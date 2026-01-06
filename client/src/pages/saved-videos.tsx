import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  HardDrive,
  Sparkles,
  FolderOpen,
  Layers
} from "lucide-react";

interface SavedVideo {
  id: number;
  projectId: number;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration?: number;
  size?: number;
  createdAt: string;
  source?: "cloud" | "local";
}

export default function SavedVideos() {
  const [, navigate] = useLocation();
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; size: number; delay: number }>>([]);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  
  useEffect(() => {
    const newParticles = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 5
    }));
    setParticles(newParticles);
  }, []);
  
  const { data: savedVideos = [], isLoading } = useQuery<SavedVideo[]>({
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
      <div className="flex-1 overflow-auto bg-[#030306] relative">
        {/* Animated background particles */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          {particles.map((particle) => (
            <div
              key={particle.id}
              className="absolute rounded-full bg-[#7163EB]/20 animate-float"
              style={{
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${6 + Math.random() * 4}s`
              }}
            />
          ))}
        </div>
        
        {/* Top gradient glow */}
        <div className="absolute top-0 left-0 right-0 h-80 bg-gradient-to-b from-[#7163EB]/10 via-fuchsia-500/5 to-transparent pointer-events-none" />
        
        {/* Radial glow in center */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#7163EB]/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto p-8 space-y-8 relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-[-4px] bg-gradient-to-br from-[#7163EB] via-fuchsia-500 to-cyan-500 rounded-2xl blur-lg opacity-60 animate-pulse" />
                  <div className="relative h-14 w-14 rounded-xl bg-gradient-to-br from-[#7163EB]/30 to-fuchsia-500/30 flex items-center justify-center border border-[#7163EB]/40">
                    <Cloud className="h-7 w-7 text-[#7163EB]" />
                  </div>
                </div>
                <div>
                  <h1 className="text-3xl font-black bg-gradient-to-r from-white via-[#7163EB] to-fuchsia-400 bg-clip-text text-transparent flex items-center gap-2">
                    Saved Videos
                    <Sparkles className="h-5 w-5 text-[#7163EB] animate-pulse" />
                  </h1>
                  <p className="text-sm text-white/50 font-medium">
                    Your completed documentaries saved to cloud storage
                  </p>
                </div>
              </div>
            </div>
            
            <Button
              onClick={() => navigate("/projects")}
              className="group relative h-11 px-6 rounded-xl bg-gradient-to-r from-white/5 to-white/[0.02] border border-[#7163EB]/30 hover:border-[#7163EB]/60 text-white/80 hover:text-white transition-all duration-300 overflow-hidden"
              data-testid="button-view-projects"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#7163EB]/0 via-[#7163EB]/10 to-[#7163EB]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <Layers className="h-4 w-4 mr-2 relative z-10" />
              <span className="relative z-10">View All Projects</span>
            </Button>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="relative">
                <div className="absolute inset-[-20px] bg-gradient-to-br from-[#7163EB] via-fuchsia-500 to-cyan-500 rounded-full blur-xl opacity-30 animate-pulse" />
                <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-[#7163EB]/20 to-fuchsia-500/20 border border-[#7163EB]/30 flex items-center justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-[#7163EB]" />
                </div>
              </div>
              <p className="mt-6 text-white/50 font-medium animate-pulse">Loading your videos...</p>
            </div>
          ) : savedVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              {/* Empty state with magical styling */}
              <div className="relative mb-8">
                {/* Outer glow rings */}
                <div className="absolute inset-[-30px] rounded-full border border-[#7163EB]/10 animate-[ping_3s_ease-in-out_infinite]" />
                <div className="absolute inset-[-20px] rounded-full border border-[#7163EB]/20" />
                <div className="absolute inset-[-10px] rounded-full border border-[#7163EB]/30 animate-pulse" />
                
                {/* Main icon container */}
                <div className="relative">
                  <div className="absolute inset-[-8px] bg-gradient-to-br from-[#7163EB] via-fuchsia-500 to-cyan-500 rounded-3xl blur-xl opacity-40 animate-pulse" />
                  <div className="relative h-24 w-24 rounded-2xl bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#0f0f1a] border border-[#7163EB]/40 flex items-center justify-center overflow-hidden">
                    {/* Spinning conic gradient */}
                    <div className="absolute inset-[-1px] rounded-2xl overflow-hidden">
                      <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,#7163EB,#d946ef,#06b6d4,#7163EB)] animate-[spin_4s_linear_infinite] opacity-40" />
                    </div>
                    <CloudOff className="h-10 w-10 text-[#7163EB] relative z-10" />
                    
                    {/* Sparkle effects */}
                    <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full animate-ping" />
                    <div className="absolute bottom-3 left-3 w-1.5 h-1.5 bg-fuchsia-400 rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
              
              <h3 className="text-2xl font-bold bg-gradient-to-r from-white via-[#7163EB] to-white bg-clip-text text-transparent mb-3">
                No saved videos yet
              </h3>
              <p className="text-white/40 mb-8 max-w-md leading-relaxed">
                Complete a documentary and save it to cloud storage. Your rendered masterpieces will appear here.
              </p>
              
              <Button
                onClick={() => navigate("/create")}
                className="group relative h-14 px-8 gap-3 rounded-xl text-base font-bold bg-gradient-to-r from-[#7163EB] via-fuchsia-500 to-[#7163EB] hover:from-[#8B7CF7] hover:via-fuchsia-400 hover:to-[#8B7CF7] border-0 shadow-lg shadow-[#7163EB]/40 hover:shadow-[#7163EB]/60 hover:scale-105 transition-all duration-300 text-white overflow-hidden"
                data-testid="button-create-documentary"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <Sparkles className="h-5 w-5 relative z-10 group-hover:rotate-12 transition-transform" />
                <span className="relative z-10">Create a Documentary</span>
              </Button>
              
              {/* Decorative floating elements */}
              <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-[#7163EB] rounded-full animate-float opacity-40" style={{ animationDelay: '0s' }} />
              <div className="absolute top-1/3 right-1/4 w-3 h-3 bg-fuchsia-500 rounded-full animate-float opacity-30" style={{ animationDelay: '1s' }} />
              <div className="absolute bottom-1/3 left-1/3 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-float opacity-40" style={{ animationDelay: '2s' }} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedVideos.map((video, index) => (
                <div
                  key={video.id}
                  className="group relative"
                  onMouseEnter={() => setHoveredCard(video.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  data-testid={`saved-video-${video.id}`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {/* Card glow effect */}
                  <div className={cn(
                    "absolute inset-[-2px] rounded-2xl bg-gradient-to-br from-[#7163EB] via-fuchsia-500 to-cyan-500 opacity-0 blur-lg transition-all duration-500",
                    hoveredCard === video.id && "opacity-40"
                  )} />
                  
                  <div className="relative bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#0f0f1a] border border-white/10 rounded-2xl overflow-hidden hover:border-[#7163EB]/50 transition-all duration-500">
                    {/* Thumbnail area */}
                    <div className="aspect-video relative bg-black/50 overflow-hidden">
                      {video.thumbnailUrl ? (
                        <img 
                          src={video.thumbnailUrl} 
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1a1a2e] to-[#0a0d14]">
                          <div className="relative">
                            <div className="absolute inset-[-10px] bg-[#7163EB]/20 rounded-full blur-xl animate-pulse" />
                            <Film className="h-14 w-14 text-[#7163EB]/60 relative z-10" />
                          </div>
                        </div>
                      )}
                      
                      {/* Overlay on hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
                        <Button
                          size="icon"
                          className="bg-gradient-to-r from-[#7163EB] to-fuchsia-500 hover:from-[#8B7CF7] hover:to-fuchsia-400 rounded-full h-14 w-14 shadow-lg shadow-[#7163EB]/50 transform scale-75 group-hover:scale-100 transition-all duration-300"
                          onClick={() => window.open(video.videoUrl, "_blank")}
                          data-testid={`button-play-${video.id}`}
                        >
                          <Play className="h-6 w-6 ml-0.5 text-white" />
                        </Button>
                      </div>
                      
                      {/* Source badge */}
                      <Badge className={cn(
                        "absolute top-3 left-3 text-[10px] gap-1.5 font-semibold border-0 backdrop-blur-sm",
                        video.source === "cloud" 
                          ? "bg-[#7163EB]/80 text-white" 
                          : "bg-white/20 text-white"
                      )}>
                        {video.source === "cloud" ? <Cloud className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}
                        {video.source === "cloud" ? "Cloud" : "Local"}
                      </Badge>
                      
                      {video.duration && (
                        <Badge className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs border-0 font-mono">
                          {formatDuration(video.duration)}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Content area */}
                    <div className="p-5">
                      <h3 className="font-bold text-white truncate mb-3 text-lg group-hover:text-[#7163EB] transition-colors duration-300">
                        {video.title || "Untitled Documentary"}
                      </h3>
                      <div className="flex items-center justify-between text-xs text-white/40 mb-4">
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-3.5 w-3.5 text-[#7163EB]/60" />
                          <span>{formatFileSize(video.size)}</span>
                        </div>
                        <span className="text-white/30">{new Date(video.createdAt).toLocaleDateString()}</span>
                      </div>
                      
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-10 rounded-xl border-[#7163EB]/30 text-[#7163EB] hover:bg-[#7163EB]/10 hover:border-[#7163EB]/60 transition-all duration-300"
                          onClick={() => window.open(video.videoUrl, "_blank")}
                          data-testid={`button-open-${video.id}`}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-10 rounded-xl border-white/10 text-white/60 hover:text-white hover:bg-white/5 hover:border-white/20 transition-all duration-300"
                          asChild
                          data-testid={`button-download-${video.id}`}
                        >
                          <a href={video.videoUrl} download>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </a>
                        </Button>
                      </div>
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
