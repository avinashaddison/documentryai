import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { 
  Play, 
  Film, 
  Cloud,
  Download,
  Loader2,
  ExternalLink,
  CloudOff,
  HardDrive
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface SavedVideo {
  id: number;
  projectId: number;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration?: number;
  size?: number;
  createdAt: string;
}

export default function SavedVideos() {
  const [, navigate] = useLocation();
  
  const { data: savedVideos = [], isLoading, refetch } = useQuery<SavedVideo[]>({
    queryKey: ["/api/saved-videos"],
    queryFn: async () => {
      const res = await fetch("/api/saved-videos");
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error("Failed to fetch saved videos");
      }
      return res.json();
    },
  });

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "Unknown";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <WorkspaceSidebar>
      <div className="flex-1 overflow-auto bg-background">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Cloud className="h-6 w-6 text-orange-500" />
                Saved Videos
              </h1>
              <p className="text-muted-foreground mt-1">
                Videos saved to cloud storage
              </p>
            </div>
            <Button
              onClick={() => navigate("/projects")}
              variant="outline"
              className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
              data-testid="button-view-projects"
            >
              View All Projects
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
          ) : savedVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
                <CloudOff className="h-8 w-8 text-orange-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No saved videos yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                Complete a documentary and save it to cloud storage. Your rendered videos will appear here.
              </p>
              <Button
                onClick={() => navigate("/create")}
                className="bg-gradient-to-r from-orange-500 to-amber-600"
                data-testid="button-create-documentary"
              >
                Create a Documentary
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedVideos.map((video) => (
                <div
                  key={video.id}
                  className="bg-card border border-border rounded-xl overflow-hidden hover:border-orange-500/30 transition-all group"
                  data-testid={`saved-video-${video.id}`}
                >
                  <div className="aspect-video relative bg-black/50">
                    {video.thumbnailUrl ? (
                      <img 
                        src={video.thumbnailUrl} 
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        size="icon"
                        className="bg-orange-500 hover:bg-orange-600 rounded-full h-12 w-12"
                        onClick={() => window.open(video.videoUrl, "_blank")}
                        data-testid={`button-play-${video.id}`}
                      >
                        <Play className="h-5 w-5 ml-0.5" />
                      </Button>
                    </div>
                    {video.duration && (
                      <Badge className="absolute bottom-2 right-2 bg-black/70 text-white text-xs">
                        {formatDuration(video.duration)}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="p-4">
                    <h3 className="font-semibold text-white truncate mb-2">
                      {video.title || "Untitled Documentary"}
                    </h3>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-3 w-3" />
                        {formatFileSize(video.size)}
                      </div>
                      <span>{new Date(video.createdAt).toLocaleDateString()}</span>
                    </div>
                    
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                        onClick={() => window.open(video.videoUrl, "_blank")}
                        data-testid={`button-open-${video.id}`}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Open
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        asChild
                        data-testid={`button-download-${video.id}`}
                      >
                        <a href={video.videoUrl} download>
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </WorkspaceSidebar>
  );
}
