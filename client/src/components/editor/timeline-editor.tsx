import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Layers, Image as ImageIcon, Mic, Type, Scissors } from "lucide-react";

export function TimelineEditor() {
  const tracks = [
    { id: 'video', icon: ImageIcon, color: 'bg-blue-500/20 border-blue-500/50', label: 'Video Track' },
    { id: 'audio', icon: Mic, color: 'bg-green-500/20 border-green-500/50', label: 'Voiceover' },
    { id: 'captions', icon: Type, color: 'bg-orange-500/20 border-orange-500/50', label: 'Captions' },
  ];

  return (
    <div className="flex flex-col h-full bg-card border-t border-border">
      {/* Toolbar */}
      <div className="h-10 border-b border-border flex items-center px-4 gap-2 bg-secondary/30">
        <div className="flex items-center gap-1 border-r border-white/5 pr-2">
          <button className="p-1.5 hover:bg-white/5 rounded text-muted-foreground hover:text-white">
            <Scissors className="h-3.5 w-3.5" />
          </button>
          <button className="p-1.5 hover:bg-white/5 rounded text-muted-foreground hover:text-white">
            <Layers className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">Timeline Editor v1.0</span>
      </div>

      {/* Timeline Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers */}
        <div className="w-48 bg-background border-r border-border flex flex-col pt-8">
          {tracks.map(track => (
            <div key={track.id} className="h-24 px-4 flex items-center gap-3 border-b border-white/5 hover:bg-white/5 transition-colors">
              <track.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">{track.label}</span>
            </div>
          ))}
        </div>

        {/* Timeline Grid */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden relative bg-background/50 timeline-grid">
           {/* Time Markers */}
           <div className="h-8 border-b border-white/10 flex items-end pb-1 sticky top-0 bg-background/95 backdrop-blur z-10">
             {Array.from({ length: 20 }).map((_, i) => (
               <div key={i} className="flex-shrink-0 w-40 text-[10px] text-muted-foreground pl-1 border-l border-white/5 font-mono">
                 00:0{Math.floor(i/2)}:{(i%2)*3}0
               </div>
             ))}
           </div>

           {/* Tracks Content */}
           <div className="relative">
             {/* Playhead */}
             <div className="absolute top-0 bottom-0 left-[24%] w-px bg-primary z-20 shadow-[0_0_10px_rgba(34,211,238,0.8)] pointer-events-none">
                <div className="absolute -top-1 -translate-x-1/2 w-3 h-3 bg-primary rotate-45" />
             </div>

             {tracks.map((track, i) => (
               <div key={track.id} className="h-24 border-b border-white/5 relative py-2">
                 {/* Mock Clips */}
                 <div 
                    className={cn(
                      "absolute top-2 bottom-2 rounded-md border backdrop-blur-sm flex items-center justify-center overflow-hidden cursor-move transition-all hover:brightness-110",
                      track.color
                    )}
                    style={{ left: `${10 + (i * 5)}%`, width: '15%' }}
                 >
                   <span className="text-[10px] font-mono opacity-50 uppercase tracking-wider truncate px-2">Scene {i+1}</span>
                 </div>
                 
                 <div 
                    className={cn(
                      "absolute top-2 bottom-2 rounded-md border backdrop-blur-sm flex items-center justify-center overflow-hidden cursor-move transition-all hover:brightness-110",
                      track.color
                    )}
                    style={{ left: `${30 + (i * 2)}%`, width: '20%' }}
                 >
                   <span className="text-[10px] font-mono opacity-50 uppercase tracking-wider truncate px-2">Scene {i+2}</span>
                 </div>
               </div>
             ))}
           </div>
        </div>
      </div>
    </div>
  );
}