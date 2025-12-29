import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { 
  Play, 
  Pause, 
  Undo, 
  Redo,
  Scissors,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Settings,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Video,
  Type,
  Music,
  Image as ImageIcon,
  Layers,
  Sticker,
  Square,
  CircleDot,
  Sparkles,
  Bell
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Track {
  id: string;
  type: 'text' | 'video' | 'image' | 'audio' | 'effect';
  clips: Clip[];
  visible: boolean;
  locked: boolean;
}

interface Clip {
  id: string;
  name: string;
  start: number;
  duration: number;
  color: string;
  icon?: 'text' | 'sticker' | 'effect';
  thumbnails?: string[];
  waveform?: boolean;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function VideoEditor() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0.83);
  const [zoom, setZoom] = useState(100);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  const totalDuration = 15.30;
  const pixelsPerSecond = (zoom / 100) * 80;

  const [tracks, setTracks] = useState<Track[]>([
    { 
      id: 't1', type: 'text', visible: true, locked: false,
      clips: [
        { id: 'txt1', name: '', start: 0.5, duration: 0.5, color: 'bg-blue-500', icon: 'text' },
        { id: 'txt2', name: 'Its never been easier', start: 1.0, duration: 5.5, color: 'bg-blue-500' },
      ]
    },
    { 
      id: 't2', type: 'text', visible: true, locked: false,
      clips: [
        { id: 'txt3', name: '', start: 0.8, duration: 0.5, color: 'bg-blue-500', icon: 'text' },
      ]
    },
    { 
      id: 't3', type: 'text', visible: true, locked: false,
      clips: [
        { id: 'txt4', name: '', start: 1.2, duration: 0.5, color: 'bg-blue-500', icon: 'text' },
        { id: 'txt5', name: 'This is a demo caption.', start: 2.5, duration: 2.0, color: 'bg-slate-600' },
        { id: 'txt6', name: 'AI service not configured.', start: 4.8, duration: 2.2, color: 'bg-slate-600' },
      ]
    },
    { 
      id: 'v1', type: 'video', visible: true, locked: false,
      clips: [
        { id: 'vid1', name: 'clip1', start: 2.5, duration: 3.5, color: 'bg-slate-700', thumbnails: ['thumb1', 'thumb2', 'thumb3'] },
        { id: 'vid2', name: 'clip2', start: 7.5, duration: 4.0, color: 'bg-slate-700', thumbnails: ['thumb1', 'thumb2', 'thumb3', 'thumb4'] },
        { id: 'vid3', name: 'clip3', start: 12.0, duration: 2.5, color: 'bg-slate-700', thumbnails: ['thumb1', 'thumb2'] },
      ]
    },
    { 
      id: 'i1', type: 'image', visible: true, locked: false,
      clips: [
        { id: 'img1', name: 'stickers', start: 0.3, duration: 2.0, color: 'bg-green-600', icon: 'sticker' },
        { id: 'eff1', name: 'card-flip', start: 10.0, duration: 4.0, color: 'bg-pink-500', icon: 'effect' },
      ]
    },
    { 
      id: 'a1', type: 'audio', visible: true, locked: false,
      clips: [
        { id: 'aud1', name: 'd: Upbeat Corporate', start: 0, duration: 15.3, color: 'bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-400', waveform: true },
      ]
    },
  ]);

  const toggleTrackProperty = (trackId: string, property: 'visible' | 'locked') => {
    setTracks(prev => prev.map(track => 
      track.id === trackId ? { ...track, [property]: !track[property] } : track
    ));
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - 40;
    const newTime = Math.max(0, Math.min(totalDuration, x / pixelsPerSecond));
    setCurrentTime(newTime);
  };

  const generateTimeMarkers = () => {
    const markers = [];
    const interval = zoom > 150 ? 1 : zoom > 80 ? 2 : 5;
    for (let t = 0; t <= totalDuration + 2; t += interval) {
      markers.push(t);
    }
    return markers;
  };

  const sidebarTools = [
    { icon: Video, label: 'Video', active: true },
    { icon: Type, label: 'Text', active: false },
    { icon: Music, label: 'Audio', active: false },
    { icon: ImageIcon, label: 'Images', active: false },
    { icon: Sticker, label: 'Stickers', active: false },
    { icon: Square, label: 'Elements', active: false },
    { icon: Sparkles, label: 'Effects', active: false },
    { icon: CircleDot, label: 'Record', active: false },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0f1419] text-white select-none" data-testid="video-editor">
      
      {/* Top Header Bar */}
      <div className="h-12 bg-[#1a1f26] border-b border-[#2a3441] flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
            <span className="text-xs font-bold">R</span>
          </div>
          <span className="text-sm font-medium text-green-400 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            RVE
          </span>
        </div>
        
        <div className="flex-1" />
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white">
            <Bell className="h-4 w-4" />
          </Button>
          <Button className="h-8 px-4 bg-[#2a3441] hover:bg-[#3a4451] text-white text-sm font-medium" data-testid="button-render">
            Render Video
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar - Tools */}
        <div className="w-12 bg-[#1a1f26] border-r border-[#2a3441] flex flex-col items-center py-2 gap-1">
          {sidebarTools.map((tool, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <button 
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                    tool.active ? "bg-blue-500/20 text-blue-400" : "text-gray-400 hover:bg-white/5 hover:text-white"
                  )}
                  data-testid={`tool-${tool.label.toLowerCase()}`}
                >
                  <tool.icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{tool.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Video Preview Area */}
          <div className="flex-1 bg-[#0a0e13] flex items-center justify-center p-4 min-h-[300px]">
            <div 
              className="relative bg-[#1e2838] rounded-lg overflow-hidden shadow-2xl"
              style={{ 
                aspectRatio: aspectRatio === "16:9" ? "16/9" : aspectRatio === "9:16" ? "9/16" : "1/1",
                maxHeight: "100%",
                maxWidth: aspectRatio === "9:16" ? "300px" : "100%",
                width: aspectRatio === "9:16" ? "auto" : "min(100%, 800px)"
              }}
              data-testid="video-preview"
            >
              {/* Sample Preview Content */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-lg shadow-green-500/30" />
                  <h1 className="text-4xl font-black text-white tracking-wide drop-shadow-lg">AMAZING</h1>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline Section */}
          <div className="h-[45%] min-h-[280px] flex flex-col bg-[#13181e] border-t border-[#2a3441]">
            
            {/* Timeline Toolbar */}
            <div className="h-10 bg-[#1a1f26] border-b border-[#2a3441] flex items-center px-3 gap-2">
              {/* Undo/Redo */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10" data-testid="button-undo">
                      <Undo className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Undo</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10" data-testid="button-redo">
                      <Redo className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Redo</TooltipContent>
                </Tooltip>
              </div>

              <div className="w-px h-5 bg-[#2a3441]" />

              {/* Scissors */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10" data-testid="button-cut">
                    <Scissors className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Split (S)</TooltipContent>
              </Tooltip>

              <div className="flex-1" />

              {/* Playback Speed */}
              <Select defaultValue="1x">
                <SelectTrigger className="w-14 h-7 bg-[#2a3441] border-0 text-xs text-gray-300">
                  <SelectValue placeholder="1x" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5x">0.5x</SelectItem>
                  <SelectItem value="1x">1x</SelectItem>
                  <SelectItem value="1.5x">1.5x</SelectItem>
                  <SelectItem value="2x">2x</SelectItem>
                </SelectContent>
              </Select>

              {/* Play/Pause */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-white hover:bg-white/10"
                onClick={() => setIsPlaying(!isPlaying)}
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
              </Button>

              {/* Timecode Display */}
              <div className="text-sm font-mono text-gray-300 min-w-[140px] text-center" data-testid="text-timecode">
                <span className="text-white">{formatTime(currentTime)}</span>
                <span className="text-gray-500"> / {formatTime(totalDuration)}</span>
              </div>

              <div className="flex-1" />

              {/* Aspect Ratio */}
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="w-16 h-7 bg-[#2a3441] border-0 text-xs text-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                  <SelectItem value="4:3">4:3</SelectItem>
                </SelectContent>
              </Select>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1.5 ml-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-gray-400 hover:text-white"
                  onClick={() => setZoom(Math.max(50, zoom - 25))}
                  data-testid="button-zoom-out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                
                <div className="w-20">
                  <Slider 
                    value={[zoom]} 
                    onValueChange={([val]) => setZoom(val)} 
                    min={50} 
                    max={200} 
                    step={10}
                    className="cursor-pointer"
                    data-testid="slider-zoom"
                  />
                </div>
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-gray-400 hover:text-white"
                  onClick={() => setZoom(Math.min(200, zoom + 25))}
                  data-testid="button-zoom-in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Fullscreen */}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/10 ml-1" data-testid="button-fullscreen">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Timeline Area */}
            <div className="flex-1 flex overflow-hidden">
              
              {/* Track Headers */}
              <div className="w-10 bg-[#1a1f26] border-r border-[#2a3441] flex flex-col flex-shrink-0">
                {/* Ruler spacer */}
                <div className="h-6 border-b border-[#2a3441]" />
                
                {/* Track controls */}
                {tracks.map(track => (
                  <div 
                    key={track.id} 
                    className="h-10 border-b border-[#2a3441] flex flex-col items-center justify-center gap-0.5"
                    data-testid={`track-controls-${track.id}`}
                  >
                    <button 
                      className="p-0.5 text-gray-500 hover:text-white"
                      data-testid={`button-settings-${track.id}`}
                    >
                      <Settings className="h-3 w-3" />
                    </button>
                    <div className="flex gap-0.5">
                      <button 
                        className={cn("p-0.5", !track.visible ? "text-gray-600" : "text-gray-400 hover:text-white")}
                        onClick={() => toggleTrackProperty(track.id, 'visible')}
                        data-testid={`button-visibility-${track.id}`}
                      >
                        {track.visible ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                      </button>
                      <button 
                        className={cn("p-0.5", track.locked ? "text-yellow-500" : "text-gray-400 hover:text-white")}
                        onClick={() => toggleTrackProperty(track.id, 'locked')}
                        data-testid={`button-lock-${track.id}`}
                      >
                        {track.locked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Timeline Tracks */}
              <div 
                ref={timelineRef}
                className="flex-1 overflow-x-auto overflow-y-hidden relative"
                onClick={handleTimelineClick}
              >
                {/* Time Ruler */}
                <div className="h-6 bg-[#1a1f26] border-b border-[#2a3441] sticky top-0 z-20">
                  <div style={{ width: (totalDuration + 4) * pixelsPerSecond + 40 }} className="relative h-full pl-10">
                    {generateTimeMarkers().map((time) => (
                      <div 
                        key={time}
                        className="absolute bottom-0 flex flex-col items-center"
                        style={{ left: time * pixelsPerSecond }}
                      >
                        <span className="text-[10px] text-gray-500 font-mono">
                          {time}s
                        </span>
                        <div className="w-px h-1.5 bg-gray-600 mt-0.5" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tracks Content */}
                <div className="relative pl-10" style={{ width: (totalDuration + 4) * pixelsPerSecond + 40 }}>
                  
                  {/* Playhead */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
                    style={{ left: currentTime * pixelsPerSecond }}
                    data-testid="playhead"
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-red-500" />
                  </div>

                  {/* Track rows */}
                  {tracks.map(track => (
                    <div 
                      key={track.id} 
                      className={cn(
                        "h-10 border-b border-[#2a3441] relative",
                        track.locked && "opacity-50"
                      )}
                      data-testid={`track-${track.id}`}
                    >
                      {/* Clips */}
                      {track.clips.map(clip => (
                        <div
                          key={clip.id}
                          className={cn(
                            "absolute top-1 bottom-1 rounded cursor-pointer transition-all",
                            clip.color,
                            selectedClip === clip.id && "ring-2 ring-blue-400",
                            !track.locked && "hover:brightness-110"
                          )}
                          style={{
                            left: clip.start * pixelsPerSecond,
                            width: Math.max(clip.duration * pixelsPerSecond, 20),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!track.locked) setSelectedClip(clip.id);
                          }}
                          data-testid={`clip-${clip.id}`}
                        >
                          {/* Clip content */}
                          <div className="h-full flex items-center overflow-hidden px-1.5">
                            
                            {/* Text icon */}
                            {clip.icon === 'text' && (
                              <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center flex-shrink-0">
                                <Type className="h-3 w-3 text-white" />
                              </div>
                            )}
                            
                            {/* Sticker icon */}
                            {clip.icon === 'sticker' && (
                              <div className="flex items-center gap-0.5">
                                {[...Array(4)].map((_, i) => (
                                  <span key={i} className="text-lg">🌿</span>
                                ))}
                              </div>
                            )}
                            
                            {/* Effect label */}
                            {clip.icon === 'effect' && (
                              <div className="flex items-center gap-1">
                                <CircleDot className="h-3 w-3" />
                                <span className="text-xs font-medium">{clip.name}</span>
                              </div>
                            )}
                            
                            {/* Text label */}
                            {!clip.icon && clip.name && !clip.waveform && !clip.thumbnails && (
                              <span className="text-xs text-white truncate">{clip.name}</span>
                            )}
                            
                            {/* Video thumbnails */}
                            {clip.thumbnails && (
                              <div className="flex items-center gap-0.5 h-full">
                                {clip.thumbnails.map((_, i) => (
                                  <div 
                                    key={i} 
                                    className="h-6 w-8 bg-gray-600 rounded-sm flex-shrink-0"
                                  />
                                ))}
                              </div>
                            )}
                            
                            {/* Audio waveform */}
                            {clip.waveform && (
                              <div className="flex items-center h-full w-full">
                                <span className="text-[10px] text-gray-800 font-medium mr-2 flex-shrink-0">{clip.name}</span>
                                <div className="flex items-center gap-px flex-1 h-full py-1">
                                  {Array.from({ length: 120 }).map((_, i) => (
                                    <div 
                                      key={i} 
                                      className="w-0.5 bg-orange-800/60 rounded-full flex-shrink-0"
                                      style={{ 
                                        height: `${15 + Math.sin(i * 0.3) * 15 + Math.random() * 40}%`,
                                        minHeight: '4px'
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
