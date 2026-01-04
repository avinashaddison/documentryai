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
  RefreshCw
} from "lucide-react";
import type { Project } from "@shared/schema";

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  CREATED: { label: "Created", color: "bg-gray-500/20 text-gray-400", icon: Clock },
  RESEARCH_DONE: { label: "Research Done", color: "bg-blue-500/20 text-blue-400", icon: RefreshCw },
  SCRIPT_DONE: { label: "Script Ready", color: "bg-cyan-500/20 text-cyan-400", icon: Edit3 },
  IMAGES_DONE: { label: "Images Ready", color: "bg-purple-500/20 text-purple-400", icon: Film },
  AUDIO_DONE: { label: "Audio Ready", color: "bg-pink-500/20 text-pink-400", icon: CheckCircle2 },
  EDITOR_APPROVED: { label: "Ready to Render", color: "bg-amber-500/20 text-amber-400", icon: CheckCircle2 },
  RENDERED: { label: "Completed", color: "bg-green-500/20 text-green-400", icon: CheckCircle2 },
  FAILED: { label: "Failed", color: "bg-red-500/20 text-red-400", icon: AlertCircle }
};

export default function Projects() {
  const [, navigate] = useLocation();
  
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

  return (
    <WorkspaceSidebar>
      <div className="flex-1 overflow-auto bg-background">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Film className="h-6 w-6 text-orange-500" />
                Video Generated
              </h1>
              <p className="text-muted-foreground mt-1">
                All your documentary projects in one place
              </p>
            </div>
            <Button
              onClick={() => navigate("/create")}
              className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700"
              data-testid="button-new-project"
            >
              New Documentary
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
                <Film className="h-8 w-8 text-orange-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                Start creating your first AI documentary. Enter a topic and let the magic happen.
              </p>
              <Button
                onClick={() => navigate("/create")}
                className="bg-gradient-to-r from-orange-500 to-amber-600"
                data-testid="button-create-first"
              >
                Create Your First Documentary
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => {
                const statusInfo = getStatusInfo(project.status);
                const StatusIcon = statusInfo.icon;
                
                return (
                  <div
                    key={project.id}
                    className="bg-card border border-border rounded-xl p-4 hover:border-orange-500/30 transition-all group cursor-pointer"
                    onClick={() => handleView(project)}
                    data-testid={`project-card-${project.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Film className="h-6 w-6 text-orange-500" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate group-hover:text-orange-400 transition-colors">
                          {project.title || "Untitled Documentary"}
                        </h3>
                        <div className="flex items-center gap-3 mt-1">
                          <Badge className={cn("text-xs font-medium", statusInfo.color)}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                          {project.createdAt && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(project.createdAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {canResume(project.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResume(project);
                            }}
                            className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                            data-testid={`button-resume-${project.id}`}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Resume
                          </Button>
                        )}
                        {project.status === "RENDERED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleView(project);
                            }}
                            className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                            data-testid={`button-view-${project.id}`}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        )}
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-orange-400 transition-colors" />
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
