import { AppShell } from "@/components/layout/app-shell";
import { VideoPreview } from "@/components/editor/video-preview";
import { TimelineEditor } from "@/components/editor/timeline-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Share2, Save, Undo } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export default function ProjectEditor() {
  const [progress, setProgress] = useState(10);
  
  // Simulate initial generation progress
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return prev + 5;
      });
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
        
        {/* Header Toolbar */}
        <div className="flex items-center justify-between pb-2">
           <div className="space-y-1">
             <div className="flex items-center gap-3">
               <h2 className="text-xl font-display font-bold text-white">The Last Cyberpunk City</h2>
               <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">Draft</Badge>
             </div>
             <p className="text-xs text-muted-foreground font-mono">Last saved: Just now</p>
           </div>

           <div className="flex items-center gap-2">
             <Button variant="outline" size="sm" className="h-8 gap-2 bg-transparent border-white/10 hover:bg-white/5 text-muted-foreground hover:text-white">
               <Undo className="h-3.5 w-3.5" /> Undo
             </Button>
             <Button variant="outline" size="sm" className="h-8 gap-2 bg-transparent border-white/10 hover:bg-white/5 text-muted-foreground hover:text-white">
               <Save className="h-3.5 w-3.5" /> Save
             </Button>
             <div className="h-4 w-px bg-white/10 mx-2" />
             <Button size="sm" className="h-8 gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
               <Download className="h-3.5 w-3.5" /> Export
             </Button>
           </div>
        </div>

        {/* Progress Bar (Visible during generation) */}
        {progress < 100 && (
          <div className="w-full bg-secondary/50 rounded-full h-1 overflow-hidden mb-2">
            <div 
              className="bg-primary h-full transition-all duration-300 ease-out relative"
              style={{ width: `${progress}%` }}
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
                <h3 className="font-display font-bold text-sm text-white mb-4 uppercase tracking-wider opacity-70">Generation Steps</h3>
                
                <div className="space-y-6 relative">
                  <div className="absolute left-1.5 top-2 bottom-2 w-px bg-white/10" />
                  
                  {[
                    { step: 1, label: "Story Analysis", status: "Complete" },
                    { step: 2, label: "Chapter Generation", status: "Complete" },
                    { step: 3, label: "Image Prompting", status: "Complete" },
                    { step: 4, label: "Visual Synthesis", status: "Processing..." },
                    { step: 5, label: "Audio Mix", status: "Pending" },
                    { step: 6, label: "Final Assembly", status: "Pending" },
                  ].map((item, i) => (
                     <div key={i} className="flex gap-3 relative">
                       <div className={cn(
                         "h-3 w-3 rounded-full border-2 z-10 bg-card mt-0.5 transition-colors",
                         i < 3 ? "border-primary bg-primary" : i === 3 ? "border-primary animate-pulse" : "border-muted"
                       )} />
                       <div>
                         <div className={cn("text-xs font-medium leading-none mb-1", i <= 3 ? "text-white" : "text-muted-foreground")}>
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