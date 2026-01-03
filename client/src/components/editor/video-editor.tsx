import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { 
  Play, 
  Pause, 
  Undo, 
  Redo,
  Scissors,
  Copy,
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
import { AIEditPanel } from "./ai-edit-panel";

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

// Deterministic pseudo-random generator for stable waveform visualization
function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967296;
  };
}

// Generate stable waveform bar heights based on clip ID
function generateWaveformBars(clipId: string, barCount: number): number[] {
  const random = seededRandom(clipId);
  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    bars.push(20 + Math.sin(i * 0.5) * 15 + random() * 20);
  }
  return bars;
}

interface VideoEditorProps {
  projectId?: number;
}

export function VideoEditor({ projectId }: VideoEditorProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(12); // Start very zoomed out for compact clips
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [draggingClip, setDraggingClip] = useState<{ clipId: string; trackType: string; offsetX: number } | null>(null);
  const [resizingClip, setResizingClip] = useState<{ clipId: string; trackType: string; edge: 'left' | 'right'; initialWidth: number; initialStart: number } | null>(null);
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isAIEnhancing, setIsAIEnhancing] = useState(false);
  const [activeSidebarTool, setActiveSidebarTool] = useState<string>('video');
  const [projectLoaded, setProjectLoaded] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  const pixelsPerSecond = (zoom / 100) * 80;

  const [timeline, setTimeline] = useState<Timeline>({
    resolution: "1920x1080",
    fps: 30,
    duration: 30,
    tracks: {
      video: [],
      audio: [],
      text: [],
    },
  });

  const { data: projectData, isLoading: isLoadingProject } = useQuery({
    queryKey: ["project-editor", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const [projectRes, chaptersRes, assetsRes, sessionRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/generated-chapters`),
        fetch(`/api/projects/${projectId}/generated-assets`),
        fetch(`/api/projects/${projectId}/session`),
      ]);
      
      if (!projectRes.ok) throw new Error("Failed to load project");
      
      const project = await projectRes.json();
      let chaptersData = chaptersRes.ok ? await chaptersRes.json() : { chapters: [] };
      const assetsData = assetsRes.ok ? await assetsRes.json() : { images: {}, audio: {} };
      const sessionData = sessionRes.ok ? await sessionRes.json() : { session: null };
      
      // If chapters are empty, try to get them from session data
      if ((!chaptersData.chapters || chaptersData.chapters.length === 0) && sessionData.session?.chaptersData) {
        try {
          const parsedChapters = JSON.parse(sessionData.session.chaptersData);
          chaptersData = { chapters: parsedChapters };
        } catch (e) {
          console.error("Failed to parse chapters from session:", e);
        }
      }
      
      // Also get images/audio from session if not available in assets
      if ((!assetsData.images || Object.keys(assetsData.images).length === 0) && sessionData.session?.imagesData) {
        try {
          assetsData.images = JSON.parse(sessionData.session.imagesData);
        } catch (e) {
          console.error("Failed to parse images from session:", e);
        }
      }
      if ((!assetsData.audio || Object.keys(assetsData.audio).length === 0) && sessionData.session?.audioData) {
        try {
          assetsData.audio = JSON.parse(sessionData.session.audioData);
        } catch (e) {
          console.error("Failed to parse audio from session:", e);
        }
      }
      
      // Transform assets from key-value format to array format
      const assets: any[] = [];
      if (assetsData.images) {
        Object.entries(assetsData.images).forEach(([key, url]) => {
          const match = key.match(/ch(\d+)_sc(\d+)/);
          if (match) {
            assets.push({
              chapterNumber: parseInt(match[1]),
              sceneNumber: parseInt(match[2]),
              assetType: "image",
              assetUrl: url,
            });
          }
        });
      }
      if (assetsData.audio) {
        Object.entries(assetsData.audio).forEach(([key, url]) => {
          const match = key.match(/ch(\d+)_sc(\d+)/);
          if (match) {
            assets.push({
              chapterNumber: parseInt(match[1]),
              sceneNumber: parseInt(match[2]),
              assetType: "audio",
              assetUrl: url,
            });
          }
        });
      }
      
      return { project, chapters: chaptersData.chapters || [], assets };
    },
    enabled: !!projectId,
  });

  useEffect(() => {
    if (projectData && !projectLoaded) {
      const { chapters, assets } = projectData;
      
      const videoClips: TimelineVideoClip[] = [];
      const audioClips: TimelineAudioClip[] = [];
      const textClips: TimelineTextClip[] = [];
      
      let currentStart = 0;
      const effects: Array<"zoom_in" | "pan_left" | "kenburns" | "zoom_out" | "pan_right"> = ["zoom_in", "pan_left", "kenburns", "zoom_out", "pan_right"];
      
      chapters.forEach((chapter: any, chapterIdx: number) => {
        const scenes = chapter.scenes || [];
        
        scenes.forEach((scene: any, sceneIdx: number) => {
          const key = `ch${chapter.chapterNumber}_sc${scene.sceneNumber}`;
          const imageAsset = assets.find((a: any) => 
            a.chapterNumber === chapter.chapterNumber && 
            a.sceneNumber === scene.sceneNumber && 
            a.assetType === "image"
          );
          const audioAsset = assets.find((a: any) => 
            a.chapterNumber === chapter.chapterNumber && 
            a.sceneNumber === scene.sceneNumber && 
            a.assetType === "audio"
          );
          
          const duration = scene.duration || 8;
          
          if (imageAsset?.assetUrl) {
            videoClips.push({
              id: generateId(),
              src: imageAsset.assetUrl,
              start: currentStart,
              duration,
              effect: effects[(chapterIdx + sceneIdx) % effects.length],
              fade_in: 0.5,
              fade_out: 0.5,
              blur: false,
            });
          }
          
          if (audioAsset?.assetUrl) {
            audioClips.push({
              id: generateId(),
              src: audioAsset.assetUrl,
              start: currentStart,
              duration,
              volume: 1.0,
              fade_in: 0.3,
              fade_out: 0.3,
              ducking: false,
              audioType: "narration" as const,
            });
          }
          
          if (chapterIdx === 0 && sceneIdx === 0) {
            textClips.push({
              id: generateId(),
              text: projectData.project.title || "Documentary",
              start: currentStart + 0.5,
              end: currentStart + 4,
              font: "Serif",
              size: 64,
              color: "#FFFFFF",
              x: "(w-text_w)/2",
              y: "h-150",
              box: true,
              box_color: "#000000",
              box_opacity: 0.6,
            });
          }
          
          currentStart += duration;
        });
      });
      
      if (videoClips.length > 0 || audioClips.length > 0) {
        setTimeline({
          resolution: "1920x1080",
          fps: 30,
          duration: Math.max(currentStart, 30),
          tracks: {
            video: videoClips,
            audio: audioClips,
            text: textClips,
          },
        });
        setProjectLoaded(true);
      }
    }
  }, [projectData, projectLoaded]);

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

  // Audio element refs for playback
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const playbackIntervalRef = useRef<number | null>(null);

  // Playback effect - advance time and manage audio
  useEffect(() => {
    if (isPlaying) {
      const startTime = Date.now();
      const startPlaybackTime = currentTime;
      
      playbackIntervalRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const newTime = startPlaybackTime + elapsed;
        
        if (newTime >= timeline.duration) {
          setCurrentTime(0);
          setIsPlaying(false);
        } else {
          setCurrentTime(newTime);
        }
      }, 33); // ~30fps update
      
      // Start playing audio clips that are at the current position
      timeline.tracks.audio.forEach(clip => {
        if (currentTime >= clip.start && currentTime < clip.start + (clip.duration || 10)) {
          let audio = audioRefs.current.get(clip.id);
          if (!audio) {
            audio = new Audio(clip.src);
            audio.volume = clip.volume || 1.0;
            audioRefs.current.set(clip.id, audio);
          }
          if (audio.paused) {
            const offset = currentTime - clip.start;
            audio.currentTime = offset;
            audio.play().catch(() => {});
          }
        }
      });
      
      return () => {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
        }
      };
    } else {
      // Pause all audio when playback stops
      audioRefs.current.forEach(audio => {
        audio.pause();
      });
    }
  }, [isPlaying]);

  // Update audio playback based on current time
  useEffect(() => {
    if (isPlaying) {
      timeline.tracks.audio.forEach(clip => {
        const clipEnd = clip.start + (clip.duration || 10);
        const audio = audioRefs.current.get(clip.id);
        
        if (currentTime >= clip.start && currentTime < clipEnd) {
          if (!audio) {
            const newAudio = new Audio(clip.src);
            newAudio.volume = clip.volume || 1.0;
            audioRefs.current.set(clip.id, newAudio);
            const offset = currentTime - clip.start;
            newAudio.currentTime = offset;
            newAudio.play().catch(() => {});
          }
        } else if (audio && !audio.paused) {
          audio.pause();
        }
      });
    }
  }, [currentTime, isPlaying, timeline.tracks.audio]);

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
    { icon: Wand2, id: 'ai', label: 'AI Edit' },
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

  const sfxCategories = Array.from(new Set(SFX_LIBRARY.map(sfx => sfx.category)));

  const handleRender = () => {
    setIsRendering(true);
    renderMutation.mutate(undefined, {
      onSettled: () => setIsRendering(false),
    });
  };

  const handleAIEnhance = async () => {
    if (timeline.tracks.video.length === 0) return;
    
    setIsAIEnhancing(true);
    try {
      const response = await fetch('/api/timeline/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeline, projectId }),
      });
      
      const data = await response.json();
      if (data.success && data.timeline) {
        setTimeline(data.timeline);
        console.log('[AI Enhance] Edit plan:', data.editPlan);
      } else {
        console.error('[AI Enhance] Error:', data.error);
      }
    } catch (err) {
      console.error('[AI Enhance] Failed:', err);
    } finally {
      setIsAIEnhancing(false);
    }
  };

  // Get the current video clip at the playhead position (must be before conditional returns)
  const getCurrentVideoClip = useCallback(() => {
    return timeline.tracks.video.find(clip => 
      currentTime >= clip.start && currentTime < clip.start + clip.duration
    );
  }, [timeline.tracks.video, currentTime]);

  const currentVideoClip = getCurrentVideoClip();
  const hasContent = timeline.tracks.video.length > 0 || timeline.tracks.audio.length > 0;

  // Split clip at playhead - works for video, audio, and text clips
  const splitClipAtPlayhead = useCallback(() => {
    // Try video clips
    const videoClip = timeline.tracks.video.find(clip => 
      currentTime > clip.start && currentTime < clip.start + clip.duration
    );
    if (videoClip) {
      const splitPoint = currentTime - videoClip.start;
      const firstPart = { ...videoClip, duration: splitPoint };
      const secondPart = { 
        ...videoClip, 
        id: generateId(), 
        start: currentTime, 
        duration: videoClip.duration - splitPoint 
      };
      setTimeline(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          video: prev.tracks.video
            .filter(c => c.id !== videoClip.id)
            .concat([firstPart, secondPart])
            .sort((a, b) => a.start - b.start),
        },
      }));
      return;
    }

    // Try audio clips
    const audioClip = timeline.tracks.audio.find(clip => 
      currentTime > clip.start && currentTime < clip.start + (clip.duration || 10)
    );
    if (audioClip) {
      const clipDuration = audioClip.duration || 10;
      const splitPoint = currentTime - audioClip.start;
      const firstPart = { ...audioClip, duration: splitPoint };
      const secondPart = { 
        ...audioClip, 
        id: generateId(), 
        start: currentTime, 
        duration: clipDuration - splitPoint 
      };
      setTimeline(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          audio: prev.tracks.audio
            .filter(c => c.id !== audioClip.id)
            .concat([firstPart, secondPart])
            .sort((a, b) => a.start - b.start),
        },
      }));
      return;
    }

    // Try text clips
    const textClip = timeline.tracks.text.find(clip => 
      currentTime > clip.start && currentTime < clip.end
    );
    if (textClip) {
      const firstPart = { ...textClip, end: currentTime };
      const secondPart = { 
        ...textClip, 
        id: generateId(), 
        start: currentTime 
      };
      setTimeline(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          text: prev.tracks.text
            .filter(c => c.id !== textClip.id)
            .concat([firstPart, secondPart])
            .sort((a, b) => a.start - b.start),
        },
      }));
    }
  }, [currentTime, timeline.tracks.video, timeline.tracks.audio, timeline.tracks.text]);

  // Duplicate selected clip - works for video, audio, and text clips
  const duplicateClip = useCallback(() => {
    if (!selectedClipId) return;
    
    // Try video clips
    const videoClip = timeline.tracks.video.find(c => c.id === selectedClipId);
    if (videoClip) {
      const newClip = { ...videoClip, id: generateId(), start: videoClip.start + videoClip.duration };
      setTimeline(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          video: [...prev.tracks.video, newClip].sort((a, b) => a.start - b.start),
        },
      }));
      return;
    }

    // Try audio clips
    const audioClip = timeline.tracks.audio.find(c => c.id === selectedClipId);
    if (audioClip) {
      const clipDuration = audioClip.duration || 10;
      const newClip = { ...audioClip, id: generateId(), start: audioClip.start + clipDuration };
      setTimeline(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          audio: [...prev.tracks.audio, newClip].sort((a, b) => a.start - b.start),
        },
      }));
      return;
    }

    // Try text clips
    const textClip = timeline.tracks.text.find(c => c.id === selectedClipId);
    if (textClip) {
      const clipDuration = textClip.end - textClip.start;
      const newClip = { ...textClip, id: generateId(), start: textClip.end, end: textClip.end + clipDuration };
      setTimeline(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          text: [...prev.tracks.text, newClip].sort((a, b) => a.start - b.start),
        },
      }));
    }
  }, [selectedClipId, timeline.tracks.video, timeline.tracks.audio, timeline.tracks.text]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(prev => !prev);
          break;
        case 'KeyS':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            splitClipAtPlayhead();
          }
          break;
        case 'KeyD':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            duplicateClip();
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedClip) {
            e.preventDefault();
            deleteClip(selectedClip.id, selectedClip.type);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentTime(prev => Math.max(0, prev - (e.shiftKey ? 1 : 0.1)));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCurrentTime(prev => Math.min(timeline.duration, prev + (e.shiftKey ? 1 : 0.1)));
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [splitClipAtPlayhead, duplicateClip, selectedClip, deleteClip, timeline.duration]);

  if (isLoadingProject) {
    return (
      <div className="flex flex-col h-full bg-[#080a0f] text-white items-center justify-center" data-testid="video-editor-loading">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-xl gradient-cyan-purple flex items-center justify-center animate-neon-pulse">
            <Wand2 className="h-8 w-8 text-white" />
          </div>
          <p className="neon-text-cyan">Loading project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#080a0f] text-white select-none" data-testid="video-editor">
      
      {/* Top Header Bar - Neon Theme */}
      <div className="h-14 bg-gradient-to-r from-[#0d1117] via-[#161b22] to-[#0d1117] border-b border-cyan-500/20 flex items-center px-4 gap-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-purple-500/5 to-magenta-500/5"></div>
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-8 h-8 gradient-cyan-purple rounded-lg flex items-center justify-center neon-glow-cyan">
            <Wand2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold neon-text-cyan">NEON EDITOR</span>
            <span className="text-xs text-gray-500 ml-2">Pro</span>
          </div>
        </div>
        
        <div className="flex-1" />
        
        {/* Keyboard shortcuts hint */}
        <div className="hidden md:flex items-center gap-2 text-xs text-gray-500 relative z-10">
          <span className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10">Space</span>
          <span>Play</span>
          <span className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 ml-2">S</span>
          <span>Split</span>
          <span className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 ml-2">D</span>
          <span>Duplicate</span>
        </div>
        
        <div className="flex items-center gap-2 relative z-10">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 border-magenta-500/30 text-magenta-400 hover:bg-magenta-500/10 hover:border-magenta-500/50 gap-1.5"
            onClick={handleAIEnhance}
            disabled={isAIEnhancing || timeline.tracks.video.length === 0}
            data-testid="button-ai-enhance"
          >
            {isAIEnhancing ? (
              <>
                <span className="animate-spin">⏳</span>
                Enhancing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                AI Enhance
              </>
            )}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50"
            onClick={() => console.log("Timeline JSON:", JSON.stringify(timeline, null, 2))}
            data-testid="button-export-json"
          >
            Export JSON
          </Button>
          <Button 
            className="h-8 px-4 gradient-cyan-purple text-white text-sm font-medium neon-glow-cyan"
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
        
        {/* Left Sidebar - Tools - Neon Theme */}
        <div className="w-14 bg-gradient-to-b from-[#0d1117] to-[#080a0f] border-r border-cyan-500/10 flex flex-col items-center py-3 gap-1.5">
          {sidebarTools.map((tool) => (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <button 
                  onClick={() => setActiveSidebarTool(activeSidebarTool === tool.id ? '' : tool.id)}
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200",
                    activeSidebarTool === tool.id 
                      ? "bg-cyan-500/20 text-cyan-400 neon-border-cyan" 
                      : "text-gray-500 hover:bg-white/5 hover:text-cyan-300"
                  )}
                  data-testid={`tool-${tool.id}`}
                >
                  <tool.icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-[#161b22] border-cyan-500/20 text-cyan-400">{tool.label}</TooltipContent>
            </Tooltip>
          ))}
          
          <div className="flex-1" />
          
          {/* Split and Duplicate tools */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                onClick={splitClipAtPlayhead}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-500 hover:bg-magenta-500/10 hover:text-magenta-400 transition-all"
                data-testid="tool-split"
              >
                <Scissors className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#161b22] border-magenta-500/20">Split (S)</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                onClick={duplicateClip}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-500 hover:bg-purple-500/10 hover:text-purple-400 transition-all"
                data-testid="tool-duplicate"
              >
                <Copy className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#161b22] border-purple-500/20">Duplicate (D)</TooltipContent>
          </Tooltip>
        </div>

        {/* AI Edit Panel - Neon Theme */}
        {activeSidebarTool === 'ai' && (
          <AIEditPanel
            timeline={timeline}
            currentTime={currentTime}
            selectedClipId={selectedClipId}
            onTimelineUpdate={setTimeline}
            onSeek={setCurrentTime}
          />
        )}

        {/* SFX Library Panel - Neon Theme */}
        {activeSidebarTool === 'sfx' && (
          <div className="w-64 bg-gradient-to-b from-[#0d1117] to-[#080a0f] border-r border-cyan-500/10 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-cyan-500/10">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-green-400" />
                <span className="neon-text-green">Sound Effects</span>
              </h3>
              <p className="text-xs text-gray-500 mt-1">Click to add at playhead</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {sfxCategories.map(category => (
                <div key={category} className="mb-3">
                  <h4 className="text-xs font-medium text-cyan-400/60 uppercase tracking-wider px-2 mb-1.5">
                    {category}
                  </h4>
                  <div className="space-y-1">
                    {SFX_LIBRARY.filter(sfx => sfx.category === category).map(sfx => (
                      <button
                        key={sfx.id}
                        onClick={() => addSfxToTimeline(sfx)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-green-500/5 border border-green-500/10 hover:bg-green-500/15 hover:border-green-500/30 transition-all group"
                        data-testid={`sfx-${sfx.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-gradient-to-br from-green-500/30 to-cyan-500/30 flex items-center justify-center">
                            <Volume2 className="h-3 w-3 text-green-400" />
                          </div>
                          <span className="text-sm text-gray-300 group-hover:text-green-400">{sfx.name}</span>
                        </div>
                        <span className="text-xs text-gray-500 group-hover:text-green-400/60">{sfx.duration}s</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audio Mixing Panel - Neon Theme */}
        {activeSidebarTool === 'audio' && (
          <div className="w-72 bg-gradient-to-b from-[#0d1117] to-[#080a0f] border-r border-cyan-500/10 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-cyan-500/10">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Music className="h-4 w-4 text-green-400" />
                <span className="text-green-400">Audio Mixer</span>
              </h3>
              <p className="text-xs text-gray-500 mt-1">Adjust audio levels</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Master Volume */}
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-400">Master Volume</span>
                  <span className="text-xs text-green-400 font-mono">80%</span>
                </div>
                <Slider defaultValue={[80]} min={0} max={100} className="cursor-pointer" />
              </div>
              
              {/* Voiceover Track */}
              <div>
                <h4 className="text-xs font-medium text-cyan-400/60 uppercase tracking-wider mb-2">Voiceover</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Slider defaultValue={[100]} min={0} max={100} className="cursor-pointer" />
                    </div>
                    <span className="text-xs text-gray-400 w-12 text-right">100%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Fade In</span>
                    <div className="flex-1">
                      <Slider defaultValue={[0.5]} min={0} max={3} step={0.1} className="cursor-pointer" />
                    </div>
                    <span className="text-xs text-gray-400 w-10 text-right">0.5s</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Fade Out</span>
                    <div className="flex-1">
                      <Slider defaultValue={[0.5]} min={0} max={3} step={0.1} className="cursor-pointer" />
                    </div>
                    <span className="text-xs text-gray-400 w-10 text-right">0.5s</span>
                  </div>
                </div>
              </div>
              
              {/* Background Music */}
              <div>
                <h4 className="text-xs font-medium text-cyan-400/60 uppercase tracking-wider mb-2">Background Music</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Slider defaultValue={[30]} min={0} max={100} className="cursor-pointer" />
                    </div>
                    <span className="text-xs text-gray-400 w-12 text-right">30%</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-cyan-500/30 bg-transparent text-cyan-500" defaultChecked />
                    <span className="text-xs text-gray-400">Auto-duck during voiceover</span>
                  </label>
                </div>
              </div>
              
              {/* Sound Effects */}
              <div>
                <h4 className="text-xs font-medium text-cyan-400/60 uppercase tracking-wider mb-2">Sound Effects</h4>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Slider defaultValue={[80]} min={0} max={100} className="cursor-pointer" />
                  </div>
                  <span className="text-xs text-gray-400 w-12 text-right">80%</span>
                </div>
              </div>
              
              {/* Audio Waveform Preview */}
              <div>
                <h4 className="text-xs font-medium text-cyan-400/60 uppercase tracking-wider mb-2">Waveform</h4>
                <div className="h-16 rounded-md bg-[#0a0d12] border border-green-500/10 flex items-center justify-center overflow-hidden">
                  <div className="flex items-center gap-0.5 h-full py-2">
                    {Array.from({ length: 40 }).map((_, i) => (
                      <div 
                        key={i}
                        className="w-1 bg-green-500/60 rounded-full"
                        style={{ height: `${Math.random() * 80 + 20}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Effects Panel - Neon Theme */}
        {activeSidebarTool === 'effects' && (
          <div className="w-72 bg-gradient-to-b from-[#0d1117] to-[#080a0f] border-r border-cyan-500/10 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-cyan-500/10">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <span className="text-purple-400">Visual Effects</span>
              </h3>
              <p className="text-xs text-gray-500 mt-1">Apply effects to selected clip</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Color Filters */}
              <div>
                <h4 className="text-xs font-medium text-cyan-400/60 uppercase tracking-wider mb-2">Color Filters</h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'none', name: 'None', color: 'gray' },
                    { id: 'vintage', name: 'Vintage', color: 'amber' },
                    { id: 'noir', name: 'Noir', color: 'gray' },
                    { id: 'warm', name: 'Warm', color: 'orange' },
                    { id: 'cold', name: 'Cold', color: 'blue' },
                    { id: 'cinematic', name: 'Cinematic', color: 'cyan' },
                  ].map(filter => (
                    <button
                      key={filter.id}
                      className={cn(
                        "px-3 py-2 rounded-md text-xs font-medium transition-all border",
                        filter.id === 'cinematic' 
                          ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400"
                          : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                      )}
                      data-testid={`filter-${filter.id}`}
                    >
                      {filter.name}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Ken Burns Effects */}
              <div>
                <h4 className="text-xs font-medium text-cyan-400/60 uppercase tracking-wider mb-2">Ken Burns Motion</h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'none', name: 'None' },
                    { id: 'zoom_in', name: 'Zoom In' },
                    { id: 'zoom_out', name: 'Zoom Out' },
                    { id: 'pan_left', name: 'Pan Left' },
                    { id: 'pan_right', name: 'Pan Right' },
                    { id: 'kenburns', name: 'Full KB' },
                  ].map(effect => (
                    <button
                      key={effect.id}
                      className="px-3 py-2 rounded-md text-xs font-medium transition-all border bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/40"
                      data-testid={`effect-${effect.id}`}
                    >
                      {effect.name}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Brightness/Contrast */}
              <div>
                <h4 className="text-xs font-medium text-cyan-400/60 uppercase tracking-wider mb-3">Adjustments</h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">Brightness</span>
                      <span className="text-xs text-cyan-400">100%</span>
                    </div>
                    <Slider defaultValue={[100]} min={0} max={200} className="cursor-pointer" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">Contrast</span>
                      <span className="text-xs text-cyan-400">100%</span>
                    </div>
                    <Slider defaultValue={[100]} min={0} max={200} className="cursor-pointer" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">Saturation</span>
                      <span className="text-xs text-cyan-400">100%</span>
                    </div>
                    <Slider defaultValue={[100]} min={0} max={200} className="cursor-pointer" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">Blur</span>
                      <span className="text-xs text-cyan-400">0px</span>
                    </div>
                    <Slider defaultValue={[0]} min={0} max={20} className="cursor-pointer" />
                  </div>
                </div>
              </div>
              
              {/* Transitions */}
              <div>
                <h4 className="text-xs font-medium text-cyan-400/60 uppercase tracking-wider mb-2">Transitions</h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'cut', name: 'Cut' },
                    { id: 'crossfade', name: 'Crossfade' },
                    { id: 'fade_black', name: 'Fade Black' },
                    { id: 'fade_white', name: 'Fade White' },
                    { id: 'wipe_left', name: 'Wipe Left' },
                    { id: 'wipe_right', name: 'Wipe Right' },
                  ].map(transition => (
                    <button
                      key={transition.id}
                      className="px-3 py-2 rounded-md text-xs font-medium transition-all border bg-magenta-500/10 border-magenta-500/20 text-magenta-400 hover:bg-magenta-500/20 hover:border-magenta-500/40"
                      data-testid={`transition-${transition.id}`}
                    >
                      {transition.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Video Preview Area - Neon Theme */}
          <div className="flex-1 bg-[#050709] flex items-center justify-center p-4 min-h-[300px] relative">
            {/* Neon grid background */}
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: `linear-gradient(rgba(0, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 255, 0.03) 1px, transparent 1px)`,
              backgroundSize: '40px 40px'
            }} />
            
            <div 
              className="relative rounded-lg overflow-hidden neon-border-cyan"
              style={{ 
                aspectRatio: aspectRatio === "16:9" ? "16/9" : aspectRatio === "9:16" ? "9/16" : "1/1",
                maxHeight: "100%",
                maxWidth: aspectRatio === "9:16" ? "300px" : "100%",
                width: aspectRatio === "9:16" ? "auto" : "min(100%, 800px)",
                background: "linear-gradient(180deg, #0d1117 0%, #080a0f 100%)"
              }}
              data-testid="video-preview"
            >
              {currentVideoClip ? (
                <img 
                  src={currentVideoClip.src} 
                  alt="Video frame"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    transform: currentVideoClip.effect === "zoom_in" 
                      ? "scale(1.1)" 
                      : currentVideoClip.effect === "zoom_out" 
                      ? "scale(0.95)" 
                      : "scale(1)",
                    filter: `grayscale(100%)${currentVideoClip.blur ? " blur(4px)" : ""}`,
                    transition: "transform 0.3s ease-out"
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="w-20 h-20 mx-auto rounded-xl gradient-cyan-purple flex items-center justify-center neon-glow-cyan">
                      <Play className="h-10 w-10 text-white ml-1" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold neon-text-cyan">
                        {projectData?.project?.title || "Timeline Preview"}
                      </h2>
                      {hasContent ? (
                        <p className="text-sm text-cyan-400/60 mt-1">{formatTime(currentTime)} / {formatTime(timeline.duration)}</p>
                      ) : (
                        <p className="text-sm text-magenta-400 mt-1">
                          {projectId ? "No generated content yet. Complete the documentary generation first." : "Add clips to the timeline to get started."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Overlay with timecode when showing image */}
              {currentVideoClip && (
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                  <div className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-md">
                    <span className="text-sm font-mono text-white">{formatTime(currentTime)} / {formatTime(timeline.duration)}</span>
                  </div>
                  <div className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-md">
                    <span className="text-xs text-gray-300">{currentVideoClip.effect !== "none" ? currentVideoClip.effect : "No effect"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline Section - Neon Theme */}
          <div className="h-[45%] min-h-[280px] flex flex-col bg-gradient-to-b from-[#0a0d12] to-[#080a0f] border-t border-cyan-500/20">
            
            {/* Timeline Toolbar - Neon Theme */}
            <div className="h-12 bg-gradient-to-r from-[#0d1117] via-[#101419] to-[#0d1117] border-b border-cyan-500/10 flex items-center px-3 gap-2">
              {/* Undo/Redo */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/10" data-testid="button-undo">
                      <Undo className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#161b22] border-cyan-500/20">Undo</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/10" data-testid="button-redo">
                      <Redo className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#161b22] border-cyan-500/20">Redo</TooltipContent>
                </Tooltip>
              </div>

              <div className="w-px h-6 bg-cyan-500/20" />

              {/* Scissors */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-gray-500 hover:text-magenta-400 hover:bg-magenta-500/10" 
                    onClick={splitClipAtPlayhead}
                    data-testid="button-cut"
                  >
                    <Scissors className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#161b22] border-magenta-500/20">Split (S)</TooltipContent>
              </Tooltip>
              
              {/* Duplicate */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-gray-500 hover:text-purple-400 hover:bg-purple-500/10" 
                    onClick={duplicateClip}
                    disabled={!selectedClip}
                    data-testid="button-duplicate"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#161b22] border-purple-500/20">Duplicate (D)</TooltipContent>
              </Tooltip>
              
              {/* Delete */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => selectedClip && deleteClip(selectedClip.id, selectedClip.type)}
                    disabled={!selectedClip}
                    data-testid="button-delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#161b22] border-red-500/20">Delete</TooltipContent>
              </Tooltip>

              <div className="flex-1" />

              {/* Play/Pause - Neon Glow */}
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn(
                  "h-10 w-10 rounded-full transition-all",
                  isPlaying 
                    ? "text-magenta-400 bg-magenta-500/20 neon-border-magenta" 
                    : "text-cyan-400 hover:bg-cyan-500/20 hover:neon-border-cyan"
                )}
                onClick={() => setIsPlaying(!isPlaying)}
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
              </Button>

              {/* Timecode Display - Neon */}
              <div className="text-sm font-mono min-w-[160px] text-center px-3 py-1.5 rounded-md bg-[#0d1117] border border-cyan-500/20" data-testid="text-timecode">
                <span className="neon-text-cyan">{formatTime(currentTime)}</span>
                <span className="text-gray-600"> / </span>
                <span className="text-gray-400">{formatTime(timeline.duration)}</span>
              </div>

              <div className="flex-1" />

              {/* Aspect Ratio */}
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="w-20 h-8 bg-[#0d1117] border-cyan-500/20 text-xs text-cyan-400">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-cyan-500/20">
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                </SelectContent>
              </Select>

              {/* Zoom Controls - Neon */}
              <div className="flex items-center gap-1.5 ml-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-gray-500 hover:text-cyan-400"
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
                  className="h-7 w-7 text-gray-500 hover:text-cyan-400"
                  onClick={() => setZoom(Math.min(200, zoom + 25))}
                  data-testid="button-zoom-in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                
                <span className="text-xs text-gray-500 min-w-[32px]">{zoom}%</span>
              </div>

              {/* Properties Button */}
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-8 w-8 ml-2", selectedClip ? "text-cyan-400 neon-border-cyan" : "text-gray-500")}
                onClick={() => setPropertiesPanelOpen(true)}
                disabled={!selectedClip}
                data-testid="button-properties"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>

            {/* Timeline Area */}
            <div className="flex-1 flex overflow-hidden">
              
              {/* Track Headers - Neon Theme */}
              <div className="w-[140px] bg-gradient-to-b from-[#0d1117] to-[#080a0f] border-r border-cyan-500/10 flex flex-col flex-shrink-0">
                {/* Ruler spacer */}
                <div className="h-7 border-b border-cyan-500/10" />
                
                {/* Track controls */}
                {tracks.map((track, index) => (
                  <div 
                    key={track.id} 
                    className="h-16 border-b border-cyan-500/5 flex items-center px-2 gap-2 hover:bg-white/5 transition-colors"
                    data-testid={`track-header-${track.id}`}
                  >
                    <div className={cn(
                      "w-7 h-7 rounded flex items-center justify-center",
                      track.type === 'video' ? "bg-cyan-500/20 text-cyan-400" :
                      track.type === 'audio' ? "bg-green-500/20 text-green-400" :
                      "bg-magenta-500/20 text-magenta-400"
                    )}>
                      {track.type === 'video' && <ImageIcon className="h-3.5 w-3.5" />}
                      {track.type === 'audio' && <Volume2 className="h-3.5 w-3.5" />}
                      {track.type === 'text' && <Type className="h-3.5 w-3.5" />}
                    </div>
                    <span className="text-xs text-gray-400 flex-1">{track.label}</span>
                    <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100">
                      <button className="p-1 text-gray-500 hover:text-cyan-400 transition-colors" data-testid={`button-visibility-${track.id}`}>
                        {track.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </button>
                      <button className="p-1 text-gray-500 hover:text-cyan-400 transition-colors" data-testid={`button-lock-${track.id}`}>
                        {track.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Timeline Tracks - Neon Theme */}
              <div 
                ref={timelineRef}
                className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#080a0f]"
                onClick={handleTimelineClick}
              >
                {/* Time Ruler - Neon */}
                <div className="h-7 bg-gradient-to-r from-[#0d1117] via-[#101419] to-[#0d1117] border-b border-cyan-500/10 sticky top-0 z-20">
                  <div style={{ width: (timeline.duration + 4) * pixelsPerSecond }} className="relative h-full">
                    {generateTimeMarkers().map((time) => (
                      <div 
                        key={time}
                        className="absolute bottom-0 flex flex-col items-center"
                        style={{ left: time * pixelsPerSecond }}
                      >
                        <span className="text-[10px] text-cyan-400/60 font-mono">
                          {time}s
                        </span>
                        <div className="w-px h-2 bg-cyan-500/30 mt-0.5" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tracks Content */}
                <div className="relative" style={{ width: (timeline.duration + 4) * pixelsPerSecond }}>
                  
                  {/* Playhead - Neon Magenta Glow */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 z-30 pointer-events-none editor-playhead animate-playhead-glow"
                    style={{ left: currentTime * pixelsPerSecond }}
                    data-testid="playhead"
                  >
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#ff00ff] rotate-45 neon-glow-magenta" />
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
                          "h-16 border-b border-cyan-500/5 relative",
                          track.locked && "opacity-50"
                        )}
                        data-testid={`track-${track.id}`}
                      >
                        {/* Grid lines - Neon */}
                        <div className="absolute inset-0 opacity-20">
                          {generateTimeMarkers().map((time) => (
                            <div 
                              key={time}
                              className="absolute top-0 bottom-0 w-px bg-cyan-500/20"
                              style={{ left: time * pixelsPerSecond }}
                            />
                          ))}
                        </div>

                        {/* Clips - Neon Theme */}
                        {clips.map((clip, clipIndex) => {
                          const clipDuration = getClipDuration(clip);
                          const isSelected = selectedClipId === clip.id;
                          const isEvenClip = clipIndex % 2 === 0;
                          
                          return (
                            <div
                              key={clip.id}
                              className={cn(
                                "absolute top-1 bottom-1 rounded-md cursor-grab active:cursor-grabbing transition-all group",
                                clip.type === 'video' && "editor-clip-video",
                                clip.type === 'audio' && "editor-clip-audio",
                                clip.type === 'text' && "editor-clip-text",
                                isSelected && "editor-clip-selected ring-1 ring-cyan-400",
                                draggingClip?.clipId === clip.id && "opacity-70 scale-[1.02]",
                                !track.locked && "hover:brightness-125"
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
                              {/* Video clip with thumbnail */}
                              {clip.type === 'video' && (
                                <div className="h-full relative overflow-hidden rounded-md">
                                  {/* Thumbnail background */}
                                  <img 
                                    src={(clip as TimelineVideoClip).src} 
                                    alt=""
                                    className="absolute inset-0 w-full h-full object-cover"
                                    style={{ filter: "grayscale(100%)" }}
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                  {/* Gradient overlay for text readability */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
                                  {/* Content - positioned at bottom */}
                                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-1.5 py-1 z-10">
                                    <div className="flex items-center gap-1 min-w-0">
                                      <GripVertical className="h-3 w-3 text-white/80 flex-shrink-0" />
                                      <span className="text-[10px] text-white font-semibold truncate drop-shadow-md">
                                        Scene {timeline.tracks.video.findIndex(v => v.id === clip.id) + 1}
                                      </span>
                                    </div>
                                    {(clip as TimelineVideoClip).effect !== 'none' && (
                                      <span className="text-[7px] text-white bg-black/50 px-1 py-0.5 rounded font-medium">
                                        {(clip as TimelineVideoClip).effect}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Audio clip with waveform */}
                              {clip.type === 'audio' && (() => {
                                const barCount = Math.min(Math.floor(clipDuration * pixelsPerSecond / 3), 80);
                                const waveformBars = generateWaveformBars(clip.id, barCount);
                                const isSfx = (clip as TimelineAudioClip).audioType === 'sfx';
                                return (
                                  <div className="h-full relative overflow-hidden rounded-md">
                                    {/* Waveform visualization */}
                                    <div className="absolute inset-0 flex items-center justify-center gap-[1px] px-1">
                                      {waveformBars.map((height, i) => (
                                        <div 
                                          key={i}
                                          className={isSfx ? "bg-purple-400/80" : "bg-amber-400/80"}
                                          style={{ 
                                            width: 2, 
                                            height: `${height}%`,
                                            minHeight: 4
                                          }}
                                        />
                                      ))}
                                    </div>
                                    {/* Content overlay */}
                                    <div className="relative h-full flex items-center px-2 z-10">
                                      <GripVertical className="h-3 w-3 text-white/80 flex-shrink-0 mr-1" />
                                      <span className="text-[9px] text-white font-semibold truncate bg-black/50 px-1 rounded drop-shadow">
                                        {(clip as TimelineAudioClip).src.split('/').pop()}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Text clip with content display */}
                              {clip.type === 'text' && (
                                <div className="h-full relative overflow-hidden rounded-md">
                                  {/* Pattern background */}
                                  <div className="absolute inset-0 opacity-40">
                                    {Array.from({ length: Math.min(Math.floor(clipDuration * pixelsPerSecond / 8), 30) }).map((_, i) => (
                                      <div 
                                        key={i}
                                        className="absolute top-0 bottom-0 w-[2px] bg-pink-300"
                                        style={{ left: i * 8 }}
                                      />
                                    ))}
                                  </div>
                                  {/* Content */}
                                  <div className="relative h-full flex items-center px-2 z-10">
                                    <GripVertical className="h-3 w-3 text-white/60 flex-shrink-0 mr-1" />
                                    <span className="text-[10px] text-white font-medium truncate">
                                      {(clip as TimelineTextClip).text || 'Text'}
                                    </span>
                                  </div>
                                </div>
                              )}

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
