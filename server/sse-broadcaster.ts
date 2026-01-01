import type { Response } from "express";

interface SSEClient {
  id: string;
  res: Response;
  projectId: number;
}

interface SSEEvent {
  type: "job_status" | "chapter_generated" | "scene_image_generated" | "audio_generated" | "progress_update" | "log_entry";
  projectId: number;
  jobId?: number;
  data: any;
}

interface ProjectState {
  status?: string;
  currentStep?: string;
  progress?: number;
  jobId?: number;
  chapters?: any[];
  images?: Record<string, string>;
  audio?: Record<string, string>;
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
}

export const sseBroadcaster = new SSEBroadcaster();
