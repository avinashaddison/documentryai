import { storage } from "./storage";
import { expandResearchQueries, fetchPerplexitySources, analyzeAndSummarizeResearch } from "./research-service";
import { generateDocumentaryFramework, generateChapterOutline, generateChapterScriptWithResearch } from "./documentary-generator";
import { generateImage } from "./image-generator";
import { generateSceneVoiceover } from "./tts-service";
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
      await runResearchStep(job.projectId, state);
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
      await saveJobState(job.id, state, completedSteps, 95);
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
      state: "AUDIO_DONE",
      status: "generated",
    });
    
    console.log(`[JobWorker] Job ${job.id} completed successfully`);
    
  } catch (error: any) {
    console.error(`[JobWorker] Job ${job.id} failed:`, error);
    
    await storage.updateGenerationJob(job.id, {
      status: "failed",
      errorMessage: error.message || "Unknown error",
    });
    
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

async function runResearchStep(projectId: number, state: GenerationState) {
  console.log(`[JobWorker] Running research step for project ${projectId}`);
  
  const project = await storage.getProject(projectId);
  if (!project) throw new Error("Project not found");
  
  await storage.createGenerationLog({
    projectId,
    step: "research",
    status: "started",
    message: "Starting research phase...",
  });
  
  // Generate research queries using correct function
  const queries = await expandResearchQueries(project.title);
  
  // Execute queries (with rate limiting)
  const sources: any[] = [];
  for (const query of queries.slice(0, 6)) {
    try {
      const fetchedSources = await fetchPerplexitySources(query.query);
      sources.push(...fetchedSources);
    } catch (e) {
      console.error(`[JobWorker] Research query failed:`, e);
    }
  }
  
  // Analyze results
  const summary = await analyzeAndSummarizeResearch(project.title, sources);
  
  // Save research
  const existingResearch = await storage.getProjectResearch(projectId);
  if (existingResearch) {
    await storage.updateProjectResearch(existingResearch.id, {
      researchQueries: JSON.stringify(queries),
      sources: JSON.stringify(sources),
      researchSummary: JSON.stringify(summary),
      status: "completed",
    });
  } else {
    await storage.createProjectResearch({
      projectId,
      researchQueries: JSON.stringify(queries),
      sources: JSON.stringify(sources),
      researchSummary: JSON.stringify(summary),
      status: "completed",
    });
  }
  
  state.research = { queries, sources, summary };
  
  await storage.createGenerationLog({
    projectId,
    step: "research",
    status: "completed",
    message: `Research complete: ${sources.length} sources, ${summary.keyFacts?.length || 0} facts`,
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
    
    const chapterScript = await generateChapterScriptWithResearch(
      project.title,
      chapterPremise,
      i + 1,
      state.outline.length,
      researchContext,
      config.imagesPerChapter || 5
    );
    
    chapters.push({
      ...chapterScript,
      title: chapterTitle,
      chapterNumber: i + 1,
    });
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
          const result = await fetchStockImageForScene(
            scene.imagePrompt,
            projectId,
            key
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
          const imageResult = await generateImage(scene.imagePrompt, { 
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
  const voice = config.narratorVoice || "aura-asteria-en";
  
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
