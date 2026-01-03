import { Play, Pause, SkipBack, SkipForward, Volume2, Maximize2, Settings2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import generatedImage from '@assets/generated_images/cinematic_sci-fi_movie_concept_art_showing_a_futuristic_city_with_neon_lights.png';

export function VideoPreview() {
  return (
    <div className="flex flex-col h-full bg-black rounded-lg border border-white/10 overflow-hidden shadow-2xl relative group">
      {/* Main Video Area */}
      <div className="flex-1 relative bg-zinc-900 flex items-center justify-center overflow-hidden">
         {/* Placeholder for video content */}
         <img 
           src={generatedImage} 
           alt="Preview" 
           className="w-full h-full object-cover opacity-80"
           style={{ filter: "grayscale(100%)" }}
         />
         
         {/* Overlay Gradients */}
         <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

         {/* Play Overlay (if paused) */}
         <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-primary/20 backdrop-blur-md flex items-center justify-center border border-primary/50 text-primary hover:scale-110 transition-transform cursor-pointer">
              <Play className="h-8 w-8 ml-1 fill-current" />
            </div>
         </div>
         
         <div className="absolute top-4 right-4 bg-black/50 backdrop-blur px-2 py-1 rounded text-xs text-white/70 font-mono">
            1080p • 60fps
         </div>
      </div>

      {/* Controls Bar */}
      <div className="h-16 bg-card border-t border-border px-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-primary hover:text-primary hover:bg-primary/10">
            <Play className="h-5 w-5 fill-current" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground w-24">
          <span>00:14:23</span>
          <span className="text-white/20">/</span>
          <span>01:00:00</span>
        </div>

        <div className="flex-1 mx-4">
           {/* Scrubber */}
           <div className="h-1 bg-white/10 rounded-full relative cursor-pointer group/scrubber">
              <div className="absolute top-0 left-0 bottom-0 w-[24%] bg-primary rounded-full" />
              <div className="absolute top-1/2 left-[24%] -translate-y-1/2 h-3 w-3 bg-white rounded-full opacity-0 group-hover/scrubber:opacity-100 transition-opacity shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
           </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 w-24">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <Slider defaultValue={[75]} max={100} step={1} className="w-full" />
          </div>
          <div className="h-4 w-px bg-white/10" />
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}