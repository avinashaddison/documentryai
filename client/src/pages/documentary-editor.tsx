import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
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
  RefreshCw,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  Wand2,
  Sparkles,
  RotateCcw,
} from "lucide-react";
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
  const [zoom, setZoom] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState("");
  const [canResume, setCanResume] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

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
          
          // Check for saved assets and resume capability
          if (parsed.projectId) {
            try {
              // Load saved assets from database
              const assetsResponse = await fetch(`/api/projects/${parsed.projectId}/generated-assets`);
              if (assetsResponse.ok) {
                const assetsData = await assetsResponse.json();
                if (Object.keys(assetsData.images).length > 0 || Object.keys(assetsData.audio).length > 0) {
                  setDocumentaryData(prev => prev ? {
                    ...prev,
                    generatedImages: { ...prev.generatedImages, ...assetsData.images },
                  } : prev);
                }
              }
              
              // Check for resume capability
              const statusResponse = await fetch(`/api/projects/${parsed.projectId}/generation-status`);
              if (statusResponse.ok) {
                const status = await statusResponse.json();
                setCanResume(status.canResume);
                setSessionInfo(status.session);
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
      kenBurnsEffect: KEN_BURNS_EFFECTS[(chIdx + scIdx) % KEN_BURNS_EFFECTS.length],
    }))
  ) || [];

  const totalDuration = allScenes.reduce((sum, scene) => sum + (scene.duration || 5), 0);
  const currentScene = allScenes[currentSceneIndex];

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

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSceneClick = (index: number) => {
    setCurrentSceneIndex(index);
    let elapsed = 0;
    for (let i = 0; i < index; i++) {
      elapsed += allScenes[i].duration || 5;
    }
    setCurrentTime(elapsed);
  };

  const handleResumeGeneration = async () => {
    if (!documentaryData) return;
    
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStatus("Resuming generation...");

    try {
      const response = await fetch(`/api/projects/${documentaryData.projectId}/resume-generation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();

      if (result.success) {
        setGenerationProgress(100);
        setGenerationStatus("Complete!");
        setCanResume(false);
        
        setDocumentaryData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            generatedImages: { ...prev.generatedImages, ...result.generatedImages },
          };
        });

        setTimeout(() => {
          setIsGenerating(false);
          setGenerationProgress(0);
          setGenerationStatus("");
        }, 1500);
      } else {
        throw new Error(result.errors?.join(", ") || "Resume failed");
      }
    } catch (error: any) {
      console.error("Resume error:", error);
      setGenerationStatus(`Error: ${error.message}`);
      setTimeout(() => {
        setIsGenerating(false);
        setGenerationProgress(0);
        setGenerationStatus("");
      }, 3000);
    }
  };

  const handleGenerateAll = async () => {
    if (!documentaryData) return;
    
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStatus("Initializing autopilot...");

    try {
      const chaptersPayload = documentaryData.chapters.map(ch => ({
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        scenes: ch.scenes.map(sc => ({
          sceneNumber: sc.sceneNumber,
          imagePrompt: sc.imagePrompt,
          narrationSegment: sc.narrationSegment,
          duration: sc.duration || 5,
          mood: "dramatic",
          shotType: "wide",
        })),
      }));

      setGenerationStatus("Generating images & audio...");
      setGenerationProgress(10);

      const response = await fetch(`/api/projects/${documentaryData.projectId}/autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapters: chaptersPayload,
          voice: "neutral",
          imageModel: "flux-1.1-pro",
        }),
      });

      setGenerationProgress(70);

      const result = await response.json();

      if (result.success) {
        setGenerationProgress(100);
        setGenerationStatus("Complete!");
        
        setDocumentaryData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            generatedImages: { ...prev.generatedImages, ...result.generatedImages },
          };
        });

        setTimeout(() => {
          setIsGenerating(false);
          setGenerationProgress(0);
          setGenerationStatus("");
        }, 1500);
      } else {
        throw new Error(result.errors?.join(", ") || "Generation failed");
      }
    } catch (error: any) {
      console.error("Autopilot error:", error);
      setGenerationStatus(`Error: ${error.message}`);
      setTimeout(() => {
        setIsGenerating(false);
        setGenerationProgress(0);
        setGenerationStatus("");
      }, 3000);
    }
  };

  const handleExport = async () => {
    if (!documentaryData) return;
    
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("processing");
    setExportError(null);

    try {
      setExportProgress(10);
      
      const response = await fetch(`/api/projects/${documentaryData.projectId}/assemble-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapters: documentaryData.chapters.map((ch, idx) => ({
            chapterNumber: ch.chapterNumber,
            scenes: ch.scenes.map((scene, scIdx) => ({
              sceneNumber: scene.sceneNumber,
              imageUrl: documentaryData.generatedImages[`ch${ch.chapterNumber}_sc${scene.sceneNumber}`],
              duration: scene.duration || 5,
              kenBurnsEffect: KEN_BURNS_EFFECTS[(idx + scIdx) % KEN_BURNS_EFFECTS.length],
              narration: scene.narrationSegment,
            })),
          })),
        }),
      });

      setExportProgress(50);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Export failed - server error");
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      setExportProgress(100);
      setExportStatus("complete");

      if (result.videoUrl) {
        setTimeout(() => {
          window.open(result.videoUrl, "_blank");
        }, 500);
      }
    } catch (error: any) {
      console.error("Export error:", error);
      setExportStatus("error");
      setExportError(error.message || "Video export failed. Please try again.");
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 1000);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!documentaryData) {
    return (
      <div className="min-h-screen bg-[#0a0d14] text-white flex flex-col items-center justify-center gap-4">
        <Film className="h-16 w-16 text-gray-600" />
        <h2 className="text-xl font-bold">No Documentary Data</h2>
        <p className="text-gray-400">Generate a documentary first to use the editor.</p>
        <Button onClick={() => setLocation("/create")} className="gap-2 bg-gradient-to-r from-primary to-purple-500">
          <ChevronLeft className="h-4 w-4" />
          Go to Documentary Maker
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0e13] text-white" data-testid="documentary-editor">
      {/* Header */}
      <div className="h-14 bg-[#1a1f26] border-b border-[#2a3441] flex items-center px-4 gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="gap-2 text-muted-foreground hover:text-white"
          data-testid="button-back"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="flex-1">
          <h1 className="text-lg font-bold text-white truncate">{documentaryData.title}</h1>
          <p className="text-xs text-muted-foreground">
            {documentaryData.chapters.length} chapters • {allScenes.length} scenes • {formatTime(totalDuration)}
          </p>
        </div>

        {canResume && sessionInfo ? (
          <Button
            onClick={handleResumeGeneration}
            disabled={isGenerating || isExporting}
            variant="outline"
            className="gap-2 border-yellow-500/50 hover:bg-yellow-500/10 text-yellow-500"
            data-testid="button-resume"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {generationStatus || `${generationProgress}%`}
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                Resume ({sessionInfo.completedImages || 0}/{sessionInfo.totalScenes} images)
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={handleGenerateAll}
            disabled={isGenerating || isExporting}
            variant="outline"
            className="gap-2 border-primary/50 hover:bg-primary/10"
            data-testid="button-generate-all"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {generationStatus || `${generationProgress}%`}
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Generate All
              </>
            )}
          </Button>
        )}

        <Button
          onClick={handleExport}
          disabled={isExporting || isGenerating}
          className="gap-2 bg-gradient-to-r from-primary to-purple-500"
          data-testid="button-export"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Exporting {exportProgress}%
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Export Video
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Scene Library Panel */}
        <div className="w-64 bg-[#1a1f26] border-r border-[#2a3441] flex flex-col">
          <div className="p-3 border-b border-[#2a3441]">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Scene Library
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {allScenes.map((scene, index) => (
              <div
                key={`${scene.chapterIndex}-${scene.sceneNumber}`}
                onClick={() => handleSceneClick(index)}
                className={cn(
                  "rounded-lg overflow-hidden cursor-pointer transition-all border-2",
                  index === currentSceneIndex
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-transparent hover:border-primary/50"
                )}
                data-testid={`scene-thumb-${index}`}
              >
                <div className="relative aspect-video bg-[#0a0e13]">
                  {scene.imageUrl ? (
                    <img
                      src={scene.imageUrl}
                      alt={`Scene ${scene.sceneNumber}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                    <span className="text-[10px] text-white/80">
                      Ch{scene.chapterIndex + 1} • Sc{scene.sceneNumber}
                    </span>
                  </div>
                  <div className="absolute top-1 right-1 bg-black/60 px-1 rounded text-[10px]">
                    {scene.duration}s
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Preview Area */}
        <div className="flex-1 flex flex-col">
          {/* Preview */}
          <div className="flex-1 bg-[#0a0e13] flex items-center justify-center p-4" ref={previewRef}>
            <div
              className="relative bg-black rounded-lg overflow-hidden shadow-2xl"
              style={{
                aspectRatio: "16/9",
                maxHeight: "100%",
                width: "min(100%, 960px)",
              }}
              data-testid="video-preview"
            >
              {currentScene?.imageUrl ? (
                <div className="relative w-full h-full overflow-hidden">
                  <img
                    ref={imageRef}
                    key={`${currentSceneIndex}-${isPlaying}`}
                    src={currentScene.imageUrl}
                    alt={`Scene ${currentScene.sceneNumber}`}
                    className="w-full h-full object-cover"
                    style={{
                      animation: isPlaying 
                        ? getKenBurnsAnimation(currentScene.kenBurnsEffect || "zoom_in", currentScene.duration || 5)
                        : "none",
                      transform: !isPlaying ? "scale(1)" : undefined,
                    }}
                  />
                  {/* Narration Caption */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
                    <p className="text-white text-center text-sm md:text-base leading-relaxed max-w-3xl mx-auto">
                      {currentScene.narrationSegment}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No image for this scene</p>
                  </div>
                </div>
              )}

              {/* Scene Info Overlay */}
              <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
                <p className="text-xs text-white/80">{currentScene?.chapterTitle}</p>
                <p className="text-sm font-semibold text-white">Scene {currentScene?.sceneNumber}</p>
              </div>

              {/* Ken Burns Effect Badge */}
              {currentScene?.kenBurnsEffect && (
                <div className="absolute top-4 right-4 bg-primary/80 backdrop-blur-sm rounded-lg px-2 py-1">
                  <p className="text-xs text-white font-mono">{currentScene.kenBurnsEffect}</p>
                </div>
              )}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="h-24 bg-[#1a1f26] border-t border-[#2a3441] p-4">
            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span>{formatTime(currentTime)}</span>
                <div className="flex-1">
                  <Progress value={(currentTime / totalDuration) * 100} className="h-1.5" />
                </div>
                <span>{formatTime(totalDuration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setCurrentSceneIndex(Math.max(0, currentSceneIndex - 1));
                    handleSceneClick(Math.max(0, currentSceneIndex - 1));
                  }}
                  className="h-8 w-8"
                  data-testid="button-prev"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  onClick={handlePlayPause}
                  className="h-10 w-10 rounded-full bg-primary hover:bg-primary/90"
                  data-testid="button-play-pause"
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setCurrentSceneIndex(Math.min(allScenes.length - 1, currentSceneIndex + 1));
                    handleSceneClick(Math.min(allScenes.length - 1, currentSceneIndex + 1));
                  }}
                  className="h-8 w-8"
                  data-testid="button-next"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMuted(!isMuted)}
                    className="h-8 w-8"
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    onValueChange={([v]) => {
                      setVolume(v);
                      setIsMuted(v === 0);
                    }}
                    max={100}
                    className="w-24"
                  />
                </div>

                <div className="flex items-center gap-2 border-l border-[#2a3441] pl-4">
                  <ZoomOut className="h-4 w-4 text-muted-foreground" />
                  <Slider
                    value={[zoom]}
                    onValueChange={([z]) => setZoom(z)}
                    min={50}
                    max={200}
                    className="w-24"
                  />
                  <ZoomIn className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Properties Panel */}
        <div className="w-72 bg-[#1a1f26] border-l border-[#2a3441] flex flex-col">
          <div className="p-3 border-b border-[#2a3441]">
            <h3 className="text-sm font-semibold text-white">Scene Properties</h3>
          </div>
          {currentScene && (
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">Chapter</label>
                <p className="text-sm text-white">{currentScene.chapterTitle}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Scene Number</label>
                <p className="text-sm text-white">{currentScene.sceneNumber}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Duration</label>
                <p className="text-sm text-white">{currentScene.duration} seconds</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ken Burns Effect</label>
                <p className="text-sm text-primary font-mono">{currentScene.kenBurnsEffect}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Image Prompt</label>
                <p className="text-xs text-white/70 mt-1 line-clamp-4">{currentScene.imagePrompt}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Narration</label>
                <p className="text-xs text-white/70 mt-1 line-clamp-6">{currentScene.narrationSegment}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export Progress Overlay */}
      {(isExporting || exportStatus === "error") && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1f26] rounded-xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              {exportStatus === "error" ? (
                <>
                  <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">Export Failed</h3>
                  <p className="text-sm text-red-400 mb-4">{exportError}</p>
                  <Button 
                    onClick={() => setExportStatus("idle")} 
                    variant="outline"
                    className="mr-2"
                  >
                    Close
                  </Button>
                  <Button onClick={handleExport}>
                    Try Again
                  </Button>
                </>
              ) : exportStatus === "complete" ? (
                <>
                  <Film className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">Export Complete!</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Your documentary video is ready.
                  </p>
                </>
              ) : (
                <>
                  <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">Exporting Documentary</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Assembling video with Ken Burns effects...
                  </p>
                  <Progress value={exportProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">{exportProgress}% complete</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
