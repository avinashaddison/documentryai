import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import claudeIconPath from "@assets/claude-ai-icon_1767588099802.png";
import perplexityIconPath from "@assets/perplexity-ai-icon_1767590005100.png";
import googleIconPath from "@assets/google-color-icon_1767590050980.png";
import aiGenerateIconPath from "@assets/midjourney-color-icon_1767592526835.png";

const clickSoundUrl = "/audio/click-sound.mp3";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { 
  Sparkles, 
  Loader2, 
  Mic, 
  Clock, 
  Image as ImageIcon,
  Hash,
  Check,
  Wand2,
  Film,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
  FileText,
  Volume2,
  Layers,
  ArrowRight,
  Settings,
  Search,
  ExternalLink,
  Users,
  Download,
  Pencil,
  Video,
  SkipBack,
  SkipForward,
  Square,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";

interface StoryFramework {
  id: number;
  projectId: number;
  generatedTitle: string | null;
  genres: string[] | null;
  premise: string | null;
  openingHook: string | null;
  narratorVoice: string | null;
  storyLength: string | null;
  hookImageModel: string | null;
  hookImageCount: number | null;
  chapterImageModel: string | null;
  imagesPerChapter: number | null;
  approved: boolean | null;
}

interface ChapterScript {
  chapterNumber: number;
  title: string;
  narration: string;
  scenes: Array<{
    sceneNumber: number;
    imagePrompt: string;
    duration: number;
    narrationSegment: string;
    mood: string;
    shotType: string;
  }>;
  estimatedDuration: number;
}

type GenerationStep = "idle" | "research" | "framework" | "outline" | "chapters" | "images" | "voiceover" | "assembly" | "complete";

interface ResearchData {
  status: string;
  queries: string[];
  sources: Array<{ title: string; url: string; snippet: string }>;
  summary: {
    keyFacts?: Array<{ fact: string; source: string; verified: boolean }>;
    timeline?: Array<{ date: string; event: string; significance: string }>;
    mainCharacters?: Array<{ name: string; role: string; significance: string }>;
  };
}

interface ResearchActivity {
  phase: "initial" | "deep" | "synthesis";
  activityType: "query_started" | "query_completed" | "source_found" | "subtopic_identified" | "fact_extracted" | "phase_complete";
  query?: string;
  queryIndex?: number;
  totalQueries?: number;
  source?: { title: string; url: string; snippet?: string };
  subtopic?: string;
  fact?: { claim: string; confidence: string; category: string };
  message: string;
  timestamp?: string;
}

function AutoVideoRenderer({ 
  projectId, 
  generatedChapters, 
  generatedImages, 
  generatedAudio,
  onVideoReady,
  existingVideoUrl,
  forceRerender,
  onRerenderStart
}: { 
  projectId: number;
  generatedChapters: ChapterScript[];
  generatedImages: Record<string, string>;
  generatedAudio: Record<string, string>;
  onVideoReady: (url: string) => void;
  existingVideoUrl?: string | null;
  forceRerender?: boolean;
  onRerenderStart?: () => void;
}) {
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hasStartedRef = useRef(false);
  
  const hasAllAssets = generatedChapters.length > 0 && 
    Object.keys(generatedImages).length > 0 && 
    Object.keys(generatedAudio).length > 0;
  
  const startRendering = async (isRerender = false) => {
    if (hasStartedRef.current && !isRerender) return;
    if (!isRerender && existingVideoUrl) return;
    hasStartedRef.current = true;
    
    if (isRerender && onRerenderStart) {
      onRerenderStart();
    }
    
    setIsRendering(true);
    setProgress(0);
    setError(null);
    setStatusMessage("Preparing video assets...");
    
    try {
      // Start render in background (non-blocking)
      fetch("/api/render/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId })
      }).then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          if (data.videoUrl) {
            setProgress(100);
            setStatusMessage("Video ready!");
            onVideoReady(data.videoUrl);
            setIsRendering(false);
          }
        } else {
          const errData = await response.json();
          setError(errData.message || "Rendering failed");
          setIsRendering(false);
          hasStartedRef.current = false;
        }
      }).catch((err) => {
        setError(err.message);
        setIsRendering(false);
        hasStartedRef.current = false;
      });
      
      // Start polling for real-time progress immediately
      pollRenderProgress();
    } catch (err: any) {
      setError(err.message);
      setIsRendering(false);
      hasStartedRef.current = false;
    }
  };
  
  const pollRenderProgress = async () => {
    try {
      const response = await fetch("/api/timeline/render-progress");
      const data = await response.json();
      
      setProgress(data.progress || 0);
      setStatusMessage(data.message || "Rendering...");
      
      if (data.status === "complete") {
        // Render is done - the fetch promise above will handle the video URL
        return;
      } else if (data.status === "error") {
        setError(data.message || "Rendering failed");
        setIsRendering(false);
        hasStartedRef.current = false;
        return;
      } else {
        // Poll every 500ms for real-time updates
        setTimeout(() => pollRenderProgress(), 500);
      }
    } catch (err: any) {
      // Keep polling even on errors
      setTimeout(() => pollRenderProgress(), 1000);
    }
  };
  
  useEffect(() => {
    if (hasAllAssets && !existingVideoUrl && !hasStartedRef.current) {
      startRendering();
    }
  }, [hasAllAssets, existingVideoUrl]);
  
  // Handle force re-render
  useEffect(() => {
    if (forceRerender && hasAllAssets && !isRendering) {
      startRendering(true);
    }
  }, [forceRerender]);
  
  if (existingVideoUrl && !forceRerender) {
    return null;
  }
  
  if (!hasAllAssets) {
    return null;
  }
  
  return (
    <div className="bg-gradient-to-br from-card via-card to-cyan-500/5 border border-cyan-500/30 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
          <Video className="h-5 w-5 text-cyan-400" />
          Rendering Video
        </h2>
        <Badge variant="outline" className="text-cyan-400 border-cyan-400/30 bg-cyan-400/10">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          In Progress
        </Badge>
      </div>
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-3"
            onClick={() => {
              hasStartedRef.current = false;
              startRendering();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      
      {isRendering && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white font-medium flex items-center gap-2">
              <Film className="h-4 w-4 text-cyan-400" />
              {statusMessage}
            </span>
            <span className="text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-3" />
          <p className="text-xs text-muted-foreground text-center">
            Creating grayscale documentary with fade transitions...
          </p>
        </div>
      )}
    </div>
  );
}

function ChapterAudioPlayer({ chapterNumber, audioUrls, sceneCount }: { 
  chapterNumber: number; 
  audioUrls: string[]; 
  sceneCount: number;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentScene, setCurrentScene] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setTotalDuration(audio.duration || 0);
    const handleEnded = () => {
      if (currentScene < audioUrls.length - 1) {
        setCurrentScene(prev => prev + 1);
      } else {
        setIsPlaying(false);
        setCurrentScene(0);
      }
    };
    
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended", handleEnded);
    
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [currentScene, audioUrls.length]);
  
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.src = audioUrls[currentScene];
    if (isPlaying) {
      audio.play().catch(() => {});
    }
  }, [currentScene, audioUrls]);
  
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };
  
  const skipPrev = () => {
    if (currentScene > 0) {
      setCurrentScene(prev => prev - 1);
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };
  
  const skipNext = () => {
    if (currentScene < audioUrls.length - 1) {
      setCurrentScene(prev => prev + 1);
    }
  };
  
  const stopPlayback = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentScene(0);
  };
  
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  
  return (
    <div className="bg-gradient-to-r from-cyan-500/10 to-violet-500/10 rounded-lg p-3 border border-cyan-500/30">
      <audio ref={audioRef} />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8"
            onClick={skipPrev}
            data-testid={`btn-prev-ch${chapterNumber}`}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button 
            size="icon" 
            variant="default"
            className="h-9 w-9 bg-cyan-500 hover:bg-cyan-600"
            onClick={togglePlay}
            data-testid={`btn-play-chapter-${chapterNumber}`}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8"
            onClick={skipNext}
            data-testid={`btn-next-ch${chapterNumber}`}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8"
            onClick={stopPlayback}
            data-testid={`btn-stop-ch${chapterNumber}`}
          >
            <Square className="h-3 w-3" />
          </Button>
        </div>
        
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-cyan-400 font-medium">
              Full Chapter {chapterNumber} Audio
            </span>
            <span className="text-muted-foreground">
              Scene {currentScene + 1}/{sceneCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Progress 
              value={totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0} 
              className="h-1.5 flex-1"
            />
            <span className="text-xs text-muted-foreground min-w-[70px] text-right">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DocumentaryMaker() {
  const [location, navigate] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [framework, setFramework] = useState<StoryFramework | null>(null);
  const [chapters, setChapters] = useState<string[]>([]);
  const [generatedChapters, setGeneratedChapters] = useState<ChapterScript[]>([]);
  const [currentStep, setCurrentStep] = useState<GenerationStep>("idle");
  const [progress, setProgress] = useState(0);
  const [totalChapters, setTotalChapters] = useState(5);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [forceRerender, setForceRerender] = useState(false);
  const [editingChapterIndex, setEditingChapterIndex] = useState<number | null>(null);
  const [editingChapterValue, setEditingChapterValue] = useState("");
  
  const [config, setConfig] = useState({
    narratorVoice: "aura-2-mars-en",
    storyLength: "medium",
    hookImageModel: "flux-1.1-pro",
    hookImageCount: 3,
    chapterImageModel: "flux-1.1-pro",
    imagesPerChapter: 5,
    imageStyle: "color" as "color" | "black-and-white",
    imageSource: "google" as "ai" | "stock" | "google",
    researchMethod: "perplexity" as "perplexity" | "claude",
    storyStyle: "narrative" as "narrative" | "investigative" | "historical" | "educational",
  });
  
  const [generationLogs, setGenerationLogs] = useState<Array<{
    id: number;
    step: string;
    status: string;
    message: string | null;
    createdAt: string;
  }>>([]);
  const [showLogs, setShowLogs] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const clickSoundRef = useRef<HTMLAudioElement | null>(null);

  const playClickSound = useCallback(() => {
    try {
      if (!clickSoundRef.current) {
        clickSoundRef.current = new Audio(clickSoundUrl);
        clickSoundRef.current.volume = 0.3;
      }
      clickSoundRef.current.currentTime = 0;
      clickSoundRef.current.play().catch(() => {});
    } catch (e) {}
  }, []);

  const storyLengthToChapters: Record<string, number> = {
    short: 3,
    medium: 5,
    long: 8,
    feature: 12,
  };

  const createProjectMutation = useMutation({
    mutationFn: async ({ projectTitle, chapterCount }: { projectTitle: string; chapterCount: number }) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle,
          chapterCount,
          voiceEnabled: true,
          imageModel: config.hookImageModel,
          scriptModel: "claude-sonnet-4-5",
        }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      return res.json();
    },
  });

  const generateFrameworkMutation = useMutation({
    mutationFn: async ({ id, numChapters }: { id: number; numChapters: number }) => {
      const res = await fetch(`/api/projects/${id}/documentary/generate-framework`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyLength: config.storyLength, totalChapters: numChapters }),
      });
      if (!res.ok) throw new Error("Failed to generate framework");
      return res.json();
    },
  });

  const generateOutlineMutation = useMutation({
    mutationFn: async ({ id, numChapters }: { id: number; numChapters: number }) => {
      const res = await fetch(`/api/projects/${id}/documentary/generate-outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalChapters: numChapters }),
      });
      if (!res.ok) throw new Error("Failed to generate outline");
      return res.json();
    },
  });

  const generateChapterMutation = useMutation({
    mutationFn: async ({ id, chapterNumber, numChapters, chapterTitle }: { 
      id: number; 
      chapterNumber: number; 
      numChapters: number;
      chapterTitle: string;
    }) => {
      const res = await fetch(`/api/projects/${id}/documentary/generate-chapter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          chapterNumber, 
          totalChapters: numChapters,
          chapterTitle 
        }),
      });
      if (!res.ok) throw new Error("Failed to generate chapter");
      return res.json();
    },
  });

  const handleGenerateFramework = async () => {
    if (!title.trim()) return;
    
    // Reset all state for fresh generation
    setFramework(null);
    setChapters([]);
    setGeneratedChapters([]);
    setGeneratedImages({});
    setGeneratedAudio({});
    setResearchData(null);
    setResearchActivities([]);
    setLiveEvents([]);
    setCurrentStep("research");
    setProgress(0);
    
    // Create the project
    const project = await createProjectMutation.mutateAsync({ 
      projectTitle: title, 
      chapterCount: totalChapters 
    });
    const id = project.id;
    setProjectId(id);
    
    // Update URL with project ID so refresh preserves the session
    navigate(`/create/${id}`, { replace: true });
    
    // Immediately start the full background generation job with deep research
    try {
      const res = await fetch(`/api/projects/${id}/generate-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalChapters,
          config: {
            model: config.hookImageModel,
            imageStyle: config.imageStyle,
            imageSource: config.imageSource,
            voice: config.narratorVoice,
            researchMethod: config.researchMethod,
          },
        }),
      });
      
      if (!res.ok) {
        throw new Error("Failed to start generation");
      }
      
      const data = await res.json();
      setActiveJob({
        id: data.job.id,
        status: data.job.status,
        progress: 0,
        currentStep: null,
        completedSteps: [],
        elapsedFormatted: "0s",
        error: null,
        stateInfo: null,
      });
      
    } catch (error) {
      console.error("Failed to start background generation:", error);
      setCurrentStep("idle");
    }
  };

  const generateImagesMutation = useMutation({
    mutationFn: async ({ id, chapterNumber, scenes, model, imageStyle }: { 
      id: number; 
      chapterNumber: number; 
      scenes: Array<{ sceneNumber: number; imagePrompt: string }>;
      model: string;
      imageStyle: "color" | "black-and-white";
    }) => {
      const res = await fetch(`/api/projects/${id}/generate-chapter-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterNumber, scenes, model, imageStyle }),
      });
      if (!res.ok) throw new Error("Failed to generate images");
      return res.json();
    },
  });

  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [generatedAudio, setGeneratedAudio] = useState<Record<string, string>>({});
  const [currentImageScene, setCurrentImageScene] = useState("");
  const [researchData, setResearchData] = useState<ResearchData | null>(null);
  const [sessionRestored, setSessionRestored] = useState(false);
  
  // Background job state
  const [activeJob, setActiveJob] = useState<{
    id: number;
    status: string;
    progress: number;
    currentStep: string | null;
    completedSteps: string[];
    elapsedFormatted: string;
    error: string | null;
    stateInfo: any;
  } | null>(null);

  // Restore session on mount - check for projectId in URL or resumeProjectId in sessionStorage
  useEffect(() => {
    const urlProjectId = params.projectId;
    const resumeId = sessionStorage.getItem("resumeProjectId");
    const idToLoad = urlProjectId || resumeId;
    
    if (idToLoad && !sessionRestored) {
      const loadSession = async () => {
        try {
          const id = parseInt(idToLoad);
          if (resumeId) sessionStorage.removeItem("resumeProjectId");
          
          // Load project data
          const projectRes = await fetch(`/api/projects/${id}`);
          if (!projectRes.ok) return;
          const project = await projectRes.json();
          
          setProjectId(id);
          setTitle(project.title || "");
          
          // Update URL if loaded from sessionStorage
          if (!urlProjectId && resumeId) {
            navigate(`/create/${id}`, { replace: true });
          }
          
          // Load framework
          const frameworkRes = await fetch(`/api/projects/${id}/framework`);
          if (frameworkRes.ok) {
            const frameworkData = await frameworkRes.json();
            if (frameworkData.framework) {
              setFramework(frameworkData.framework);
              if (frameworkData.framework.storyLength) {
                setTotalChapters(storyLengthToChapters[frameworkData.framework.storyLength] || 5);
              }
            }
          }
          
          // Load research data
          const researchRes = await fetch(`/api/projects/${id}/research`);
          if (researchRes.ok) {
            const researchStatus = await researchRes.json();
            if (researchStatus.status === "completed") {
              setResearchData(researchStatus);
            }
          }
          
          // Load generated assets
          const assetsRes = await fetch(`/api/projects/${id}/generated-assets`);
          if (assetsRes.ok) {
            const assets = await assetsRes.json();
            if (assets.images) setGeneratedImages(assets.images);
            if (assets.audio) setGeneratedAudio(assets.audio);
          }
          
          // Load session data for chapters, outline, config, images, and audio
          const sessionRes = await fetch(`/api/projects/${id}/session`);
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            const session = sessionData.session;
            
            if (session) {
              // Restore chapters
              if (session.chaptersData) {
                try {
                  const chaptersFromSession = JSON.parse(session.chaptersData);
                  if (chaptersFromSession.length > 0) {
                    setGeneratedChapters(chaptersFromSession);
                    const titles = chaptersFromSession.map((ch: any) => ch.title);
                    setChapters(titles);
                  }
                } catch (e) {
                  console.error("Failed to parse chapters data:", e);
                }
              }
              
              // Restore outline (if chapters not available)
              if (session.outlineData) {
                try {
                  const outlineFromSession = JSON.parse(session.outlineData);
                  if (outlineFromSession.length > 0) {
                    setChapters(prev => prev.length > 0 ? prev : outlineFromSession);
                  }
                } catch (e) {
                  console.error("Failed to parse outline data:", e);
                }
              }
              
              // Restore config
              if (session.configData) {
                try {
                  const configFromSession = JSON.parse(session.configData);
                  setConfig(prev => ({ ...prev, ...configFromSession }));
                } catch (e) {
                  console.error("Failed to parse config data:", e);
                }
              }
              
              // Restore images from session (more complete than assets endpoint)
              if (session.imagesData) {
                try {
                  const imagesFromSession = JSON.parse(session.imagesData);
                  if (Object.keys(imagesFromSession).length > 0) {
                    setGeneratedImages(imagesFromSession);
                  }
                } catch (e) {
                  console.error("Failed to parse images data:", e);
                }
              }
              
              // Restore audio from session
              if (session.audioData) {
                try {
                  const audioFromSession = JSON.parse(session.audioData);
                  if (Object.keys(audioFromSession).length > 0) {
                    setGeneratedAudio(audioFromSession);
                  }
                } catch (e) {
                  console.error("Failed to parse audio data:", e);
                }
              }
              
              // Restore total chapters from session
              if (session.totalChapters) {
                setTotalChapters(session.totalChapters);
              }
            }
          }
          
          // Load script content for chapters (fallback)
          if (project.scriptContent?.chapters) {
            const chapterTitles = project.scriptContent.chapters.map((ch: any) => ch.title);
            setChapters(chapterTitles);
            setGeneratedChapters(project.scriptContent.chapters);
          }
          
          // Determine current step based on project status
          if (project.status === "RENDERED" || project.state === "RENDERED") {
            setCurrentStep("complete");
            setProgress(100);
            if (project.renderedVideoUrl) {
              setRenderedVideoUrl(project.renderedVideoUrl);
            }
          } else if (project.status === "AUDIO_DONE" || project.status === "EDITOR_APPROVED") {
            setCurrentStep("idle");
            setProgress(90);
          } else if (project.status === "IMAGES_DONE") {
            setCurrentStep("idle");
            setProgress(85);
          } else if (project.status === "SCRIPT_DONE") {
            setCurrentStep("idle");
            setProgress(50);
          } else if (project.status === "RESEARCH_DONE") {
            setCurrentStep("idle");
            setProgress(25);
          }
          
          setSessionRestored(true);
        } catch (error) {
          console.error("Failed to restore session:", error);
        }
      };
      loadSession();
    }
  }, [params.projectId, sessionRestored, navigate]);

  // Auto-save session when key state changes
  useEffect(() => {
    if (projectId && currentStep !== "idle" && currentStep !== "complete") {
      const saveSession = async () => {
        try {
          const stepMapping: Record<string, string> = {
            research: "images",
            framework: "images",
            outline: "images",
            chapters: "images",
            images: "images",
            voiceover: "audio",
            assembly: "video"
          };
          
          await fetch(`/api/projects/${projectId}/session`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "in_progress",
              currentStep: stepMapping[currentStep] || "images",
              currentChapter: 1,
              currentScene: 1,
              totalChapters,
              totalScenes: Math.max(1, generatedChapters.reduce((sum, ch) => sum + ch.scenes.length, 0)),
              completedImages: Object.keys(generatedImages).length,
              completedAudio: Object.keys(generatedAudio).length,
              voice: config.narratorVoice,
              imageModel: config.hookImageModel,
              imageStyle: config.imageStyle,
              chaptersData: JSON.stringify(generatedChapters),
              outlineData: JSON.stringify(chapters),
              configData: JSON.stringify(config),
              imagesData: JSON.stringify(generatedImages),
              audioData: JSON.stringify(generatedAudio),
            }),
          });
        } catch (error) {
          console.error("Failed to save session:", error);
        }
      };
      saveSession();
    }
  }, [projectId, currentStep, generatedImages, generatedAudio, generatedChapters]);

  // Real-time updates via Server-Sent Events
  const eventSourceRef = useRef<EventSource | null>(null);
  const [liveEvents, setLiveEvents] = useState<{type: string; message: string; timestamp: string}[]>([]);
  const [researchActivities, setResearchActivities] = useState<ResearchActivity[]>([]);
  const researchPanelRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!projectId) return;
    
    // Initial job status check
    const checkInitialStatus = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/job`);
        if (res.ok) {
          const data = await res.json();
          if (data.job) {
            setActiveJob({
              id: data.job.id,
              status: data.job.status,
              progress: data.job.progress || 0,
              currentStep: data.job.currentStep,
              completedSteps: data.job.completedSteps ? JSON.parse(data.job.completedSteps) : [],
              elapsedFormatted: data.job.elapsedFormatted || "0s",
              error: data.job.error,
              stateInfo: data.job.stateInfo,
            });
          }
        }
      } catch (e) {}
    };
    checkInitialStatus();
    
    // Setup SSE connection for real-time updates
    const setupEventSource = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      
      const es = new EventSource(`/api/projects/${projectId}/stream`);
      eventSourceRef.current = es;
      
      es.addEventListener("progress_update", (e) => {
        const data = JSON.parse(e.data);
        setProgress(data.progress);
        setLiveEvents(prev => [...prev.slice(-9), { type: "progress", message: data.message, timestamp: data.timestamp }]);
        
        const stepMap: Record<string, GenerationStep> = {
          research: "research",
          framework: "framework",
          outline: "outline",
          chapters: "chapters",
          images: "images",
          audio: "voiceover",
        };
        if (data.step && stepMap[data.step]) {
          setCurrentStep(stepMap[data.step]);
        }
      });
      
      es.addEventListener("chapter_generated", (e) => {
        const data = JSON.parse(e.data);
        setGeneratedChapters(prev => {
          const exists = prev.some(ch => ch.chapterNumber === data.chapterNumber);
          if (exists) return prev;
          return [...prev, data.chapter];
        });
        setLiveEvents(prev => [...prev.slice(-9), { type: "chapter", message: `Chapter ${data.chapterNumber}: ${data.title}`, timestamp: new Date().toISOString() }]);
      });
      
      es.addEventListener("scene_image_generated", (e) => {
        const data = JSON.parse(e.data);
        setGeneratedImages(prev => ({ ...prev, [data.key]: data.imageUrl }));
        setLiveEvents(prev => [...prev.slice(-9), { type: "image", message: `Image for Ch${data.chapterNumber} Sc${data.sceneNumber}`, timestamp: new Date().toISOString() }]);
      });
      
      es.addEventListener("audio_generated", (e) => {
        const data = JSON.parse(e.data);
        setGeneratedAudio(prev => ({ ...prev, [data.key]: data.audioUrl }));
        setLiveEvents(prev => [...prev.slice(-9), { type: "audio", message: `Audio for Ch${data.chapterNumber} Sc${data.sceneNumber}`, timestamp: new Date().toISOString() }]);
      });
      
      es.addEventListener("job_status", (e) => {
        const data = JSON.parse(e.data);
        if (data.status === "completed") {
          setCurrentStep("complete");
          setProgress(100);
          es.close();
        }
      });
      
      es.addEventListener("research_activity", (e) => {
        const data = JSON.parse(e.data) as ResearchActivity;
        setResearchActivities(prev => [...prev.slice(-49), data]);
      });
      
      es.addEventListener("outline_generated", (e) => {
        const data = JSON.parse(e.data);
        setChapters(data.outline);
      });
      
      es.addEventListener("framework_generated", (e) => {
        const data = JSON.parse(e.data);
        setFramework(data.framework);
      });
      
      es.onerror = () => {
        // Reconnect after a delay on error
        setTimeout(setupEventSource, 3000);
      };
    };
    
    setupEventSource();
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [projectId]);

  // Function to start background generation job
  const startBackgroundGeneration = async () => {
    if (!projectId) return;
    
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalChapters,
          config: {
            model: config.hookImageModel,
            imageStyle: config.imageStyle,
            imageSource: config.imageSource,
            voice: config.narratorVoice,
            researchMethod: config.researchMethod,
          },
        }),
      });
      
      if (!res.ok) {
        throw new Error("Failed to start generation");
      }
      
      const data = await res.json();
      setActiveJob({
        id: data.job.id,
        status: data.job.status,
        progress: 0,
        currentStep: null,
        completedSteps: [],
        elapsedFormatted: "0s",
        error: null,
        stateInfo: null,
      });
      
      setCurrentStep("research");
      setProgress(0);
      setLiveEvents([]);
      setResearchActivities([]);
      
    } catch (error) {
      console.error("Failed to start background generation:", error);
    }
  };
  
  // Auto-scroll research panel when new activities arrive
  useEffect(() => {
    if (researchPanelRef.current) {
      researchPanelRef.current.scrollTop = researchPanelRef.current.scrollHeight;
    }
  }, [researchActivities]);

  const generateVoiceoverMutation = useMutation({
    mutationFn: async ({ id, chapterNumber, sceneNumber, narration, voice }: { 
      id: number; 
      chapterNumber: number;
      sceneNumber: number;
      narration: string;
      voice: string;
    }) => {
      const res = await fetch(`/api/projects/${id}/generate-scene-voiceover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterNumber, sceneNumber, narration, voice }),
      });
      if (!res.ok) throw new Error("Failed to generate voiceover");
      return res.json();
    },
  });

  const handleGenerateAllChapters = async () => {
    if (!projectId || chapters.length === 0) return;
    
    setCurrentStep("chapters");
    const generated: ChapterScript[] = [];
    
    for (let i = 0; i < chapters.length; i++) {
      const chapterProgress = 25 + ((i + 1) / chapters.length) * 25;
      setProgress(chapterProgress);
      
      const result = await generateChapterMutation.mutateAsync({
        id: projectId,
        chapterNumber: i + 1,
        numChapters: chapters.length,
        chapterTitle: chapters[i],
      });
      
      generated.push(result.chapter);
      setGeneratedChapters([...generated]);
    }
    
    setProgress(50);
    setCurrentStep("images");
    
    for (let i = 0; i < generated.length; i++) {
      const chapter = generated[i];
      const imageProgress = 50 + ((i + 1) / generated.length) * 35;
      
      setCurrentImageScene(`Chapter ${chapter.chapterNumber}: Generating ${chapter.scenes.length} images...`);
      
      try {
        console.log(`[Generation] Chapter ${chapter.chapterNumber}: Starting image generation (${config.imageStyle} style)`);
        const imageResult = await generateImagesMutation.mutateAsync({
          id: projectId,
          chapterNumber: chapter.chapterNumber,
          scenes: chapter.scenes.map(s => ({
            sceneNumber: s.sceneNumber,
            imagePrompt: s.imagePrompt,
          })),
          model: config.hookImageModel,
          imageStyle: config.imageStyle,
        });
        
        imageResult.results.forEach((r: any) => {
          if (r.success && r.imageUrl) {
            console.log(`[Generation] Chapter ${chapter.chapterNumber} Scene ${r.sceneNumber}: Image generated`);
            setGeneratedImages(prev => ({
              ...prev,
              [`ch${chapter.chapterNumber}_sc${r.sceneNumber}`]: r.imageUrl,
            }));
          } else {
            console.warn(`[Generation] Chapter ${chapter.chapterNumber} Scene ${r.sceneNumber}: Image failed - ${r.error}`);
          }
        });
      } catch (error) {
        console.error(`Failed to generate images for chapter ${i + 1}:`, error);
      }
      
      setProgress(imageProgress);
    }
    
    setProgress(70);
    setCurrentStep("voiceover");
    
    // Generate voiceovers for each scene
    for (let i = 0; i < generated.length; i++) {
      const chapter = generated[i];
      
      for (let j = 0; j < chapter.scenes.length; j++) {
        const scene = chapter.scenes[j];
        const voiceoverProgress = 70 + ((i * chapter.scenes.length + j + 1) / (generated.length * chapter.scenes.length)) * 15;
        
        setCurrentImageScene(`Chapter ${chapter.chapterNumber}: Generating voiceover for scene ${scene.sceneNumber}...`);
        
        const narrationText = scene.narrationSegment || "";
        if (!narrationText.trim()) {
          console.warn(`[Voiceover] Skipping Ch${chapter.chapterNumber} Sc${scene.sceneNumber}: no narration text`);
          continue;
        }
        
        try {
          console.log(`[Voiceover] Ch${chapter.chapterNumber} Sc${scene.sceneNumber}: Starting TTS (${narrationText.length} chars)`);
          const audioResult = await generateVoiceoverMutation.mutateAsync({
            id: projectId,
            chapterNumber: chapter.chapterNumber,
            sceneNumber: scene.sceneNumber,
            narration: narrationText,
            voice: config.narratorVoice,
          });
          
          if (audioResult.audioUrl) {
            console.log(`[Voiceover] Ch${chapter.chapterNumber} Sc${scene.sceneNumber}: Audio generated - ${audioResult.audioUrl}`);
            setGeneratedAudio(prev => ({
              ...prev,
              [`ch${chapter.chapterNumber}_sc${scene.sceneNumber}`]: audioResult.audioUrl,
            }));
          }
        } catch (error: any) {
          console.error(`[Voiceover] Ch${chapter.chapterNumber} Sc${scene.sceneNumber}: FAILED - ${error.message}`);
        }
        
        setProgress(voiceoverProgress);
      }
    }
    
    setProgress(85);
    setCurrentStep("complete");
    setCurrentImageScene("");
  };

  const handleContinueToEditor = () => {
    if (projectId) {
      // Navigate to the neon video editor with the project ID
      navigate(`/editor/${projectId}`);
    }
  };

  const isGenerating = currentStep !== "idle" && currentStep !== "complete";

  const voiceOptions = [
    { value: "aura-2-thalia-en", label: "Thalia", description: "Warm and expressive female" },
    { value: "aura-2-apollo-en", label: "Apollo", description: "Clear and confident male" },
    { value: "aura-2-aries-en", label: "Aries", description: "Bold and energetic male" },
    { value: "aura-2-athena-en", label: "Athena", description: "Calm and professional female" },
    { value: "aura-2-atlas-en", label: "Atlas", description: "Strong and authoritative male" },
    { value: "aura-2-aurora-en", label: "Aurora", description: "Friendly and engaging female" },
    { value: "aura-2-draco-en", label: "Draco", description: "Deep and dramatic male" },
    { value: "aura-2-jupiter-en", label: "Jupiter", description: "Commanding and powerful male" },
    { value: "aura-2-mars-en", label: "Mars", description: "Smooth narrator baritone" },
    { value: "aura-2-neptune-en", label: "Neptune", description: "Calm and soothing male" },
    { value: "aura-2-zeus-en", label: "Zeus", description: "Deep and trustworthy male" },
    { value: "aura-2-orion-en", label: "Orion", description: "Clear and knowledgeable" },
  ];

  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

  const handleVoicePreview = async (voice: string) => {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.src = "";
    }
    
    if (previewingVoice === voice) {
      setPreviewingVoice(null);
      setPreviewAudio(null);
      return;
    }
    
    setPreviewingVoice(voice);
    try {
      const audio = new Audio(`/api/voices/${voice}/preview`);
      audio.onended = () => {
        setPreviewingVoice(null);
        setPreviewAudio(null);
      };
      audio.onerror = () => {
        setPreviewingVoice(null);
        setPreviewAudio(null);
      };
      setPreviewAudio(audio);
      await audio.play();
    } catch (error) {
      console.error("Failed to preview voice:", error);
      setPreviewingVoice(null);
    }
  };

  const chapterPresets = [
    { count: 3, label: "Short", duration: "5-8 min", color: "from-sky-400 via-cyan-500 to-teal-500", glow: "shadow-cyan-500/50", text: "text-cyan-400", accent: "text-cyan-300" },
    { count: 5, label: "Medium", duration: "15-20 min", color: "from-fuchsia-500 via-purple-500 to-violet-600", glow: "shadow-purple-500/50", text: "text-purple-400", accent: "text-fuchsia-300" },
    { count: 8, label: "Long", duration: "30-45 min", color: "from-orange-400 via-amber-500 to-yellow-500", glow: "shadow-amber-500/50", text: "text-amber-400", accent: "text-orange-300" },
    { count: 12, label: "Feature", duration: "60+ min", color: "from-rose-500 via-pink-500 to-red-500", glow: "shadow-rose-500/50", text: "text-rose-400", accent: "text-pink-300" },
  ];

  const storyLengthOptions = [
    { value: "short", label: "Short (5-8 min, 3 chapters)" },
    { value: "medium", label: "Medium (15-20 min, 5 chapters)" },
    { value: "long", label: "Long (30-45 min, 8 chapters)" },
    { value: "feature", label: "Feature (60+ min, 12 chapters)" },
  ];

  const imageModelOptions = [
    { value: "flux-1.1-pro", label: "Flux 1.1 Pro (Best Quality)" },
    { value: "ideogram-v3-turbo", label: "Ideogram V3 Turbo (Fast)" },
    { value: "flux-schnell", label: "Flux Schnell (Fastest)" },
  ];

  const steps = [
    { id: "research", label: "Research", icon: BookOpen },
    { id: "framework", label: "Framework", icon: FileText },
    { id: "outline", label: "Outline", icon: Layers },
    { id: "chapters", label: "Chapters", icon: FileText },
    { id: "images", label: "Images", icon: ImageIcon },
    { id: "voiceover", label: "Voiceover", icon: Volume2 },
    { id: "assembly", label: "Assembly", icon: Film },
  ];

  useEffect(() => {
    const savedTopic = sessionStorage.getItem("documentaryTopic");
    if (savedTopic) {
      setTitle(savedTopic);
      sessionStorage.removeItem("documentaryTopic");
    }
  }, []);

  // Poll for logs when generating
  useEffect(() => {
    if (!projectId || currentStep === "idle" || currentStep === "complete") return;
    
    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/progress`);
        if (res.ok) {
          const data = await res.json();
          setGenerationLogs(data.logs || []);
        }
      } catch (error) {
        console.error("Failed to fetch logs:", error);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [projectId, currentStep]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [generationLogs]);

  return (
    <WorkspaceSidebar>
      <div className="min-h-screen bg-background text-white relative overflow-auto">
        {/* Animated background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-500/10 via-cyan-500/5 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

        <div className="relative z-10 max-w-5xl mx-auto py-8 px-4 space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-6 relative">
          {/* Floating particles around header */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-[600px] h-[200px] pointer-events-none overflow-hidden">
            <div className="absolute w-2 h-2 bg-fuchsia-400/60 rounded-full animate-[float_4s_ease-in-out_infinite]" style={{ left: '10%', top: '30%' }} />
            <div className="absolute w-1.5 h-1.5 bg-cyan-400/60 rounded-full animate-[float_5s_ease-in-out_infinite]" style={{ left: '85%', top: '50%', animationDelay: '1s' }} />
            <div className="absolute w-1 h-1 bg-violet-400/80 rounded-full animate-[float_3s_ease-in-out_infinite]" style={{ left: '25%', top: '70%', animationDelay: '2s' }} />
            <div className="absolute w-2.5 h-2.5 bg-pink-400/40 rounded-full animate-[float_6s_ease-in-out_infinite]" style={{ left: '75%', top: '20%', animationDelay: '0.5s' }} />
          </div>
          
          {/* Badge */}
          <div className="relative inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-violet-500/20 via-fuchsia-500/20 to-cyan-500/20 border border-violet-400/40 text-xs font-mono uppercase tracking-[0.2em] group hover:scale-105 transition-all duration-300 cursor-default overflow-hidden">
            {/* Animated shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_3s_ease-in-out_infinite]" />
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500/30 via-fuchsia-500/30 to-cyan-500/30 blur-xl opacity-50" />
            <Sparkles className="h-3.5 w-3.5 text-fuchsia-400 animate-pulse relative z-10" />
            <span className="relative z-10 bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent font-bold">
              AI Documentary Studio
            </span>
            <Sparkles className="h-3.5 w-3.5 text-cyan-400 animate-pulse relative z-10" style={{ animationDelay: '0.5s' }} />
          </div>
          
          {/* Main Title */}
          <div className="relative">
            {/* Title glow background */}
            <div className="absolute inset-0 blur-3xl bg-gradient-to-r from-violet-500/20 via-fuchsia-500/20 to-cyan-500/20 animate-pulse" />
            <h1 className="relative text-6xl font-display font-black tracking-tight">
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(168,85,247,0.5)] animate-[pulse_4s_ease-in-out_infinite]">
                Create Your
              </span>
              <br />
              <span className="bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(6,182,212,0.5)] animate-[pulse_4s_ease-in-out_infinite]" style={{ animationDelay: '2s' }}>
                Documentary
              </span>
            </h1>
          </div>
          
          {/* Subtitle */}
          <p className="max-w-xl mx-auto text-lg font-medium leading-relaxed">
            <span className="text-white/70">Enter a topic and let </span>
            <span className="bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent font-semibold">AI generate</span>
            <span className="text-white/70"> a complete documentary with </span>
            <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent font-semibold">narration</span>
            <span className="text-white/70">, </span>
            <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent font-semibold">visuals</span>
            <span className="text-white/70">, and </span>
            <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent font-semibold">professional editing</span>
            <span className="text-white/70">.</span>
          </p>
          
        </div>

        {/* Progress Steps */}
        {currentStep !== "idle" && (
          <div className="glass-panel-glow rounded-2xl p-6 relative overflow-hidden">
            {/* Animated background particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute w-2 h-2 bg-violet-500/30 rounded-full animate-float" style={{ left: '10%', top: '20%', animationDelay: '0s' }} />
              <div className="absolute w-1.5 h-1.5 bg-cyan-500/30 rounded-full animate-float" style={{ left: '30%', top: '60%', animationDelay: '0.5s' }} />
              <div className="absolute w-2 h-2 bg-yellow-500/30 rounded-full animate-float" style={{ left: '70%', top: '30%', animationDelay: '1s' }} />
              <div className="absolute w-1 h-1 bg-violet-400/40 rounded-full animate-float" style={{ left: '85%', top: '70%', animationDelay: '1.5s' }} />
            </div>
            
            <div className="flex items-center justify-between mb-6 relative">
              {steps.map((step, i) => {
                const stepIndex = steps.findIndex(s => s.id === currentStep);
                const isActive = step.id === currentStep;
                const isComplete = i < stepIndex || currentStep === "complete";
                
                return (
                  <div key={step.id} className="flex items-center">
                    <div className="relative group">
                      {/* Outer glow ring for active step */}
                      {isActive && (
                        <>
                          <div className="absolute -inset-2 rounded-2xl bg-gradient-to-r from-[#7163EB] via-cyan-400 to-[#7163EB] opacity-60 blur-lg animate-pulse" />
                          <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-[#7163EB] to-cyan-400 opacity-40 animate-spin-slow" style={{ animationDuration: '3s' }} />
                        </>
                      )}
                      {/* Complete step glow */}
                      {isComplete && (
                        <div className="absolute -inset-1 rounded-xl bg-[#7163EB]/30 blur-md" />
                      )}
                      <div className={cn(
                        "relative w-14 h-14 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-500 transform border-2",
                        isComplete ? "bg-gradient-to-br from-[#7163EB] via-[#8B7CF7] to-[#6355D8] text-white shadow-lg shadow-[#7163EB]/50 scale-100 border-[#7163EB]/50" :
                        isActive ? "bg-gradient-to-br from-[#7163EB]/20 to-cyan-500/20 text-white shadow-lg shadow-[#7163EB]/50 scale-110 border-[#7163EB]/60" :
                        "bg-slate-800/80 border-slate-600/50 text-slate-400 scale-95 opacity-50"
                      )}>
                        {isComplete ? (
                          <div className="relative">
                            <Check className="h-6 w-6 animate-in zoom-in duration-300" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-8 h-8 rounded-full border-2 border-white/30 animate-ping opacity-50" />
                            </div>
                          </div>
                        ) : isActive ? (
                          <div className="relative">
                            <step.icon className="h-6 w-6 animate-pulse" />
                            <div className="absolute -inset-1">
                              <div className="w-8 h-8 rounded-full border-2 border-t-[#7163EB] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                            </div>
                          </div>
                        ) : (
                          <step.icon className="h-5 w-5" />
                        )}
                      </div>
                      {/* Step label on hover */}
                      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                        <span className="text-[10px] text-slate-400 font-medium">{step.label}</span>
                      </div>
                    </div>
                    {i < steps.length - 1 && (
                      <div className="relative w-10 h-1.5 mx-2">
                        <div className="absolute inset-0 rounded-full bg-slate-700/50" />
                        <div 
                          className={cn(
                            "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                            isComplete ? "bg-gradient-to-r from-[#7163EB] to-[#8B7CF7] w-full shadow-lg shadow-[#7163EB]/30" : 
                            isActive ? "bg-gradient-to-r from-[#7163EB]/50 to-cyan-400/50 w-1/2 animate-pulse" : "w-0"
                          )}
                        />
                        {/* Animated dot traveling along connector */}
                        {isActive && (
                          <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50 animate-bounce" style={{ left: '25%' }} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Enhanced Progress Bar */}
            <div className="relative h-5 bg-slate-900/80 rounded-full overflow-hidden border border-[#7163EB]/30 shadow-inner shadow-black/50">
              {/* Background glow */}
              <div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#7163EB]/40 via-cyan-500/30 to-transparent blur-sm transition-all duration-700"
                style={{ width: `${Math.min(progress + 10, 100)}%` }}
              />
              {/* Main progress fill */}
              <div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#7163EB] via-[#8B7CF7] via-cyan-400 to-amber-400 rounded-full transition-all duration-500 ease-out shadow-lg shadow-[#7163EB]/40"
                style={{ width: `${progress}%` }}
              >
                {/* Animated shine effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shine" />
                {/* Inner glow */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
              </div>
              {/* Leading edge glow */}
              {progress > 0 && progress < 100 && (
                <div 
                  className="absolute top-0 bottom-0 w-6 bg-gradient-to-r from-transparent via-white/80 to-white/40 blur-sm animate-pulse"
                  style={{ left: `calc(${progress}% - 12px)` }}
                />
              )}
              {/* Sparkle particles */}
              {progress > 0 && progress < 100 && (
                <>
                  <div 
                    className="absolute top-1 w-1 h-1 bg-white rounded-full animate-ping opacity-60"
                    style={{ left: `calc(${progress}% - 5px)` }}
                  />
                  <div 
                    className="absolute bottom-1 w-0.5 h-0.5 bg-cyan-300 rounded-full animate-ping opacity-40"
                    style={{ left: `calc(${progress}% - 10px)`, animationDelay: '0.5s' }}
                  />
                </>
              )}
            </div>
            
            {/* Progress percentage */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#7163EB] animate-pulse shadow-lg shadow-[#7163EB]/50" />
                <span className="text-sm text-white/80 font-mono font-semibold">{Math.round(progress)}%</span>
              </div>
              <span className={cn(
                "text-sm font-semibold px-3 py-1 rounded-full",
                currentStep === "complete" 
                  ? "bg-[#7163EB]/20 text-[#8B7CF7] border border-[#7163EB]/30" 
                  : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse"
              )}>
                {currentStep === "complete" ? "Complete!" : "Processing..."}
              </span>
            </div>
            <div className="flex items-center justify-center gap-4 mt-3">
              <p className="text-sm text-orange-300 font-medium">
                {currentStep === "research" && `Researching topic with ${config.researchMethod === "claude" ? "Claude Opus 4.5" : "Perplexity AI"}...`}
                {currentStep === "framework" && "Generating documentary framework with Claude..."}
                {currentStep === "outline" && "Creating chapter outline..."}
                {currentStep === "chapters" && `Generating chapter scripts (${generatedChapters.length}/${chapters.length})...`}
                {currentStep === "images" && (currentImageScene || "Generating scene images...")}
                {currentStep === "voiceover" && "Creating AI voiceover..."}
                {currentStep === "assembly" && "Assembling final video..."}
                {currentStep === "complete" && `Generation complete! ${Object.keys(generatedImages).length} images generated.`}
              </p>
              {activeJob && activeJob.status === "running" && (
                <div className="flex items-center gap-2 text-sm text-cyan-400 font-mono bg-card/50 px-3 py-1 rounded-lg border border-cyan-500/30">
                  <Clock className="h-4 w-4" />
                  <span data-testid="text-elapsed-time">{activeJob.elapsedFormatted}</span>
                </div>
              )}
            </div>
            
            {/* Research Activity Panel - Shows during and after research phase */}
            {researchActivities.length > 0 && (
              <div 
                className="mt-4 bg-gradient-to-br from-blue-950/40 to-purple-950/30 rounded-xl p-4 border border-blue-500/20 shadow-lg shadow-blue-500/5"
                data-testid="panel-research-activity"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-blue-300 font-semibold">Live Research Feed</span>
                  </div>
                  <div className="flex-1" />
                  <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400 bg-blue-500/10" data-testid="badge-sources-count">
                    {researchActivities.filter(a => a.activityType === "source_found").length} sources
                  </Badge>
                  <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400 bg-purple-500/10" data-testid="badge-queries-count">
                    {researchActivities.filter(a => a.activityType === "query_completed").length} queries
                  </Badge>
                </div>
                <div 
                  ref={researchPanelRef} 
                  className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-blue-500/20 scrollbar-track-transparent pr-2"
                >
                  {researchActivities.slice(-15).map((activity, i) => (
                    <div 
                      key={i}
                      className={cn(
                        "flex items-start gap-3 text-xs p-2 rounded-lg animate-in slide-in-from-left-2 duration-300",
                        activity.activityType === "query_started" && "bg-cyan-500/10 border-l-2 border-cyan-400",
                        activity.activityType === "query_completed" && "bg-green-500/10 border-l-2 border-green-400",
                        activity.activityType === "source_found" && "bg-blue-500/10 border-l-2 border-blue-400",
                        activity.activityType === "subtopic_identified" && "bg-purple-500/10 border-l-2 border-purple-400",
                        activity.activityType === "fact_extracted" && "bg-emerald-500/10 border-l-2 border-emerald-400",
                        activity.activityType === "phase_complete" && "bg-violet-500/10 border-l-2 border-violet-400"
                      )}
                      style={{ animationDelay: `${i * 30}ms` }}
                      data-testid={`item-research-activity-${i}`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {activity.activityType === "query_started" && <Search className="h-3 w-3 text-cyan-400 animate-pulse" />}
                        {activity.activityType === "query_completed" && <Check className="h-3 w-3 text-green-400" />}
                        {activity.activityType === "source_found" && <ExternalLink className="h-3 w-3 text-blue-400" />}
                        {activity.activityType === "subtopic_identified" && <Layers className="h-3 w-3 text-purple-400" />}
                        {activity.activityType === "fact_extracted" && <FileText className="h-3 w-3 text-emerald-400" />}
                        {activity.activityType === "phase_complete" && <Sparkles className="h-3 w-3 text-violet-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "truncate",
                          activity.activityType === "query_started" && "text-cyan-300",
                          activity.activityType === "query_completed" && "text-green-300",
                          activity.activityType === "source_found" && "text-blue-300",
                          activity.activityType === "subtopic_identified" && "text-purple-300",
                          activity.activityType === "fact_extracted" && "text-emerald-300",
                          activity.activityType === "phase_complete" && "text-orange-300 font-medium"
                        )}>
                          {activity.message}
                        </p>
                        {activity.source?.url && (
                          <a 
                            href={activity.source.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-400/70 hover:text-blue-300 text-[10px] truncate block"
                            data-testid={`link-research-source-${i}`}
                          >
                            {activity.source.url}
                          </a>
                        )}
                        {activity.fact && (
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded",
                            activity.fact.confidence === "high" && "bg-emerald-500/20 text-emerald-400",
                            activity.fact.confidence === "medium" && "bg-cyan-500/20 text-cyan-400",
                            activity.fact.confidence === "low" && "bg-red-500/20 text-red-400"
                          )}>
                            {activity.fact.confidence} confidence
                          </span>
                        )}
                      </div>
                      {activity.queryIndex && activity.totalQueries && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {activity.queryIndex}/{activity.totalQueries}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Live Events Ticker */}
            {liveEvents.length > 0 && researchActivities.length === 0 && (
              <div className="mt-4 bg-card/30 rounded-lg p-3 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-400 font-medium uppercase tracking-wider">Live Updates</span>
                </div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {liveEvents.slice(-5).map((event, i) => (
                    <div 
                      key={i} 
                      className="flex items-center gap-2 text-xs animate-in slide-in-from-left-2 duration-300"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        event.type === "chapter" && "bg-purple-400",
                        event.type === "image" && "bg-blue-400",
                        event.type === "audio" && "bg-cyan-400",
                        event.type === "progress" && "bg-violet-400"
                      )} />
                      <span className="text-muted-foreground">{event.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {activeJob && activeJob.error && (
              <p className="text-sm text-red-400 mt-2 text-center">
                Error: {activeJob.error}
              </p>
            )}
          </div>
        )}

        {/* Title Input Section */}
        <div className="glass-panel-glow rounded-2xl p-6 space-y-5">
          <Label className="text-sm font-medium text-orange-300 flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Documentary Topic
          </Label>
          <div className="flex gap-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., The Dark Secrets of the Woolworth Mansion..."
              className="flex-1 h-14 bg-card/50 border-violet-500/30 text-white placeholder:text-muted-foreground rounded-xl focus:border-violet-400 focus:ring-violet-400/20 text-lg neon-input"
              disabled={isGenerating}
              data-testid="input-title"
            />
            <Button
              onClick={handleGenerateFramework}
              disabled={!title.trim() || isGenerating}
              className="h-14 px-10 gap-3 rounded-xl text-base font-bold bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-600 hover:from-violet-400 hover:via-cyan-400 hover:to-violet-500 border-0 shadow-lg shadow-violet-500/40 hover:shadow-violet-500/60 hover:scale-105 transition-all duration-300 text-white"
              data-testid="button-generate-framework"
            >
              {isGenerating && currentStep !== "chapters" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="h-5 w-5" />
                  Generate
                </>
              )}
            </Button>
          </div>
          
          {/* Chapter Count Selector with Visual Boxes */}
          <div className="space-y-4">
            <Label className="text-sm text-cyan-300 flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Number of Chapters
            </Label>
            
            {/* Preset Chapter Boxes */}
            <div className="grid grid-cols-4 gap-4">
              {chapterPresets.map((preset) => {
                const isSelected = totalChapters === preset.count;
                return (
                  <button
                    key={preset.count}
                    onClick={() => {
                      playClickSound();
                      setTotalChapters(preset.count);
                      const lengthMap: Record<number, string> = { 3: "short", 5: "medium", 8: "long", 12: "feature" };
                      setConfig({ ...config, storyLength: lengthMap[preset.count] || "medium" });
                    }}
                    disabled={isGenerating}
                    className={cn(
                      "relative group overflow-hidden rounded-2xl p-5 transition-all duration-500 ease-out",
                      "border-2",
                      isSelected 
                        ? `border-transparent bg-gradient-to-br ${preset.color} scale-[1.03] shadow-xl ${preset.glow}` 
                        : "border-white/10 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-white/20 hover:from-slate-800 hover:to-slate-900 hover:scale-[1.02]",
                      isGenerating && "opacity-50 cursor-not-allowed"
                    )}
                    style={{
                      boxShadow: isSelected 
                        ? `0 0 40px -8px var(--tw-shadow-color), inset 0 1px 0 0 rgba(255,255,255,0.2)`
                        : undefined
                    }}
                    data-testid={`button-chapter-${preset.count}`}
                  >
                    {/* Inner dark overlay for selected state */}
                    {isSelected && (
                      <div className="absolute inset-[3px] rounded-xl bg-slate-900/90 backdrop-blur-sm" />
                    )}
                    
                    {/* Shimmer effect on hover */}
                    <div className={cn(
                      "absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000",
                      isSelected && "hidden"
                    )} />
                    
                    {/* Content */}
                    <div className="relative z-10 text-center space-y-1.5">
                      <div className={cn(
                        "text-5xl font-black transition-all duration-300 tracking-tight",
                        isSelected 
                          ? `${preset.text} drop-shadow-[0_0_20px_currentColor]` 
                          : "text-white/60 group-hover:text-white"
                      )}>
                        {preset.count}
                      </div>
                      <div className={cn(
                        "text-[11px] font-bold uppercase tracking-[0.2em] transition-colors",
                        isSelected ? preset.accent : "text-white/40 group-hover:text-white/60"
                      )}>
                        {preset.label}
                      </div>
                      <div className={cn(
                        "text-[10px] transition-colors font-medium",
                        isSelected ? "text-white/60" : "text-white/30 group-hover:text-white/40"
                      )}>
                        {preset.duration}
                      </div>
                    </div>
                    
                    {/* Selection indicator */}
                    {isSelected && (
                      <div className="absolute top-2.5 right-2.5">
                        <div className={cn(
                          "w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center shadow-lg ring-2 ring-white/20",
                          preset.color
                        )}>
                          <Check className="h-3.5 w-3.5 text-white drop-shadow-md" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            
            {/* Custom Chapter Input */}
            <div className="flex items-center gap-3 pt-3 border-t border-border/50">
              <span className="text-xs text-muted-foreground">Or enter custom:</span>
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={totalChapters}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    const clamped = Math.min(20, Math.max(1, val));
                    setTotalChapters(clamped);
                    const lengthMap: Record<number, string> = { 3: "short", 5: "medium", 8: "long", 12: "feature" };
                    setConfig({ ...config, storyLength: lengthMap[clamped] || "custom" });
                  }}
                  disabled={isGenerating}
                  className="w-20 h-9 text-center bg-card/50 border-violet-500/30 text-white font-bold rounded-lg"
                  data-testid="input-custom-chapters"
                />
              </div>
              <span className="text-xs text-orange-300">
                chapters (~{Math.round(totalChapters * 3)} min)
              </span>
            </div>
          </div>
          
          {/* Research Method Selector */}
          <div className="space-y-4 pt-4 border-t border-border/50">
            <Label className="text-sm text-cyan-300 flex items-center gap-2">
              <Search className="h-4 w-4" />
              Research Method
            </Label>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Perplexity Option */}
              <button
                onClick={() => { playClickSound(); setConfig({ ...config, researchMethod: "perplexity" }); }}
                disabled={isGenerating}
                className={cn(
                  "relative group overflow-hidden rounded-xl p-4 transition-all duration-300",
                  "border",
                  config.researchMethod === "perplexity"
                    ? "border-cyan-400/60 bg-cyan-500/10 scale-[1.02]"
                    : "border-border bg-card/50 hover:border-cyan-500/40 hover:bg-card/80",
                  isGenerating && "opacity-50 cursor-not-allowed"
                )}
                style={{
                  boxShadow: config.researchMethod === "perplexity" 
                    ? "0 0 30px -5px rgba(0, 200, 255, 0.4), inset 0 1px 0 0 rgba(0, 200, 255, 0.2)"
                    : undefined
                }}
                data-testid="button-research-perplexity"
              >
                <div className={cn(
                  "absolute inset-0 bg-gradient-to-br from-cyan-500 to-blue-600 opacity-0 transition-opacity duration-300",
                  config.researchMethod === "perplexity" ? "opacity-15" : "group-hover:opacity-5"
                )} />
                
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 overflow-hidden",
                    config.researchMethod === "perplexity" 
                      ? "shadow-lg shadow-cyan-500/30 ring-2 ring-cyan-400/50" 
                      : "bg-white/5 group-hover:bg-white/10"
                  )}>
                    <img 
                      src={perplexityIconPath} 
                      alt="Perplexity AI"
                      className={cn(
                        "w-full h-full object-cover transition-all duration-300",
                        config.researchMethod === "perplexity" ? "opacity-100" : "opacity-70 group-hover:opacity-90"
                      )}
                    />
                  </div>
                  <div className="text-center space-y-1">
                    <div className={cn(
                      "text-lg font-bold transition-all duration-300",
                      config.researchMethod === "perplexity" ? "text-cyan-400" : "text-white/70 group-hover:text-white"
                    )}>
                      Perplexity
                    </div>
                    <div className={cn(
                      "text-xs transition-colors",
                      config.researchMethod === "perplexity" ? "text-cyan-300/80" : "text-muted-foreground"
                    )}>
                      Web search + AI synthesis
                    </div>
                  </div>
                </div>
                
                {config.researchMethod === "perplexity" && (
                  <div className="absolute top-2 right-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  </div>
                )}
              </button>
              
              {/* Claude Opus 4.5 Option */}
              <button
                onClick={() => { playClickSound(); setConfig({ ...config, researchMethod: "claude" }); }}
                disabled={isGenerating}
                className={cn(
                  "relative group overflow-hidden rounded-xl p-4 transition-all duration-300",
                  "border",
                  config.researchMethod === "claude"
                    ? "border-purple-400/60 bg-purple-500/10 scale-[1.02]"
                    : "border-border bg-card/50 hover:border-purple-500/40 hover:bg-card/80",
                  isGenerating && "opacity-50 cursor-not-allowed"
                )}
                style={{
                  boxShadow: config.researchMethod === "claude" 
                    ? "0 0 30px -5px rgba(168, 85, 247, 0.4), inset 0 1px 0 0 rgba(168, 85, 247, 0.2)"
                    : undefined
                }}
                data-testid="button-research-claude"
              >
                <div className={cn(
                  "absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-600 opacity-0 transition-opacity duration-300",
                  config.researchMethod === "claude" ? "opacity-15" : "group-hover:opacity-5"
                )} />
                
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 overflow-hidden",
                    config.researchMethod === "claude" 
                      ? "shadow-lg shadow-purple-500/30 ring-2 ring-purple-400/50" 
                      : "bg-white/5 group-hover:bg-white/10"
                  )}>
                    <img 
                      src={claudeIconPath} 
                      alt="Claude AI"
                      className={cn(
                        "w-full h-full object-cover transition-all duration-300",
                        config.researchMethod === "claude" ? "opacity-100" : "opacity-70 group-hover:opacity-90"
                      )}
                    />
                  </div>
                  <div className="text-center space-y-1">
                    <div className={cn(
                      "text-lg font-bold transition-all duration-300",
                      config.researchMethod === "claude" ? "text-purple-400" : "text-white/70 group-hover:text-white"
                    )}>
                      Claude Opus 4.5
                    </div>
                    <div className={cn(
                      "text-xs transition-colors",
                      config.researchMethod === "claude" ? "text-purple-300/80" : "text-muted-foreground"
                    )}>
                      Deep AI reasoning
                    </div>
                  </div>
                </div>
                
                {config.researchMethod === "claude" && (
                  <div className="absolute top-2 right-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  </div>
                )}
              </button>
            </div>
          </div>
          
          {/* Image Source Selector */}
          <div className="space-y-4 pt-4 border-t border-border/50">
            <Label className="text-sm text-pink-300 flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Image Source
            </Label>
            
            <div className="grid grid-cols-3 gap-3">
              {/* Google Images Option */}
              <button
                onClick={() => { playClickSound(); setConfig({ ...config, imageSource: "google" }); }}
                disabled={isGenerating}
                className={cn(
                  "relative group overflow-hidden rounded-xl p-3 transition-all duration-300",
                  "border",
                  config.imageSource === "google"
                    ? "border-green-400/60 bg-green-500/10 scale-[1.02]"
                    : "border-border bg-card/50 hover:border-green-500/40 hover:bg-card/80",
                  isGenerating && "opacity-50 cursor-not-allowed"
                )}
                style={{
                  boxShadow: config.imageSource === "google" 
                    ? "0 0 25px -5px rgba(34, 197, 94, 0.4)"
                    : undefined
                }}
                data-testid="button-image-google"
              >
                <div className={cn(
                  "absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 opacity-0 transition-opacity duration-300",
                  config.imageSource === "google" ? "opacity-15" : "group-hover:opacity-5"
                )} />
                
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300 overflow-hidden",
                    config.imageSource === "google" 
                      ? "shadow-lg shadow-green-500/30 ring-2 ring-green-400/50" 
                      : "bg-white/5 group-hover:bg-white/10"
                  )}>
                    <img 
                      src={googleIconPath} 
                      alt="Google"
                      className={cn(
                        "w-full h-full object-cover transition-all duration-300",
                        config.imageSource === "google" ? "opacity-100" : "opacity-70 group-hover:opacity-90"
                      )}
                    />
                  </div>
                  <div className="text-center">
                    <div className={cn(
                      "text-sm font-bold transition-all duration-300",
                      config.imageSource === "google" ? "text-green-400" : "text-white/70 group-hover:text-white"
                    )}>
                      Google
                    </div>
                    <div className={cn(
                      "text-[10px] transition-colors",
                      config.imageSource === "google" ? "text-green-300/80" : "text-muted-foreground"
                    )}>
                      Fast & Free
                    </div>
                  </div>
                </div>
                
                {config.imageSource === "google" && (
                  <div className="absolute top-1.5 right-1.5">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  </div>
                )}
              </button>
              
              {/* Perplexity Stock Option */}
              <button
                onClick={() => { playClickSound(); setConfig({ ...config, imageSource: "stock" }); }}
                disabled={isGenerating}
                className={cn(
                  "relative group overflow-hidden rounded-xl p-3 transition-all duration-300",
                  "border",
                  config.imageSource === "stock"
                    ? "border-cyan-400/60 bg-cyan-500/10 scale-[1.02]"
                    : "border-border bg-card/50 hover:border-cyan-500/40 hover:bg-card/80",
                  isGenerating && "opacity-50 cursor-not-allowed"
                )}
                style={{
                  boxShadow: config.imageSource === "stock" 
                    ? "0 0 25px -5px rgba(0, 200, 255, 0.4)"
                    : undefined
                }}
                data-testid="button-image-stock"
              >
                <div className={cn(
                  "absolute inset-0 bg-gradient-to-br from-cyan-500 to-blue-600 opacity-0 transition-opacity duration-300",
                  config.imageSource === "stock" ? "opacity-15" : "group-hover:opacity-5"
                )} />
                
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300 overflow-hidden",
                    config.imageSource === "stock" 
                      ? "shadow-lg shadow-cyan-500/30 ring-2 ring-cyan-400/50" 
                      : "bg-white/5 group-hover:bg-white/10"
                  )}>
                    <img 
                      src={perplexityIconPath} 
                      alt="Perplexity"
                      className={cn(
                        "w-full h-full object-cover transition-all duration-300",
                        config.imageSource === "stock" ? "opacity-100" : "opacity-70 group-hover:opacity-90"
                      )}
                    />
                  </div>
                  <div className="text-center">
                    <div className={cn(
                      "text-sm font-bold transition-all duration-300",
                      config.imageSource === "stock" ? "text-cyan-400" : "text-white/70 group-hover:text-white"
                    )}>
                      Perplexity
                    </div>
                    <div className={cn(
                      "text-[10px] transition-colors",
                      config.imageSource === "stock" ? "text-cyan-300/80" : "text-muted-foreground"
                    )}>
                      Smart Search
                    </div>
                  </div>
                </div>
                
                {config.imageSource === "stock" && (
                  <div className="absolute top-1.5 right-1.5">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  </div>
                )}
              </button>
              
              {/* AI Generated Option */}
              <button
                onClick={() => { playClickSound(); setConfig({ ...config, imageSource: "ai" }); }}
                disabled={isGenerating}
                className={cn(
                  "relative group overflow-hidden rounded-2xl p-4 transition-all duration-500 ease-out",
                  "border-2",
                  config.imageSource === "ai"
                    ? "border-transparent bg-gradient-to-br from-fuchsia-600 via-purple-600 to-pink-600 scale-[1.02]"
                    : "border-white/10 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-fuchsia-500/30 hover:from-slate-800 hover:to-slate-900 hover:scale-[1.01]",
                  isGenerating && "opacity-50 cursor-not-allowed"
                )}
                style={{
                  boxShadow: config.imageSource === "ai" 
                    ? "0 0 40px -8px rgba(217, 70, 239, 0.6), inset 0 1px 0 0 rgba(255,255,255,0.2)"
                    : undefined
                }}
                data-testid="button-image-ai"
              >
                {/* Inner dark overlay for selected state */}
                {config.imageSource === "ai" && (
                  <div className="absolute inset-[3px] rounded-xl bg-gradient-to-br from-slate-900/95 via-purple-950/90 to-slate-900/95 backdrop-blur-sm" />
                )}
                
                {/* Shimmer effect on hover */}
                <div className={cn(
                  "absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000",
                  config.imageSource === "ai" && "hidden"
                )} />
                
                <div className="relative z-10 flex flex-col items-center gap-3">
                  {/* Icon with glow */}
                  <div className={cn(
                    "relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 overflow-hidden",
                    config.imageSource === "ai" 
                      ? "bg-gradient-to-br from-fuchsia-500 via-purple-500 to-pink-500 shadow-xl shadow-fuchsia-500/50 ring-2 ring-white/20" 
                      : "bg-white/5 group-hover:bg-white/10"
                  )}>
                    {config.imageSource === "ai" && (
                      <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                    )}
                    <img 
                      src={aiGenerateIconPath} 
                      alt="AI Generate"
                      className={cn(
                        "w-8 h-8 object-contain transition-all duration-300",
                        config.imageSource === "ai" ? "opacity-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" : "opacity-60 group-hover:opacity-80"
                      )}
                    />
                    {/* Sparkle effects */}
                    {config.imageSource === "ai" && (
                      <>
                        <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-white rounded-full animate-ping opacity-75" />
                        <div className="absolute bottom-1 left-1 w-1 h-1 bg-fuchsia-300 rounded-full animate-pulse" />
                      </>
                    )}
                  </div>
                  <div className="text-center">
                    <div className={cn(
                      "text-sm font-bold transition-all duration-300",
                      config.imageSource === "ai" ? "text-fuchsia-300 drop-shadow-[0_0_10px_rgba(217,70,239,0.5)]" : "text-white/60 group-hover:text-white"
                    )}>
                      AI Generate
                    </div>
                    <div className={cn(
                      "text-[10px] transition-colors font-medium",
                      config.imageSource === "ai" ? "text-pink-300/80" : "text-white/40"
                    )}>
                      Flux / Ideogram
                    </div>
                  </div>
                </div>
                
                {config.imageSource === "ai" && (
                  <div className="absolute top-2.5 right-2.5">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-fuchsia-400 to-pink-500 flex items-center justify-center shadow-lg ring-2 ring-white/20 animate-in zoom-in duration-200">
                      <Check className="h-3.5 w-3.5 text-white drop-shadow-md" />
                    </div>
                  </div>
                )}
              </button>
            </div>
          </div>
          
          {/* Story Configuration */}
          <div className="space-y-4 pt-4 border-t border-border/50">
            <Label className="text-sm text-emerald-300 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Story Configuration
            </Label>
            
            {/* Story Style */}
            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Documentary Style</span>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "narrative", label: "Narrative", desc: "Story-driven", icon: "📖", color: "from-violet-500 via-purple-500 to-fuchsia-500", glow: "shadow-purple-500/40", text: "text-purple-400", accent: "text-fuchsia-300" },
                  { value: "investigative", label: "Investigative", desc: "Deep dive", icon: "🔍", color: "from-emerald-400 via-teal-500 to-cyan-500", glow: "shadow-teal-500/40", text: "text-teal-400", accent: "text-emerald-300" },
                  { value: "historical", label: "Historical", desc: "Timeline focus", icon: "⏳", color: "from-amber-400 via-orange-500 to-red-500", glow: "shadow-orange-500/40", text: "text-orange-400", accent: "text-amber-300" },
                  { value: "educational", label: "Educational", desc: "Informative", icon: "🎓", color: "from-blue-400 via-indigo-500 to-violet-500", glow: "shadow-indigo-500/40", text: "text-indigo-400", accent: "text-blue-300" },
                ].map((style) => {
                  const isSelected = config.storyStyle === style.value;
                  return (
                    <button
                      key={style.value}
                      onClick={() => { playClickSound(); setConfig({ ...config, storyStyle: style.value as typeof config.storyStyle }); }}
                      disabled={isGenerating}
                      className={cn(
                        "relative group overflow-hidden rounded-xl p-4 transition-all duration-500 ease-out text-left",
                        "border-2",
                        isSelected
                          ? `border-transparent bg-gradient-to-r ${style.color} scale-[1.02] shadow-xl ${style.glow}`
                          : "border-white/10 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-white/20 hover:from-slate-800 hover:to-slate-900 hover:scale-[1.01]",
                        isGenerating && "opacity-50 cursor-not-allowed"
                      )}
                      style={{
                        boxShadow: isSelected 
                          ? `0 0 35px -8px var(--tw-shadow-color), inset 0 1px 0 0 rgba(255,255,255,0.15)`
                          : undefined
                      }}
                      data-testid={`button-style-${style.value}`}
                    >
                      {/* Inner dark overlay for selected state */}
                      {isSelected && (
                        <div className="absolute inset-[3px] rounded-lg bg-slate-900/90 backdrop-blur-sm" />
                      )}
                      
                      {/* Shimmer effect on hover */}
                      <div className={cn(
                        "absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000",
                        isSelected && "hidden"
                      )} />
                      
                      <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{style.icon}</span>
                          <div>
                            <div className={cn(
                              "text-sm font-bold transition-all duration-300",
                              isSelected ? `${style.text} drop-shadow-[0_0_10px_currentColor]` : "text-white/70 group-hover:text-white"
                            )}>
                              {style.label}
                            </div>
                            <div className={cn(
                              "text-[11px] transition-colors font-medium",
                              isSelected ? style.accent : "text-white/40 group-hover:text-white/50"
                            )}>
                              {style.desc}
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <div className={cn(
                            "w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center shadow-lg ring-2 ring-white/20",
                            style.color
                          )}>
                            <Check className="h-3.5 w-3.5 text-white drop-shadow-md" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Narrator Voice Selection */}
            <div className="space-y-3">
              <span className="text-sm text-violet-300 flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Narrator Voice
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {voiceOptions.map((voice, index) => {
                  const voiceIcons = [
                    { gradient: "from-violet-500 to-purple-600", icon: Mic },
                    { gradient: "from-blue-500 to-cyan-600", icon: Volume2 },
                    { gradient: "from-emerald-500 to-teal-600", icon: Mic },
                    { gradient: "from-pink-500 to-rose-600", icon: Volume2 },
                    { gradient: "from-cyan-500 to-blue-600", icon: Mic },
                    { gradient: "from-purple-500 to-indigo-600", icon: Volume2 },
                  ];
                  const voiceStyle = voiceIcons[index % voiceIcons.length];
                  const VoiceIcon = voiceStyle.icon;
                  
                  return (
                    <div
                      key={voice.value}
                      onClick={() => { if (!isGenerating) { playClickSound(); setConfig({ ...config, narratorVoice: voice.value }); } }}
                      className={cn(
                        "relative rounded-xl p-3 transition-all duration-300 cursor-pointer group",
                        "border",
                        config.narratorVoice === voice.value
                          ? "border-violet-400/60 bg-violet-500/10 scale-[1.02]"
                          : "border-border bg-card/50 hover:border-violet-500/40 hover:bg-card/80",
                        isGenerating && "opacity-50 cursor-not-allowed"
                      )}
                      style={{
                        boxShadow: config.narratorVoice === voice.value 
                          ? "0 0 25px -5px rgba(139, 92, 246, 0.4)"
                          : undefined
                      }}
                      data-testid={`button-voice-${voice.value}`}
                    >
                      <div className={cn(
                        "absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 rounded-xl",
                        voiceStyle.gradient,
                        config.narratorVoice === voice.value ? "opacity-10" : "group-hover:opacity-5"
                      )} />
                      
                      <div className="relative z-10 flex flex-col items-center gap-2">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300",
                          config.narratorVoice === voice.value 
                            ? `bg-gradient-to-br ${voiceStyle.gradient} shadow-lg` 
                            : "bg-white/5 group-hover:bg-white/10"
                        )}>
                          <VoiceIcon className={cn(
                            "h-5 w-5 transition-colors",
                            config.narratorVoice === voice.value ? "text-white" : "text-violet-400/70"
                          )} />
                        </div>
                        <div className="text-center w-full">
                          <div className={cn(
                            "text-sm font-medium transition-colors",
                            config.narratorVoice === voice.value ? "text-violet-400" : "text-white/80"
                          )}>
                            {voice.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">{voice.description}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7 rounded-full transition-all duration-200",
                            previewingVoice === voice.value 
                              ? "bg-violet-500/40 text-white scale-110" 
                              : "bg-violet-500/10 text-violet-400 hover:bg-violet-500/30 hover:scale-105"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVoicePreview(voice.value);
                          }}
                          data-testid={`button-preview-${voice.value}`}
                        >
                          {previewingVoice === voice.value ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5 ml-0.5" />
                          )}
                        </Button>
                      </div>
                      
                      {config.narratorVoice === voice.value && (
                        <div className="absolute top-1.5 right-1.5">
                          <div className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-200 bg-gradient-to-br",
                            voiceStyle.gradient
                          )}>
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Research Summary Display */}
        {researchData && researchData.summary && (
          <div className="glass-panel-glow rounded-2xl p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                <Search className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-xl font-display font-bold gradient-text">Research Summary</h2>
              <Badge variant="outline" className="ml-auto text-xs bg-blue-500/10 text-blue-400 border-blue-500/30 px-3 py-1">
                {researchData.sources?.length || 0} Sources
              </Badge>
            </div>

            {/* Key Facts */}
            {researchData.summary.keyFacts && researchData.summary.keyFacts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-blue-300">Key Facts</Label>
                <div className="grid gap-2">
                  {researchData.summary.keyFacts.slice(0, 5).map((fact, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-blue-500/5 rounded-lg border border-blue-500/20">
                      <Check className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-white/90">{fact.fact}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            {researchData.summary.timeline && researchData.summary.timeline.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-blue-300">Timeline</Label>
                <div className="grid gap-2">
                  {researchData.summary.timeline.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 bg-background/50 rounded-lg border border-border">
                      <span className="text-xs font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded flex-shrink-0">
                        {item.date}
                      </span>
                      <span className="text-sm text-white/80">{item.event}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Figures */}
            {researchData.summary.mainCharacters && researchData.summary.mainCharacters.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-blue-300 flex items-center gap-2">
                  <Users className="h-3 w-3" />
                  Key Figures
                </Label>
                <div className="flex flex-wrap gap-2">
                  {researchData.summary.mainCharacters.slice(0, 6).map((char, i) => (
                    <Badge key={i} className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1">
                      {char.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Sources Preview */}
            {researchData.sources && researchData.sources.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-border/50">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sources Used</Label>
                <div className="flex flex-wrap gap-2">
                  {researchData.sources.slice(0, 3).map((source, i) => (
                    <a 
                      key={i}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-500/10 px-2 py-1 rounded"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {source.title?.slice(0, 40)}...
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Generated Framework Display */}
        {framework && (
          <div className="glass-panel-glow rounded-2xl p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-600 flex items-center justify-center neon-glow-gold">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-xl font-display font-bold gradient-text">Generated Framework</h2>
              <Badge variant="outline" className="ml-auto text-xs bg-green-500/10 text-green-400 border-green-500/30 px-3 py-1">
                Claude Sonnet 4.5
              </Badge>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-cyan-300">Title</Label>
              <h3 className="text-3xl font-display font-bold text-white neon-text-gold" data-testid="text-generated-title">
                {framework.generatedTitle}
              </h3>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-cyan-300">Genres</Label>
              <div className="flex gap-2" data-testid="container-genres">
                {framework.genres?.map((genre, i) => (
                  <Badge key={i} className="bg-violet-500/20 text-orange-300 border border-violet-500/30 px-3 py-1">
                    {genre}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Premise</Label>
              <p className="text-white/90 leading-relaxed" data-testid="text-premise">
                {framework.premise}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Opening Hook (150 Words)
              </Label>
              <div className="bg-background/50 rounded-lg p-4 border border-border">
                <p className="text-white/80 leading-relaxed italic" data-testid="text-opening-hook">
                  "{framework.openingHook}"
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Chapter Outline */}
        {chapters.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-display font-bold text-white">Chapter Outline</h2>
                <Badge variant="outline" className="ml-2 text-xs">
                  {chapters.length} Chapters
                </Badge>
              </div>
              
              <div className="flex items-center gap-2">
                {generatedChapters.length === 0 && !isGenerating && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newChapters = [...chapters, `Chapter ${chapters.length + 1}: New Chapter`];
                        setChapters(newChapters);
                      }}
                      className="gap-1"
                      data-testid="button-add-chapter"
                    >
                      + Add
                    </Button>
                    <Button
                      onClick={handleGenerateAllChapters}
                      className="gap-2"
                      data-testid="button-generate-chapters"
                    >
                      <Play className="h-4 w-4" />
                      Generate All Chapters
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {chapters.map((chapter, i) => {
                const isGenerated = generatedChapters.some(c => c.chapterNumber === i + 1);
                const generatedChapter = generatedChapters.find(c => c.chapterNumber === i + 1);
                const isEditing = editingChapterIndex === i;
                
                return (
                  <div 
                    key={i} 
                    className={cn(
                      "p-3 rounded-lg border transition-all",
                      isGenerated 
                        ? "bg-green-500/10 border-green-500/30" 
                        : "bg-background/50 border-border"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                          isGenerated ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                        )}>
                          {isGenerated ? <Check className="h-3 w-3" /> : i + 1}
                        </div>
                        {isEditing ? (
                          <Input
                            value={editingChapterValue}
                            onChange={(e) => setEditingChapterValue(e.target.value)}
                            onBlur={() => {
                              const newChapters = [...chapters];
                              newChapters[i] = editingChapterValue || chapter;
                              setChapters(newChapters);
                              setEditingChapterIndex(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const newChapters = [...chapters];
                                newChapters[i] = editingChapterValue || chapter;
                                setChapters(newChapters);
                                setEditingChapterIndex(null);
                              } else if (e.key === "Escape") {
                                setEditingChapterIndex(null);
                              }
                            }}
                            autoFocus
                            className="flex-1 h-8 text-sm"
                            data-testid={`input-chapter-${i}`}
                          />
                        ) : (
                          <span 
                            className="text-white font-medium cursor-pointer hover:text-primary transition-colors flex-1"
                            onClick={() => {
                              if (!isGenerated && !isGenerating) {
                                setEditingChapterIndex(i);
                                setEditingChapterValue(chapter);
                              }
                            }}
                            data-testid={`text-chapter-${i}`}
                          >
                            {chapter}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {generatedChapter && (
                          <span className="text-xs text-muted-foreground">
                            {generatedChapter.scenes.length} scenes
                          </span>
                        )}
                        {!isGenerated && !isGenerating && chapters.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                            onClick={() => {
                              const newChapters = chapters.filter((_, idx) => idx !== i);
                              setChapters(newChapters);
                            }}
                            data-testid={`button-remove-chapter-${i}`}
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {generatedChapters.length === 0 && !isGenerating && (
              <p className="text-xs text-muted-foreground text-center">
                Click on a chapter name to edit it, or add/remove chapters before generating.
              </p>
            )}
          </div>
        )}

        {/* Start Generation Button - appears after framework is ready */}
        {framework && generatedChapters.length === 0 && chapters.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Button
              onClick={startBackgroundGeneration}
              disabled={isGenerating || (activeJob?.status === "running")}
              className="w-full h-14 gap-3 bg-gradient-to-r from-primary via-violet-500 to-purple-500 hover:from-primary/90 hover:via-violet-500/90 hover:to-purple-500/90 text-lg font-semibold shadow-lg shadow-purple-500/25 border border-white/10"
              data-testid="button-start-generation"
            >
              {isGenerating || activeJob?.status === "running" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {activeJob ? `Generating... ${activeJob.elapsedFormatted}` : "Generating Chapters..."}
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  Start Full Generation
                </>
              )}
            </Button>
          </div>
        )}

        {/* Auto Video Renderer - starts automatically when assets are ready */}
        <AutoVideoRenderer 
          projectId={projectId!}
          generatedChapters={generatedChapters}
          generatedImages={generatedImages}
          generatedAudio={generatedAudio}
          existingVideoUrl={renderedVideoUrl}
          forceRerender={forceRerender}
          onRerenderStart={() => setRenderedVideoUrl(null)}
          onVideoReady={(url) => {
            setRenderedVideoUrl(url);
            setForceRerender(false);
            setCurrentStep("complete");
          }}
        />
        
        {/* Rendered Video Section - Shows prominently when video is available */}
        {renderedVideoUrl && (
          <div className="bg-gradient-to-br from-card via-card to-green-500/10 border-2 border-green-500/40 rounded-xl p-6 space-y-4 shadow-lg shadow-green-500/5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
                <Video className="h-6 w-6 text-green-400" />
                Your Documentary is Ready
              </h2>
              <Badge variant="outline" className="text-green-400 border-green-400/30 bg-green-400/10">
                <Check className="h-3 w-3 mr-1" />
                Complete
              </Badge>
            </div>
            
            <div className="aspect-video bg-black rounded-lg overflow-hidden border border-border">
              <video
                controls
                autoPlay={false}
                className="w-full h-full"
                src={renderedVideoUrl}
                poster={Object.values(generatedImages)[0] || undefined}
                data-testid="video-rendered-documentary"
              >
                Your browser does not support the video tag.
              </video>
            </div>
            
            <div className="flex gap-3">
              <a
                href={renderedVideoUrl}
                download={`documentary_${projectId}.mp4`}
                className="flex-1"
              >
                <Button 
                  className="w-full h-14 gap-3 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 hover:from-green-600 hover:via-emerald-600 hover:to-teal-600 text-lg font-bold shadow-lg"
                  data-testid="button-download-video"
                >
                  <Download className="h-6 w-6" />
                  Download Documentary
                </Button>
              </a>
              
              <Button 
                variant="outline"
                className="h-14 gap-2 border-violet-400/30 text-violet-400"
                onClick={() => setForceRerender(true)}
                disabled={forceRerender}
                data-testid="button-rerender-video"
              >
                <RefreshCw className={`h-5 w-5 ${forceRerender ? 'animate-spin' : ''}`} />
                Re-render
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground text-center">
              Grayscale documentary with smooth fade transitions • Click Re-render to apply changes
            </p>
          </div>
        )}

        {/* Generated Scripts Preview - Full Script with Audio */}
        {generatedChapters.length > 0 && (
          <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 backdrop-blur-xl shadow-2xl">
            {/* Decorative gradient glow */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500"></div>
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-violet-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            {/* Header */}
            <div className="relative p-6 border-b border-white/5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30">
                    <FileText className="h-5 w-5 text-cyan-400" />
                    <div className="absolute inset-0 rounded-xl bg-cyan-400/20 blur-sm"></div>
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-bold bg-gradient-to-r from-white via-cyan-100 to-white bg-clip-text text-transparent">
                      Full Script & Audio
                    </h2>
                    <p className="text-xs text-cyan-400/70">Complete documentary narration</p>
                  </div>
                </div>
                <Badge className="bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 border border-violet-400/30 px-3 py-1.5 font-semibold">
                  {generatedChapters.reduce((sum, ch) => sum + (ch.scenes?.length || 0), 0)} Scenes
                </Badge>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6 space-y-6 max-h-[650px] overflow-y-auto scrollbar-thin scrollbar-thumb-cyan-500/20 scrollbar-track-transparent">
              {generatedChapters.map((chapter) => (
                <div key={chapter.chapterNumber} className="space-y-4">
                  {/* Chapter Header */}
                  <div className="sticky top-0 z-10 -mx-6 px-6 py-4 bg-gradient-to-r from-slate-900/98 via-slate-800/98 to-slate-900/98 backdrop-blur-lg border-b border-cyan-500/10">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/30 to-violet-500/30 border border-cyan-500/40 flex items-center justify-center">
                        <span className="text-lg font-bold text-cyan-300">{chapter.chapterNumber}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-white text-lg leading-tight mb-1">
                          {chapter.title}
                        </h3>
                        <div className="flex items-center gap-3 text-sm text-cyan-400/70">
                          <span className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
                            {chapter.scenes?.length || 0} scenes
                          </span>
                          <span className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-violet-400"></div>
                            ~{Math.round((chapter.estimatedDuration || 0) / 60)} minutes
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Full Chapter Audio Player */}
                    {(() => {
                      const chapterAudioUrls = (chapter.scenes || [])
                        .map((s: any) => s.audioUrl || generatedAudio[`ch${chapter.chapterNumber}_sc${s.sceneNumber}`])
                        .filter(Boolean);
                      
                      if (chapterAudioUrls.length === 0) return null;
                      
                      return (
                        <div className="mt-4">
                          <ChapterAudioPlayer 
                            chapterNumber={chapter.chapterNumber}
                            audioUrls={chapterAudioUrls}
                            sceneCount={chapterAudioUrls.length}
                          />
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* Scenes */}
                  <div className="space-y-3 ml-6 pl-6 border-l-2 border-gradient-to-b from-cyan-500/40 via-violet-500/40 to-fuchsia-500/40" style={{ borderImage: 'linear-gradient(to bottom, rgb(6 182 212 / 0.4), rgb(139 92 246 / 0.4), rgb(217 70 239 / 0.4)) 1' }}>
                    {chapter.scenes?.map((scene: any, sceneIndex: number) => {
                      const audioUrl = scene.audioUrl || generatedAudio[`ch${chapter.chapterNumber}_sc${scene.sceneNumber}`];
                      
                      return (
                        <div 
                          key={scene.sceneNumber} 
                          className="group relative bg-gradient-to-br from-white/[0.03] to-white/[0.01] rounded-xl p-5 border border-white/5 hover:border-cyan-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5"
                        >
                          {/* Scene number indicator */}
                          <div className="absolute -left-9 top-5 w-4 h-4 rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 border-2 border-slate-800 shadow-lg shadow-cyan-500/30"></div>
                          
                          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-gradient-to-r from-cyan-500/20 to-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-semibold">
                                Scene {scene.sceneNumber}
                              </Badge>
                              {scene.mood && (
                                <Badge variant="outline" className="text-violet-300 border-violet-400/30 bg-violet-500/5">
                                  {scene.mood}
                                </Badge>
                              )}
                              {scene.shotType && (
                                <Badge variant="outline" className="text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-500/5">
                                  {scene.shotType}
                                </Badge>
                              )}
                            </div>
                            {scene.duration && (
                              <span className="text-sm font-medium text-white/50 bg-white/5 px-2.5 py-1 rounded-lg">
                                ~{scene.duration}s
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap font-light">
                            {scene.narrationSegment || scene.narration || scene.voiceoverScript || "No narration"}
                          </p>
                          
                          {audioUrl && (
                            <div className="flex items-center gap-3 pt-4 mt-4 border-t border-white/5">
                              <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                                <Volume2 className="h-4 w-4 text-cyan-400" />
                              </div>
                              <audio 
                                controls 
                                className="h-8 flex-1 [&::-webkit-media-controls-panel]:bg-slate-800/80 [&::-webkit-media-controls-current-time-display]:text-cyan-300 [&::-webkit-media-controls-time-remaining-display]:text-cyan-300"
                                style={{ maxWidth: "100%" }}
                                data-testid={`audio-ch${chapter.chapterNumber}-sc${scene.sceneNumber}`}
                              >
                                <source src={audioUrl} type="audio/wav" />
                                Your browser does not support audio.
                              </audio>
                            </div>
                          )}
                          
                          {scene.imagePrompt && (
                            <details className="text-xs mt-3 group/details">
                              <summary className="cursor-pointer text-white/40 hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                                <span className="group-open/details:rotate-90 transition-transform">▶</span>
                                View image prompt
                              </summary>
                              <p className="mt-2 text-white/30 italic pl-3 border-l-2 border-violet-500/30 py-2 bg-violet-500/5 rounded-r-lg">
                                {scene.imagePrompt}
                              </p>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generated Images Gallery */}
        {Object.keys(generatedImages).length > 0 && (
          <div className="relative overflow-hidden rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 backdrop-blur-xl shadow-2xl">
            {/* Decorative gradient glow */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-500"></div>
            <div className="absolute -top-20 -left-20 w-40 h-40 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-violet-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            {/* Header */}
            <div className="relative p-6 border-b border-white/5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-violet-500/20 border border-fuchsia-500/30">
                    <ImageIcon className="h-5 w-5 text-fuchsia-400" />
                    <div className="absolute inset-0 rounded-xl bg-fuchsia-400/20 blur-sm"></div>
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-bold bg-gradient-to-r from-white via-fuchsia-100 to-white bg-clip-text text-transparent">
                      Generated Scene Images
                    </h2>
                    <p className="text-xs text-fuchsia-400/70">Visual assets for your documentary</p>
                  </div>
                </div>
                <Badge className="bg-gradient-to-r from-fuchsia-500/20 to-violet-500/20 text-fuchsia-300 border border-fuchsia-400/30 px-3 py-1.5 font-semibold">
                  {Object.keys(generatedImages).length} Images
                </Badge>
              </div>
            </div>
            
            {/* Gallery Grid */}
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[550px] overflow-y-auto scrollbar-thin scrollbar-thumb-fuchsia-500/20 scrollbar-track-transparent pr-2">
                {Object.entries(generatedImages).map(([key, url], index) => (
                  <div 
                    key={key} 
                    className="group relative rounded-xl overflow-hidden border border-white/10 hover:border-fuchsia-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-fuchsia-500/10 hover:-translate-y-1"
                  >
                    {/* Image number badge */}
                    <div className="absolute top-2 left-2 z-10 w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500/80 to-violet-500/80 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg">
                      <span className="text-xs font-bold text-white">{index + 1}</span>
                    </div>
                    
                    {/* Image */}
                    <div className="relative aspect-video bg-slate-800/50">
                      <img 
                        src={url} 
                        alt={key}
                        className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent && !parent.querySelector('.error-placeholder')) {
                            const placeholder = document.createElement('div');
                            placeholder.className = 'error-placeholder absolute inset-0 flex items-center justify-center bg-slate-800/80';
                            placeholder.innerHTML = '<span class="text-fuchsia-400/50 text-sm">Image unavailable</span>';
                            parent.appendChild(placeholder);
                          }
                        }}
                      />
                      {/* Gradient overlay on hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-fuchsia-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </div>
                    
                    {/* Label */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-3 pt-8">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse"></div>
                        <span className="text-xs text-white/90 font-mono tracking-wide">{key}</span>
                      </div>
                    </div>
                    
                    {/* Hover overlay with action hint */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                      <div className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10">
                        <span className="text-xs text-white/80">Click to preview</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
      </div>
    </WorkspaceSidebar>
  );
}
