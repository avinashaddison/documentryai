import { useState } from "react";
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
  Trash2,
  Edit3,
  RefreshCw,
  Sparkles,
  Zap,
  Video,
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
    icon: Edit3,
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
  
  const { data: projects = [], isLoading, refetch } = useQuery<Project[]>({
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
      <div className="flex-1 overflow-auto bg-[#050508]">
        <div className="max-w-6xl mx-auto p-6 space-y-8">
          {/* Header */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-950/50 via-slate-900/80 to-fuchsia-950/30 border border-violet-500/20 p-8">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-500/10 via-transparent to-transparent" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-fuchsia-500/10 to-transparent rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-cyan-500/10 to-transparent rounded-full blur-3xl" />
            
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl blur-lg opacity-50" />
                    <div className="relative h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                      <Video className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div>
                    <h1 className="text-3xl font-black bg-gradient-to-r from-white via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
                      Video Generated
                    </h1>
                    <p className="text-violet-300/70 text-sm">
                      All your documentary projects in one place
                    </p>
                  </div>
                </div>
              </div>
              
              <Button
                onClick={() => navigate("/create")}
                className="relative group overflow-hidden bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 hover:from-violet-600 hover:via-fuchsia-600 hover:to-pink-600 border-0 shadow-lg shadow-fuchsia-500/25 h-12 px-6"
                data-testid="button-new-project"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <Sparkles className="h-4 w-4 mr-2" />
                New Documentary
              </Button>
            </div>

            {/* Stats */}
            <div className="relative z-10 flex gap-6 mt-6">
              <div className="flex items-center gap-3 bg-white/5 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{completedCount}</p>
                  <p className="text-xs text-emerald-300/70">Completed</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/5 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
                <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{inProgressCount}</p>
                  <p className="text-xs text-amber-300/70">In Progress</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/5 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
                <div className="h-10 w-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{projects.length}</p>
                  <p className="text-xs text-violet-300/70">Total Projects</p>
                </div>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-full blur-xl opacity-30 animate-pulse" />
                <Loader2 className="h-12 w-12 animate-spin text-violet-400 relative z-10" />
              </div>
              <p className="text-violet-300/70 mt-4 animate-pulse">Loading your projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-3xl blur-2xl opacity-20" />
                <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 flex items-center justify-center">
                  <Film className="h-12 w-12 text-violet-400" />
                </div>
              </div>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-white to-violet-200 bg-clip-text text-transparent mb-3">
                No projects yet
              </h3>
              <p className="text-muted-foreground mb-8 max-w-md">
                Start creating your first AI documentary. Enter a topic and let the magic happen.
              </p>
              <Button
                onClick={() => navigate("/create")}
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 h-12 px-8 shadow-lg shadow-violet-500/25"
                data-testid="button-create-first"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Create Your First Documentary
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
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
                    className={cn(
                      "relative group cursor-pointer rounded-2xl transition-all duration-500",
                      "bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-800/50",
                      "border border-white/5 hover:border-violet-500/30",
                      "hover:shadow-xl hover:shadow-violet-500/10",
                      isHovered && "scale-[1.01]"
                    )}
                    onClick={() => handleView(project)}
                    data-testid={`project-card-${project.id}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Background glow on hover */}
                    <div className={cn(
                      "absolute inset-0 rounded-2xl transition-opacity duration-500",
                      `bg-gradient-to-br ${statusInfo.bgGlow}`,
                      isHovered ? "opacity-100" : "opacity-0"
                    )} />
                    
                    {/* Progress bar at bottom */}
                    {!isCompleted && progress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 rounded-b-2xl overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all duration-700",
                            `bg-gradient-to-r ${statusInfo.gradient}`
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                    
                    <div className="relative z-10 p-5">
                      <div className="flex items-center gap-5">
                        {/* Thumbnail / Icon */}
                        <div className="relative flex-shrink-0">
                          <div className={cn(
                            "w-16 h-16 rounded-xl flex items-center justify-center transition-all duration-300",
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
                                <div className="absolute inset-0 animate-ping">
                                  <Play className="h-7 w-7 text-emerald-400 opacity-30" />
                                </div>
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
                            "absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center",
                            `bg-gradient-to-br ${statusInfo.gradient}`,
                            "border-2 border-slate-900"
                          )}>
                            <StatusIcon className="h-2.5 w-2.5 text-white" />
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
                          <div className="flex items-center gap-3 mt-2">
                            <Badge className={cn(
                              "text-xs font-semibold px-3 py-1 rounded-full",
                              `bg-gradient-to-r ${statusInfo.gradient}`,
                              "text-white border-0 shadow-sm"
                            )}>
                              <StatusIcon className="h-3 w-3 mr-1.5" />
                              {statusInfo.label}
                            </Badge>
                            {project.chapterCount && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Film className="h-3 w-3" />
                                {project.chapterCount} chapters
                              </span>
                            )}
                            {project.createdAt && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
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
                                "border-violet-500/30 text-violet-300 hover:bg-violet-500/10 hover:border-violet-400/50",
                                "transition-all duration-300 h-10 px-4"
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
                                "transition-all duration-300 h-10 px-5"
                              )}
                              data-testid={`button-view-${project.id}`}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Watch
                            </Button>
                          )}
                          <div className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300",
                            "bg-white/5 group-hover:bg-violet-500/20"
                          )}>
                            <ChevronRight className={cn(
                              "h-5 w-5 transition-all duration-300",
                              isHovered ? "text-violet-400 translate-x-0.5" : "text-muted-foreground"
                            )} />
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
