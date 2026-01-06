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
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Zap,
  Layers,
  Calendar,
  TrendingUp
} from "lucide-react";
import type { Project } from "@shared/schema";

const statusConfig: Record<string, { label: string; color: string; bgGlow: string; icon: typeof Clock; gradient: string }> = {
  CREATED: { 
    label: "Created", 
    color: "text-slate-300", 
    bgGlow: "from-slate-500/20 to-slate-600/10",
    icon: Clock,
    gradient: "from-slate-400 to-slate-500"
  },
  RESEARCH_DONE: { 
    label: "Researching", 
    color: "text-blue-400", 
    bgGlow: "from-blue-500/20 to-blue-600/10",
    icon: RefreshCw,
    gradient: "from-blue-400 to-cyan-500"
  },
  SCRIPT_DONE: { 
    label: "Script Ready", 
    color: "text-cyan-400", 
    bgGlow: "from-cyan-500/20 to-teal-600/10",
    icon: Sparkles,
    gradient: "from-cyan-400 to-teal-500"
  },
  IMAGES_DONE: { 
    label: "Images Ready", 
    color: "text-violet-400", 
    bgGlow: "from-violet-500/20 to-purple-600/10",
    icon: Film,
    gradient: "from-violet-400 to-purple-500"
  },
  AUDIO_DONE: { 
    label: "Audio Ready", 
    color: "text-pink-400", 
    bgGlow: "from-pink-500/20 to-rose-600/10",
    icon: CheckCircle2,
    gradient: "from-pink-400 to-rose-500"
  },
  EDITOR_APPROVED: { 
    label: "Ready to Render", 
    color: "text-amber-400", 
    bgGlow: "from-amber-500/20 to-orange-600/10",
    icon: CheckCircle2,
    gradient: "from-amber-400 to-orange-500"
  },
  RENDERED: { 
    label: "Completed", 
    color: "text-emerald-400", 
    bgGlow: "from-emerald-500/20 to-green-600/10",
    icon: CheckCircle2,
    gradient: "from-emerald-400 to-green-500"
  },
  FAILED: { 
    label: "Failed", 
    color: "text-red-400", 
    bgGlow: "from-red-500/20 to-rose-600/10",
    icon: AlertCircle,
    gradient: "from-red-400 to-rose-500"
  }
};

const getProgressFromStatus = (status: string): number => {
  const progressMap: Record<string, number> = {
    CREATED: 10,
    RESEARCH_DONE: 25,
    SCRIPT_DONE: 40,
    IMAGES_DONE: 60,
    AUDIO_DONE: 80,
    EDITOR_APPROVED: 90,
    RENDERED: 100,
    FAILED: 0
  };
  return progressMap[status] || 0;
};

export default function Projects() {
  const [, navigate] = useLocation();
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; size: number; delay: number }>>([]);
  
  useEffect(() => {
    const newParticles = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 5
    }));
    setParticles(newParticles);
  }, []);
  
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    refetchInterval: 10000
  });

  const getStatusInfo = (status: string) => {
    return statusConfig[status] || statusConfig.CREATED;
  };

  const canResume = (status: string) => {
    return !["RENDERED", "FAILED"].includes(status);
  };

  const handleResume = (project: Project) => {
    navigate(`/create/${project.id}`);
  };

  const handleView = (project: Project) => {
    navigate(`/create/${project.id}`);
  };

  const completedCount = projects.filter(p => p.status === "RENDERED").length;
  const inProgressCount = projects.filter(p => !["RENDERED", "FAILED"].includes(p.status)).length;

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
        
        {/* Radial glow */}
        <div className="absolute top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-[#7163EB]/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto p-8 space-y-8 relative z-10">
          {/* Header Card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f0f1a]/90 via-[#1a1a2e]/80 to-[#0f0f1a]/90 border border-[#7163EB]/20 p-8">
            {/* Animated background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#7163EB]/10 via-transparent to-transparent" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-fuchsia-500/10 to-transparent rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-cyan-500/10 to-transparent rounded-full blur-3xl" />
            
            {/* Spinning border accent */}
            <div className="absolute top-0 left-0 right-0 h-[1px] overflow-hidden">
              <div className="h-full w-full bg-gradient-to-r from-transparent via-[#7163EB] to-transparent animate-shimmer" />
            </div>
            
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-[-6px] bg-gradient-to-br from-[#7163EB] via-fuchsia-500 to-cyan-500 rounded-2xl blur-xl opacity-50 animate-pulse" />
                  <div className="relative h-16 w-16 rounded-xl bg-gradient-to-br from-[#7163EB]/30 to-fuchsia-500/30 flex items-center justify-center border border-[#7163EB]/40 overflow-hidden">
                    <div className="absolute inset-[-1px] rounded-xl overflow-hidden">
                      <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,#7163EB,#d946ef,#06b6d4,#7163EB)] animate-[spin_4s_linear_infinite] opacity-40" />
                    </div>
                    <Layers className="h-8 w-8 text-[#7163EB] relative z-10" />
                  </div>
                </div>
                <div>
                  <h1 className="text-3xl font-black bg-gradient-to-r from-white via-[#7163EB] to-fuchsia-400 bg-clip-text text-transparent flex items-center gap-2">
                    Video Generated
                    <Sparkles className="h-5 w-5 text-[#7163EB] animate-pulse" />
                  </h1>
                  <p className="text-white/50 text-sm font-medium mt-1">
                    All your documentary projects in one place
                  </p>
                </div>
              </div>
              
              <Button
                onClick={() => navigate("/create")}
                className="group relative h-12 px-6 gap-2 rounded-xl font-bold bg-gradient-to-r from-[#7163EB] via-fuchsia-500 to-[#7163EB] hover:from-[#8B7CF7] hover:via-fuchsia-400 hover:to-[#8B7CF7] border-0 shadow-lg shadow-[#7163EB]/40 hover:shadow-[#7163EB]/60 hover:scale-105 transition-all duration-300 text-white overflow-hidden"
                data-testid="button-new-project"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <Sparkles className="h-4 w-4 relative z-10 group-hover:rotate-12 transition-transform" />
                <span className="relative z-10">New Documentary</span>
              </Button>
            </div>

            {/* Stats */}
            <div className="relative z-10 flex gap-4 mt-8">
              {[
                { icon: CheckCircle2, value: completedCount, label: "Completed", color: "emerald", gradient: "from-emerald-500/20 to-emerald-600/10" },
                { icon: Zap, value: inProgressCount, label: "In Progress", color: "amber", gradient: "from-amber-500/20 to-amber-600/10" },
                { icon: TrendingUp, value: projects.length, label: "Total Projects", color: "[#7163EB]", gradient: "from-[#7163EB]/20 to-fuchsia-500/10" }
              ].map((stat, i) => (
                <div 
                  key={i}
                  className="group relative flex items-center gap-4 bg-white/5 backdrop-blur-sm rounded-2xl px-5 py-4 border border-white/10 hover:border-[#7163EB]/30 transition-all duration-300 hover:scale-105 cursor-default"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-[#7163EB]/0 via-[#7163EB]/5 to-[#7163EB]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110",
                    `bg-gradient-to-br ${stat.gradient}`
                  )}>
                    <stat.icon className={cn("h-6 w-6", `text-${stat.color}-400`)} />
                  </div>
                  <div className="relative z-10">
                    <p className="text-3xl font-black text-white">{stat.value}</p>
                    <p className={cn("text-xs font-medium", `text-${stat.color}-300/70`)}>{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="relative">
                <div className="absolute inset-[-20px] bg-gradient-to-br from-[#7163EB] via-fuchsia-500 to-cyan-500 rounded-full blur-xl opacity-30 animate-pulse" />
                <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-[#7163EB]/20 to-fuchsia-500/20 border border-[#7163EB]/30 flex items-center justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-[#7163EB]" />
                </div>
              </div>
              <p className="mt-6 text-white/50 font-medium animate-pulse">Loading your projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="relative mb-8">
                <div className="absolute inset-[-30px] rounded-full border border-[#7163EB]/10 animate-[ping_3s_ease-in-out_infinite]" />
                <div className="absolute inset-[-20px] rounded-full border border-[#7163EB]/20" />
                <div className="absolute inset-[-10px] rounded-full border border-[#7163EB]/30 animate-pulse" />
                
                <div className="relative">
                  <div className="absolute inset-[-8px] bg-gradient-to-br from-[#7163EB] via-fuchsia-500 to-cyan-500 rounded-3xl blur-xl opacity-40 animate-pulse" />
                  <div className="relative h-24 w-24 rounded-2xl bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#0f0f1a] border border-[#7163EB]/40 flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-[-1px] rounded-2xl overflow-hidden">
                      <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,#7163EB,#d946ef,#06b6d4,#7163EB)] animate-[spin_4s_linear_infinite] opacity-40" />
                    </div>
                    <Film className="h-10 w-10 text-[#7163EB] relative z-10" />
                  </div>
                </div>
              </div>
              
              <h3 className="text-2xl font-bold bg-gradient-to-r from-white via-[#7163EB] to-white bg-clip-text text-transparent mb-3">
                No projects yet
              </h3>
              <p className="text-white/40 mb-8 max-w-md leading-relaxed">
                Start creating your first AI documentary. Enter a topic and let the magic happen.
              </p>
              
              <Button
                onClick={() => navigate("/create")}
                className="group relative h-14 px-8 gap-3 rounded-xl text-base font-bold bg-gradient-to-r from-[#7163EB] via-fuchsia-500 to-[#7163EB] hover:from-[#8B7CF7] hover:via-fuchsia-400 hover:to-[#8B7CF7] border-0 shadow-lg shadow-[#7163EB]/40 hover:shadow-[#7163EB]/60 hover:scale-105 transition-all duration-300 text-white overflow-hidden"
                data-testid="button-create-first"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <Sparkles className="h-5 w-5 relative z-10 group-hover:rotate-12 transition-transform" />
                <span className="relative z-10">Create Your First Documentary</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((project, index) => {
                const statusInfo = getStatusInfo(project.status);
                const StatusIcon = statusInfo.icon;
                const progress = getProgressFromStatus(project.status);
                const isHovered = hoveredId === project.id;
                const isCompleted = project.status === "RENDERED";
                
                return (
                  <div
                    key={project.id}
                    onMouseEnter={() => setHoveredId(project.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="group relative cursor-pointer animate-in fade-in slide-in-from-bottom-4"
                    onClick={() => handleView(project)}
                    data-testid={`project-card-${project.id}`}
                    style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
                  >
                    {/* Card glow effect */}
                    <div className={cn(
                      "absolute inset-[-2px] rounded-2xl bg-gradient-to-r from-[#7163EB] via-fuchsia-500 to-cyan-500 opacity-0 blur-lg transition-all duration-500",
                      isHovered && "opacity-30"
                    )} />
                    
                    <div className={cn(
                      "relative rounded-2xl transition-all duration-500 overflow-hidden",
                      "bg-gradient-to-br from-[#0f0f1a]/90 via-[#1a1a2e]/80 to-[#0f0f1a]/90",
                      "border border-white/5 hover:border-[#7163EB]/40",
                      isHovered && "scale-[1.01]"
                    )}>
                      {/* Background glow on hover */}
                      <div className={cn(
                        "absolute inset-0 transition-opacity duration-500",
                        `bg-gradient-to-br ${statusInfo.bgGlow}`,
                        isHovered ? "opacity-100" : "opacity-0"
                      )} />
                      
                      {/* Progress bar at bottom */}
                      {!isCompleted && progress > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all duration-700",
                              `bg-gradient-to-r ${statusInfo.gradient}`
                            )}
                            style={{ width: `${progress}%` }}
                          />
                          <div 
                            className="absolute top-0 h-full w-20 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
                            style={{ left: `${progress - 10}%` }}
                          />
                        </div>
                      )}
                      
                      <div className="relative z-10 p-6">
                        <div className="flex items-center gap-6">
                          {/* Thumbnail / Icon */}
                          <div className="relative flex-shrink-0">
                            <div className={cn(
                              "absolute inset-[-4px] rounded-xl blur-md transition-opacity duration-300",
                              `bg-gradient-to-br ${statusInfo.gradient}`,
                              isHovered ? "opacity-40" : "opacity-0"
                            )} />
                            <div className={cn(
                              "relative w-16 h-16 rounded-xl flex items-center justify-center transition-all duration-300",
                              `bg-gradient-to-br ${statusInfo.bgGlow}`,
                              "border border-white/10",
                              isHovered && "scale-110"
                            )}>
                              {isCompleted ? (
                                <div className="relative">
                                  <Play className={cn(
                                    "h-7 w-7 transition-colors duration-300",
                                    `${statusInfo.color}`
                                  )} />
                                </div>
                              ) : (
                                <Film className={cn(
                                  "h-7 w-7 transition-colors duration-300",
                                  `${statusInfo.color}`
                                )} />
                              )}
                            </div>
                            {/* Status indicator dot */}
                            <div className={cn(
                              "absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-lg",
                              `bg-gradient-to-br ${statusInfo.gradient}`,
                              "border-2 border-[#0f0f1a]"
                            )}>
                              <StatusIcon className="h-3 w-3 text-white" />
                            </div>
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <h3 className={cn(
                              "font-bold text-lg truncate transition-colors duration-300",
                              isHovered ? "text-white" : "text-white/90"
                            )}>
                              {project.title || "Untitled Documentary"}
                            </h3>
                            <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                              <Badge className={cn(
                                "text-xs font-semibold px-3 py-1.5 rounded-full",
                                `bg-gradient-to-r ${statusInfo.gradient}`,
                                "text-white border-0 shadow-sm"
                              )}>
                                <StatusIcon className="h-3 w-3 mr-1.5" />
                                {statusInfo.label}
                              </Badge>
                              {project.chapterCount && (
                                <span className="text-xs text-white/40 flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full">
                                  <Film className="h-3 w-3 text-[#7163EB]/60" />
                                  {project.chapterCount} chapters
                                </span>
                              )}
                              {project.createdAt && (
                                <span className="text-xs text-white/40 flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full">
                                  <Calendar className="h-3 w-3 text-[#7163EB]/60" />
                                  {new Date(project.createdAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-3">
                            {canResume(project.status) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleResume(project);
                                }}
                                className={cn(
                                  "border-[#7163EB]/30 text-[#7163EB] hover:bg-[#7163EB]/10 hover:border-[#7163EB]/60",
                                  "transition-all duration-300 h-10 px-5 rounded-xl font-semibold"
                                )}
                                data-testid={`button-resume-${project.id}`}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Resume
                              </Button>
                            )}
                            {isCompleted && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleView(project);
                                }}
                                className={cn(
                                  "bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600",
                                  "text-white border-0 shadow-lg shadow-emerald-500/20",
                                  "transition-all duration-300 h-10 px-5 rounded-xl font-semibold"
                                )}
                                data-testid={`button-view-${project.id}`}
                              >
                                <Play className="h-4 w-4 mr-2" />
                                Watch
                              </Button>
                            )}
                            <div className={cn(
                              "h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300",
                              "bg-white/5 group-hover:bg-[#7163EB]/20 border border-transparent group-hover:border-[#7163EB]/30"
                            )}>
                              <ChevronRight className={cn(
                                "h-5 w-5 transition-all duration-300",
                                isHovered ? "text-[#7163EB] translate-x-0.5" : "text-white/30"
                              )} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </WorkspaceSidebar>
  );
}
