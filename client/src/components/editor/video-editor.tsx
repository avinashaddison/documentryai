import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
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
  Sparkles,
  Download,
  Trash2,
  Plus,
  GripVertical,
  Volume2,
  Wand2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Timeline, TimelineVideoClip, TimelineAudioClip, TimelineTextClip } from "@shared/schema";
import { SFX_LIBRARY } from "@shared/schema";

interface EditorTrack {
  id: string;
  type: 'video' | 'audio' | 'text';
  label: string;
  visible: boolean;
  locked: boolean;
}

type AnyClip = (TimelineVideoClip & { type: 'video' }) | 
               (TimelineAudioClip & { type: 'audio' }) | 
               (TimelineTextClip & { type: 'text' });

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function generateId(): string {
  return `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function VideoEditor() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [draggingClip, setDraggingClip] = useState<{ clipId: string; trackType: string; offsetX: number } | null>(null);
  const [resizingClip, setResizingClip] = useState<{ clipId: string; trackType: string; edge: 'left' | 'right'; initialWidth: number; initialStart: number } | null>(null);
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [activeSidebarTool, setActiveSidebarTool] = useState<string>('video');
  const timelineRef = useRef<HTMLDivElement>(null);
  
  const pixelsPerSecond = (zoom / 100) * 80;

  const [timeline, setTimeline] = useState<Timeline>({
    resolution: "1920x1080",
    fps: 30,
    duration: 30,
    tracks: {
      video: [
        { id: generateId(), src: "/sample/scene1.jpg", start: 0, duration: 8, effect: "zoom_in", fade_in: 0.5, fade_out: 0.5, blur: false },
        { id: generateId(), src: "/sample/scene2.jpg", start: 8, duration: 7, effect: "pan_left", fade_in: 0.5, fade_out: 0.5, blur: false },
        { id: generateId(), src: "/sample/scene3.jpg", start: 15, duration: 8, effect: "kenburns", fade_in: 0.5, fade_out: 0.5, blur: false },
        { id: generateId(), src: "/sample/scene4.jpg", start: 23, duration: 7, effect: "zoom_out", fade_in: 0.5, fade_out: 0.5, blur: false },
      ],
      audio: [
        { id: generateId(), src: "/sample/narration.wav", start: 0, duration: 30, volume: 1.0, fade_in: 0.5, fade_out: 1.0, ducking: false, audioType: "narration" as const },
        { id: generateId(), src: "/sample/bgm.mp3", start: 0, duration: 30, volume: 0.3, fade_in: 2, fade_out: 2, ducking: true, audioType: "music" as const },
      ],
      text: [
        { id: generateId(), text: "The Beginning", start: 1, end: 5, font: "Serif", size: 64, color: "#FFFFFF", x: "(w-text_w)/2", y: "h-150", box: true, box_color: "#000000", box_opacity: 0.6 },
        { id: generateId(), text: "Chapter One", start: 10, end: 14, font: "Serif", size: 48, color: "#FFFFFF", x: "(w-text_w)/2", y: "h-120", box: true, box_color: "#000000", box_opacity: 0.5 },
      ],
    },
  });

  const [tracks] = useState<EditorTrack[]>([
    { id: 'video', type: 'video', label: 'Video', visible: true, locked: false },
    { id: 'audio1', type: 'audio', label: 'Audio 1', visible: true, locked: false },
    { id: 'audio2', type: 'audio', label: 'Audio 2', visible: true, locked: false },
    { id: 'text', type: 'text', label: 'Text', visible: true, locked: false },
  ]);

  const renderMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/timeline/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeline,
          outputName: `timeline_video_${Date.now()}`,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Render failed");
      }
      return response.json();
    },
  });

  const getSelectedClip = (): AnyClip | null => {
    if (!selectedClipId) return null;
    
    const videoClip = timeline.tracks.video.find(c => c.id === selectedClipId);
    if (videoClip) return { ...videoClip, type: 'video' as const };
    
    const audioClip = timeline.tracks.audio.find(c => c.id === selectedClipId);
    if (audioClip) return { ...audioClip, type: 'audio' as const };
    
    const textClip = timeline.tracks.text.find(c => c.id === selectedClipId);
    if (textClip) return { ...textClip, type: 'text' as const };
    
    return null;
  };

  const updateVideoClip = (id: string, updates: Partial<TimelineVideoClip>) => {
    setTimeline(prev => {
      const updatedClips = prev.tracks.video.map(c => c.id === id ? { ...c, ...updates } : c);
      updatedClips.sort((a, b) => a.start - b.start);
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          video: updatedClips,
        },
      };
    });
  };

  const updateAudioClip = (id: string, updates: Partial<TimelineAudioClip>) => {
    setTimeline(prev => {
      const updatedClips = prev.tracks.audio.map(c => c.id === id ? { ...c, ...updates } : c);
      updatedClips.sort((a, b) => a.start - b.start);
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          audio: updatedClips,
        },
      };
    });
  };

  const updateTextClip = (id: string, updates: Partial<TimelineTextClip>) => {
    setTimeline(prev => {
      const updatedClips = prev.tracks.text.map(c => c.id === id ? { ...c, ...updates } : c);
      updatedClips.sort((a, b) => a.start - b.start);
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          text: updatedClips,
        },
      };
    });
  };

  const deleteClip = (id: string, type: 'video' | 'audio' | 'text') => {
    setTimeline(prev => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        [type]: prev.tracks[type].filter(c => c.id !== id),
      },
    }));
    setSelectedClipId(null);
    setPropertiesPanelOpen(false);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || draggingClip || resizingClip) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - 140;
    const newTime = Math.max(0, Math.min(timeline.duration, x / pixelsPerSecond));
    setCurrentTime(newTime);
  };

  const handleDragStart = (e: React.MouseEvent, clipId: string, trackType: string) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDraggingClip({
      clipId,
      trackType,
      offsetX: e.clientX - rect.left,
    });
    setSelectedClipId(clipId);
  };

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!draggingClip || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - 140 - draggingClip.offsetX;
    const newStart = Math.max(0, x / pixelsPerSecond);
    
    if (draggingClip.trackType === 'video') {
      updateVideoClip(draggingClip.clipId, { start: newStart });
    } else if (draggingClip.trackType === 'audio') {
      updateAudioClip(draggingClip.clipId, { start: newStart });
    } else if (draggingClip.trackType === 'text') {
      const clip = timeline.tracks.text.find(c => c.id === draggingClip.clipId);
      if (clip) {
        const duration = clip.end - clip.start;
        updateTextClip(draggingClip.clipId, { start: newStart, end: newStart + duration });
      }
    }
  }, [draggingClip, pixelsPerSecond, timeline.tracks.text]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingClip || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - 140;
    
    if (resizingClip.trackType === 'video') {
      const clip = timeline.tracks.video.find(c => c.id === resizingClip.clipId);
      if (!clip) return;
      
      if (resizingClip.edge === 'right') {
        const newDuration = Math.max(1, (x / pixelsPerSecond) - clip.start);
        updateVideoClip(resizingClip.clipId, { duration: newDuration });
      } else {
        const newStart = Math.max(0, Math.min(clip.start + clip.duration - 1, x / pixelsPerSecond));
        const newDuration = clip.duration + (clip.start - newStart);
        updateVideoClip(resizingClip.clipId, { start: newStart, duration: newDuration });
      }
    } else if (resizingClip.trackType === 'audio') {
      const clip = timeline.tracks.audio.find(c => c.id === resizingClip.clipId);
      if (!clip || !clip.duration) return;
      
      if (resizingClip.edge === 'right') {
        const newDuration = Math.max(1, (x / pixelsPerSecond) - clip.start);
        updateAudioClip(resizingClip.clipId, { duration: newDuration });
      } else {
        const newStart = Math.max(0, Math.min(clip.start + clip.duration - 1, x / pixelsPerSecond));
        const newDuration = clip.duration + (clip.start - newStart);
        updateAudioClip(resizingClip.clipId, { start: newStart, duration: newDuration });
      }
    } else if (resizingClip.trackType === 'text') {
      const clip = timeline.tracks.text.find(c => c.id === resizingClip.clipId);
      if (!clip) return;
      
      if (resizingClip.edge === 'right') {
        const newEnd = Math.max(clip.start + 0.5, x / pixelsPerSecond);
        updateTextClip(resizingClip.clipId, { end: newEnd });
      } else {
        const newStart = Math.max(0, Math.min(clip.end - 0.5, x / pixelsPerSecond));
        updateTextClip(resizingClip.clipId, { start: newStart });
      }
    }
  }, [resizingClip, pixelsPerSecond, timeline.tracks]);

  const handleDragEnd = useCallback(() => {
    setDraggingClip(null);
    setResizingClip(null);
  }, []);

  useEffect(() => {
    if (draggingClip || resizingClip) {
      const handleMove = draggingClip ? handleDragMove : handleResizeMove;
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [draggingClip, resizingClip, handleDragMove, handleResizeMove, handleDragEnd]);

  const generateTimeMarkers = () => {
    const markers = [];
    const interval = zoom > 150 ? 1 : zoom > 80 ? 2 : 5;
    for (let t = 0; t <= timeline.duration + 2; t += interval) {
      markers.push(t);
    }
    return markers;
  };

  const getClipsForTrack = (trackType: 'video' | 'audio' | 'text', trackIndex: number): AnyClip[] => {
    if (trackType === 'video') {
      return timeline.tracks.video.map(c => ({ ...c, type: 'video' as const }));
    } else if (trackType === 'audio') {
      const audioClips = timeline.tracks.audio.map(c => ({ ...c, type: 'audio' as const }));
      return audioClips.filter((_, i) => i % 2 === (trackIndex === 0 ? 0 : 1));
    } else {
      return timeline.tracks.text.map(c => ({ ...c, type: 'text' as const }));
    }
  };

  const getClipDuration = (clip: AnyClip): number => {
    if (clip.type === 'text') return clip.end - clip.start;
    return clip.duration || 5;
  };

  const selectedClip = getSelectedClip();

  const sidebarTools = [
    { icon: Video, id: 'video', label: 'Video' },
    { icon: Type, id: 'text', label: 'Text' },
    { icon: Music, id: 'audio', label: 'Audio' },
    { icon: Volume2, id: 'sfx', label: 'Sound FX' },
    { icon: ImageIcon, id: 'images', label: 'Images' },
    { icon: Sparkles, id: 'effects', label: 'Effects' },
  ];

  const addSfxToTimeline = (sfx: typeof SFX_LIBRARY[number]) => {
    const newClip: TimelineAudioClip = {
      id: generateId(),
      src: `/sfx/${sfx.id}.mp3`,
      start: currentTime,
      duration: sfx.duration,
      volume: 0.8,
      fade_in: 0.1,
      fade_out: 0.1,
      ducking: false,
      audioType: "sfx" as const,
    };
    
    setTimeline(prev => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        audio: [...prev.tracks.audio, newClip].sort((a, b) => a.start - b.start),
      },
    }));
  };

  const sfxCategories = [...new Set(SFX_LIBRARY.map(sfx => sfx.category))];

  const handleRender = () => {
    setIsRendering(true);
    renderMutation.mutate(undefined, {
      onSettled: () => setIsRendering(false),
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#0f1419] text-white select-none" data-testid="video-editor">
      
      {/* Top Header Bar */}
      <div className="h-12 bg-[#1a1f26] border-b border-[#2a3441] flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded flex items-center justify-center">
            <Wand2 className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold">Timeline Editor</span>
        </div>
        
        <div className="flex-1" />
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 border-[#2a3441] text-gray-300"
            onClick={() => console.log("Timeline JSON:", JSON.stringify(timeline, null, 2))}
            data-testid="button-export-json"
          >
            Export JSON
          </Button>
          <Button 
            className="h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            onClick={handleRender}
            disabled={isRendering}
            data-testid="button-render"
          >
            {isRendering ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Rendering...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Render Video
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar - Tools */}
        <div className="w-12 bg-[#1a1f26] border-r border-[#2a3441] flex flex-col items-center py-2 gap-1">
          {sidebarTools.map((tool) => (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <button 
                  onClick={() => setActiveSidebarTool(activeSidebarTool === tool.id ? '' : tool.id)}
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                    activeSidebarTool === tool.id ? "bg-blue-500/20 text-blue-400" : "text-gray-400 hover:bg-white/5 hover:text-white"
                  )}
                  data-testid={`tool-${tool.id}`}
                >
                  <tool.icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{tool.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* SFX Library Panel */}
        {activeSidebarTool === 'sfx' && (
          <div className="w-64 bg-[#1a1f26] border-r border-[#2a3441] flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2a3441]">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-blue-400" />
                Sound Effects
              </h3>
              <p className="text-xs text-gray-500 mt-1">Click to add at playhead position</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {sfxCategories.map(category => (
                <div key={category} className="mb-3">
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 mb-1.5">
                    {category}
                  </h4>
                  <div className="space-y-1">
                    {SFX_LIBRARY.filter(sfx => sfx.category === category).map(sfx => (
                      <button
                        key={sfx.id}
                        onClick={() => addSfxToTimeline(sfx)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-[#242c38] hover:bg-[#2d3847] transition-colors group"
                        data-testid={`sfx-${sfx.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center">
                            <Volume2 className="h-3 w-3 text-purple-400" />
                          </div>
                          <span className="text-sm text-gray-200">{sfx.name}</span>
                        </div>
                        <span className="text-xs text-gray-500 group-hover:text-gray-400">{sfx.duration}s</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <Play className="h-10 w-10 text-white ml-1" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Timeline Preview</h2>
                    <p className="text-sm text-gray-400 mt-1">{formatTime(currentTime)} / {formatTime(timeline.duration)}</p>
                  </div>
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
              
              {/* Delete */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-gray-400 hover:text-red-400 hover:bg-white/10"
                    onClick={() => selectedClip && deleteClip(selectedClip.id, selectedClip.type)}
                    disabled={!selectedClip}
                    data-testid="button-delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>

              <div className="flex-1" />

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
                <span className="text-gray-500"> / {formatTime(timeline.duration)}</span>
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

              {/* Properties Button */}
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-7 w-7 ml-2", selectedClip ? "text-blue-400" : "text-gray-400")}
                onClick={() => setPropertiesPanelOpen(true)}
                disabled={!selectedClip}
                data-testid="button-properties"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>

            {/* Timeline Area */}
            <div className="flex-1 flex overflow-hidden">
              
              {/* Track Headers */}
              <div className="w-[140px] bg-[#1a1f26] border-r border-[#2a3441] flex flex-col flex-shrink-0">
                {/* Ruler spacer */}
                <div className="h-6 border-b border-[#2a3441]" />
                
                {/* Track controls */}
                {tracks.map((track, index) => (
                  <div 
                    key={track.id} 
                    className="h-12 border-b border-[#2a3441] flex items-center px-2 gap-2"
                    data-testid={`track-header-${track.id}`}
                  >
                    <div className={cn(
                      "w-7 h-7 rounded flex items-center justify-center",
                      track.type === 'video' ? "bg-blue-600/20 text-blue-400" :
                      track.type === 'audio' ? "bg-green-600/20 text-green-400" :
                      "bg-orange-600/20 text-orange-400"
                    )}>
                      {track.type === 'video' && <ImageIcon className="h-3.5 w-3.5" />}
                      {track.type === 'audio' && <Volume2 className="h-3.5 w-3.5" />}
                      {track.type === 'text' && <Type className="h-3.5 w-3.5" />}
                    </div>
                    <span className="text-xs text-gray-300 flex-1">{track.label}</span>
                    <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100">
                      <button className="p-1 text-gray-400 hover:text-white" data-testid={`button-visibility-${track.id}`}>
                        {track.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </button>
                      <button className="p-1 text-gray-400 hover:text-white" data-testid={`button-lock-${track.id}`}>
                        {track.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
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
                  <div style={{ width: (timeline.duration + 4) * pixelsPerSecond }} className="relative h-full">
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
                <div className="relative" style={{ width: (timeline.duration + 4) * pixelsPerSecond }}>
                  
                  {/* Playhead */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
                    style={{ left: currentTime * pixelsPerSecond }}
                    data-testid="playhead"
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-red-500" />
                  </div>

                  {/* Track rows */}
                  {tracks.map((track, trackIndex) => {
                    const clips = track.type === 'video' ? getClipsForTrack('video', 0) :
                                  track.type === 'audio' ? getClipsForTrack('audio', track.id === 'audio1' ? 0 : 1) :
                                  getClipsForTrack('text', 0);
                    
                    return (
                      <div 
                        key={track.id} 
                        className={cn(
                          "h-12 border-b border-[#2a3441] relative",
                          track.locked && "opacity-50"
                        )}
                        data-testid={`track-${track.id}`}
                      >
                        {/* Grid lines */}
                        <div className="absolute inset-0 opacity-10">
                          {generateTimeMarkers().map((time) => (
                            <div 
                              key={time}
                              className="absolute top-0 bottom-0 w-px bg-gray-500"
                              style={{ left: time * pixelsPerSecond }}
                            />
                          ))}
                        </div>

                        {/* Clips */}
                        {clips.map(clip => {
                          const clipDuration = getClipDuration(clip);
                          const isSelected = selectedClipId === clip.id;
                          
                          return (
                            <div
                              key={clip.id}
                              className={cn(
                                "absolute top-1 bottom-1 rounded cursor-grab active:cursor-grabbing transition-all group",
                                clip.type === 'video' && "bg-blue-600/80 border border-blue-400/40",
                                clip.type === 'audio' && "bg-green-600/80 border border-green-400/40",
                                clip.type === 'text' && "bg-orange-600/80 border border-orange-400/40",
                                isSelected && "ring-2 ring-white ring-offset-1 ring-offset-[#13181e]",
                                draggingClip?.clipId === clip.id && "opacity-70",
                                !track.locked && "hover:brightness-110"
                              )}
                              style={{
                                left: clip.start * pixelsPerSecond,
                                width: Math.max(clipDuration * pixelsPerSecond, 30),
                              }}
                              onMouseDown={(e) => !track.locked && handleDragStart(e, clip.id, clip.type)}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!track.locked) {
                                  setSelectedClipId(clip.id);
                                }
                              }}
                              onDoubleClick={() => setPropertiesPanelOpen(true)}
                              data-testid={`clip-${clip.id}`}
                            >
                              {/* Clip content */}
                              <div className="h-full flex items-center overflow-hidden px-2">
                                <GripVertical className="h-3 w-3 text-white/40 flex-shrink-0 mr-1" />
                                <span className="text-[10px] text-white truncate font-medium">
                                  {clip.type === 'video' && `Scene ${timeline.tracks.video.indexOf(clip as TimelineVideoClip) + 1}`}
                                  {clip.type === 'audio' && (clip as TimelineAudioClip).src.split('/').pop()}
                                  {clip.type === 'text' && (clip as TimelineTextClip).text}
                                </span>
                                {clip.type === 'video' && (clip as TimelineVideoClip).effect !== 'none' && (
                                  <span className="ml-auto text-[8px] text-white/60 bg-white/10 px-1 rounded">
                                    {(clip as TimelineVideoClip).effect}
                                  </span>
                                )}
                              </div>

                              {/* Resize handles */}
                              {!track.locked && (
                                <>
                                  <div 
                                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l opacity-0 group-hover:opacity-100"
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      setResizingClip({
                                        clipId: clip.id,
                                        trackType: clip.type,
                                        edge: 'left',
                                        initialWidth: clipDuration * pixelsPerSecond,
                                        initialStart: clip.start,
                                      });
                                    }}
                                  />
                                  <div 
                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r opacity-0 group-hover:opacity-100"
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      setResizingClip({
                                        clipId: clip.id,
                                        trackType: clip.type,
                                        edge: 'right',
                                        initialWidth: clipDuration * pixelsPerSecond,
                                        initialStart: clip.start,
                                      });
                                    }}
                                  />
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clip Properties Panel */}
      <Sheet open={propertiesPanelOpen} onOpenChange={setPropertiesPanelOpen}>
        <SheetContent className="bg-[#1a1f26] border-l border-[#2a3441] text-white w-[350px]">
          <SheetHeader>
            <SheetTitle className="text-white">
              {selectedClip?.type === 'video' && 'Video Clip Properties'}
              {selectedClip?.type === 'audio' && 'Audio Clip Properties'}
              {selectedClip?.type === 'text' && 'Text Clip Properties'}
            </SheetTitle>
          </SheetHeader>
          
          {selectedClip && (
            <div className="mt-6 space-y-6">
              {/* Timing */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-400">Timing</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Start (s)</Label>
                    <Input 
                      type="number" 
                      step="0.1"
                      value={selectedClip.start}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        if (selectedClip.type === 'video') updateVideoClip(selectedClip.id, { start: val });
                        else if (selectedClip.type === 'audio') updateAudioClip(selectedClip.id, { start: val });
                        else if (selectedClip.type === 'text') updateTextClip(selectedClip.id, { start: val });
                      }}
                      className="h-8 bg-[#2a3441] border-0 text-white"
                      data-testid="input-clip-start"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Duration (s)</Label>
                    <Input 
                      type="number" 
                      step="0.1"
                      value={getClipDuration(selectedClip)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 1;
                        if (selectedClip.type === 'video') updateVideoClip(selectedClip.id, { duration: val });
                        else if (selectedClip.type === 'audio') updateAudioClip(selectedClip.id, { duration: val });
                        else if (selectedClip.type === 'text') {
                          const clip = selectedClip as TimelineTextClip;
                          updateTextClip(selectedClip.id, { end: clip.start + val });
                        }
                      }}
                      className="h-8 bg-[#2a3441] border-0 text-white"
                      data-testid="input-clip-duration"
                    />
                  </div>
                </div>
              </div>

              {/* Video-specific properties */}
              {selectedClip.type === 'video' && (
                <>
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-400">Effect</h4>
                    <Select 
                      value={(selectedClip as TimelineVideoClip).effect || 'none'}
                      onValueChange={(val) => updateVideoClip(selectedClip.id, { effect: val as any })}
                    >
                      <SelectTrigger className="h-8 bg-[#2a3441] border-0 text-white" data-testid="select-effect">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="kenburns">Ken Burns</SelectItem>
                        <SelectItem value="zoom_in">Zoom In</SelectItem>
                        <SelectItem value="zoom_out">Zoom Out</SelectItem>
                        <SelectItem value="pan_left">Pan Left</SelectItem>
                        <SelectItem value="pan_right">Pan Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-400">Fades</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-gray-500">Fade In (s)</Label>
                        <Input 
                          type="number" 
                          step="0.1"
                          value={(selectedClip as TimelineVideoClip).fade_in || 0}
                          onChange={(e) => updateVideoClip(selectedClip.id, { fade_in: parseFloat(e.target.value) || 0 })}
                          className="h-8 bg-[#2a3441] border-0 text-white"
                          data-testid="input-fade-in"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Fade Out (s)</Label>
                        <Input 
                          type="number" 
                          step="0.1"
                          value={(selectedClip as TimelineVideoClip).fade_out || 0}
                          onChange={(e) => updateVideoClip(selectedClip.id, { fade_out: parseFloat(e.target.value) || 0 })}
                          className="h-8 bg-[#2a3441] border-0 text-white"
                          data-testid="input-fade-out"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Audio-specific properties */}
              {selectedClip.type === 'audio' && (
                <>
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-400">Volume</h4>
                    <div className="flex items-center gap-3">
                      <Slider 
                        value={[(selectedClip as TimelineAudioClip).volume ?? 1.0]}
                        onValueChange={([val]) => updateAudioClip(selectedClip.id, { volume: val })}
                        min={0}
                        max={2}
                        step={0.1}
                        className="flex-1"
                        data-testid="slider-volume"
                      />
                      <span className="text-sm text-gray-400 w-12 text-right">
                        {Math.round(((selectedClip as TimelineAudioClip).volume ?? 1) * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-400">Fades</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-gray-500">Fade In (s)</Label>
                        <Input 
                          type="number" 
                          step="0.1"
                          value={(selectedClip as TimelineAudioClip).fade_in || 0}
                          onChange={(e) => updateAudioClip(selectedClip.id, { fade_in: parseFloat(e.target.value) || 0 })}
                          className="h-8 bg-[#2a3441] border-0 text-white"
                          data-testid="input-audio-fade-in"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Fade Out (s)</Label>
                        <Input 
                          type="number" 
                          step="0.1"
                          value={(selectedClip as TimelineAudioClip).fade_out || 0}
                          onChange={(e) => updateAudioClip(selectedClip.id, { fade_out: parseFloat(e.target.value) || 0 })}
                          className="h-8 bg-[#2a3441] border-0 text-white"
                          data-testid="input-audio-fade-out"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Text-specific properties */}
              {selectedClip.type === 'text' && (
                <>
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-400">Text Content</h4>
                    <Input 
                      value={(selectedClip as TimelineTextClip).text}
                      onChange={(e) => updateTextClip(selectedClip.id, { text: e.target.value })}
                      className="h-8 bg-[#2a3441] border-0 text-white"
                      data-testid="input-text-content"
                    />
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-400">Style</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-gray-500">Font Size</Label>
                        <Input 
                          type="number"
                          value={(selectedClip as TimelineTextClip).size || 48}
                          onChange={(e) => updateTextClip(selectedClip.id, { size: parseInt(e.target.value) || 48 })}
                          className="h-8 bg-[#2a3441] border-0 text-white"
                          data-testid="input-text-size"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Color</Label>
                        <Input 
                          type="color"
                          value={(selectedClip as TimelineTextClip).color || '#FFFFFF'}
                          onChange={(e) => updateTextClip(selectedClip.id, { color: e.target.value })}
                          className="h-8 bg-[#2a3441] border-0"
                          data-testid="input-text-color"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-400">Background Box</h4>
                      <button
                        className={cn(
                          "w-10 h-5 rounded-full transition-colors relative",
                          (selectedClip as TimelineTextClip).box ? "bg-blue-600" : "bg-gray-600"
                        )}
                        onClick={() => updateTextClip(selectedClip.id, { box: !(selectedClip as TimelineTextClip).box })}
                        data-testid="toggle-text-box"
                      >
                        <span 
                          className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                            (selectedClip as TimelineTextClip).box ? "translate-x-5" : "translate-x-0.5"
                          )}
                        />
                      </button>
                    </div>
                    {(selectedClip as TimelineTextClip).box && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-gray-500">Box Color</Label>
                          <Input 
                            type="color"
                            value={(selectedClip as TimelineTextClip).box_color || '#000000'}
                            onChange={(e) => updateTextClip(selectedClip.id, { box_color: e.target.value })}
                            className="h-8 bg-[#2a3441] border-0"
                            data-testid="input-box-color"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Opacity</Label>
                          <Slider 
                            value={[(selectedClip as TimelineTextClip).box_opacity ?? 0.5]}
                            onValueChange={([val]) => updateTextClip(selectedClip.id, { box_opacity: val })}
                            min={0}
                            max={1}
                            step={0.1}
                            data-testid="slider-box-opacity"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Delete button */}
              <Button 
                variant="destructive" 
                className="w-full mt-6"
                onClick={() => selectedClip && deleteClip(selectedClip.id, selectedClip.type)}
                data-testid="button-delete-clip"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Clip
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
