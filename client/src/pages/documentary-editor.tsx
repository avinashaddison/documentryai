import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Download,
  Film,
  Image as ImageIcon,
  Clock,
  Layers,
  ChevronLeft,
  Loader2,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  Maximize,
  Minimize,
  Eye,
  Settings,
  Folder,
  Music,
  Video,
  Grid3X3,
  Monitor,
  Mic,
  Scissors,
  Magnet,
  ChevronDown,
  Grip,
  Bookmark,
  Flag,
  Square,
  Rewind,
  FastForward,
  Circle,
  MonitorPlay,
  SlidersHorizontal,
  Command,
  FileVideo,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const kenBurnsStyles = `
@keyframes kenBurnsZoomIn {
  from { transform: scale(1); }
  to { transform: scale(1.15); }
}
@keyframes kenBurnsZoomOut {
  from { transform: scale(1.15); }
  to { transform: scale(1); }
}
@keyframes kenBurnsPanLeft {
  from { transform: translateX(0) scale(1.1); }
  to { transform: translateX(-8%) scale(1.1); }
}
@keyframes kenBurnsPanRight {
  from { transform: translateX(0) scale(1.1); }
  to { transform: translateX(8%) scale(1.1); }
}
@keyframes kenBurnsPanUp {
  from { transform: translateY(0) scale(1.1); }
  to { transform: translateY(-8%) scale(1.1); }
}
@keyframes kenBurnsPanDown {
  from { transform: translateY(0) scale(1.1); }
  to { transform: translateY(8%) scale(1.1); }
}
`;

interface Scene {
  sceneNumber: number;
  imagePrompt: string;
  duration: number;
  narrationSegment: string;
  imageUrl?: string;
  kenBurnsEffect?: string;
}

interface Chapter {
  chapterNumber: number;
  title: string;
  scenes: Scene[];
  narration: string;
}

interface DocumentaryData {
  projectId: number;
  title: string;
  chapters: Chapter[];
  generatedImages: Record<string, string>;
  generatedAudio?: Record<string, string>;
}

const KEN_BURNS_EFFECTS = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"];

const getKenBurnsAnimation = (effect: string, duration: number) => {
  const animationMap: Record<string, string> = {
    zoom_in: `kenBurnsZoomIn ${duration}s ease-out forwards`,
    zoom_out: `kenBurnsZoomOut ${duration}s ease-out forwards`,
    pan_left: `kenBurnsPanLeft ${duration}s ease-out forwards`,
    pan_right: `kenBurnsPanRight ${duration}s ease-out forwards`,
    pan_up: `kenBurnsPanUp ${duration}s ease-out forwards`,
    pan_down: `kenBurnsPanDown ${duration}s ease-out forwards`,
  };
  return animationMap[effect] || animationMap.zoom_in;
};

export default function DocumentaryEditor() {
  const [, setLocation] = useLocation();
  const [documentaryData, setDocumentaryData] = useState<DocumentaryData | null>(null);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<"idle" | "processing" | "complete" | "error">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [activePanel, setActivePanel] = useState<"media" | "effects" | "audio">("media");
  const [markers, setMarkers] = useState<{time: number, label: string, color: string}[]>([]);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const preloadedAudios = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    const styleTag = document.createElement("style");
    styleTag.textContent = kenBurnsStyles;
    document.head.appendChild(styleTag);
    return () => {
      document.head.removeChild(styleTag);
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const storedData = sessionStorage.getItem("documentaryEditorData");
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          setDocumentaryData(parsed);
          
          if (parsed.projectId) {
            try {
              const assetsResponse = await fetch(`/api/projects/${parsed.projectId}/generated-assets`);
              if (assetsResponse.ok) {
                const assetsData = await assetsResponse.json();
                if (Object.keys(assetsData.images).length > 0 || Object.keys(assetsData.audio).length > 0) {
                  setDocumentaryData(prev => prev ? {
                    ...prev,
                    generatedImages: { ...prev.generatedImages, ...assetsData.images },
                    generatedAudio: { ...(prev.generatedAudio || {}), ...assetsData.audio },
                  } : prev);
                }
              }
            } catch (e) {
              console.error("Failed to load saved assets:", e);
            }
          }
        } catch (e) {
          console.error("Failed to parse documentary data:", e);
        }
      }
      setIsLoading(false);
    };
    loadData();
  }, []);

  const allScenes = documentaryData?.chapters.flatMap((ch, chIdx) =>
    ch.scenes.map((scene, scIdx) => ({
      ...scene,
      chapterIndex: chIdx,
      chapterTitle: ch.title,
      globalIndex: chIdx * 100 + scIdx,
      imageUrl: documentaryData.generatedImages[`ch${ch.chapterNumber}_sc${scene.sceneNumber}`] || null,
      audioUrl: documentaryData.generatedAudio?.[`ch${ch.chapterNumber}_sc${scene.sceneNumber}`] || null,
      kenBurnsEffect: KEN_BURNS_EFFECTS[(chIdx + scIdx) % KEN_BURNS_EFFECTS.length],
    }))
  ) || [];

  const totalDuration = allScenes.reduce((sum, scene) => sum + (scene.duration || 5), 0);
  const currentScene = allScenes[currentSceneIndex];

  const getSceneIndexFromTime = useCallback((time: number) => {
    let elapsed = 0;
    for (let i = 0; i < allScenes.length; i++) {
      elapsed += allScenes[i].duration || 5;
      if (time < elapsed) {
        return i;
      }
    }
    return allScenes.length - 1;
  }, [allScenes]);

  const seekToTime = useCallback((time: number) => {
    const clampedTime = Math.max(0, Math.min(totalDuration, time));
    setCurrentTime(clampedTime);
    setCurrentSceneIndex(getSceneIndexFromTime(clampedTime));
  }, [totalDuration, getSceneIndexFromTime]);

  useEffect(() => {
    if (isPlaying && allScenes.length > 0) {
      playIntervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const newTime = prev + 0.1;
          let elapsed = 0;
          for (let i = 0; i < allScenes.length; i++) {
            elapsed += allScenes[i].duration || 5;
            if (newTime < elapsed) {
              if (i !== currentSceneIndex) {
                setCurrentSceneIndex(i);
              }
              break;
            }
          }
          if (newTime >= totalDuration) {
            setIsPlaying(false);
            return 0;
          }
          return newTime;
        });
      }, 100);
    }
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, allScenes.length, totalDuration, currentSceneIndex]);

  useEffect(() => {
    if (!currentScene?.audioUrl || !audioRef.current) return;
    
    const audio = audioRef.current;
    audio.src = currentScene.audioUrl;
    audio.volume = isMuted ? 0 : volume / 100;
    
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    
    return () => {
      audio.pause();
    };
  }, [currentScene?.audioUrl, isPlaying, volume, isMuted]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSceneClick = (index: number) => {
    setCurrentSceneIndex(index);
    let time = 0;
    for (let i = 0; i < index; i++) {
      time += allScenes[i].duration || 5;
    }
    setCurrentTime(time);
    setIsPlaying(false);
  };

  const toggleFullscreen = async () => {
    if (!videoContainerRef.current) return;
    
    if (!isFullscreen) {
      try {
        await videoContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch (e) {
        console.error("Fullscreen failed:", e);
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (e) {
        console.error("Exit fullscreen failed:", e);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.code) {
        case "Space":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            seekToTime(currentTime - 5);
          } else {
            handleSceneClick(Math.max(0, currentSceneIndex - 1));
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            seekToTime(currentTime + 5);
          } else {
            handleSceneClick(Math.min(allScenes.length - 1, currentSceneIndex + 1));
          }
          break;
        case "Home":
          e.preventDefault();
          seekToTime(0);
          break;
        case "End":
          e.preventDefault();
          seekToTime(totalDuration);
          break;
        case "KeyM":
          e.preventDefault();
          setMarkers(prev => [...prev, { time: currentTime, label: `Marker ${prev.length + 1}`, color: "#f97316" }]);
          break;
        case "KeyG":
          e.preventDefault();
          setShowGrid(!showGrid);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSceneIndex, allScenes.length, totalDuration, currentTime, showGrid]);

  const handleExport = async () => {
    if (!documentaryData) return;

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("processing");
    setExportError(null);

    try {
      const progressInterval = setInterval(() => {
        setExportProgress((prev) => Math.min(prev + Math.random() * 8, 90));
      }, 800);

      const exportData = {
        projectId: documentaryData.projectId,
        title: documentaryData.title,
        chapters: documentaryData.chapters.map((ch) => ({
          ...ch,
          scenes: ch.scenes.map((scene) => ({
            ...scene,
            imageUrl: documentaryData.generatedImages[`ch${ch.chapterNumber}_sc${scene.sceneNumber}`],
            audioUrl: documentaryData.generatedAudio?.[`ch${ch.chapterNumber}_sc${scene.sceneNumber}`],
            kenBurnsEffect: KEN_BURNS_EFFECTS[(ch.chapterNumber + scene.sceneNumber) % KEN_BURNS_EFFECTS.length],
          })),
        })),
      };

      const response = await fetch("/api/render-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportData),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Export failed");
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      setExportProgress(100);
      setExportStatus("complete");

      if (result.videoUrl) {
        setExportedVideoUrl(result.videoUrl);
      }
    } catch (error: any) {
      console.error("Export error:", error);
      setExportStatus("error");
      setExportError(error.message || "Video export failed");
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 1000);
    }
  };

  const formatTimecode = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 24);
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getSceneStartTime = (index: number) => {
    let time = 0;
    for (let i = 0; i < index; i++) {
      time += allScenes[i]?.duration || 5;
    }
    return time;
  };

  if (!documentaryData) {
    return (
      <div className="min-h-screen bg-[#0a0d14] text-white flex flex-col items-center justify-center gap-4">
        <Film className="h-16 w-16 text-gray-600" />
        <h2 className="text-xl font-bold">No Documentary Data</h2>
        <p className="text-gray-400">Generate a documentary first to use the editor.</p>
        <Button onClick={() => setLocation("/create")} className="gap-2 bg-gradient-to-r from-orange-500 to-amber-600">
          <ChevronLeft className="h-4 w-4" />
          Go to Documentary Maker
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-[#0c0e14] text-white overflow-hidden" data-testid="documentary-editor">
        <audio ref={audioRef} preload="auto" />
        
        {/* Top Command Bar - Professional NLE Style */}
        <div className="h-10 bg-gradient-to-b from-[#1e2330] to-[#181c26] border-b border-[#2a3040] flex items-center px-2 gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
            className="h-7 px-2 text-xs text-gray-400 hover:text-white hover:bg-white/5"
            data-testid="button-back"
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
            Project
          </Button>

          <div className="w-px h-5 bg-[#2a3040] mx-2" />

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white hover:bg-white/5">
                  <Scissors className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-[#1a1f2e] border-[#2a3040]">
                <p className="text-xs">Razor Tool (C)</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn("h-7 w-7 hover:bg-white/5", snapEnabled ? "text-orange-400" : "text-gray-400")}
                  onClick={() => setSnapEnabled(!snapEnabled)}
                >
                  <Magnet className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-[#1a1f2e] border-[#2a3040]">
                <p className="text-xs">Snap (S)</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn("h-7 w-7 hover:bg-white/5", showGrid ? "text-orange-400" : "text-gray-400")}
                  onClick={() => setShowGrid(!showGrid)}
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-[#1a1f2e] border-[#2a3040]">
                <p className="text-xs">Grid Overlay (G)</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-3">
              <FileVideo className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-medium text-white truncate max-w-md">{documentaryData.title}</span>
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] h-5">
                <Eye className="h-2.5 w-2.5 mr-1" />
                Preview
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono">
              {documentaryData.chapters.length}ch • {allScenes.length}sc
            </span>
            <Button
              onClick={handleExport}
              disabled={isExporting || isGenerating}
              size="sm"
              className="h-7 px-3 text-xs gap-1.5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-lg shadow-orange-500/20"
              data-testid="button-export"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {exportProgress}%
                </>
              ) : (
                <>
                  <Download className="h-3 w-3" />
                  Export
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Main Editor Area with Resizable Panels */}
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* Left Panel - Media Browser */}
          <ResizablePanel defaultSize={20} minSize={12} maxSize={30} className="bg-[#12151c]">
            <div className="h-full flex flex-col">
              <Tabs value={activePanel} onValueChange={(v) => setActivePanel(v as any)} className="flex-1 flex flex-col">
                <TabsList className="h-9 w-full justify-start rounded-none bg-[#181c26] border-b border-[#2a3040] p-0">
                  <TabsTrigger value="media" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent text-xs h-full px-3">
                    <Folder className="h-3 w-3 mr-1.5" />
                    Media
                  </TabsTrigger>
                  <TabsTrigger value="effects" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent text-xs h-full px-3">
                    <SlidersHorizontal className="h-3 w-3 mr-1.5" />
                    Effects
                  </TabsTrigger>
                  <TabsTrigger value="audio" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent text-xs h-full px-3">
                    <Music className="h-3 w-3 mr-1.5" />
                    Audio
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="media" className="flex-1 m-0 overflow-hidden">
                  <div className="h-full overflow-y-auto p-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      {allScenes.map((scene, index) => (
                        <div
                          key={`${scene.chapterIndex}-${scene.sceneNumber}`}
                          onClick={() => handleSceneClick(index)}
                          className={cn(
                            "relative rounded overflow-hidden cursor-pointer transition-all group",
                            index === currentSceneIndex
                              ? "ring-2 ring-orange-500 ring-offset-1 ring-offset-[#12151c]"
                              : "hover:ring-1 hover:ring-white/30"
                          )}
                          data-testid={`scene-thumb-${index}`}
                        >
                          <div className="aspect-video bg-[#0a0d14]">
                            {scene.imageUrl ? (
                              <img
                                src={scene.imageUrl}
                                alt={`Scene ${scene.sceneNumber}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <ImageIcon className="h-4 w-4 text-gray-600" />
                              </div>
                            )}
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="absolute bottom-0 left-0 right-0 p-1 flex items-center justify-between">
                            <span className="text-[9px] text-white/80 font-medium">
                              {scene.chapterIndex + 1}.{scene.sceneNumber}
                            </span>
                            <span className="text-[9px] text-white/60 bg-black/50 px-1 rounded">
                              {scene.duration}s
                            </span>
                          </div>
                          {scene.audioUrl && (
                            <div className="absolute top-1 right-1">
                              <Mic className="h-2.5 w-2.5 text-green-400" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="effects" className="flex-1 m-0 p-3">
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Ken Burns Effects</p>
                    {KEN_BURNS_EFFECTS.map(effect => (
                      <div key={effect} className="flex items-center gap-2 p-2 rounded bg-[#181c26] hover:bg-[#1e2330] cursor-pointer">
                        <div className="w-8 h-8 rounded bg-[#0a0d14] flex items-center justify-center">
                          <Video className="h-3.5 w-3.5 text-orange-400" />
                        </div>
                        <span className="text-xs capitalize">{effect.replace("_", " ")}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="audio" className="flex-1 m-0 p-3">
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Audio Tracks</p>
                    {allScenes.filter(s => s.audioUrl).map((scene, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded bg-[#181c26] hover:bg-[#1e2330] cursor-pointer">
                        <div className="w-8 h-8 rounded bg-[#0a0d14] flex items-center justify-center">
                          <Mic className="h-3.5 w-3.5 text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">Ch{scene.chapterIndex + 1} Sc{scene.sceneNumber}</p>
                          <p className="text-[10px] text-gray-500">{scene.duration}s</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-1 bg-[#0a0d14] hover:bg-orange-500/50 transition-colors" />

          {/* Center Panel - Preview Monitor */}
          <ResizablePanel defaultSize={60} minSize={40}>
            <ResizablePanelGroup direction="vertical">
              {/* Program Monitor */}
              <ResizablePanel defaultSize={65} minSize={40}>
                <div className="h-full bg-[#0a0d14] flex flex-col">
                  {/* Monitor Header */}
                  <div className="h-8 bg-[#12151c] border-b border-[#1e2330] flex items-center justify-between px-3">
                    <div className="flex items-center gap-2">
                      <MonitorPlay className="h-3.5 w-3.5 text-orange-400" />
                      <span className="text-[11px] font-medium text-gray-300">Program Monitor</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn("h-6 w-6 hover:bg-white/5", showSafeZones ? "text-orange-400" : "text-gray-500")}
                            onClick={() => setShowSafeZones(!showSafeZones)}
                          >
                            <Square className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-[#1a1f2e] border-[#2a3040]">
                          <p className="text-xs">Safe Zones</p>
                        </TooltipContent>
                      </Tooltip>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-gray-500 hover:text-white hover:bg-white/5"
                        onClick={toggleFullscreen}
                      >
                        {isFullscreen ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>

                  {/* Video Preview */}
                  <div 
                    ref={videoContainerRef}
                    className="flex-1 flex items-center justify-center p-4 bg-gradient-to-b from-[#0a0d14] to-[#080a10]"
                  >
                    <div
                      className={cn(
                        "relative bg-black rounded-lg overflow-hidden shadow-2xl",
                        "ring-1 ring-white/5"
                      )}
                      style={{
                        aspectRatio: "16/9",
                        width: "100%",
                        maxWidth: "960px",
                        maxHeight: "calc(100% - 1rem)",
                      }}
                      data-testid="video-preview"
                    >
                      {currentScene?.imageUrl ? (
                        <div className="absolute inset-0 overflow-hidden">
                          <img
                            ref={imageRef}
                            key={`${currentSceneIndex}-${isPlaying}`}
                            src={currentScene.imageUrl}
                            alt={`Scene ${currentScene.sceneNumber}`}
                            className="absolute inset-0 w-full h-full object-cover"
                            style={{
                              animation: isPlaying 
                                ? getKenBurnsAnimation(currentScene.kenBurnsEffect || "zoom_in", currentScene.duration || 5)
                                : "none",
                            }}
                          />
                          
                          {/* Safe Zone Overlays */}
                          {showSafeZones && (
                            <>
                              <div className="absolute inset-[5%] border border-red-500/40 pointer-events-none" />
                              <div className="absolute inset-[10%] border border-yellow-500/40 pointer-events-none" />
                            </>
                          )}

                          {/* Grid Overlay */}
                          {showGrid && (
                            <div className="absolute inset-0 pointer-events-none" style={{
                              backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                              backgroundSize: "33.33% 33.33%"
                            }} />
                          )}
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#12151c] to-[#0a0d14]">
                          <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                              <Film className="h-8 w-8 text-gray-600" />
                            </div>
                            <p className="text-gray-500 text-sm">No preview available</p>
                          </div>
                        </div>
                      )}

                      {/* Scene Badge */}
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        <div className="bg-black/70 backdrop-blur-sm rounded px-2 py-1">
                          <span className="text-[10px] font-mono text-orange-400">
                            CH{(currentScene?.chapterIndex || 0) + 1} SC{currentScene?.sceneNumber || 1}
                          </span>
                        </div>
                        {isPlaying && (
                          <div className="bg-red-500/90 rounded px-2 py-1 flex items-center gap-1">
                            <Circle className="h-2 w-2 fill-white animate-pulse" />
                            <span className="text-[10px] font-medium text-white">LIVE</span>
                          </div>
                        )}
                      </div>

                      {/* Timecode Display */}
                      <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm rounded px-2 py-1">
                        <span className="text-[11px] font-mono text-green-400">{formatTimecode(currentTime)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Transport Controls */}
                  <div className="h-14 bg-gradient-to-t from-[#181c26] to-[#12151c] border-t border-[#1e2330] flex items-center justify-center gap-1 px-4">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white" onClick={() => seekToTime(0)}>
                      <Rewind className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white" onClick={() => handleSceneClick(Math.max(0, currentSceneIndex - 1))}>
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      onClick={handlePlayPause}
                      className="h-10 w-10 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/30 mx-2"
                      data-testid="button-play-pause"
                    >
                      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white" onClick={() => handleSceneClick(Math.min(allScenes.length - 1, currentSceneIndex + 1))}>
                      <SkipForward className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white" onClick={() => seekToTime(totalDuration)}>
                      <FastForward className="h-4 w-4" />
                    </Button>

                    <div className="w-px h-6 bg-[#2a3040] mx-3" />

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white" onClick={() => setIsMuted(!isMuted)}>
                        {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      </Button>
                      <Slider
                        value={[isMuted ? 0 : volume]}
                        onValueChange={([v]) => { setVolume(v); setIsMuted(v === 0); }}
                        max={100}
                        className="w-20"
                      />
                    </div>

                    <div className="w-px h-6 bg-[#2a3040] mx-3" />

                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="text-orange-400">{formatTimecode(currentTime)}</span>
                      <span className="text-gray-600">/</span>
                      <span className="text-gray-400">{formatTimecode(totalDuration)}</span>
                    </div>
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle className="h-1 bg-[#0a0d14] hover:bg-orange-500/50 transition-colors" />

              {/* Timeline Panel */}
              <ResizablePanel defaultSize={35} minSize={20}>
                <div className="h-full bg-[#12151c] flex flex-col">
                  {/* Timeline Header */}
                  <div className="h-8 bg-[#181c26] border-b border-[#1e2330] flex items-center justify-between px-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-gray-300">Timeline</span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-gray-500 hover:text-orange-400" onClick={() => setMarkers(prev => [...prev, { time: currentTime, label: `M${prev.length + 1}`, color: "#f97316" }])}>
                          <Flag className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-gray-500 hover:text-white">
                          <Bookmark className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ZoomOut className="h-3 w-3 text-gray-500" />
                      <Slider
                        value={[zoom]}
                        onValueChange={([z]) => setZoom(z)}
                        min={50}
                        max={200}
                        className="w-20"
                      />
                      <ZoomIn className="h-3 w-3 text-gray-500" />
                      <span className="text-[10px] text-gray-500 ml-1">{zoom}%</span>
                    </div>
                  </div>

                  {/* Time Ruler */}
                  <div className="h-6 bg-[#0a0d14] border-b border-[#1e2330] flex items-end relative overflow-hidden">
                    <div className="absolute left-16 right-0 h-full flex items-end">
                      {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }).map((_, i) => (
                        <div key={i} className="absolute flex flex-col items-center" style={{ left: `${(i * 5 / totalDuration) * 100}%` }}>
                          <span className="text-[9px] text-gray-500 font-mono mb-0.5">{formatTime(i * 5)}</span>
                          <div className="w-px h-2 bg-gray-600" />
                        </div>
                      ))}
                      {/* Markers */}
                      {markers.map((marker, i) => (
                        <div key={i} className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: `${(marker.time / totalDuration) * 100}%` }}>
                          <Flag className="h-3 w-3" style={{ color: marker.color }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tracks Area */}
                  <div ref={timelineRef} className="flex-1 overflow-auto relative">
                    {/* Video Track */}
                    <div className="flex h-16 border-b border-[#1e2330]">
                      <div className="w-16 flex-shrink-0 bg-[#181c26] flex items-center justify-center border-r border-[#1e2330]">
                        <div className="text-center">
                          <Video className="h-3.5 w-3.5 text-blue-400 mx-auto mb-0.5" />
                          <span className="text-[9px] text-gray-500">V1</span>
                        </div>
                      </div>
                      <div className="flex-1 relative bg-[#0a0d14] overflow-hidden">
                        <div className="absolute inset-0 flex" style={{ transform: `scaleX(${zoom / 100})`, transformOrigin: 'left' }}>
                          {allScenes.map((scene, index) => {
                            const startPercent = (getSceneStartTime(index) / totalDuration) * 100;
                            const widthPercent = ((scene.duration || 5) / totalDuration) * 100;
                            return (
                              <div
                                key={index}
                                onClick={() => handleSceneClick(index)}
                                className={cn(
                                  "absolute h-full cursor-pointer transition-all group",
                                  index === currentSceneIndex ? "z-10" : ""
                                )}
                                style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                              >
                                <div className={cn(
                                  "h-full m-0.5 rounded overflow-hidden border-2 transition-all",
                                  index === currentSceneIndex 
                                    ? "border-orange-500 shadow-lg shadow-orange-500/20" 
                                    : "border-blue-500/50 group-hover:border-blue-400"
                                )}>
                                  <div className="h-full bg-gradient-to-b from-blue-900/60 to-blue-950/80 flex items-center">
                                    {scene.imageUrl && (
                                      <img src={scene.imageUrl} className="h-full w-auto object-cover opacity-60" alt="" />
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <span className="text-[9px] font-medium text-white/80 bg-black/30 px-1 rounded">
                                        {scene.chapterIndex + 1}.{scene.sceneNumber}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Playhead */}
                        <div 
                          className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-20 pointer-events-none"
                          style={{ left: `${(currentTime / totalDuration) * 100}%` }}
                        >
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-orange-500 rotate-45" />
                        </div>
                      </div>
                    </div>

                    {/* Audio Track */}
                    <div className="flex h-14 border-b border-[#1e2330]">
                      <div className="w-16 flex-shrink-0 bg-[#181c26] flex items-center justify-center border-r border-[#1e2330]">
                        <div className="text-center">
                          <Mic className="h-3.5 w-3.5 text-green-400 mx-auto mb-0.5" />
                          <span className="text-[9px] text-gray-500">A1</span>
                        </div>
                      </div>
                      <div className="flex-1 relative bg-[#0a0d14] overflow-hidden">
                        <div className="absolute inset-0 flex" style={{ transform: `scaleX(${zoom / 100})`, transformOrigin: 'left' }}>
                          {allScenes.map((scene, index) => {
                            if (!scene.audioUrl) return null;
                            const startPercent = (getSceneStartTime(index) / totalDuration) * 100;
                            const widthPercent = ((scene.duration || 5) / totalDuration) * 100;
                            return (
                              <div
                                key={index}
                                className="absolute h-full"
                                style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                              >
                                <div className={cn(
                                  "h-full m-0.5 rounded overflow-hidden border",
                                  index === currentSceneIndex 
                                    ? "border-green-400" 
                                    : "border-green-600/40"
                                )}>
                                  <div className="h-full bg-gradient-to-b from-green-900/40 to-green-950/60 flex items-center justify-center relative">
                                    {/* Waveform visualization */}
                                    <div className="absolute inset-0 flex items-center justify-around px-1 opacity-50">
                                      {Array.from({ length: 20 }).map((_, i) => (
                                        <div key={i} className="w-0.5 bg-green-400 rounded-full" style={{ height: `${20 + Math.random() * 60}%` }} />
                                      ))}
                                    </div>
                                    <Mic className="h-3 w-3 text-green-400 z-10" />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Playhead */}
                        <div 
                          className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-20 pointer-events-none"
                          style={{ left: `${(currentTime / totalDuration) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Narration Track */}
                    <div className="flex h-10">
                      <div className="w-16 flex-shrink-0 bg-[#181c26] flex items-center justify-center border-r border-[#1e2330]">
                        <div className="text-center">
                          <span className="text-[9px] text-gray-500">VO</span>
                        </div>
                      </div>
                      <div className="flex-1 bg-[#0a0d14]" />
                    </div>
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle className="w-1 bg-[#0a0d14] hover:bg-orange-500/50 transition-colors" />

          {/* Right Panel - Inspector */}
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-[#12151c]">
            <div className="h-full flex flex-col">
              <div className="h-9 bg-[#181c26] border-b border-[#1e2330] flex items-center px-3">
                <Settings className="h-3.5 w-3.5 text-orange-400 mr-2" />
                <span className="text-[11px] font-medium text-gray-300">Inspector</span>
              </div>

              {currentScene && (
                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                  {/* Scene Info */}
                  <div className="bg-[#181c26] rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Scene Info</span>
                      <Badge className="bg-orange-500/20 text-orange-400 border-0 text-[9px]">Active</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[#0a0d14] rounded p-2">
                        <span className="text-[9px] text-gray-500 block">Chapter</span>
                        <span className="text-xs text-white font-medium">{currentScene.chapterIndex + 1}</span>
                      </div>
                      <div className="bg-[#0a0d14] rounded p-2">
                        <span className="text-[9px] text-gray-500 block">Scene</span>
                        <span className="text-xs text-white font-medium">{currentScene.sceneNumber}</span>
                      </div>
                      <div className="bg-[#0a0d14] rounded p-2">
                        <span className="text-[9px] text-gray-500 block">Duration</span>
                        <span className="text-xs text-white font-medium">{currentScene.duration}s</span>
                      </div>
                      <div className="bg-[#0a0d14] rounded p-2">
                        <span className="text-[9px] text-gray-500 block">Effect</span>
                        <span className="text-[10px] text-orange-400 font-mono capitalize">{currentScene.kenBurnsEffect?.replace("_", " ")}</span>
                      </div>
                    </div>
                  </div>

                  {/* Chapter Title */}
                  <div className="bg-[#181c26] rounded-lg p-3">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">Chapter</span>
                    <p className="text-xs text-white">{currentScene.chapterTitle}</p>
                  </div>

                  {/* Image Prompt */}
                  <div className="bg-[#181c26] rounded-lg p-3">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">Image Prompt</span>
                    <p className="text-[11px] text-gray-300 leading-relaxed">{currentScene.imagePrompt}</p>
                  </div>

                  {/* Narration */}
                  <div className="bg-[#181c26] rounded-lg p-3">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">Narration</span>
                    <p className="text-[11px] text-gray-300 leading-relaxed">{currentScene.narrationSegment}</p>
                  </div>

                  {/* Keyboard Shortcuts */}
                  <div className="bg-[#181c26] rounded-lg p-3">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">Shortcuts</span>
                    <div className="space-y-1.5 text-[10px]">
                      <div className="flex justify-between text-gray-400">
                        <span>Play/Pause</span>
                        <kbd className="bg-[#0a0d14] px-1.5 py-0.5 rounded text-gray-300">Space</kbd>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Add Marker</span>
                        <kbd className="bg-[#0a0d14] px-1.5 py-0.5 rounded text-gray-300">M</kbd>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Toggle Grid</span>
                        <kbd className="bg-[#0a0d14] px-1.5 py-0.5 rounded text-gray-300">G</kbd>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Prev/Next Scene</span>
                        <kbd className="bg-[#0a0d14] px-1.5 py-0.5 rounded text-gray-300">← →</kbd>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Export Progress Overlay */}
        {(isExporting || exportStatus === "error" || exportStatus === "complete") && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#1a1f26] rounded-xl p-8 max-w-md w-full mx-4 border border-[#2a3040]">
              <div className="text-center">
                {exportStatus === "error" ? (
                  <>
                    <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Export Failed</h3>
                    <p className="text-sm text-gray-400 mb-4">{exportError}</p>
                    <Button onClick={() => setExportStatus("idle")} variant="outline">
                      Close
                    </Button>
                  </>
                ) : exportStatus === "complete" ? (
                  <>
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Download className="h-6 w-6 text-green-500" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Export Complete!</h3>
                    <p className="text-sm text-gray-400 mb-4">Your video is ready</p>
                    <div className="flex gap-2 justify-center">
                      {exportedVideoUrl && (
                        <Button asChild className="bg-gradient-to-r from-orange-500 to-amber-600">
                          <a href={exportedVideoUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </a>
                        </Button>
                      )}
                      <Button onClick={() => setExportStatus("idle")} variant="outline">
                        Close
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-12 w-12 mx-auto text-orange-500 animate-spin mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Rendering Video</h3>
                    <p className="text-sm text-gray-400 mb-4">This may take a few minutes...</p>
                    <Progress value={exportProgress} className="h-2" />
                    <p className="text-xs text-gray-500 mt-2">{exportProgress}% complete</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
