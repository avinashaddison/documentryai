import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ensureDbConnected } from "./db";
import { insertProjectSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { videoService } from "./video-service";
import { generateStoryFramework } from "./framework-generator";
import { 
  generateDocumentaryFramework, 
  generateChapterScript, 
  generateChapterOutline 
} from "./documentary-generator";
import { generateImage, generateChapterImages } from "./image-generator";
import { generateChapterVoiceover, generateSceneVoiceover, getAvailableVoices } from "./tts-service";
import { runAutopilotGeneration, generateSceneAssets, getGenerationStatus, resumeGeneration } from "./autopilot-generator";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  await ensureDbConnected();

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

      const chapter = await generateChapterScript(
        framework.generatedTitle || "",
        framework.premise || "",
        chapterNumber,
        totalChapters,
        chapterTitle
      );

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

      // Save the audio asset to database for persistence
      await storage.saveGeneratedAsset({
        projectId,
        chapterNumber,
        sceneNumber,
        assetType: "audio",
        assetUrl: audioUrl,
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

      await storage.createGenerationLog({
        projectId,
        step: "video_assembly",
        status: "started",
        message: `Assembling video from ${chapters.length} chapters...`
      });

      const outputPath = `generated_videos/project_${projectId}_documentary.mp4`;
      
      const chaptersData = chapters.map(ch => {
        const content = JSON.parse(ch.content || "{}");
        return {
          chapter_number: ch.chapterNumber,
          scenes: content.scenes?.map((s: any) => ({
            image_path: `generated_assets/images/${projectId}_ch${ch.chapterNumber}_sc${s.sceneNumber}.webp`,
            duration: s.duration || 5,
            prompt: s.imagePrompt,
          })) || [],
        };
      });

      const result = await videoService.assembleFullVideo(
        {
          title: project.title,
          chapters: chaptersData,
        },
        outputPath
      );

      if (result.success) {
        await storage.createGenerationLog({
          projectId,
          step: "video_assembly",
          status: "completed",
          message: `Video assembled: ${outputPath}`
        });
      }

      res.json({ ...result, outputPath });
    } catch (error: any) {
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

  return httpServer;
}
