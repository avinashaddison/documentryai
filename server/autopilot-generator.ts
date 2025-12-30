import { storage } from "./storage";
import { generateChapterImages } from "./image-generator";
import { generateSceneVoiceover } from "./tts-service";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import type { GenerationSession, GeneratedAsset } from "@shared/schema";

interface AutopilotOptions {
  projectId: number;
  chapters: Array<{
    chapterNumber: number;
    title: string;
    scenes: Array<{
      sceneNumber: number;
      imagePrompt: string;
      narrationSegment: string;
      duration: number;
      mood: string;
      shotType: string;
    }>;
  }>;
  voice?: string;
  imageModel?: string;
  onProgress?: (step: string, progress: number, message: string) => void;
}

interface AutopilotResult {
  success: boolean;
  videoPath?: string;
  generatedImages: Record<string, string>;
  generatedAudio: Record<string, string>;
  errors: string[];
  sessionId?: number;
}

export async function runAutopilotGeneration(options: AutopilotOptions): Promise<AutopilotResult> {
  const { projectId, chapters, voice = "neutral", imageModel = "flux-1.1-pro", onProgress } = options;
  
  const result: AutopilotResult = {
    success: false,
    generatedImages: {},
    generatedAudio: {},
    errors: [],
  };

  const log = (step: string, progress: number, message: string) => {
    console.log(`[Autopilot] ${step}: ${message} (${progress}%)`);
    onProgress?.(step, progress, message);
  };

  try {
    log("init", 0, "Starting autopilot generation...");
    
    let totalScenes = 0;
    chapters.forEach(ch => totalScenes += ch.scenes.length);

    // Check for existing session to resume
    let session = await storage.getActiveGenerationSession(projectId);
    
    if (!session) {
      // Create new session
      session = await storage.createGenerationSession({
        projectId,
        status: "in_progress",
        currentChapter: 1,
        currentScene: 1,
        currentStep: "images",
        totalChapters: chapters.length,
        totalScenes,
        completedImages: 0,
        completedAudio: 0,
        voice,
        imageModel,
        chaptersData: JSON.stringify(chapters),
      });
    }

    result.sessionId = session.id;

    // Load existing assets
    const existingAssets = await storage.getGeneratedAssetsByProject(projectId);
    for (const asset of existingAssets) {
      const key = `ch${asset.chapterNumber}_sc${asset.sceneNumber}`;
      if (asset.assetType === "image") {
        result.generatedImages[key] = asset.assetUrl;
      } else if (asset.assetType === "audio") {
        result.generatedAudio[key] = asset.assetUrl;
      }
    }

    await storage.createGenerationLog({
      projectId,
      step: "autopilot",
      status: "started",
      message: `Starting automated video generation (resumable)...`
    });

    // Phase 1: Generate images
    if (session.currentStep === "images") {
      log("images", 5, "Generating images...");

      for (const chapter of chapters) {
        // Skip already completed chapters (if resuming)
        if (chapter.chapterNumber < session.currentChapter && session.currentStep !== "images") {
          continue;
        }

        for (const scene of chapter.scenes) {
          const key = `ch${chapter.chapterNumber}_sc${scene.sceneNumber}`;
          
          // Skip if image already exists
          if (result.generatedImages[key]) {
            log("images", calculateProgress(session, "images", totalScenes),
              `Skipping image ${key} (already generated)`);
            continue;
          }

          try {
            log("images", calculateProgress(session, "images", totalScenes),
              `Generating image for Ch${chapter.chapterNumber} Sc${scene.sceneNumber}...`);

            const imageResults = await generateChapterImages(
              {
                chapterNumber: chapter.chapterNumber,
                scenes: [{ 
                  sceneNumber: scene.sceneNumber, 
                  imagePrompt: scene.imagePrompt,
                }],
              },
              projectId,
              { model: imageModel as any }
            );

            if (imageResults[0]?.success && imageResults[0]?.imageUrl) {
              result.generatedImages[key] = imageResults[0].imageUrl;
              
              // Save to database
              await storage.saveGeneratedAsset({
                projectId,
                chapterNumber: chapter.chapterNumber,
                sceneNumber: scene.sceneNumber,
                assetType: "image",
                assetUrl: imageResults[0].imageUrl,
                prompt: scene.imagePrompt,
                status: "completed",
              });

              // Update session progress
              session = await storage.updateGenerationSession(session.id, {
                currentChapter: chapter.chapterNumber,
                currentScene: scene.sceneNumber,
                completedImages: (session.completedImages || 0) + 1,
              }) as GenerationSession;
            } else {
              const error = imageResults[0]?.error || "Unknown image generation error";
              result.errors.push(`Image ${key}: ${error}`);
            }
          } catch (error: any) {
            result.errors.push(`Image ${key}: ${error.message}`);
            // Continue to next scene even if one fails
          }
        }
      }

      // Move to audio phase
      session = await storage.updateGenerationSession(session.id, {
        currentStep: "audio",
        currentChapter: 1,
        currentScene: 1,
      }) as GenerationSession;
    }

    // Phase 2: Generate audio
    if (session.currentStep === "audio") {
      log("audio", 40, "Generating voiceovers...");

      for (const chapter of chapters) {
        for (const scene of chapter.scenes) {
          const key = `ch${chapter.chapterNumber}_sc${scene.sceneNumber}`;
          
          // Skip if audio already exists
          if (result.generatedAudio[key]) {
            log("audio", calculateProgress(session, "audio", totalScenes),
              `Skipping audio ${key} (already generated)`);
            continue;
          }

          try {
            log("audio", calculateProgress(session, "audio", totalScenes),
              `Generating audio for Ch${chapter.chapterNumber} Sc${scene.sceneNumber}...`);

            const audioUrl = await generateSceneVoiceover(
              projectId,
              chapter.chapterNumber,
              scene.sceneNumber,
              scene.narrationSegment,
              voice
            );

            result.generatedAudio[key] = audioUrl;

            // Save to database
            await storage.saveGeneratedAsset({
              projectId,
              chapterNumber: chapter.chapterNumber,
              sceneNumber: scene.sceneNumber,
              assetType: "audio",
              assetUrl: audioUrl,
              narration: scene.narrationSegment,
              duration: scene.duration,
              status: "completed",
            });

            // Update session progress
            session = await storage.updateGenerationSession(session.id, {
              currentChapter: chapter.chapterNumber,
              currentScene: scene.sceneNumber,
              completedAudio: (session.completedAudio || 0) + 1,
            }) as GenerationSession;

          } catch (error: any) {
            result.errors.push(`Audio ${key}: ${error.message}`);
          }
        }
      }

      // Move to video phase
      session = await storage.updateGenerationSession(session.id, {
        currentStep: "video",
      }) as GenerationSession;
    }

    // Phase 3: Assemble video
    if (session.currentStep === "video") {
      log("assembly", 80, "Assembling final video...");

      await storage.createGenerationLog({
        projectId,
        step: "video_assembly",
        status: "started",
        message: "Assembling video with Ken Burns effects and transitions..."
      });

      const projectData = buildProjectData(projectId, chapters, result.generatedImages, result.generatedAudio);
      const outputPath = `generated_videos/project_${projectId}_documentary.mp4`;
      
      const assemblySuccess = await assembleVideoWithPython(projectData, outputPath);

      if (assemblySuccess) {
        result.success = true;
        result.videoPath = `/${outputPath}`;
        
        // Mark session complete
        await storage.updateGenerationSession(session.id, {
          status: "completed",
        });

        await storage.createGenerationLog({
          projectId,
          step: "autopilot",
          status: "completed",
          message: `Autopilot complete! Video saved to ${outputPath}`
        });

        log("complete", 100, "Video generation complete!");
      } else {
        result.errors.push("Video assembly failed");
        
        await storage.updateGenerationSession(session.id, {
          status: "failed",
          errorMessage: "Video assembly failed",
        });
      }
    }

    return result;
  } catch (error: any) {
    result.errors.push(`Autopilot error: ${error.message}`);
    
    await storage.createGenerationLog({
      projectId,
      step: "autopilot",
      status: "failed",
      message: `Autopilot failed: ${error.message}`
    });

    return result;
  }
}

function calculateProgress(session: GenerationSession, phase: string, totalScenes: number): number {
  const imagesComplete = session.completedImages || 0;
  const audioComplete = session.completedAudio || 0;

  if (phase === "images") {
    return 5 + Math.round((imagesComplete / totalScenes) * 35);
  } else if (phase === "audio") {
    return 40 + Math.round((audioComplete / totalScenes) * 35);
  }
  return 80;
}

export async function getGenerationStatus(projectId: number): Promise<{
  hasActiveSession: boolean;
  session?: GenerationSession;
  assets: GeneratedAsset[];
  canResume: boolean;
}> {
  const session = await storage.getActiveGenerationSession(projectId);
  const assets = await storage.getGeneratedAssetsByProject(projectId);
  
  return {
    hasActiveSession: !!session,
    session,
    assets,
    canResume: !!session && session.status === "in_progress",
  };
}

export async function resumeGeneration(projectId: number): Promise<AutopilotResult> {
  const session = await storage.getActiveGenerationSession(projectId);
  
  if (!session || !session.chaptersData) {
    return {
      success: false,
      generatedImages: {},
      generatedAudio: {},
      errors: ["No active session to resume"],
    };
  }

  let chapters;
  try {
    chapters = JSON.parse(session.chaptersData);
    if (!Array.isArray(chapters) || chapters.length === 0) {
      throw new Error("Invalid chapters data");
    }
  } catch (e) {
    // Mark session as failed since data is corrupted
    await storage.updateGenerationSession(session.id, {
      status: "failed",
      errorMessage: "Corrupted session data - cannot resume",
    });
    return {
      success: false,
      generatedImages: {},
      generatedAudio: {},
      errors: ["Session data is corrupted - please start a new generation"],
    };
  }
  
  return runAutopilotGeneration({
    projectId,
    chapters,
    voice: session.voice || "neutral",
    imageModel: session.imageModel || "flux-1.1-pro",
  });
}

function buildProjectData(
  projectId: number,
  chapters: AutopilotOptions["chapters"],
  images: Record<string, string>,
  audio: Record<string, string>
) {
  return {
    title: `Project ${projectId}`,
    chapters: chapters.map(ch => ({
      chapter_number: ch.chapterNumber,
      title: ch.title,
      audio_path: audio[`ch${ch.chapterNumber}_sc1`]?.replace(/^\//, "") || 
        `generated_assets/audio/project_${projectId}/ch${ch.chapterNumber}_sc1.mp3`,
      scenes: ch.scenes.map(sc => {
        const key = `ch${ch.chapterNumber}_sc${sc.sceneNumber}`;
        const imagePath = images[key]?.replace(/^\//, "") || 
          `generated_assets/images/${projectId}_ch${ch.chapterNumber}_sc${sc.sceneNumber}.webp`;
        const audioPath = audio[key]?.replace(/^\//, "") || 
          `generated_assets/audio/project_${projectId}/ch${ch.chapterNumber}_sc${sc.sceneNumber}.mp3`;
        
        return {
          scene_number: sc.sceneNumber,
          image_path: path.join(process.cwd(), imagePath),
          audio_path: path.join(process.cwd(), audioPath),
          duration: sc.duration || 5,
          narration: sc.narrationSegment,
          mood: sc.mood,
          ken_burns_effect: getKenBurnsEffect(sc.sceneNumber),
        };
      }),
    })),
  };
}

function getKenBurnsEffect(sceneNumber: number): string {
  const effects = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"];
  return effects[(sceneNumber - 1) % effects.length];
}

async function assembleVideoWithPython(projectData: any, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const config = JSON.stringify({
      project: projectData,
      output: outputPath,
    });

    console.log("[Autopilot] Running Python video assembly...");

    const python = spawn("python3", [
      "server/python/video_processor.py",
      "assemble_full",
      config,
    ]);

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log("[Python]", data.toString());
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
      console.error("[Python Error]", data.toString());
    });

    python.on("close", (code) => {
      console.log(`[Autopilot] Python exited with code ${code}`);
      
      if (code === 0) {
        try {
          const result = JSON.parse(stdout.trim().split("\n").pop() || "{}");
          resolve(result.success === true);
        } catch {
          resolve(fs.existsSync(outputPath));
        }
      } else {
        console.error("[Autopilot] Python error:", stderr);
        resolve(false);
      }
    });

    python.on("error", (err) => {
      console.error("[Autopilot] Failed to start Python:", err);
      resolve(false);
    });
  });
}

export async function generateSceneAssets(
  projectId: number,
  chapterNumber: number,
  sceneNumber: number,
  imagePrompt: string,
  narration: string,
  voice: string = "neutral",
  imageModel: string = "flux-1.1-pro"
): Promise<{ imageUrl?: string; audioUrl?: string; errors: string[] }> {
  const errors: string[] = [];
  let imageUrl: string | undefined;
  let audioUrl: string | undefined;

  try {
    const imageResults = await generateChapterImages(
      {
        chapterNumber,
        scenes: [{ sceneNumber, imagePrompt }],
      },
      projectId,
      { model: imageModel as any }
    );

    if (imageResults[0]?.success) {
      imageUrl = imageResults[0].imageUrl;
      
      // Save to database
      await storage.saveGeneratedAsset({
        projectId,
        chapterNumber,
        sceneNumber,
        assetType: "image",
        assetUrl: imageUrl!,
        prompt: imagePrompt,
        status: "completed",
      });
    } else {
      errors.push(imageResults[0]?.error || "Image generation failed");
    }
  } catch (e: any) {
    errors.push(`Image error: ${e.message}`);
  }

  try {
    audioUrl = await generateSceneVoiceover(projectId, chapterNumber, sceneNumber, narration, voice);
    
    // Save to database
    await storage.saveGeneratedAsset({
      projectId,
      chapterNumber,
      sceneNumber,
      assetType: "audio",
      assetUrl: audioUrl,
      narration,
      status: "completed",
    });
  } catch (e: any) {
    errors.push(`Audio error: ${e.message}`);
  }

  return { imageUrl, audioUrl, errors };
}
