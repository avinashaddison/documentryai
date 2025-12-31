import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

interface ProgressMessage {
  type: "progress" | "step" | "complete" | "error" | "scene_update";
  projectId: number;
  step?: string;
  progress?: number;
  message?: string;
  data?: any;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<number, Set<WebSocket>> = new Map();

  init(httpServer: Server) {
    this.wss = new WebSocketServer({ server: httpServer, path: "/ws/generation" });

    this.wss.on("connection", (ws, req) => {
      const url = new URL(req.url || "", `ws://${req.headers.host}`);
      const projectId = parseInt(url.searchParams.get("projectId") || "0");

      if (projectId) {
        if (!this.clients.has(projectId)) {
          this.clients.set(projectId, new Set());
        }
        this.clients.get(projectId)!.add(ws);

        ws.on("close", () => {
          this.clients.get(projectId)?.delete(ws);
          if (this.clients.get(projectId)?.size === 0) {
            this.clients.delete(projectId);
          }
        });

        ws.send(JSON.stringify({ type: "connected", projectId }));
      }
    });

    console.log("WebSocket server initialized at /ws/generation");
  }

  broadcast(projectId: number, message: ProgressMessage) {
    const clients = this.clients.get(projectId);
    if (!clients) return;

    const payload = JSON.stringify(message);
    Array.from(clients).forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  sendProgress(projectId: number, step: string, progress: number, message: string, data?: any) {
    this.broadcast(projectId, {
      type: "progress",
      projectId,
      step,
      progress,
      message,
      data,
    });
  }

  sendStepChange(projectId: number, step: string, message: string) {
    this.broadcast(projectId, {
      type: "step",
      projectId,
      step,
      message,
    });
  }

  sendSceneUpdate(projectId: number, chapterNumber: number, sceneNumber: number, status: "pending" | "generating" | "completed" | "error", assetType: "image" | "voice" | "video", url?: string) {
    this.broadcast(projectId, {
      type: "scene_update",
      projectId,
      data: {
        chapterNumber,
        sceneNumber,
        status,
        assetType,
        url,
      },
    });
  }

  sendComplete(projectId: number, message: string, videoUrl?: string) {
    this.broadcast(projectId, {
      type: "complete",
      projectId,
      message,
      data: { videoUrl },
    });
  }

  sendError(projectId: number, message: string) {
    this.broadcast(projectId, {
      type: "error",
      projectId,
      message,
    });
  }
}

export const wsService = new WebSocketService();
