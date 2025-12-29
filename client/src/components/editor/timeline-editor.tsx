import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { 
  Layers, 
  Image as ImageIcon, 
  Mic, 
  Type, 
  Scissors, 
  ZoomIn, 
  ZoomOut,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Copy,
  Magnet,
  Undo,
  Redo,
  SplitSquareHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Track {
  id: string;
  type: 'video' | 'audio' | 'caption';
  label: string;
  visible: boolean;
  locked: boolean;
  muted: boolean;
  solo: boolean;
  clips: Clip[];
}

interface Clip {
  id: string;
  name: string;
  start: number;
  duration: number;
  color: string;
}

function formatTimecode(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export function TimelineEditor() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(323.33); // 00:05:23:10
  const [zoom, setZoom] = useState(100);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  const totalDuration = 600; // 10 minutes
  const pixelsPerSecond = zoom / 10;

  const [tracks, setTracks] = useState<Track[]>([
    { 
      id: 'v2', type: 'video', label: 'V2', visible: true, locked: false, muted: false, solo: false,
      clips: []
    },
    { 
      id: 'v1', type: 'video', label: 'V1', visible: true, locked: false, muted: false, solo: false,
      clips: [
        { id: 'clip1', name: 'Intro.mp4', start: 0, duration: 45, color: 'bg-blue-600/80' },
        { id: 'clip2', name: 'Scene01.mp4', start: 50, duration: 80, color: 'bg-blue-500/80' },
        { id: 'clip3', name: 'Scene02.mp4', start: 140, duration: 120, color: 'bg-blue-600/80' },
        { id: 'clip4', name: 'Scene03.mp4', start: 270, duration: 90, color: 'bg-blue-500/80' },
      ]
    },
    { 
      id: 'a1', type: 'audio', label: 'A1', visible: true, locked: false, muted: false, solo: false,
      clips: [
        { id: 'audio1', name: 'Voiceover.wav', start: 0, duration: 360, color: 'bg-green-600/80' },
      ]
    },
    { 
      id: 'a2', type: 'audio', label: 'A2', visible: true, locked: false, muted: false, solo: false,
      clips: [
        { id: 'music1', name: 'BGM.mp3', start: 0, duration: 400, color: 'bg-purple-600/80' },
      ]
    },
    { 
      id: 'c1', type: 'caption', label: 'CC', visible: true, locked: false, muted: false, solo: false,
      clips: [
        { id: 'cap1', name: 'Subtitles', start: 5, duration: 350, color: 'bg-orange-600/80' },
      ]
    },
  ]);

  const toggleTrackProperty = (trackId: string, property: 'visible' | 'locked' | 'muted' | 'solo') => {
    setTracks(prev => prev.map(track => 
      track.id === trackId ? { ...track, [property]: !track[property] } : track
    ));
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const newTime = Math.max(0, Math.min(totalDuration, x / pixelsPerSecond));
    setCurrentTime(newTime);
  };

  const generateTimeMarkers = () => {
    const markers = [];
    const interval = zoom > 150 ? 5 : zoom > 80 ? 10 : zoom > 40 ? 30 : 60;
    for (let t = 0; t <= totalDuration; t += interval) {
      markers.push(t);
    }
    return markers;
  };

  const getTrackIcon = (type: string) => {
    switch (type) {
      case 'video': return ImageIcon;
      case 'audio': return Mic;
      case 'caption': return Type;
      default: return Layers;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a] border-t border-[#333] select-none" data-testid="timeline-editor">
      {/* Top Toolbar */}
      <div className="h-10 border-b border-[#333] flex items-center px-2 gap-1 bg-[#252525]">
        {/* Playback Controls */}
        <div className="flex items-center gap-0.5 border-r border-[#444] pr-2 mr-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10" data-testid="button-skip-back">
                <SkipBack className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Go to Start</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10"
                onClick={() => setIsPlaying(!isPlaying)}
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPlaying ? 'Pause' : 'Play'}</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10" data-testid="button-skip-forward">
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Go to End</TooltipContent>
          </Tooltip>
        </div>

        {/* Timecode Display */}
        <div className="bg-[#111] border border-[#444] rounded px-2 py-0.5 font-mono text-xs text-primary min-w-[100px] text-center" data-testid="text-timecode">
          {formatTimecode(currentTime)}
        </div>

        <div className="w-px h-5 bg-[#444] mx-2" />

        {/* Edit Tools */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10" data-testid="button-undo">
                <Undo className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10" data-testid="button-redo">
                <Redo className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>
          
          <div className="w-px h-5 bg-[#444] mx-1" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10" data-testid="button-cut">
                <Scissors className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Split Clip (S)</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10" data-testid="button-split">
                <SplitSquareHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ripple Split</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10" data-testid="button-copy">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate (Ctrl+D)</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10" data-testid="button-delete">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete (Del)</TooltipContent>
          </Tooltip>
          
          <div className="w-px h-5 bg-[#444] mx-1" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-7 w-7 hover:bg-white/10", snapEnabled ? "text-primary" : "text-gray-400 hover:text-white")}
                onClick={() => setSnapEnabled(!snapEnabled)}
                data-testid="button-snap"
              >
                <Magnet className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Snap to Clips {snapEnabled ? '(On)' : '(Off)'}</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-1" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10"
                onClick={() => setZoom(Math.max(20, zoom - 20))}
                data-testid="button-zoom-out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>
          
          <div className="w-24">
            <Slider 
              value={[zoom]} 
              onValueChange={([val]) => setZoom(val)} 
              min={20} 
              max={300} 
              step={10}
              className="cursor-pointer"
              data-testid="slider-zoom"
            />
          </div>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10"
                onClick={() => setZoom(Math.min(300, zoom + 20))}
                data-testid="button-zoom-in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
          
          <span className="text-[10px] text-gray-500 w-10 text-right font-mono">{zoom}%</span>
        </div>
      </div>

      {/* Timeline Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers */}
        <div className="w-36 bg-[#1e1e1e] border-r border-[#333] flex flex-col flex-shrink-0">
          {/* Ruler header spacer */}
          <div className="h-6 border-b border-[#333] bg-[#252525]" />
          
          {/* Track headers */}
          {tracks.map(track => {
            const Icon = getTrackIcon(track.type);
            return (
              <div 
                key={track.id} 
                className="h-16 border-b border-[#333] flex items-center px-2 gap-1 hover:bg-white/5 group"
                data-testid={`track-header-${track.id}`}
              >
                {/* Track type icon and label */}
                <div className={cn(
                  "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold",
                  track.type === 'video' ? "bg-blue-600/30 text-blue-400" :
                  track.type === 'audio' ? "bg-green-600/30 text-green-400" :
                  "bg-orange-600/30 text-orange-400"
                )}>
                  {track.label}
                </div>

                <div className="flex-1" />

                {/* Track controls */}
                <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100">
                  <button 
                    className={cn("p-1 rounded hover:bg-white/10", !track.visible && "text-red-400")}
                    onClick={() => toggleTrackProperty(track.id, 'visible')}
                    data-testid={`button-visibility-${track.id}`}
                  >
                    {track.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                  
                  <button 
                    className={cn("p-1 rounded hover:bg-white/10", track.locked && "text-yellow-400")}
                    onClick={() => toggleTrackProperty(track.id, 'locked')}
                    data-testid={`button-lock-${track.id}`}
                  >
                    {track.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                  
                  {(track.type === 'audio' || track.type === 'video') && (
                    <button 
                      className={cn("p-1 rounded hover:bg-white/10", track.muted && "text-red-400")}
                      onClick={() => toggleTrackProperty(track.id, 'muted')}
                      data-testid={`button-mute-${track.id}`}
                    >
                      {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          
          {/* Master track */}
          <div className="h-10 border-b border-[#333] flex items-center px-2 bg-[#1a1a1a]">
            <div className="text-[10px] text-gray-500 font-medium">Master</div>
            <div className="flex-1" />
            <div className="w-16 h-2 bg-[#333] rounded-full overflow-hidden">
              <div className="h-full w-3/4 bg-gradient-to-r from-green-500 via-yellow-500 to-green-500 rounded-full" />
            </div>
          </div>
        </div>

        {/* Timeline Tracks */}
        <div 
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#1a1a1a]"
          onClick={handleTimelineClick}
        >
          {/* Time Ruler */}
          <div className="h-6 border-b border-[#333] bg-[#252525] sticky top-0 z-20 flex items-end">
            <div style={{ width: totalDuration * pixelsPerSecond }} className="relative h-full">
              {generateTimeMarkers().map((time) => (
                <div 
                  key={time}
                  className="absolute bottom-0 flex flex-col items-center"
                  style={{ left: time * pixelsPerSecond }}
                >
                  <span className="text-[9px] text-gray-500 font-mono mb-0.5">
                    {formatTimecode(time).substring(0, 8)}
                  </span>
                  <div className="w-px h-2 bg-[#555]" />
                </div>
              ))}
            </div>
          </div>

          {/* Tracks Content */}
          <div className="relative" style={{ width: totalDuration * pixelsPerSecond }}>
            {/* Playhead */}
            <div 
              className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
              style={{ left: currentTime * pixelsPerSecond }}
              data-testid="playhead"
            >
              <div className="absolute -top-6 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500" />
              <div className="absolute -top-6 -translate-x-1/2 bg-red-500 text-white text-[9px] font-mono px-1 rounded -mt-4">
                {formatTimecode(currentTime)}
              </div>
            </div>

            {/* Track rows */}
            {tracks.map(track => (
              <div 
                key={track.id} 
                className={cn(
                  "h-16 border-b border-[#333] relative",
                  track.locked && "opacity-50"
                )}
                data-testid={`track-${track.id}`}
              >
                {/* Grid lines */}
                <div className="absolute inset-0 opacity-20">
                  {generateTimeMarkers().map((time) => (
                    <div 
                      key={time}
                      className="absolute top-0 bottom-0 w-px bg-[#444]"
                      style={{ left: time * pixelsPerSecond }}
                    />
                  ))}
                </div>

                {/* Clips */}
                {track.clips.map(clip => (
                  <div
                    key={clip.id}
                    className={cn(
                      "absolute top-1 bottom-1 rounded cursor-pointer transition-all border border-white/10",
                      clip.color,
                      selectedClip === clip.id && "ring-2 ring-primary ring-offset-1 ring-offset-[#1a1a1a]",
                      !track.locked && "hover:brightness-110"
                    )}
                    style={{
                      left: clip.start * pixelsPerSecond,
                      width: clip.duration * pixelsPerSecond,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!track.locked) setSelectedClip(clip.id);
                    }}
                    data-testid={`clip-${clip.id}`}
                  >
                    {/* Clip content */}
                    <div className="h-full flex flex-col overflow-hidden px-1 py-0.5">
                      <span className="text-[9px] font-medium text-white truncate">{clip.name}</span>
                      
                      {/* Waveform visualization for audio */}
                      {track.type === 'audio' && (
                        <div className="flex-1 flex items-center gap-px opacity-50 mt-1">
                          {Array.from({ length: Math.min(50, Math.floor(clip.duration / 2)) }).map((_, i) => (
                            <div 
                              key={i} 
                              className="w-0.5 bg-white/80 rounded-full"
                              style={{ height: `${20 + Math.random() * 60}%` }}
                            />
                          ))}
                        </div>
                      )}
                      
                      {/* Thumbnail strip for video */}
                      {track.type === 'video' && (
                        <div className="flex-1 flex gap-px mt-1 opacity-50">
                          {Array.from({ length: Math.min(8, Math.floor(clip.duration / 15)) }).map((_, i) => (
                            <div 
                              key={i} 
                              className="flex-1 bg-black/30 rounded-sm"
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Resize handles */}
                    {!track.locked && (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-white/30 rounded-l" />
                        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-white/30 rounded-r" />
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {/* Master audio meter track */}
            <div className="h-10 border-b border-[#333] bg-[#151515] relative">
              <div className="absolute inset-y-2 left-0 right-0 flex items-center px-2">
                <div className="flex-1 h-3 bg-[#222] rounded-full overflow-hidden relative">
                  <div 
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-600 via-green-500 to-yellow-500 rounded-full transition-all"
                    style={{ width: `${60 + Math.random() * 20}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="h-6 border-t border-[#333] bg-[#252525] flex items-center px-3 text-[10px] text-gray-500">
        <span>Duration: {formatTimecode(totalDuration)}</span>
        <div className="w-px h-3 bg-[#444] mx-3" />
        <span>Tracks: {tracks.length}</span>
        <div className="w-px h-3 bg-[#444] mx-3" />
        <span>Clips: {tracks.reduce((acc, t) => acc + t.clips.length, 0)}</span>
        <div className="flex-1" />
        <span>30 FPS • 1920x1080</span>
      </div>
    </div>
  );
}