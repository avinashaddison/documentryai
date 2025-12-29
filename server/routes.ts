import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ensureDbConnected } from "./db";
import { insertProjectSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { videoService } from "./video-service";
import { generateStoryFramework } from "./framework-generator";

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

  return httpServer;
}
