import type { Response } from "express";

interface SSEClient {
  id: string;
  res: Response;
  projectId: number;
}

interface SSEEvent {
  type: "job_status" | "chapter_generated" | "scene_image_generated" | "audio_generated" | "progress_update" | "log_entry" | "research_activity" | "outline_generated" | "framework_generated";
  projectId: number;
  jobId?: number;
  data: any;
}

interface ResearchActivity {
  phase: "initial" | "deep" | "synthesis";
  activityType: "query_started" | "query_completed" | "source_found" | "subtopic_identified" | "fact_extracted" | "phase_complete";
  query?: string;
  queryIndex?: number;
  totalQueries?: number;
  source?: { title: string; url: string; snippet?: string };
  subtopic?: string;
  fact?: { claim: string; confidence: string; category: string };
  message: string;
}

interface ProjectState {
  status?: string;
  currentStep?: string;
  progress?: number;
  jobId?: number;
  chapters?: any[];
  images?: Record<string, string>;
  audio?: Record<string, string>;
  researchActivities?: ResearchActivity[];
  outline?: string[];
  framework?: any;
}

class SSEBroadcaster {
  private clients: Map<string, SSEClient> = new Map();
  private projectStates: Map<number, ProjectState> = new Map();

  addClient(projectId: number, res: Response): string {
    const clientId = `${projectId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    
    this.clients.set(clientId, { id: clientId, res, projectId });
    
    // Send current state to new client
    const state = this.projectStates.get(projectId);
    if (state) {
      // Send job status with all relevant fields
      this.sendToClient(clientId, { 
        type: "job_status", 
        projectId, 
        jobId: state.jobId,
        data: { 
          status: state.status, 
          currentStep: state.currentStep,
          progress: state.progress,
          timestamp: new Date().toISOString() 
        } 
      });
      
      // Send accumulated chapters if any
      if (state.chapters && state.chapters.length > 0) {
        state.chapters.forEach(ch => {
          this.sendToClient(clientId, { type: "chapter_generated", projectId, data: { chapter: ch, chapterNumber: ch.chapterNumber, title: ch.title } });
        });
      }
      
      // Send accumulated images if any
      if (state.images) {
        Object.entries(state.images).forEach(([key, url]) => {
          const match = key.match(/ch(\d+)_sc(\d+)/);
          if (match) {
            this.sendToClient(clientId, { type: "scene_image_generated", projectId, data: { key, imageUrl: url, chapterNumber: parseInt(match[1]), sceneNumber: parseInt(match[2]) } });
          }
        });
      }
      
      // Send accumulated audio if any
      if (state.audio) {
        Object.entries(state.audio).forEach(([key, url]) => {
          const match = key.match(/ch(\d+)_sc(\d+)/);
          if (match) {
            this.sendToClient(clientId, { type: "audio_generated", projectId, data: { key, audioUrl: url, chapterNumber: parseInt(match[1]), sceneNumber: parseInt(match[2]) } });
          }
        });
      }
      
      // Send accumulated research activities if any
      if (state.researchActivities && state.researchActivities.length > 0) {
        state.researchActivities.forEach(activity => {
          this.sendToClient(clientId, { type: "research_activity", projectId, data: activity });
        });
      }
      
      // Send cached outline if any
      if (state.outline && state.outline.length > 0) {
        this.sendToClient(clientId, { type: "outline_generated", projectId, data: { outline: state.outline, totalChapters: state.outline.length } });
      }
      
      // Send cached framework if any
      if (state.framework) {
        this.sendToClient(clientId, { type: "framework_generated", projectId, data: { framework: state.framework } });
      }
    }
    
    const heartbeat = setInterval(() => {
      if (this.clients.has(clientId)) {
        res.write(": heartbeat\n\n");
      } else {
        clearInterval(heartbeat);
      }
    }, 15000);
    
    res.on("close", () => {
      this.clients.delete(clientId);
      clearInterval(heartbeat);
    });
    
    return clientId;
  }

  removeClient(clientId: string) {
    const client = this.clients.get(clientId);
    if (client) {
      client.res.end();
      this.clients.delete(clientId);
    }
  }

  private sendToClient(clientId: string, event: SSEEvent) {
    const client = this.clients.get(clientId);
    if (client) {
      const eventData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
      client.res.write(eventData);
    }
  }

  private getOrCreateState(projectId: number): ProjectState {
    let state = this.projectStates.get(projectId);
    if (!state) {
      state = { chapters: [], images: {}, audio: {} };
      this.projectStates.set(projectId, state);
    }
    return state;
  }

  broadcast(event: SSEEvent) {
    const state = this.getOrCreateState(event.projectId);
    
    // Update cached state based on event type
    if (event.type === "job_status") {
      state.status = event.data.status;
      state.currentStep = event.data.currentStep;
      state.jobId = event.jobId;
      if (event.data.progress !== undefined) {
        state.progress = event.data.progress;
      }
    } else if (event.type === "progress_update") {
      state.progress = event.data.progress;
      state.currentStep = event.data.step;
    } else if (event.type === "chapter_generated") {
      if (!state.chapters) state.chapters = [];
      const existing = state.chapters.findIndex(c => c.chapterNumber === event.data.chapterNumber);
      if (existing >= 0) {
        state.chapters[existing] = event.data.chapter;
      } else {
        state.chapters.push(event.data.chapter);
      }
    } else if (event.type === "scene_image_generated") {
      if (!state.images) state.images = {};
      state.images[event.data.key] = event.data.imageUrl;
    } else if (event.type === "audio_generated") {
      if (!state.audio) state.audio = {};
      state.audio[event.data.key] = event.data.audioUrl;
    } else if (event.type === "research_activity") {
      if (!state.researchActivities) state.researchActivities = [];
      state.researchActivities.push(event.data);
      // Keep only recent 50 activities for memory efficiency
      if (state.researchActivities.length > 50) {
        state.researchActivities = state.researchActivities.slice(-50);
      }
    } else if (event.type === "outline_generated") {
      state.outline = event.data.outline;
    } else if (event.type === "framework_generated") {
      state.framework = event.data.framework;
    }
    
    this.clients.forEach((client, clientId) => {
      if (client.projectId === event.projectId) {
        this.sendToClient(clientId, event);
      }
    });
  }

  emitChapterGenerated(projectId: number, jobId: number, chapter: any) {
    this.broadcast({
      type: "chapter_generated",
      projectId,
      jobId,
      data: {
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        scenesCount: chapter.scenes?.length || 0,
        chapter,
      },
    });
  }

  emitOutlineGenerated(projectId: number, jobId: number, outline: string[]) {
    this.broadcast({
      type: "outline_generated",
      projectId,
      jobId,
      data: {
        outline,
        totalChapters: outline.length,
      },
    });
  }

  emitFrameworkGenerated(projectId: number, jobId: number, framework: any) {
    this.broadcast({
      type: "framework_generated",
      projectId,
      jobId,
      data: {
        framework,
      },
    });
  }

  emitImageGenerated(projectId: number, jobId: number, chapterNumber: number, sceneNumber: number, imageUrl: string) {
    this.broadcast({
      type: "scene_image_generated",
      projectId,
      jobId,
      data: {
        chapterNumber,
        sceneNumber,
        imageUrl,
        key: `ch${chapterNumber}_sc${sceneNumber}`,
      },
    });
  }

  emitAudioGenerated(projectId: number, jobId: number, chapterNumber: number, sceneNumber: number, audioUrl: string) {
    this.broadcast({
      type: "audio_generated",
      projectId,
      jobId,
      data: {
        chapterNumber,
        sceneNumber,
        audioUrl,
        key: `ch${chapterNumber}_sc${sceneNumber}`,
      },
    });
  }

  emitProgress(projectId: number, jobId: number, step: string, progress: number, message: string) {
    this.broadcast({
      type: "progress_update",
      projectId,
      jobId,
      data: {
        step,
        progress,
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }

  emitLog(projectId: number, step: string, status: string, message: string) {
    this.broadcast({
      type: "log_entry",
      projectId,
      data: {
        step,
        status,
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }

  emitJobStatus(projectId: number, jobId: number, status: string, currentStep: string, progress?: number) {
    this.broadcast({
      type: "job_status",
      projectId,
      jobId,
      data: {
        status,
        currentStep,
        progress: progress ?? this.getOrCreateState(projectId).progress ?? 0,
        timestamp: new Date().toISOString(),
      },
    });
  }
  
  clearProjectState(projectId: number) {
    this.projectStates.delete(projectId);
  }

  emitResearchActivity(
    projectId: number, 
    jobId: number, 
    activity: ResearchActivity
  ) {
    this.broadcast({
      type: "research_activity",
      projectId,
      jobId,
      data: {
        ...activity,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

export const sseBroadcaster = new SSEBroadcaster();
export type { ResearchActivity };
