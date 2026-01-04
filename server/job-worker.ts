import { storage } from "./storage";
import { conductDeepResearch, conductClaudeDeepResearch } from "./research-service";
import { generateDocumentaryFramework, generateChapterOutline, generateChapterScriptWithResearch } from "./documentary-generator";
import { generateImage } from "./image-generator";
import { generateSceneVoiceover } from "./tts-service";
import { sseBroadcaster } from "./sse-broadcaster";
import { buildTimelineFromAssets } from "./auto-editor";
import { renderTimeline } from "./timeline-renderer";
import type { GenerationJob } from "@shared/schema";

let isProcessing = false;
let processingJobId: number | null = null;

interface GenerationState {
  chapters: any[];
  outline: string[];
  images: Record<string, string>;
  audio: Record<string, string>;
  framework: any;
  research: any;
}

export async function startJobWorker() {
  console.log("[JobWorker] Starting background job worker...");
  
  // Check for any running jobs that may have been interrupted (e.g., server restart)
  // and mark them as queued for re-processing
  try {
    const { generationJobs } = await import("@shared/schema");
    const { db } = await import("./db");
    const { eq } = await import("drizzle-orm");
    
    await db
      .update(generationJobs)
      .set({ status: "queued", updatedAt: new Date() })
      .where(eq(generationJobs.status, "running"));
    
    console.log("[JobWorker] Reset any interrupted running jobs to queued");
  } catch (error) {
    console.error("[JobWorker] Failed to reset interrupted jobs:", error);
  }
  
  // Start the processing loop
  processJobQueue();
}

async function processJobQueue() {
  // Poll every 2 seconds for new jobs
  setInterval(async () => {
    if (isProcessing) return;
    
    try {
      const queuedJobs = await storage.getQueuedJobs();
      if (queuedJobs.length > 0) {
        const job = queuedJobs[0];
        await processJob(job);
      }
    } catch (error) {
      console.error("[JobWorker] Error checking job queue:", error);
    }
  }, 2000);
}

async function processJob(job: GenerationJob) {
  if (isProcessing) return;
  
  isProcessing = true;
  processingJobId = job.id;
  
  console.log(`[JobWorker] Starting job ${job.id} for project ${job.projectId}`);
  
  try {
    // Mark job as running
    await storage.updateGenerationJob(job.id, {
      status: "running",
      startedAt: new Date(),
    });
    
    // Clear any stale cached state from previous runs before emitting new status
    sseBroadcaster.clearProjectState(job.projectId);
    
    // Emit job started event via SSE
    sseBroadcaster.emitJobStatus(job.projectId, job.id, "running", "research", 0);
    
    // Parse existing state
    let state: GenerationState = {
      chapters: [],
      outline: [],
      images: {},
      audio: {},
      framework: null,
      research: null,
    };
    
    if (job.stateData) {
      try {
        state = { ...state, ...JSON.parse(job.stateData) };
      } catch (e) {
        console.error("[JobWorker] Failed to parse state data:", e);
      }
    }
    
    const completedSteps = job.completedSteps || [];
    const config = job.configData ? JSON.parse(job.configData) : {};
    
    // Step 1: Research
    if (!completedSteps.includes("research")) {
      await updateJobProgress(job.id, "research", 5);
      await runResearchStep(job.projectId, job.id, state, config);
      completedSteps.push("research");
      await saveJobState(job.id, state, completedSteps, 15);
    }
    
    // Step 2: Framework
    if (!completedSteps.includes("framework")) {
      await updateJobProgress(job.id, "framework", 18);
      await runFrameworkStep(job.projectId, job.totalChapters, state);
      completedSteps.push("framework");
      await saveJobState(job.id, state, completedSteps, 22);
    }
    
    // Step 3: Outline
    if (!completedSteps.includes("outline")) {
      await updateJobProgress(job.id, "outline", 25);
      await runOutlineStep(job.projectId, job.totalChapters, state);
      completedSteps.push("outline");
      await saveJobState(job.id, state, completedSteps, 28);
    }
    
    // Step 4: Chapters
    if (!completedSteps.includes("chapters")) {
      await updateJobProgress(job.id, "chapters", 30);
      await runChaptersStep(job.projectId, job.totalChapters, config, state);
      completedSteps.push("chapters");
      await saveJobState(job.id, state, completedSteps, 50);
    }
    
    // Step 5: Images
    if (!completedSteps.includes("images")) {
      await updateJobProgress(job.id, "images", 55);
      await runImagesStep(job.projectId, config, state);
      completedSteps.push("images");
      await saveJobState(job.id, state, completedSteps, 80);
    }
    
    // Step 6: Audio
    if (!completedSteps.includes("audio")) {
      await updateJobProgress(job.id, "audio", 85);
      await runAudioStep(job.projectId, config, state);
      completedSteps.push("audio");
      await saveJobState(job.id, state, completedSteps, 90);
    }
    
    // Step 7: Auto-Render
    if (!completedSteps.includes("render")) {
      await updateJobProgress(job.id, "render", 92);
      const videoUrl = await runAutoRenderStep(job.projectId, state);
      if (videoUrl) {
        (state as any).renderedVideoUrl = videoUrl;
      }
      completedSteps.push("render");
      await saveJobState(job.id, state, completedSteps, 99);
    }
    
    // Mark job as completed
    await storage.updateGenerationJob(job.id, {
      status: "completed",
      progress: 100,
      finishedAt: new Date(),
      stateData: JSON.stringify(state),
      completedSteps,
    });
    
    // Update project status to completed
    await storage.updateProject(job.projectId, {
      state: "RENDERED",
      status: "generated",
      renderedVideoUrl: (state as any).renderedVideoUrl || null,
    });
    
    // Emit job completed event via SSE
    sseBroadcaster.emitJobStatus(job.projectId, job.id, "completed", "complete", 100);
    
    console.log(`[JobWorker] Job ${job.id} completed successfully with video: ${(state as any).renderedVideoUrl}`);
    
  } catch (error: any) {
    console.error(`[JobWorker] Job ${job.id} failed:`, error);
    
    await storage.updateGenerationJob(job.id, {
      status: "failed",
      errorMessage: error.message || "Unknown error",
    });
    
    // Emit job failed event via SSE
    sseBroadcaster.emitJobStatus(job.projectId, job.id, "failed", "error", 0);
    
    await storage.createGenerationLog({
      projectId: job.projectId,
      step: "job",
      status: "failed",
      message: `Generation failed: ${error.message}`,
    });
    
  } finally {
    isProcessing = false;
    processingJobId = null;
  }
}

async function updateJobProgress(jobId: number, step: string, progress: number) {
  await storage.updateGenerationJob(jobId, {
    currentStep: step,
    progress,
  });
  
  // Get job to emit SSE event with project ID
  const job = await storage.getGenerationJob(jobId);
  if (job) {
    sseBroadcaster.emitJobStatus(job.projectId, jobId, "running", step, progress);
  }
}

async function saveJobState(
  jobId: number, 
  state: GenerationState, 
  completedSteps: string[], 
  progress: number
) {
  await storage.updateGenerationJob(jobId, {
    stateData: JSON.stringify(state),
    completedSteps,
    progress,
  });
}

async function runResearchStep(projectId: number, jobId: number, state: GenerationState, config: any) {
  const researchMethod = config?.researchMethod || "perplexity";
  console.log(`[JobWorker] Running DEEP research step for project ${projectId}, job ${jobId} using ${researchMethod}`);
  
  const project = await storage.getProject(projectId);
  if (!project) throw new Error("Project not found");
  
  const researchMethodLabel = researchMethod === "claude" ? "Claude Opus 4.5" : "Perplexity AI";
  await storage.createGenerationLog({
    projectId,
    step: "research",
    status: "started",
    message: `Starting deep research phase with ${researchMethodLabel}...`,
  });
  
  // Use the appropriate research function based on method
  let researchResult;
  if (researchMethod === "claude") {
    researchResult = await conductClaudeDeepResearch(
      project.title,
      projectId,
      jobId,
      "deep"
    );
  } else {
    researchResult = await conductDeepResearch(
      project.title,
      projectId,
      jobId,
      "deep"
    );
  }
  
  // Save research with enhanced data
  const existingResearch = await storage.getProjectResearch(projectId);
  const researchData = {
    researchQueries: JSON.stringify(researchResult.queries),
    sources: JSON.stringify(researchResult.sources),
    researchSummary: JSON.stringify({
      ...researchResult.summary,
      facts: researchResult.facts,
      subtopics: researchResult.subtopics,
      depth: researchResult.depth,
    }),
    status: "completed" as const,
  };
  
  if (existingResearch) {
    await storage.updateProjectResearch(existingResearch.id, researchData);
  } else {
    await storage.createProjectResearch({
      projectId,
      ...researchData,
    });
  }
  
  // Include facts inside summary for downstream generators
  state.research = { 
    queries: researchResult.queries, 
    sources: researchResult.sources, 
    summary: {
      ...researchResult.summary,
      facts: researchResult.facts,
      subtopics: researchResult.subtopics,
    },
    facts: researchResult.facts,
  };
  
  await storage.createGenerationLog({
    projectId,
    step: "research",
    status: "completed",
    message: `Deep research complete: ${researchResult.sources.length} sources, ${researchResult.facts.length} facts, ${researchResult.summary.timeline.length} timeline events`,
  });
  
  await storage.updateProject(projectId, { state: "RESEARCH_DONE" });
}

async function runFrameworkStep(projectId: number, totalChapters: number, state: GenerationState) {
  console.log(`[JobWorker] Running framework step for project ${projectId}`);
  
  const project = await storage.getProject(projectId);
  if (!project) throw new Error("Project not found");
  
  await storage.createGenerationLog({
    projectId,
    step: "framework",
    status: "started",
    message: `Generating documentary framework with ${totalChapters} chapters...`,
  });
  
  // Get research for context
  const researchData = await storage.getProjectResearch(projectId);
  const researchContext = researchData?.researchSummary ? JSON.parse(researchData.researchSummary) : null;
  
  const framework = await generateDocumentaryFramework(project.title, "medium", totalChapters);
  
  // Store framework
  await storage.createStoryFramework({
    projectId,
    generatedTitle: framework.title,
    genres: framework.genres,
    premise: framework.premise,
    openingHook: framework.openingHook,
  });
  
  state.framework = framework;
  
  // Emit framework generated event via SSE
  sseBroadcaster.emitFrameworkGenerated(projectId, processingJobId || 0, framework);
  
  await storage.createGenerationLog({
    projectId,
    step: "framework",
    status: "completed",
    message: `Framework generated: ${framework.title}`,
  });
}

async function runOutlineStep(projectId: number, totalChapters: number, state: GenerationState) {
  console.log(`[JobWorker] Running outline step for project ${projectId}`);
  
  const project = await storage.getProject(projectId);
  if (!project) throw new Error("Project not found");
  
  await storage.createGenerationLog({
    projectId,
    step: "outline",
    status: "started",
    message: "Generating chapter outline...",
  });
  
  const framework = await storage.getStoryFrameworkByProject(projectId);
  const researchData = await storage.getProjectResearch(projectId);
  const researchContext = researchData?.researchSummary ? JSON.parse(researchData.researchSummary) : null;
  
  // generateChapterOutline expects documentaryTitle, premise, openingHook, totalChapters
  const premise = framework?.premise || "";
  const openingHook = framework?.openingHook || "";
  
  const outline = await generateChapterOutline(project.title, premise, openingHook, totalChapters);
  
  state.outline = outline;
  
  // Emit outline generated event via SSE
  sseBroadcaster.emitOutlineGenerated(projectId, processingJobId || 0, outline);
  
  await storage.createGenerationLog({
    projectId,
    step: "outline",
    status: "completed",
    message: `Generated ${outline.length} chapter titles`,
  });
}

async function runChaptersStep(
  projectId: number, 
  totalChapters: number, 
  config: any, 
  state: GenerationState
) {
  console.log(`[JobWorker] Running chapters step for project ${projectId}`);
  
  const project = await storage.getProject(projectId);
  if (!project) throw new Error("Project not found");
  
  const framework = await storage.getStoryFrameworkByProject(projectId);
  const researchData = await storage.getProjectResearch(projectId);
  const researchContext = researchData?.researchSummary ? JSON.parse(researchData.researchSummary) : null;
  
  const chapters: any[] = [];
  
  for (let i = 0; i < state.outline.length; i++) {
    const chapterTitle = state.outline[i];
    
    await storage.createGenerationLog({
      projectId,
      step: "chapters",
      status: "in_progress",
      message: `Generating Chapter ${i + 1}: ${chapterTitle}`,
    });
    
    // generateChapterScriptWithResearch expects (title, premise, chapterNum, totalChapters, researchContext, scenesPerChapter?)
    const chapterPremise = framework?.premise || chapterTitle;
    
    // Increase scenes per chapter for more visual variety (10-12 scenes = more engaging content)
    const chapterScript = await generateChapterScriptWithResearch(
      project.title,
      chapterPremise,
      i + 1,
      state.outline.length,
      researchContext,
      config.imagesPerChapter || 10
    );
    
    const chapter = {
      ...chapterScript,
      title: chapterTitle,
      chapterNumber: i + 1,
    };
    chapters.push(chapter);
    
    // Emit real-time chapter generated event
    sseBroadcaster.emitChapterGenerated(projectId, processingJobId || 0, chapter);
    sseBroadcaster.emitProgress(projectId, processingJobId || 0, "chapters", Math.round(((i + 1) / state.outline.length) * 30) + 20, `Generated Chapter ${i + 1} of ${state.outline.length}`);
  }
  
  state.chapters = chapters;
  
  // Update project state
  await storage.updateProject(projectId, {
    state: "SCRIPT_DONE",
  });
  
  await storage.createGenerationLog({
    projectId,
    step: "chapters",
    status: "completed",
    message: `Generated ${chapters.length} chapter scripts`,
  });
}

async function runImagesStep(projectId: number, config: any, state: GenerationState) {
  console.log(`[JobWorker] Running images step for project ${projectId}`);
  console.log(`[JobWorker] Config:`, JSON.stringify(config));
  
  const imageSource = config.imageSource || "stock";
  const isStockMode = imageSource === "stock";
  console.log(`[JobWorker] Image source: ${imageSource}, isStockMode: ${isStockMode}`);
  
  await storage.createGenerationLog({
    projectId,
    step: "images",
    status: "started",
    message: isStockMode ? "Fetching stock photos for all chapters..." : "Generating AI images for all chapters...",
  });
  
  const images: Record<string, string> = {};
  const model = config.hookImageModel || "flux-1.1-pro";
  
  if (isStockMode) {
    const { fetchStockImageForScene } = await import("./stock-image-service");
    
    for (const chapter of state.chapters) {
      for (const scene of chapter.scenes || []) {
        const key = `ch${chapter.chapterNumber}_scene${scene.sceneNumber}`;
        
        try {
          // Pass narration segment to improve image-audio matching
          const result = await fetchStockImageForScene(
            scene.imagePrompt,
            projectId,
            key,
            scene.narrationSegment || scene.narration
          );
          
          if (result.success && result.imageUrl) {
            images[key] = result.imageUrl;
            
            await storage.saveGeneratedAsset({
              projectId,
              chapterNumber: chapter.chapterNumber,
              sceneNumber: scene.sceneNumber,
              assetType: "image",
              assetUrl: result.imageUrl,
              prompt: scene.imagePrompt,
              status: "completed",
            });
            
            // Emit real-time image generated event
            const totalScenes = state.chapters.reduce((sum, ch) => sum + (ch.scenes?.length || 0), 0);
            const completedImages = Object.keys(images).length;
            sseBroadcaster.emitImageGenerated(projectId, processingJobId || 0, chapter.chapterNumber, scene.sceneNumber, result.imageUrl);
            sseBroadcaster.emitProgress(projectId, processingJobId || 0, "images", Math.round((completedImages / totalScenes) * 20) + 50, `Fetched image ${completedImages} of ${totalScenes}`);
          } else {
            console.error(`[JobWorker] Stock image failed for ${key}:`, result.error);
          }
          
          await new Promise(r => setTimeout(r, 200));
        } catch (error) {
          console.error(`[JobWorker] Stock image failed for ${key}:`, error);
        }
      }
    }
  } else {
    for (const chapter of state.chapters) {
      for (const scene of chapter.scenes || []) {
        const key = `ch${chapter.chapterNumber}_scene${scene.sceneNumber}`;
        
        try {
          const enhancedPrompt = scene.historicalContext 
            ? `${scene.imagePrompt}. Historical context: ${scene.historicalContext}`
            : scene.imagePrompt;
          
          const imageResult = await generateImage(enhancedPrompt, { 
            model: model as any,
            projectId,
            sceneId: key,
          });
          
          if (!imageResult.success || !imageResult.imageUrl) {
            throw new Error(imageResult.error || "Image generation failed");
          }
          
          images[key] = imageResult.imageUrl;
          
          await storage.saveGeneratedAsset({
            projectId,
            chapterNumber: chapter.chapterNumber,
            sceneNumber: scene.sceneNumber,
            assetType: "image",
            assetUrl: imageResult.imageUrl,
            prompt: scene.imagePrompt,
            status: "completed",
          });
          
          // Emit real-time image generated event
          const totalScenes = state.chapters.reduce((sum, ch) => sum + (ch.scenes?.length || 0), 0);
          const completedImages = Object.keys(images).length;
          sseBroadcaster.emitImageGenerated(projectId, processingJobId || 0, chapter.chapterNumber, scene.sceneNumber, imageResult.imageUrl);
          sseBroadcaster.emitProgress(projectId, processingJobId || 0, "images", Math.round((completedImages / totalScenes) * 20) + 50, `Generated image ${completedImages} of ${totalScenes}`);
          
        } catch (error) {
          console.error(`[JobWorker] AI image generation failed for ${key}:`, error);
        }
      }
    }
  }
  
  state.images = images;
  
  await storage.updateProject(projectId, { state: "IMAGES_DONE" });
  
  await storage.createGenerationLog({
    projectId,
    step: "images",
    status: "completed",
    message: `${isStockMode ? "Fetched" : "Generated"} ${Object.keys(images).length} images`,
  });
}

async function runAudioStep(projectId: number, config: any, state: GenerationState) {
  console.log(`[JobWorker] Running audio step for project ${projectId}`);
  
  await storage.createGenerationLog({
    projectId,
    step: "audio",
    status: "started",
    message: "Generating voiceovers for all chapters...",
  });
  
  const audio: Record<string, string> = {};
  // Frontend sends 'voice', check both for compatibility
  const voice = config.voice || config.narratorVoice || "aura-2-mars-en";
  console.log(`[JobWorker] Using voice model: ${voice}`);
  
  for (const chapter of state.chapters) {
    for (const scene of chapter.scenes || []) {
      const key = `ch${chapter.chapterNumber}_scene${scene.sceneNumber}`;
      
      // Use narrationSegment (from generator), voiceoverScript, or narration as fallback
      const narrationText = scene.narrationSegment || scene.voiceoverScript || scene.narration;
      if (!narrationText) continue;
      
      try {
        // generateSceneVoiceover expects (projectId, chapterNumber, sceneNumber, narration, voice)
        const audioUrl = await generateSceneVoiceover(projectId, chapter.chapterNumber, scene.sceneNumber, narrationText, voice);
        
        audio[key] = audioUrl;
        
        await storage.saveGeneratedAsset({
          projectId,
          chapterNumber: chapter.chapterNumber,
          sceneNumber: scene.sceneNumber,
          assetType: "audio",
          assetUrl: audioUrl,
          narration: scene.narration,
          status: "completed",
        });
        
        // Emit real-time audio generated event
        const totalScenes = state.chapters.reduce((sum, ch) => sum + (ch.scenes?.length || 0), 0);
        const completedAudio = Object.keys(audio).length;
        sseBroadcaster.emitAudioGenerated(projectId, processingJobId || 0, chapter.chapterNumber, scene.sceneNumber, audioUrl);
        sseBroadcaster.emitProgress(projectId, processingJobId || 0, "audio", Math.round((completedAudio / totalScenes) * 20) + 70, `Generated audio ${completedAudio} of ${totalScenes}`);
        
      } catch (error) {
        console.error(`[JobWorker] Audio generation failed for ${key}:`, error);
      }
    }
  }
  
  state.audio = audio;
  
  await storage.updateProject(projectId, { state: "AUDIO_DONE" });
  
  await storage.createGenerationLog({
    projectId,
    step: "audio",
    status: "completed",
    message: `Generated ${Object.keys(audio).length} audio clips`,
  });
}

export function getProcessingJobId(): number | null {
  return processingJobId;
}

export function isJobProcessing(): boolean {
  return isProcessing;
}

async function runAutoRenderStep(projectId: number, state: GenerationState): Promise<string | null> {
  console.log(`[JobWorker] Starting auto-render for project ${projectId}`);
  
  await storage.createGenerationLog({
    projectId,
    step: "render",
    status: "running",
    message: "Auto-rendering documentary video...",
  });
  
  sseBroadcaster.emitProgress(projectId, processingJobId || 0, "render", 92, "Building video timeline...");
  
  try {
    // Get project data
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    
    // Get all generated assets
    const assets = await storage.getGeneratedAssetsByProject(projectId);
    if (!assets || assets.length === 0) {
      console.log(`[JobWorker] No assets found for auto-render`);
      return null;
    }
    
    // Get chapter data for titles
    const chapters = await storage.getChaptersByProject(projectId);
    const chapterTitles: Record<number, string> = {};
    for (const ch of chapters) {
      chapterTitles[ch.chapterNumber] = ch.content.split('\n')[0]?.replace(/^#+\s*/, '') || `Chapter ${ch.chapterNumber}`;
    }
    
    // Build merged asset list (combine image and audio for same scene)
    const sceneMap = new Map<string, any>();
    
    for (const asset of assets) {
      const key = `${asset.chapterNumber}-${asset.sceneNumber}`;
      
      if (!sceneMap.has(key)) {
        sceneMap.set(key, {
          chapterNumber: asset.chapterNumber,
          chapterTitle: chapterTitles[asset.chapterNumber],
          sceneNumber: asset.sceneNumber,
          imageUrl: "",
          audioUrl: undefined,
          narration: asset.narration || undefined,
          duration: 5,
        });
      }
      
      const scene = sceneMap.get(key);
      if (asset.assetType === "image") {
        scene.imageUrl = asset.assetUrl;
      } else if (asset.assetType === "audio") {
        scene.audioUrl = asset.assetUrl;
        if (asset.duration) {
          scene.duration = asset.duration / 1000;
        }
      }
      if (asset.narration && !scene.narration) {
        scene.narration = asset.narration;
      }
    }
    
    const mergedAssets = Array.from(sceneMap.values()).filter(a => a.imageUrl);
    
    if (mergedAssets.length === 0) {
      console.log(`[JobWorker] No valid scenes for auto-render`);
      return null;
    }
    
    console.log(`[JobWorker] Building timeline from ${mergedAssets.length} scenes`);
    sseBroadcaster.emitProgress(projectId, processingJobId || 0, "render", 94, `Building timeline from ${mergedAssets.length} scenes...`);
    
    // Build timeline with auto-editing
    const timeline = buildTimelineFromAssets(
      projectId,
      project.title,
      mergedAssets,
      {
        style: "documentary",
        addChapterTitles: true,
        addCaptions: true,
      }
    );
    
    console.log(`[JobWorker] Timeline built: ${timeline.duration}s, ${timeline.tracks.video.length} video, ${timeline.tracks.text.length} text`);
    sseBroadcaster.emitProgress(projectId, processingJobId || 0, "render", 95, "Rendering video with FFmpeg...");
    
    // Render the timeline
    const outputName = `documentary_${projectId}_${Date.now()}`;
    const result = await renderTimeline(timeline, outputName, (progress) => {
      const pct = 95 + Math.floor(progress.progress * 0.04);
      sseBroadcaster.emitProgress(projectId, processingJobId || 0, "render", pct, progress.message);
    });
    
    if (result.success) {
      const videoUrl = result.objectStorageUrl || `/generated_videos/${outputName}.mp4`;
      
      await storage.createGenerationLog({
        projectId,
        step: "render",
        status: "completed",
        message: `Video rendered successfully: ${videoUrl}`,
      });
      
      console.log(`[JobWorker] Auto-render complete: ${videoUrl}`);
      return videoUrl;
    } else {
      throw new Error(result.error || "Render failed");
    }
    
  } catch (error: any) {
    console.error(`[JobWorker] Auto-render failed:`, error);
    
    await storage.createGenerationLog({
      projectId,
      step: "render",
      status: "failed",
      message: `Auto-render failed: ${error.message}`,
    });
    
    return null;
  }
}
