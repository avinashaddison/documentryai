import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { ensureDbConnected } from "./db";
import { insertProjectSchema, TimelineSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { videoService } from "./video-service";
import { generateStoryFramework } from "./framework-generator";
import { 
  generateDocumentaryFramework, 
  generateChapterScript,
  generateChapterScriptWithResearch,
  generateChapterOutline 
} from "./documentary-generator";
import { generateImage, generateChapterImages } from "./image-generator";
import { generateChapterVoiceover, generateSceneVoiceover, getAvailableVoices, generateVoicePreview } from "./tts-service";
import { runAutopilotGeneration, generateSceneAssets, getGenerationStatus, resumeGeneration } from "./autopilot-generator";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import { conductFullResearch } from "./research-service";
import { sseBroadcaster } from "./sse-broadcaster";
import { renderTimeline } from "./timeline-renderer";
import { buildTimelineFromAssets, buildDocumentaryTimeline } from "./auto-editor";
import { generateAIEditPlan, applyEditPlanToTimeline } from "./ai-editor";

// Global render progress tracker
let currentRenderProgress = {
  status: 'idle' as 'idle' | 'downloading' | 'rendering' | 'uploading' | 'complete' | 'error',
  progress: 0,
  message: ''
};

async function downloadAudioFromStorage(objectPath: string, localPath: string): Promise<boolean> {
  try {
    if (!objectPath.startsWith("/objects/public/")) {
      return false;
    }
    
    const publicSearchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map(p => p.trim()).filter(Boolean);
    if (publicSearchPaths.length === 0) {
      console.error("No public object search paths configured");
      return false;
    }
    
    const relativePath = objectPath.replace("/objects/public/", "");
    
    for (const searchPath of publicSearchPaths) {
      try {
        const fullObjectPath = `${searchPath}/${relativePath}`;
        const pathParts = fullObjectPath.split("/").filter(Boolean);
        const bucketName = pathParts[0];
        const objectName = pathParts.slice(1).join("/");
        
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        const [exists] = await file.exists();
        
        if (exists) {
          const dir = path.dirname(localPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          
          await file.download({ destination: localPath });
          return true;
        }
      } catch (e) {
        continue;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`Error downloading audio from storage: ${error}`);
    return false;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  await ensureDbConnected();
  
  registerObjectStorageRoutes(app);

  app.get("/api/projects", async (_req, res) => {
    try {
      const projects = await storage.getAllProjects();
      res.json(projects);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const chapters = await storage.getChaptersByProject(id);
      const logs = await storage.getGenerationLogsByProject(id);

      res.json({ ...project, chapters, logs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const result = insertProjectSchema.safeParse(req.body);
      
      if (!result.success) {
        const validationError = fromError(result.error);
        return res.status(400).json({ error: validationError.message });
      }

      const project = await storage.createProject(result.data);
      res.status(201).json(project);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.updateProject(id, req.body);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      res.json(project);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteProject(id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/research", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      let research = await storage.getProjectResearch(id);
      
      if (!research) {
        research = await storage.createProjectResearch({
          projectId: id,
          status: "in_progress",
        });
      } else if (research.status === "completed") {
        return res.json({
          success: true,
          research: {
            queries: JSON.parse(research.researchQueries || "[]"),
            sources: JSON.parse(research.sources || "[]"),
            summary: JSON.parse(research.researchSummary || "{}"),
          }
        });
      } else {
        await storage.updateProjectResearch(research.id, { status: "in_progress" });
      }

      res.json({ message: "Research started", projectId: id, researchId: research.id });

      (async () => {
        try {
          const results = await conductFullResearch(project.title);
          
          await storage.updateProjectResearch(research!.id, {
            researchQueries: JSON.stringify(results.queries),
            sources: JSON.stringify(results.sources),
            researchSummary: JSON.stringify(results.summary),
            status: "completed",
          });

          await storage.updateProject(id, { state: "RESEARCH_DONE" });

          await storage.createGenerationLog({
            projectId: id,
            step: "research",
            status: "completed",
            message: `Research complete: ${results.sources.length} sources, ${results.summary.keyFacts?.length || 0} facts`
          });
        } catch (error: any) {
          await storage.updateProjectResearch(research!.id, {
            status: "failed",
            errorMessage: error.message,
          });
          await storage.createGenerationLog({
            projectId: id,
            step: "research",
            status: "failed",
            message: error.message
          });
        }
      })();

    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/projects/:id/research", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const research = await storage.getProjectResearch(id);
      
      if (!research) {
        return res.json({ status: "not_started" });
      }

      res.json({
        status: research.status,
        queries: research.researchQueries ? JSON.parse(research.researchQueries) : [],
        sources: research.sources ? JSON.parse(research.sources) : [],
        summary: research.researchSummary ? JSON.parse(research.researchSummary) : {},
        error: research.errorMessage,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/generate", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      await storage.updateProject(id, { status: "generating", progress: 0 });
      
      await storage.createGenerationLog({
        projectId: id,
        step: "initialization",
        status: "started",
        message: "Pipeline initialized"
      });

      res.json({ message: "Generation started", projectId: id });

      (async () => {
        try {
          const { generateVideo } = await import("./generator");
          await generateVideo(id);
        } catch (error: any) {
          await storage.updateProject(id, { status: "failed" });
          await storage.createGenerationLog({
            projectId: id,
            step: "error",
            status: "failed",
            message: error.message
          });
        }
      })();

    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/projects/:id/progress", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const logs = await storage.getGenerationLogsByProject(id);

      res.json({
        status: project.status,
        progress: project.progress,
        currentStep: project.currentStep,
        logs
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/video/detect-scenes", async (req, res) => {
    try {
      const { videoPath, threshold } = req.body;
      const result = await videoService.detectScenes(videoPath, threshold);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/video/trim", async (req, res) => {
    try {
      const { inputPath, outputPath, startTime, endTime } = req.body;
      const result = await videoService.trimVideo(inputPath, outputPath, startTime, endTime);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/video/merge", async (req, res) => {
    try {
      const { outputPath, videoPaths } = req.body;
      const result = await videoService.mergeVideos(outputPath, videoPaths);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/video/images-to-video", async (req, res) => {
    try {
      const result = await videoService.imagesToVideo(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/video/assemble-chapter", async (req, res) => {
    try {
      const { chapter, outputPath } = req.body;
      const result = await videoService.assembleChapterVideo(chapter, outputPath);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/video/assemble-full", async (req, res) => {
    try {
      const { project, outputPath } = req.body;
      const result = await videoService.assembleFullVideo(project, outputPath);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/video/info", async (req, res) => {
    try {
      const { path: videoPath } = req.query;
      if (!videoPath || typeof videoPath !== 'string') {
        return res.status(400).json({ error: "videoPath is required" });
      }
      const result = await videoService.getVideoInfo(videoPath);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/framework/generate", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const frameworkResult = await generateStoryFramework(project.title);
      
      let framework = await storage.getStoryFrameworkByProject(projectId);
      
      if (framework) {
        framework = await storage.updateStoryFramework(framework.id, {
          generatedTitle: frameworkResult.title,
          genres: frameworkResult.genres,
          premise: frameworkResult.premise,
          openingHook: frameworkResult.openingHook,
        });
      } else {
        framework = await storage.createStoryFramework({
          projectId,
          generatedTitle: frameworkResult.title,
          genres: frameworkResult.genres,
          premise: frameworkResult.premise,
          openingHook: frameworkResult.openingHook,
        });
      }

      res.json(framework);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/projects/:id/framework", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const framework = await storage.getStoryFrameworkByProject(projectId);
      
      if (!framework) {
        return res.status(404).json({ error: "Framework not found" });
      }

      res.json(framework);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/projects/:id/framework", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      let framework = await storage.getStoryFrameworkByProject(projectId);
      
      if (!framework) {
        framework = await storage.createStoryFramework({
          projectId,
          ...req.body,
        });
      } else {
        framework = await storage.updateStoryFramework(framework.id, req.body);
      }

      res.json(framework);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/framework/approve", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      let framework = await storage.getStoryFrameworkByProject(projectId);
      
      if (!framework) {
        return res.status(404).json({ error: "Framework not found" });
      }

      framework = await storage.updateStoryFramework(framework.id, { approved: true });
      await storage.updateProject(projectId, { status: "approved" });

      res.json(framework);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/documentary/generate-framework", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const { storyLength = "medium", totalChapters } = req.body;
      const numChapters = totalChapters || project.chapterCount || 5;
      
      await storage.createGenerationLog({
        projectId,
        step: "framework",
        status: "started",
        message: `Generating documentary framework with ${numChapters} chapters...`
      });

      const framework = await generateDocumentaryFramework(project.title, storyLength, numChapters);
      
      let storedFramework = await storage.getStoryFrameworkByProject(projectId);
      
      if (storedFramework) {
        storedFramework = await storage.updateStoryFramework(storedFramework.id, {
          generatedTitle: framework.title,
          genres: framework.genres,
          premise: framework.premise,
          openingHook: framework.openingHook,
          storyLength,
        });
      } else {
        storedFramework = await storage.createStoryFramework({
          projectId,
          generatedTitle: framework.title,
          genres: framework.genres,
          premise: framework.premise,
          openingHook: framework.openingHook,
          storyLength,
        });
      }

      await storage.createGenerationLog({
        projectId,
        step: "framework",
        status: "completed",
        message: `Framework generated: ${framework.title}`
      });

      res.json({ framework, storedFramework, totalChapters: framework.totalChapters });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/documentary/generate-outline", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const framework = await storage.getStoryFrameworkByProject(projectId);
      
      if (!framework) {
        return res.status(404).json({ error: "Framework not found. Generate framework first." });
      }

      const { totalChapters = 5 } = req.body;
      
      await storage.createGenerationLog({
        projectId,
        step: "outline",
        status: "started",
        message: "Generating chapter outline..."
      });

      const chapters = await generateChapterOutline(
        framework.generatedTitle || "",
        framework.premise || "",
        framework.openingHook || "",
        totalChapters
      );

      await storage.createGenerationLog({
        projectId,
        step: "outline",
        status: "completed",
        message: `Generated ${chapters.length} chapter titles`
      });

      res.json({ chapters });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/documentary/generate-chapter", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const framework = await storage.getStoryFrameworkByProject(projectId);
      
      if (!framework) {
        return res.status(404).json({ error: "Framework not found" });
      }

      const { chapterNumber, totalChapters, chapterTitle } = req.body;
      
      await storage.createGenerationLog({
        projectId,
        step: `chapter_${chapterNumber}`,
        status: "started",
        message: `Generating Chapter ${chapterNumber} script...`
      });

      // Load research data if available
      const research = await storage.getProjectResearch(projectId);
      let chapter;
      
      if (research?.status === "completed" && research.researchSummary) {
        const researchContext = JSON.parse(research.researchSummary);
        
        await storage.createGenerationLog({
          projectId,
          step: `chapter_${chapterNumber}`,
          status: "in_progress",
          message: `Using research data for factual script generation`
        });
        
        chapter = await generateChapterScriptWithResearch(
          framework.generatedTitle || "",
          framework.premise || "",
          chapterNumber,
          totalChapters,
          researchContext,
          chapterTitle
        );
      } else {
        chapter = await generateChapterScript(
          framework.generatedTitle || "",
          framework.premise || "",
          chapterNumber,
          totalChapters,
          chapterTitle
        );
      }

      const savedChapter = await storage.createChapter({
        projectId,
        chapterNumber,
        content: JSON.stringify(chapter),
        wordCount: chapter.narration.split(/\s+/).length,
      });

      await storage.createGenerationLog({
        projectId,
        step: `chapter_${chapterNumber}`,
        status: "completed",
        message: `Chapter ${chapterNumber}: "${chapter.title}" - ${chapter.scenes.length} scenes`
      });

      res.json({ chapter, savedChapter });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/generate-image", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { prompt, model = "flux-1.1-pro", sceneId } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      await storage.createGenerationLog({
        projectId,
        step: `image_${sceneId || "single"}`,
        status: "started",
        message: `Generating image...`
      });

      const result = await generateImage(prompt, {
        model,
        aspectRatio: "16:9",
        projectId,
        sceneId,
      });

      if (result.success) {
        await storage.createGenerationLog({
          projectId,
          step: `image_${sceneId || "single"}`,
          status: "completed",
          message: `Image generated: ${result.imageUrl}`
        });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/generate-chapter-images", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { chapterNumber, scenes, model = "flux-1.1-pro", imageStyle = "color" } = req.body;
      
      if (!scenes || !Array.isArray(scenes)) {
        return res.status(400).json({ error: "Scenes array is required" });
      }

      await storage.createGenerationLog({
        projectId,
        step: `chapter_${chapterNumber}_images`,
        status: "started",
        message: `Generating ${scenes.length} images for Chapter ${chapterNumber}...`
      });

      const results = await generateChapterImages(
        { chapterNumber, scenes },
        projectId,
        { model, imageStyle }
      );

      const successCount = results.filter(r => r.success).length;
      
      // Save successful image assets to database for persistence
      for (const result of results) {
        if (result.success && result.imageUrl) {
          await storage.saveGeneratedAsset({
            projectId,
            chapterNumber,
            sceneNumber: result.sceneNumber,
            assetType: "image",
            assetUrl: result.imageUrl,
          });
        }
      }
      
      await storage.createGenerationLog({
        projectId,
        step: `chapter_${chapterNumber}_images`,
        status: "completed",
        message: `Generated ${successCount}/${scenes.length} images for Chapter ${chapterNumber}`
      });

      res.json({ results, successCount, totalScenes: scenes.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/voices", (_req, res) => {
    res.json(getAvailableVoices());
  });

  app.get("/api/voices/:voice/preview", async (req, res) => {
    try {
      const { voice } = req.params;
      const audioBuffer = await generateVoicePreview(voice);
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Length", audioBuffer.length);
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("[VoicePreview] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/generate-voiceover", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { chapterNumber, narration, voice = "neutral" } = req.body;
      
      if (typeof chapterNumber !== "number" || chapterNumber < 1) {
        return res.status(400).json({ error: "Valid chapterNumber (positive integer) is required" });
      }
      if (!narration || typeof narration !== "string") {
        return res.status(400).json({ error: "Narration text is required" });
      }

      await storage.createGenerationLog({
        projectId,
        step: `chapter_${chapterNumber}_voiceover`,
        status: "started",
        message: `Generating voiceover for Chapter ${chapterNumber}...`
      });

      const audioUrl = await generateChapterVoiceover(
        projectId,
        chapterNumber,
        narration,
        voice
      );

      await storage.createGenerationLog({
        projectId,
        step: `chapter_${chapterNumber}_voiceover`,
        status: "completed",
        message: `Voiceover generated for Chapter ${chapterNumber}`
      });

      res.json({ audioUrl, chapterNumber });
    } catch (error: any) {
      console.error("Voiceover generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/generate-scene-voiceover", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { chapterNumber, sceneNumber, narration, voice = "neutral" } = req.body;
      
      if (typeof chapterNumber !== "number" || chapterNumber < 1) {
        return res.status(400).json({ error: "Valid chapterNumber (positive integer) is required" });
      }
      if (typeof sceneNumber !== "number" || sceneNumber < 1) {
        return res.status(400).json({ error: "Valid sceneNumber (positive integer) is required" });
      }
      if (!narration || typeof narration !== "string") {
        return res.status(400).json({ error: "Narration text is required" });
      }

      await storage.createGenerationLog({
        projectId,
        step: `chapter_${chapterNumber}_scene_${sceneNumber}_voiceover`,
        status: "started",
        message: `Generating voiceover for Chapter ${chapterNumber}, Scene ${sceneNumber}...`
      });

      const audioUrl = await generateSceneVoiceover(
        projectId,
        chapterNumber,
        sceneNumber,
        narration,
        voice
      );
      
      // Measure actual audio duration
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      let audioDurationMs = 5000;
      try {
        const filePath = audioUrl.startsWith('/') ? audioUrl.substring(1) : audioUrl;
        const { stdout } = await execAsync(
          `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`
        );
        const duration = parseFloat(stdout.trim());
        if (!isNaN(duration)) {
          audioDurationMs = Math.round(duration * 1000);
        }
      } catch (e) {
        console.error("Error getting audio duration:", e);
      }

      // Save the audio asset to database with actual duration
      await storage.saveGeneratedAsset({
        projectId,
        chapterNumber,
        sceneNumber,
        assetType: "audio",
        assetUrl: audioUrl,
        narration: narration,
        duration: audioDurationMs,
      });

      await storage.createGenerationLog({
        projectId,
        step: `chapter_${chapterNumber}_scene_${sceneNumber}_voiceover`,
        status: "completed",
        message: `Voiceover generated for Chapter ${chapterNumber}, Scene ${sceneNumber}`
      });

      res.json({ audioUrl, chapterNumber, sceneNumber });
    } catch (error: any) {
      console.error("Scene voiceover generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/assemble-video", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const chapters = await storage.getChaptersByProject(projectId);
      
      if (!chapters.length) {
        return res.status(400).json({ error: "No chapters found" });
      }

      const assets = await storage.getGeneratedAssetsByProject(projectId);
      
      const imageAssets: Record<string, string> = {};
      const audioAssets: Record<string, string> = {};
      
      for (const asset of assets) {
        const key = `ch${asset.chapterNumber}_sc${asset.sceneNumber}`;
        if (asset.assetType === "image") {
          imageAssets[key] = asset.assetUrl;
        } else if (asset.assetType === "audio") {
          audioAssets[key] = asset.assetUrl;
        }
      }

      if (Object.keys(imageAssets).length === 0) {
        return res.status(400).json({ error: "No generated images found. Please generate images first." });
      }

      await storage.createGenerationLog({
        projectId,
        step: "video_assembly",
        status: "started",
        message: `Assembling video from ${chapters.length} chapters with ${Object.keys(imageAssets).length} images and ${Object.keys(audioAssets).length} audio files...`
      });

      const tempAudioDir = path.join(process.cwd(), "temp_audio", `project_${projectId}`);
      if (!fs.existsSync(tempAudioDir)) {
        fs.mkdirSync(tempAudioDir, { recursive: true });
      }
      
      const localAudioPaths: Record<string, string> = {};
      for (const [key, audioUrl] of Object.entries(audioAssets)) {
        if (audioUrl.startsWith("/objects/public/")) {
          const localPath = path.join(tempAudioDir, `${key}.wav`);
          const downloaded = await downloadAudioFromStorage(audioUrl, localPath);
          if (downloaded) {
            localAudioPaths[key] = localPath;
            console.log(`Downloaded audio ${key} to ${localPath}`);
          } else {
            console.warn(`Failed to download audio ${key} from ${audioUrl}`);
          }
        }
      }

      const outputPath = `generated_videos/project_${projectId}_documentary.mp4`;
      
      const getKenBurnsEffect = (n: number) => {
        const effects = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"];
        return effects[(n - 1) % effects.length];
      };
      
      const chaptersData = chapters.map(ch => {
        const content = JSON.parse(ch.content || "{}");
        const scenes = content.scenes || [];
        
        return {
          chapter_number: ch.chapterNumber,
          title: content.title || `Chapter ${ch.chapterNumber}`,
          scenes: scenes.map((s: any) => {
            const key = `ch${ch.chapterNumber}_sc${s.sceneNumber}`;
            const imagePath = imageAssets[key]?.replace(/^\//, "");
            const audioPath = localAudioPaths[key] || undefined;
            
            return {
              scene_number: s.sceneNumber,
              image_path: imagePath ? path.join(process.cwd(), imagePath) : undefined,
              audio_path: audioPath,
              duration: s.duration || 5,
              narration: s.narrationSegment,
              ken_burns_effect: getKenBurnsEffect(s.sceneNumber),
            };
          }).filter((s: any) => s.image_path),
        };
      }).filter(ch => ch.scenes.length > 0);

      if (chaptersData.length === 0) {
        return res.status(400).json({ error: "No valid scenes with images found." });
      }

      const result = await videoService.assembleFullVideo(
        {
          title: project.title,
          chapters: chaptersData,
        },
        outputPath
      );

      try {
        fs.rmSync(tempAudioDir, { recursive: true, force: true });
      } catch (e) {
        console.warn("Could not clean up temp audio directory:", e);
      }

      if (result.success) {
        await storage.createGenerationLog({
          projectId,
          step: "video_assembly",
          status: "completed",
          message: `Video assembled with audio: ${outputPath}`
        });
        
        res.json({ 
          success: true, 
          videoUrl: `/${outputPath}`,
          outputPath 
        });
      } else {
        await storage.createGenerationLog({
          projectId,
          step: "video_assembly",
          status: "failed",
          message: result.error || "Video assembly failed"
        });
        res.status(500).json({ error: result.error || "Video assembly failed" });
      }
    } catch (error: any) {
      console.error("Video assembly error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/autopilot", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { chapters, voice = "neutral", imageModel = "flux-1.1-pro", imageStyle = "color" } = req.body;

      if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
        return res.status(400).json({ error: "Chapters array is required" });
      }

      await storage.createGenerationLog({
        projectId,
        step: "autopilot",
        status: "started",
        message: `Starting autopilot generation (${imageStyle} images): images → audio → video assembly...`
      });

      const result = await runAutopilotGeneration({
        projectId,
        chapters,
        voice,
        imageModel,
        imageStyle,
      });

      if (result.success) {
        res.json({
          success: true,
          videoPath: result.videoPath,
          generatedImages: result.generatedImages,
          generatedAudio: result.generatedAudio,
          errors: result.errors,
        });
      } else {
        res.status(500).json({
          success: false,
          errors: result.errors,
          generatedImages: result.generatedImages,
          generatedAudio: result.generatedAudio,
        });
      }
    } catch (error: any) {
      console.error("Autopilot error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/generate-scene-assets", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { chapterNumber, sceneNumber, imagePrompt, narration, voice = "neutral", imageModel = "flux-1.1-pro" } = req.body;

      if (typeof chapterNumber !== "number" || typeof sceneNumber !== "number") {
        return res.status(400).json({ error: "chapterNumber and sceneNumber are required" });
      }

      const result = await generateSceneAssets(
        projectId,
        chapterNumber,
        sceneNumber,
        imagePrompt,
        narration,
        voice,
        imageModel
      );

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get generation status (for resume functionality)
  app.get("/api/projects/:id/generation-status", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const status = await getGenerationStatus(projectId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Resume incomplete generation
  app.post("/api/projects/:id/resume-generation", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      await storage.createGenerationLog({
        projectId,
        step: "autopilot",
        status: "resumed",
        message: "Resuming interrupted generation..."
      });

      const result = await resumeGeneration(projectId);

      if (result.success) {
        res.json({
          success: true,
          videoPath: result.videoPath,
          generatedImages: result.generatedImages,
          generatedAudio: result.generatedAudio,
          errors: result.errors,
        });
      } else {
        res.status(500).json({
          success: false,
          errors: result.errors,
          generatedImages: result.generatedImages,
          generatedAudio: result.generatedAudio,
        });
      }
    } catch (error: any) {
      console.error("Resume generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all generated assets for a project
  app.get("/api/projects/:id/generated-assets", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const assets = await storage.getGeneratedAssetsByProject(projectId);
      
      // Organize by type
      const images: Record<string, string> = {};
      const audio: Record<string, string> = {};
      
      for (const asset of assets) {
        const key = `ch${asset.chapterNumber}_sc${asset.sceneNumber}`;
        if (asset.assetType === "image") {
          images[key] = asset.assetUrl;
        } else if (asset.assetType === "audio") {
          audio[key] = asset.assetUrl;
        }
      }
      
      res.json({ images, audio, assets });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get generated chapters with scenes (from completed job state)
  app.get("/api/projects/:id/generated-chapters", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Get the most recent completed job for this project using storage
      const job = await storage.getCompletedGenerationJob(projectId);
      
      if (!job || !job.stateData) {
        res.json({ chapters: [] });
        return;
      }
      
      const state = JSON.parse(job.stateData);
      res.json({ chapters: state.chapters || [] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get saved videos from object storage
  app.get("/api/saved-videos", async (req, res) => {
    try {
      const savedVideos: any[] = [];
      
      // First, get videos from object storage
      const publicSearchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map(p => p.trim()).filter(Boolean);
      
      if (publicSearchPaths.length > 0) {
        try {
          const pathParts = publicSearchPaths[0].split("/").filter(Boolean);
          const bucketName = pathParts[0];
          const basePath = pathParts.slice(1).join("/");
          
          const bucket = objectStorageClient.bucket(bucketName);
          const videosPath = basePath ? `${basePath}/videos/` : "videos/";
          
          const [files] = await bucket.getFiles({ prefix: videosPath });
          
          for (const file of files) {
            if (file.name.endsWith(".mp4")) {
              const [metadata] = await file.getMetadata();
              const projectIdMatch = file.name.match(/project_(\d+)_/);
              const projectId = projectIdMatch ? parseInt(projectIdMatch[1]) : 0;
              
              // Construct the full video URL preserving the storage path
              // file.name is the full path within the bucket (e.g., "public/videos/project_1_documentary.mp4")
              const videoUrl = `/objects/public/${file.name}`;
              
              savedVideos.push({
                id: projectId || Math.floor(Math.random() * 10000),
                projectId: projectId,
                title: (metadata.metadata?.title as string) || `Documentary ${projectId}`,
                videoUrl: videoUrl,
                thumbnailUrl: null,
                duration: null,
                size: parseInt(String(metadata.size) || "0"),
                createdAt: metadata.timeCreated || new Date().toISOString(),
                source: "cloud"
              });
            }
          }
        } catch (storageErr) {
          console.error("[SavedVideos] Object storage error:", storageErr);
        }
      }
      
      // Also check for locally rendered videos from RENDERED projects
      const projects = await storage.getAllProjects();
      const renderedProjects = projects.filter(p => p.status === "RENDERED");
      
      for (const p of renderedProjects) {
        // Skip if already in cloud storage
        if (savedVideos.some(v => v.projectId === p.id)) continue;
        
        const localPath = path.join(process.cwd(), `generated_videos/project_${p.id}_documentary.mp4`);
        if (fs.existsSync(localPath)) {
          const stats = fs.statSync(localPath);
          savedVideos.push({
            id: p.id,
            projectId: p.id,
            title: p.title,
            videoUrl: `/generated_videos/project_${p.id}_documentary.mp4`,
            thumbnailUrl: null,
            duration: null,
            size: stats.size,
            createdAt: p.createdAt,
            source: "local"
          });
        }
      }
      
      // Sort by creation date, newest first
      savedVideos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      res.json(savedVideos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get active generation session for a project
  app.get("/api/projects/:id/session", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const session = await storage.getActiveGenerationSession(projectId);
      
      if (!session) {
        res.json({ session: null });
        return;
      }
      
      res.json({ session });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create or update generation session
  app.put("/api/projects/:id/session", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const sessionData = req.body;
      
      // Check for existing session
      const existing = await storage.getActiveGenerationSession(projectId);
      
      if (existing) {
        // Update existing session
        const updated = await storage.updateGenerationSession(existing.id, {
          ...sessionData,
          updatedAt: new Date()
        });
        res.json({ session: updated });
      } else {
        // Create new session
        const created = await storage.createGenerationSession({
          projectId,
          ...sessionData
        });
        res.json({ session: created });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete generation session
  app.delete("/api/projects/:id/session", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const session = await storage.getActiveGenerationSession(projectId);
      
      if (session) {
        await storage.deleteGenerationSession(session.id);
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Background Generation Jobs ============
  
  // Start a background generation job
  app.post("/api/projects/:id/generate-background", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { totalChapters = 5, config = {} } = req.body;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      
      // Check for existing active job
      const existingJob = await storage.getActiveGenerationJob(projectId);
      if (existingJob) {
        res.json({ 
          job: existingJob,
          message: "Existing job found" 
        });
        return;
      }
      
      // Create new job
      const job = await storage.createGenerationJob({
        projectId,
        status: "queued",
        totalChapters,
        configData: JSON.stringify(config),
      });
      
      res.json({ 
        job,
        message: "Job queued successfully" 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // SSE stream for real-time job updates
  app.get("/api/projects/:id/stream", (req, res) => {
    const projectId = parseInt(req.params.id);
    
    if (isNaN(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    
    const clientId = sseBroadcaster.addClient(projectId, res);
    console.log(`[SSE] Client ${clientId} connected for project ${projectId}`);
    
    req.on("close", () => {
      sseBroadcaster.removeClient(clientId);
      console.log(`[SSE] Client ${clientId} disconnected`);
    });
  });

  // Get active generation job for a project
  app.get("/api/projects/:id/job", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const job = await storage.getActiveGenerationJob(projectId);
      
      if (!job) {
        res.json({ job: null });
        return;
      }
      
      // Calculate elapsed time
      const now = new Date();
      const startedAt = job.startedAt ? new Date(job.startedAt) : null;
      const elapsedSeconds = startedAt ? Math.floor((now.getTime() - startedAt.getTime()) / 1000) : 0;
      
      // Parse state data for additional info
      let stateInfo = null;
      if (job.stateData) {
        try {
          stateInfo = JSON.parse(job.stateData);
        } catch (e) {}
      }
      
      res.json({ 
        job: {
          ...job,
          elapsedSeconds,
          elapsedFormatted: formatElapsedTime(elapsedSeconds),
          stateInfo,
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get job by ID
  app.get("/api/generation-jobs/:jobId", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const job = await storage.getGenerationJob(jobId);
      
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      
      // Calculate elapsed time
      const now = new Date();
      const startedAt = job.startedAt ? new Date(job.startedAt) : null;
      const finishedAt = job.finishedAt ? new Date(job.finishedAt) : null;
      const elapsedSeconds = startedAt 
        ? Math.floor(((finishedAt || now).getTime() - startedAt.getTime()) / 1000) 
        : 0;
      
      res.json({ 
        job: {
          ...job,
          elapsedSeconds,
          elapsedFormatted: formatElapsedTime(elapsedSeconds),
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Render video endpoint - exports documentary to MP4
  app.post("/api/render-video", async (req, res) => {
    try {
      const { projectId, title, chapters } = req.body;
      
      if (!projectId || !chapters || !Array.isArray(chapters)) {
        res.status(400).json({ error: "Missing projectId or chapters" });
        return;
      }
      
      console.log(`[RenderVideo] Starting render for project ${projectId} with ${chapters.length} chapters`);
      
      // Create directories
      const tempDir = path.join(process.cwd(), "temp_processing");
      const outputDir = path.join(process.cwd(), "generated_videos");
      const imagesDir = path.join(tempDir, `project_${projectId}_images`);
      const audioDir = path.join(tempDir, `project_${projectId}_audio`);
      
      await fs.promises.mkdir(tempDir, { recursive: true });
      await fs.promises.mkdir(outputDir, { recursive: true });
      await fs.promises.mkdir(imagesDir, { recursive: true });
      await fs.promises.mkdir(audioDir, { recursive: true });
      
      // Download images and audio, build project data for Python
      const processedChapters: any[] = [];
      
      for (const chapter of chapters) {
        const processedScenes: any[] = [];
        
        for (const scene of chapter.scenes || []) {
          const imagePath = path.join(imagesDir, `ch${chapter.chapterNumber}_sc${scene.sceneNumber}.jpg`);
          const audioPath = path.join(audioDir, `ch${chapter.chapterNumber}_sc${scene.sceneNumber}.wav`);
          
          // Download image from URL
          if (scene.imageUrl) {
            try {
              const imageResponse = await fetch(scene.imageUrl);
              if (imageResponse.ok) {
                const buffer = Buffer.from(await imageResponse.arrayBuffer());
                await fs.promises.writeFile(imagePath, buffer);
                console.log(`[RenderVideo] Downloaded image: ${imagePath}`);
              }
            } catch (err) {
              console.error(`[RenderVideo] Failed to download image for scene ${scene.sceneNumber}:`, err);
            }
          }
          
          // Download audio from object storage
          if (scene.audioUrl) {
            try {
              const downloaded = await downloadAudioFromStorage(scene.audioUrl, audioPath);
              if (downloaded) {
                console.log(`[RenderVideo] Downloaded audio: ${audioPath}`);
              }
            } catch (err) {
              console.error(`[RenderVideo] Failed to download audio for scene ${scene.sceneNumber}:`, err);
            }
          }
          
          processedScenes.push({
            scene_number: scene.sceneNumber,
            image_path: imagePath,
            audio_path: fs.existsSync(audioPath) ? audioPath : "",
            duration: scene.duration || 5,
            ken_burns_effect: scene.kenBurnsEffect || "zoom_in"
          });
        }
        
        processedChapters.push({
          chapter_number: chapter.chapterNumber,
          title: chapter.title,
          scenes: processedScenes
        });
      }
      
      const projectData = {
        project_id: projectId,
        title: title || `Documentary ${projectId}`,
        chapters: processedChapters
      };
      
      // Call Python video processor
      const { spawn } = await import("child_process");
      const outputPath = path.join(outputDir, `project_${projectId}_documentary.mp4`);
      
      // Format config for the Python script: assemble_full <json_config>
      const configForPython = JSON.stringify({
        project: projectData,
        output: outputPath
      });
      
      const pythonProcess = spawn("python", [
        "server/python/video_processor.py",
        "assemble_full",
        configForPython
      ]);
      
      let stderr = "";
      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.log(`[RenderVideo] Python: ${data.toString()}`);
      });
      
      await new Promise<void>((resolve, reject) => {
        pythonProcess.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Video processing failed: ${stderr}`));
          }
        });
        pythonProcess.on("error", reject);
      });
      
      // Clean up temp files
      try {
        await fs.promises.rm(imagesDir, { recursive: true, force: true });
        await fs.promises.rm(audioDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn("[RenderVideo] Cleanup warning:", cleanupErr);
      }
      
      // Upload video to object storage
      let objectStorageUrl = "";
      try {
        const publicSearchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map(p => p.trim()).filter(Boolean);
        if (publicSearchPaths.length > 0) {
          const videoBuffer = await fs.promises.readFile(outputPath);
          const videoFileName = `videos/project_${projectId}_documentary.mp4`;
          
          const pathParts = publicSearchPaths[0].split("/").filter(Boolean);
          const bucketName = pathParts[0];
          const basePath = pathParts.slice(1).join("/");
          
          const bucket = objectStorageClient.bucket(bucketName);
          const fullPath = basePath ? `${basePath}/${videoFileName}` : videoFileName;
          const file = bucket.file(fullPath);
          
          await file.save(videoBuffer, {
            contentType: "video/mp4",
            metadata: {
              projectId: projectId.toString(),
              title: title || `Documentary ${projectId}`,
              createdAt: new Date().toISOString()
            }
          });
          
          objectStorageUrl = `/objects/public/${videoFileName}`;
          console.log(`[RenderVideo] Uploaded to object storage: ${objectStorageUrl}`);
        }
      } catch (uploadErr) {
        console.error("[RenderVideo] Object storage upload failed:", uploadErr);
      }
      
      // Update project status to RENDERED
      await storage.updateProject(projectId, { status: "RENDERED" });
      
      console.log(`[RenderVideo] Render complete: ${outputPath}`);
      
      res.json({
        success: true,
        videoUrl: objectStorageUrl || `/generated_videos/project_${projectId}_documentary.mp4`,
        objectStorageUrl,
        message: "Video rendered and saved to library"
      });
    } catch (error: any) {
      console.error("[RenderVideo] Error:", error);
      res.status(500).json({ error: error.message || "Video rendering failed" });
    }
  });

  // Get render progress
  app.get("/api/timeline/render-progress", (req, res) => {
    res.json(currentRenderProgress);
  });

  // Timeline-based video render endpoint - uses timeline JSON as source of truth
  app.post("/api/timeline/render", async (req, res) => {
    try {
      const { timeline, outputName } = req.body;
      
      if (!timeline) {
        res.status(400).json({ error: "Missing timeline data" });
        return;
      }
      
      const parseResult = TimelineSchema.safeParse(timeline);
      if (!parseResult.success) {
        res.status(400).json({ 
          error: "Invalid timeline format", 
          details: fromError(parseResult.error).message 
        });
        return;
      }
      
      const validTimeline = parseResult.data;
      const name = outputName || `timeline_${Date.now()}`;
      
      // Reset progress tracker
      currentRenderProgress = { status: 'downloading', progress: 0, message: 'Starting render...' };
      
      console.log(`[TimelineRender] Starting render: ${name}`);
      console.log(`[TimelineRender] Resolution: ${validTimeline.resolution}, FPS: ${validTimeline.fps}, Duration: ${validTimeline.duration}s`);
      console.log(`[TimelineRender] Video clips: ${validTimeline.tracks.video.length}, Audio clips: ${validTimeline.tracks.audio.length}, Text clips: ${validTimeline.tracks.text.length}`);
      
      const result = await renderTimeline(validTimeline, name, (progress) => {
        // Update global progress tracker
        currentRenderProgress = {
          status: progress.status === 'pending' ? 'downloading' : 
                  progress.status === 'failed' ? 'error' : 
                  progress.status as any,
          progress: progress.progress,
          message: progress.message
        };
        console.log(`[TimelineRender] ${progress.status}: ${progress.message} (${progress.progress}%)`);
      });
      
      if (result.success) {
        currentRenderProgress = { status: 'complete', progress: 100, message: 'Render complete!' };
        res.json({
          success: true,
          videoUrl: result.objectStorageUrl || `/generated_videos/${name}.mp4`,
          objectStorageUrl: result.objectStorageUrl,
          localPath: result.outputPath,
          message: "Timeline rendered successfully"
        });
      } else {
        currentRenderProgress = { status: 'error', progress: 0, message: result.error || 'Render failed' };
        res.status(500).json({ 
          success: false, 
          error: result.error || "Render failed" 
        });
      }
    } catch (error: any) {
      currentRenderProgress = { status: 'error', progress: 0, message: error.message || 'Render failed' };
      console.error("[TimelineRender] Error:", error);
      res.status(500).json({ error: error.message || "Timeline rendering failed" });
    }
  });

  // Auto-render documentary with full editing (chapter titles, captions, color grading)
  app.post("/api/auto-render", async (req, res) => {
    try {
      const { projectId, style, colorGrade, addChapterTitles, addCaptions, bgmUrl } = req.body;
      
      if (!projectId) {
        res.status(400).json({ error: "Missing projectId" });
        return;
      }
      
      console.log(`[AutoRender] Starting auto-render for project ${projectId}`);
      
      // Get project data
      const project = await storage.getProject(projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      
      // Get all generated assets for this project
      const assets = await storage.getGeneratedAssetsByProject(projectId);
      if (!assets || assets.length === 0) {
        res.status(400).json({ error: "No generated assets found for this project" });
        return;
      }
      
      // Get chapter data
      const chapters = await storage.getChaptersByProject(projectId);
      const chapterTitles: Record<number, string> = {};
      for (const ch of chapters) {
        chapterTitles[ch.chapterNumber] = ch.content.split('\n')[0]?.replace(/^#+\s*/, '') || `Chapter ${ch.chapterNumber}`;
      }
      
      // Build asset list for timeline
      const assetList = assets.map(asset => ({
        chapterNumber: asset.chapterNumber,
        chapterTitle: chapterTitles[asset.chapterNumber],
        sceneNumber: asset.sceneNumber,
        imageUrl: asset.assetType === 'image' ? asset.assetUrl : '',
        audioUrl: asset.assetType === 'audio' ? asset.assetUrl : undefined,
        narration: asset.narration || undefined,
        duration: asset.duration ? asset.duration / 1000 : 5,
      })).filter(a => a.imageUrl);
      
      // Merge audio into scenes
      const sceneMap = new Map<string, any>();
      for (const asset of assetList) {
        const key = `${asset.chapterNumber}-${asset.sceneNumber}`;
        if (!sceneMap.has(key)) {
          sceneMap.set(key, asset);
        } else {
          const existing = sceneMap.get(key);
          if (!existing.imageUrl && asset.imageUrl) existing.imageUrl = asset.imageUrl;
          if (!existing.audioUrl && asset.audioUrl) existing.audioUrl = asset.audioUrl;
          if (!existing.narration && asset.narration) existing.narration = asset.narration;
        }
      }
      
      // Get audio URLs
      for (const asset of assets) {
        if (asset.assetType === 'audio') {
          const key = `${asset.chapterNumber}-${asset.sceneNumber}`;
          if (sceneMap.has(key)) {
            sceneMap.get(key).audioUrl = asset.assetUrl;
            if (asset.duration) {
              sceneMap.get(key).duration = asset.duration / 1000;
            }
          }
        }
      }
      
      const mergedAssets = Array.from(sceneMap.values());
      
      console.log(`[AutoRender] Building timeline from ${mergedAssets.length} scenes`);
      
      // Build timeline with auto-editing
      const timeline = buildTimelineFromAssets(
        projectId,
        project.title,
        mergedAssets,
        {
          style: style || "documentary",
          colorGrade: colorGrade,
          addChapterTitles: addChapterTitles !== false,
          addCaptions: addCaptions !== false,
          bgmUrl: bgmUrl,
        }
      );
      
      console.log(`[AutoRender] Timeline built: ${timeline.duration}s duration`);
      console.log(`[AutoRender] Video clips: ${timeline.tracks.video.length}, Audio clips: ${timeline.tracks.audio.length}, Text clips: ${timeline.tracks.text.length}`);
      
      // Render the timeline
      const outputName = `auto_documentary_${projectId}_${Date.now()}`;
      const result = await renderTimeline(timeline, outputName, (progress) => {
        console.log(`[AutoRender] ${progress.status}: ${progress.message} (${progress.progress}%)`);
      });
      
      if (result.success) {
        // Update project status
        await storage.updateProject(projectId, { status: "RENDERED" });
        
        res.json({
          success: true,
          videoUrl: result.objectStorageUrl || `/generated_videos/${outputName}.mp4`,
          objectStorageUrl: result.objectStorageUrl,
          timeline: timeline,
          message: "Documentary auto-rendered successfully with full editing"
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: result.error || "Auto-render failed" 
        });
      }
    } catch (error: any) {
      console.error("[AutoRender] Error:", error);
      res.status(500).json({ error: error.message || "Auto-render failed" });
    }
  });

  // Direct render - Simple grayscale video with fade transitions, no fancy effects
  app.post("/api/render/direct", async (req, res) => {
    try {
      const { projectId } = req.body;
      
      if (!projectId) {
        res.status(400).json({ error: "Missing projectId" });
        return;
      }
      
      console.log(`[DirectRender] Starting simple render for project ${projectId}`);
      
      const project = await storage.getProject(projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      
      const assets = await storage.getGeneratedAssetsByProject(projectId);
      if (!assets || assets.length === 0) {
        res.status(400).json({ error: "No generated assets found" });
        return;
      }
      
      // Group assets by scene
      const sceneMap = new Map<string, { imageUrl: string; audioUrl: string; duration: number; chapterNumber: number; sceneNumber: number }>();
      
      for (const asset of assets) {
        const key = `${asset.chapterNumber}-${asset.sceneNumber}`;
        if (!sceneMap.has(key)) {
          sceneMap.set(key, { 
            imageUrl: '', 
            audioUrl: '', 
            duration: 5, 
            chapterNumber: asset.chapterNumber, 
            sceneNumber: asset.sceneNumber 
          });
        }
        const scene = sceneMap.get(key)!;
        if (asset.assetType === 'image') scene.imageUrl = asset.assetUrl;
        if (asset.assetType === 'audio') {
          scene.audioUrl = asset.assetUrl;
          if (asset.duration) scene.duration = asset.duration / 1000;
        }
      }
      
      const scenes = Array.from(sceneMap.values())
        .filter(s => s.imageUrl && s.audioUrl)
        .sort((a, b) => a.chapterNumber - b.chapterNumber || a.sceneNumber - b.sceneNumber);
      
      if (scenes.length === 0) {
        res.status(400).json({ error: "No complete scenes found (need both image and audio)" });
        return;
      }
      
      console.log(`[DirectRender] Rendering ${scenes.length} scenes`);
      
      // Build simple timeline - grayscale, fade transitions, static images
      const videoClips: any[] = [];
      const audioClips: any[] = [];
      let currentTime = 0;
      const fadeDuration = 0.5;
      
      for (const scene of scenes) {
        const clipDuration = scene.duration + fadeDuration;
        
        videoClips.push({
          id: `video_${scene.chapterNumber}_${scene.sceneNumber}`,
          source: scene.imageUrl,
          startTime: currentTime,
          duration: clipDuration,
          effects: {
            effect: "static",
            colorGrade: "grayscale",
            fade_in: fadeDuration,
            fade_out: fadeDuration
          }
        });
        
        audioClips.push({
          id: `audio_${scene.chapterNumber}_${scene.sceneNumber}`,
          source: scene.audioUrl,
          startTime: currentTime,
          duration: scene.duration,
          volume: 1.0,
          fade_in: 0.1,
          fade_out: 0.1
        });
        
        currentTime += scene.duration;
      }
      
      const timeline = {
        projectId,
        projectName: project.title,
        duration: currentTime + fadeDuration,
        resolution: "1920x1080",
        fps: 30,
        tracks: {
          video: videoClips,
          audio: audioClips,
          text: [] as any[]
        }
      };
      
      const outputName = `direct_${projectId}_${Date.now()}`;
      const result = await renderTimeline(timeline, outputName, (progress) => {
        console.log(`[DirectRender] ${progress.status}: ${progress.message} (${progress.progress}%)`);
      });
      
      if (result.success) {
        await storage.updateProject(projectId, { status: "RENDERED" });
        
        res.json({
          success: true,
          videoUrl: result.objectStorageUrl || `/generated_videos/${outputName}.mp4`,
          objectStorageUrl: result.objectStorageUrl,
          message: "Video rendered successfully"
        });
      } else {
        res.status(500).json({ success: false, error: result.error || "Render failed" });
      }
    } catch (error: any) {
      console.error("[DirectRender] Error:", error);
      res.status(500).json({ error: error.message || "Direct render failed" });
    }
  });

  // AI-powered timeline editing - Claude generates edit plan
  app.post("/api/timeline/ai-edit", async (req, res) => {
    try {
      const { timeline, projectId } = req.body;
      
      if (!timeline) {
        res.status(400).json({ error: "Missing timeline data" });
        return;
      }
      
      const parseResult = TimelineSchema.safeParse(timeline);
      if (!parseResult.success) {
        res.status(400).json({ 
          error: "Invalid timeline format",
          details: fromError(parseResult.error).toString()
        });
        return;
      }
      
      console.log("[AI Edit] Generating AI edit plan for timeline with", parseResult.data.tracks.video.length, "clips");
      
      // Get documentary context if project ID provided
      let context = {
        title: "Documentary",
        chapters: [] as any[]
      };
      
      if (projectId) {
        const project = await storage.getProject(projectId);
        if (project) {
          context.title = project.title;
          
          const chapters = await storage.getChaptersByProject(projectId);
          const assets = await storage.getGeneratedAssetsByProject(projectId);
          
          context.chapters = chapters.map(ch => {
            const chapterAssets = assets.filter(a => a.chapterNumber === ch.chapterNumber);
            return {
              title: ch.content.split('\n')[0]?.replace(/^#+\s*/, '') || `Chapter ${ch.chapterNumber}`,
              scenes: chapterAssets
                .filter(a => a.assetType === 'audio' && a.narration)
                .map(a => ({
                  narration: a.narration || '',
                  imagePrompt: a.prompt || '',
                })),
            };
          });
        }
      }
      
      // Generate AI edit plan using Claude
      const editPlan = await generateAIEditPlan(parseResult.data, context);
      
      // Apply edit plan to timeline
      const enhancedTimeline = applyEditPlanToTimeline(parseResult.data, editPlan, context);
      
      console.log("[AI Edit] Applied", editPlan.clipEdits.length, "clip edits");
      
      res.json({
        success: true,
        timeline: enhancedTimeline,
        editPlan: editPlan,
        message: `AI enhanced ${editPlan.clipEdits.length} clips with documentary styling`
      });
    } catch (error: any) {
      console.error("[AI Edit] Error:", error);
      res.status(500).json({ error: error.message || "AI editing failed" });
    }
  });

  // Get timeline JSON schema info
  app.get("/api/timeline/schema", (_req, res) => {
    res.json({
      schema: {
        resolution: "1920x1080 (default)",
        fps: "30 (default)",
        duration: "number (required)",
        tracks: {
          video: {
            id: "string",
            src: "string (URL or path)",
            start: "number (seconds)",
            duration: "number (seconds)",
            effect: "none | kenburns | zoom_in | zoom_out | pan_left | pan_right",
            fade_in: "number (seconds, optional)",
            fade_out: "number (seconds, optional)",
            blur: "boolean (optional)"
          },
          audio: {
            id: "string",
            src: "string (URL or path)",
            start: "number (seconds)",
            duration: "number (seconds, optional)",
            volume: "0-2 (default: 1.0)",
            fade_in: "number (seconds, optional)",
            fade_out: "number (seconds, optional)",
            ducking: "boolean (optional)"
          },
          text: {
            id: "string",
            text: "string",
            start: "number (seconds)",
            end: "number (seconds)",
            font: "string (default: Serif)",
            size: "number (default: 48)",
            color: "string (default: #FFFFFF)",
            x: "FFmpeg expression (default: centered)",
            y: "FFmpeg expression (default: bottom)",
            box: "boolean (optional)",
            box_color: "string (default: #000000)",
            box_opacity: "0-1 (default: 0.5)"
          }
        }
      }
    });
  });

  return httpServer;
}

function formatElapsedTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}
