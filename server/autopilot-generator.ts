import { storage } from "./storage";
import { generateChapterImages } from "./image-generator";
import { generateSceneVoiceover } from "./tts-service";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

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
    
    await storage.createGenerationLog({
      projectId,
      step: "autopilot",
      status: "started",
      message: "Starting automated video generation pipeline..."
    });

    let totalScenes = 0;
    chapters.forEach(ch => totalScenes += ch.scenes.length);
    let completedScenes = 0;

    for (const chapter of chapters) {
      log("images", Math.round((completedScenes / totalScenes) * 30), 
        `Generating images for Chapter ${chapter.chapterNumber}...`);

      await storage.createGenerationLog({
        projectId,
        step: `chapter_${chapter.chapterNumber}_images`,
        status: "started",
        message: `Generating ${chapter.scenes.length} images for Chapter ${chapter.chapterNumber}...`
      });

      try {
        const imageResults = await generateChapterImages(
          {
            chapterNumber: chapter.chapterNumber,
            scenes: chapter.scenes.map(s => ({
              sceneNumber: s.sceneNumber,
              imagePrompt: s.imagePrompt,
              chapterNumber: chapter.chapterNumber,
            })),
          },
          projectId,
          { model: imageModel as any }
        );

        for (const imgResult of imageResults) {
          if (imgResult.success && imgResult.imageUrl) {
            const key = `ch${chapter.chapterNumber}_sc${imgResult.sceneNumber}`;
            result.generatedImages[key] = imgResult.imageUrl;
          } else if (imgResult.error) {
            result.errors.push(`Image Ch${chapter.chapterNumber} Sc${imgResult.sceneNumber}: ${imgResult.error}`);
          }
        }

        await storage.createGenerationLog({
          projectId,
          step: `chapter_${chapter.chapterNumber}_images`,
          status: "completed",
          message: `Generated images for Chapter ${chapter.chapterNumber}`
        });
      } catch (error: any) {
        result.errors.push(`Chapter ${chapter.chapterNumber} images: ${error.message}`);
      }

      log("audio", 30 + Math.round((completedScenes / totalScenes) * 30),
        `Generating voiceover for Chapter ${chapter.chapterNumber}...`);

      await storage.createGenerationLog({
        projectId,
        step: `chapter_${chapter.chapterNumber}_audio`,
        status: "started",
        message: `Generating voiceover for Chapter ${chapter.chapterNumber}...`
      });

      for (const scene of chapter.scenes) {
        try {
          const audioUrl = await generateSceneVoiceover(
            projectId,
            chapter.chapterNumber,
            scene.sceneNumber,
            scene.narrationSegment,
            voice
          );
          
          const key = `ch${chapter.chapterNumber}_sc${scene.sceneNumber}`;
          result.generatedAudio[key] = audioUrl;
          completedScenes++;
          
          log("audio", 30 + Math.round((completedScenes / totalScenes) * 30),
            `Generated audio for Ch${chapter.chapterNumber} Sc${scene.sceneNumber}`);
        } catch (error: any) {
          result.errors.push(`Audio Ch${chapter.chapterNumber} Sc${scene.sceneNumber}: ${error.message}`);
          completedScenes++;
        }
      }

      await storage.createGenerationLog({
        projectId,
        step: `chapter_${chapter.chapterNumber}_audio`,
        status: "completed",
        message: `Generated voiceover for Chapter ${chapter.chapterNumber}`
      });
    }

    log("assembly", 70, "Assembling final video...");

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
      
      await storage.createGenerationLog({
        projectId,
        step: "video_assembly",
        status: "completed",
        message: "Video assembly complete!"
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
      
      await storage.createGenerationLog({
        projectId,
        step: "video_assembly",
        status: "failed",
        message: "Video assembly failed"
      });
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
    console.log("[Autopilot] Config:", config.substring(0, 500) + "...");

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
    } else {
      errors.push(imageResults[0]?.error || "Image generation failed");
    }
  } catch (e: any) {
    errors.push(`Image error: ${e.message}`);
  }

  try {
    audioUrl = await generateSceneVoiceover(projectId, chapterNumber, sceneNumber, narration, voice);
  } catch (e: any) {
    errors.push(`Audio error: ${e.message}`);
  }

  return { imageUrl, audioUrl, errors };
}
