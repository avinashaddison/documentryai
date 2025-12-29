import { AppShell } from "@/components/layout/app-shell";
import { VideoPreview } from "@/components/editor/video-preview";
import { TimelineEditor } from "@/components/editor/timeline-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Save, Undo } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";

interface Project {
  id: number;
  title: string;
  status: string;
  progress: number;
  currentStep: number;
  chapters?: any[];
  logs?: Array<{ step: string; status: string; message: string; createdAt: string }>;
}

export default function ProjectEditor() {
  const [, params] = useRoute("/editor/:id");
  const projectId = params?.id;

  const { data: project, refetch } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    refetchInterval: (query) => {
      return query.state.data?.status === "generating" ? 2000 : false;
    },
    enabled: !!projectId,
  });

  const steps = [
    { id: 1, label: "Story (Claude 3.5)", status: project?.currentStep && project.currentStep > 0 ? "Complete" : project?.currentStep === 0 && project.status === "generating" ? "Generating..." : "Pending" },
    { id: 2, label: "Prompts (GPT-5)", status: project?.currentStep && project.currentStep > 1 ? "Complete" : project?.currentStep === 1 && project.status === "generating" ? "Refining..." : "Pending" },
    { id: 3, label: "Images (Flux 1.1 Pro)", status: project?.currentStep && project.currentStep > 2 ? "Complete" : project?.currentStep === 2 && project.status === "generating" ? "Synthesizing..." : "Pending" },
    { id: 4, label: "Voice (Speechify)", status: project?.currentStep && project.currentStep > 3 ? "Complete" : project?.currentStep === 3 && project.status === "generating" ? "Recording..." : "Pending" },
    { id: 5, label: "Assembly (FFmpeg)", status: project?.currentStep && project.currentStep > 4 ? "Complete" : project?.currentStep === 4 && project.status === "generating" ? "Rendering..." : "Pending" },
  ];

  if (!project) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">Loading project...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
        
        {/* Header Toolbar */}
        <div className="flex items-center justify-between pb-2">
           <div className="space-y-1">
             <div className="flex items-center gap-3">
               <h2 className="text-xl font-display font-bold text-white" data-testid="text-project-title">{project.title}</h2>
               <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20" data-testid="badge-status">
                 {project.status}
               </Badge>
             </div>
             <p className="text-xs text-muted-foreground font-mono">
               Pipeline: Claude → GPT-5 → Flux 1.1 Pro
             </p>
           </div>

           <div className="flex items-center gap-2">
             <Button variant="outline" size="sm" className="h-8 gap-2 bg-transparent border-white/10 hover:bg-white/5 text-muted-foreground hover:text-white" data-testid="button-undo">
               <Undo className="h-3.5 w-3.5" /> Undo
             </Button>
             <Button variant="outline" size="sm" className="h-8 gap-2 bg-transparent border-white/10 hover:bg-white/5 text-muted-foreground hover:text-white" data-testid="button-save">
               <Save className="h-3.5 w-3.5" /> Save
             </Button>
             <div className="h-4 w-px bg-white/10 mx-2" />
             <Button size="sm" className="h-8 gap-2 bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-export">
               <Download className="h-3.5 w-3.5" /> Export
             </Button>
           </div>
        </div>

        {/* Progress Bar (Visible during generation) */}
        {project.status === "generating" && (
          <div className="w-full bg-secondary/50 rounded-full h-1 overflow-hidden mb-2">
            <div 
              className="bg-primary h-full transition-all duration-300 ease-out relative"
              style={{ width: `${project.progress}%` }}
              data-testid="progress-bar"
            >
              <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white/50 to-transparent opacity-50" />
            </div>
          </div>
        )}

        {/* Editor Layout */}
        <div className="flex-1 grid grid-rows-[60%_40%] gap-4 min-h-0">
          
          {/* Top Section */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-4 min-h-0">
             {/* Preview */}
             <VideoPreview />
             
             {/* Asset/Properties Panel */}
             <div className="bg-card border border-border rounded-lg p-4 overflow-y-auto hidden md:block">
                <h3 className="font-display font-bold text-sm text-white mb-4 uppercase tracking-wider opacity-70">Pipeline Status</h3>
                
                <div className="space-y-6 relative">
                  <div className="absolute left-1.5 top-2 bottom-2 w-px bg-white/10" />
                  
                  {steps.map((item, i) => (
                     <div key={i} className="flex gap-3 relative" data-testid={`step-${item.id}`}>
                       <div className={cn(
                         "h-3 w-3 rounded-full border-2 z-10 bg-card mt-0.5 transition-all duration-300",
                         item.status === "Complete" ? "border-primary bg-primary" : 
                         item.status.includes("...") ? "border-primary bg-transparent animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.5)]" : 
                         "border-muted bg-card"
                       )} />
                       <div>
                         <div className={cn("text-xs font-medium leading-none mb-1 transition-colors", 
                           item.status === "Pending" ? "text-muted-foreground" : "text-white"
                         )}>
                           {item.label}
                         </div>
                         <div className="text-[10px] text-muted-foreground">{item.status}</div>
                       </div>
                     </div>
                  ))}
                </div>
             </div>
          </div>

          {/* Bottom Section: Timeline */}
          <div className="min-h-0">
            <TimelineEditor />
          </div>

        </div>

      </div>
    </AppShell>
  );
}