import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Home,
  Image as ImageIcon,
  Mic,
  Film,
  History,
  Play,
  Settings,
  Sparkles,
  Loader2,
  Check,
  X,
  Download,
  ChevronRight,
  Clock,
  Layers,
  Volume2,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarView = "home" | "images" | "voice" | "video" | "history";
type AutopilotPhase = "setup" | "review" | "generating" | "complete";

interface StoryFramework {
  id: number;
  projectId: number;
  generatedTitle: string | null;
  genres: string[] | null;
  premise: string | null;
  openingHook: string | null;
  narratorVoice: string | null;
  storyLength: string | null;
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

interface SceneStatus {
  image: "pending" | "generating" | "completed" | "error";
  voice: "pending" | "generating" | "completed" | "error";
  video: "pending" | "generating" | "completed" | "error";
  imageUrl?: string;
  audioUrl?: string;
}

interface WsMessage {
  type: "connected" | "progress" | "step" | "complete" | "error" | "scene_update";
  projectId: number;
  step?: string;
  progress?: number;
  message?: string;
  data?: any;
}

const SESSION_KEY_STORAGE = "petr_ai_session_key";

function getOrCreateSessionKey(): string {
  let key = localStorage.getItem(SESSION_KEY_STORAGE);
  if (!key) {
    key = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(SESSION_KEY_STORAGE, key);
  }
  return key;
}

const sidebarItems = [
  { id: "home" as SidebarView, label: "Home", icon: Home },
  { id: "images" as SidebarView, label: "Images", icon: ImageIcon },
  { id: "voice" as SidebarView, label: "Voice", icon: Mic },
  { id: "video" as SidebarView, label: "Video", icon: Film },
  { id: "history" as SidebarView, label: "History", icon: History },
];

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<SidebarView>("home");
  const [sessionKey] = useState(() => getOrCreateSessionKey());
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [framework, setFramework] = useState<StoryFramework | null>(null);
  const [generatedChapters, setGeneratedChapters] = useState<ChapterScript[]>([]);
  const [autopilotPhase, setAutopilotPhase] = useState<AutopilotPhase>("setup");
  const [progress, setProgress] = useState(0);
  const [sceneStatuses, setSceneStatuses] = useState<Record<string, SceneStatus>>({});
  const [wsMessages, setWsMessages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [totalChapters, setTotalChapters] = useState(5);
  const [storyLength, setStoryLength] = useState("medium");
  const wsRef = useRef<WebSocket | null>(null);

  const storyLengthToChapters: Record<string, number> = {
    short: 3,
    medium: 5,
    long: 8,
    feature: 12,
  };

  const { data: projects } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      return res.json();
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async ({ projectTitle, chapterCount }: { projectTitle: string; chapterCount: number }) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle,
          chapterCount,
          voiceEnabled: true,
          imageModel: "flux-1.1-pro",
          scriptModel: "claude-sonnet-4-5",
        }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });

  const generateFrameworkMutation = useMutation({
    mutationFn: async ({ id, numChapters }: { id: number; numChapters: number }) => {
      const res = await fetch(`/api/projects/${id}/documentary/generate-framework`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyLength, totalChapters: numChapters }),
      });
      if (!res.ok) throw new Error("Failed to generate framework");
      return res.json();
    },
  });

  const connectWebSocket = (projId: number) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/generation`);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", projectId: projId }));
      setWsMessages(prev => [...prev, "[CONNECTED] Real-time updates active"]);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        
        if (msg.type === "progress") {
          setProgress(msg.progress || 0);
          if (msg.message) {
            setWsMessages(prev => [...prev, `[PROGRESS] ${msg.message}`]);
          }
        } else if (msg.type === "scene_update") {
          const { chapterIndex, sceneIndex, phase, status, imageUrl, audioUrl } = msg.data || {};
          const key = `${chapterIndex}-${sceneIndex}`;
          setSceneStatuses(prev => ({
            ...prev,
            [key]: {
              ...prev[key] || { image: "pending", voice: "pending", video: "pending" },
              [phase]: status,
              ...(imageUrl && { imageUrl }),
              ...(audioUrl && { audioUrl }),
            }
          }));
        } else if (msg.type === "complete") {
          setAutopilotPhase("complete");
          if (msg.data?.videoUrl) {
            setVideoUrl(msg.data.videoUrl);
          }
          setWsMessages(prev => [...prev, `[COMPLETE] ${msg.message}`]);
        } else if (msg.type === "error") {
          setWsMessages(prev => [...prev, `[ERROR] ${msg.message}`]);
          setProgress(0);
          setGenerationError(msg.message || "Generation failed");
          setSceneStatuses(prev => {
            const reset: Record<string, SceneStatus> = {};
            Object.keys(prev).forEach(key => {
              reset[key] = { 
                image: prev[key].image === "generating" ? "error" : prev[key].image, 
                voice: prev[key].voice === "generating" ? "error" : prev[key].voice, 
                video: prev[key].video === "generating" ? "error" : prev[key].video,
                imageUrl: prev[key].imageUrl,
                audioUrl: prev[key].audioUrl,
              };
            });
            return reset;
          });
        }
      } catch (e) {
        console.error("WS parse error:", e);
      }
    };
    
    wsRef.current = ws;
  };

  const handleStartGeneration = async () => {
    if (!title.trim()) return;
    
    const numChapters = storyLengthToChapters[storyLength];
    setTotalChapters(numChapters);
    
    const project = await createProjectMutation.mutateAsync({ 
      projectTitle: title, 
      chapterCount: numChapters 
    });
    setProjectId(project.id);
    
    const fw = await generateFrameworkMutation.mutateAsync({ 
      id: project.id, 
      numChapters 
    });
    setFramework(fw);
    setAutopilotPhase("review");
  };

  const handleApproveAndStart = async () => {
    if (!projectId) return;
    
    setAutopilotPhase("generating");
    setGenerationError(null);
    setSceneStatuses({});
    setWsMessages([]);
    connectWebSocket(projectId);
    
    setWsMessages(prev => [...prev, "[STEP] Generating chapter scripts..."]);
    
    const generated: ChapterScript[] = [];
    for (let i = 0; i < totalChapters; i++) {
      const res = await fetch(`/api/projects/${projectId}/documentary/generate-chapter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          chapterNumber: i + 1,
          storyLength,
          totalChapters,
        }),
      });
      if (res.ok) {
        const chapter = await res.json();
        generated.push(chapter);
        setGeneratedChapters([...generated]);
        
        chapter.scenes?.forEach((_: any, sceneIdx: number) => {
          const key = `${i}-${sceneIdx}`;
          setSceneStatuses(prev => ({
            ...prev,
            [key]: { image: "pending", voice: "pending", video: "pending" }
          }));
        });
      }
    }

    await fetch(`/api/projects/${projectId}/documentary/autopilot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        chapters: generated,
        imageModel: "flux-1.1-pro",
      }),
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-emerald-500";
      case "generating": return "bg-amber-500 animate-pulse";
      case "error": return "bg-red-500";
      default: return "bg-zinc-600";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <Check className="h-3 w-3" />;
      case "generating": return <Loader2 className="h-3 w-3 animate-spin" />;
      case "error": return <X className="h-3 w-3" />;
      default: return <Clock className="h-3 w-3" />;
    }
  };

  const renderHomeView = () => (
    <div className="space-y-8">
      {autopilotPhase === "setup" && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent">
              Create Your Documentary
            </h2>
            <p className="text-zinc-400">Enter a topic and let AI generate a complete documentary</p>
          </div>

          <div className="glass-panel rounded-2xl p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-zinc-300">Documentary Topic</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., The History of Ancient Rome"
                className="bg-zinc-800/50 border-zinc-700 text-white h-12 text-lg"
                data-testid="input-topic"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Documentary Length</Label>
              <Select value={storyLength} onValueChange={setStoryLength}>
                <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-white" data-testid="select-length">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short (3 chapters)</SelectItem>
                  <SelectItem value="medium">Medium (5 chapters)</SelectItem>
                  <SelectItem value="long">Long (8 chapters)</SelectItem>
                  <SelectItem value="feature">Feature (12 chapters)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleStartGeneration}
              disabled={!title.trim() || createProjectMutation.isPending || generateFrameworkMutation.isPending}
              className="w-full h-12 text-lg bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-semibold"
              data-testid="button-start"
            >
              {createProjectMutation.isPending || generateFrameworkMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Generating Framework...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  Generate Documentary
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {autopilotPhase === "review" && framework && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
              Review Your Documentary
            </Badge>
            <h2 className="text-2xl font-bold text-white">{framework.generatedTitle}</h2>
          </div>

          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div>
              <Label className="text-zinc-400 text-sm">Opening Hook</Label>
              <p className="text-white mt-1">{framework.openingHook}</p>
            </div>
            <div>
              <Label className="text-zinc-400 text-sm">Premise</Label>
              <p className="text-zinc-300 mt-1">{framework.premise}</p>
            </div>
            {framework.genres && (
              <div className="flex gap-2">
                {framework.genres.map((genre, i) => (
                  <Badge key={i} variant="outline" className="border-orange-500/30 text-orange-400">
                    {genre}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={handleApproveAndStart}
            className="w-full h-12 text-lg bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700"
            data-testid="button-approve"
          >
            <Play className="h-5 w-5 mr-2" />
            Approve & Start Generation
          </Button>
        </div>
      )}

      {autopilotPhase === "generating" && (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Generating Documentary
            </Badge>
            <h2 className="text-2xl font-bold text-white">Live Generation Progress</h2>
          </div>

          <div className="glass-panel rounded-2xl p-4">
            <Progress value={progress} className="h-2" />
            <p className="text-center text-sm text-zinc-400 mt-2">{progress}% Complete</p>
          </div>

          {/* Scene Timeline */}
          <div className="glass-panel rounded-2xl p-6 space-y-4 max-h-96 overflow-y-auto">
            {generatedChapters.map((chapter, chapterIdx) => (
              <div key={chapterIdx} className="space-y-2">
                <h4 className="font-medium text-white flex items-center gap-2">
                  <span className="text-orange-400">Ch {chapter.chapterNumber}:</span>
                  {chapter.title}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {chapter.scenes?.map((scene, sceneIdx) => {
                    const key = `${chapterIdx}-${sceneIdx}`;
                    const status = sceneStatuses[key] || { image: "pending", voice: "pending", video: "pending" };
                    return (
                      <div key={sceneIdx} className="bg-zinc-800/50 rounded-lg p-2 space-y-1">
                        <p className="text-xs text-zinc-400">Scene {scene.sceneNumber}</p>
                        <div className="flex gap-1">
                          <div className={cn("w-5 h-5 rounded flex items-center justify-center", getStatusColor(status.image))} title="Image">
                            <ImageIcon className="h-3 w-3 text-white" />
                          </div>
                          <div className={cn("w-5 h-5 rounded flex items-center justify-center", getStatusColor(status.voice))} title="Voice">
                            <Mic className="h-3 w-3 text-white" />
                          </div>
                          <div className={cn("w-5 h-5 rounded flex items-center justify-center", getStatusColor(status.video))} title="Video">
                            <Film className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Live Logs */}
          {wsMessages.length > 0 && (
            <div className="glass-panel rounded-2xl p-4 max-h-32 overflow-y-auto font-mono text-xs">
              {wsMessages.slice(-8).map((msg, i) => (
                <div key={i} className={cn(
                  "text-zinc-400",
                  msg.includes("[ERROR]") && "text-red-400",
                  msg.includes("[COMPLETE]") && "text-emerald-400"
                )}>{msg}</div>
              ))}
            </div>
          )}

          {/* Error with Retry */}
          {generationError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center space-y-3">
              <p className="text-red-400 font-medium">Generation Error</p>
              <p className="text-sm text-zinc-400">{generationError}</p>
              <Button
                onClick={handleApproveAndStart}
                className="bg-gradient-to-r from-orange-500 to-amber-600"
                data-testid="button-retry"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Generation
              </Button>
            </div>
          )}
        </div>
      )}

      {autopilotPhase === "complete" && (
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <div className="space-y-2">
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              <Check className="h-3 w-3 mr-1" />
              Documentary Complete
            </Badge>
            <h2 className="text-2xl font-bold text-white">Your Documentary is Ready!</h2>
          </div>

          {videoUrl && (
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <video
                src={videoUrl}
                controls
                className="w-full rounded-lg"
                data-testid="video-preview"
              />
              <Button
                asChild
                className="w-full bg-gradient-to-r from-orange-500 to-amber-600"
              >
                <a href={videoUrl} download data-testid="button-download">
                  <Download className="h-4 w-4 mr-2" />
                  Download Video
                </a>
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            onClick={() => {
              setAutopilotPhase("setup");
              setTitle("");
              setProjectId(null);
              setFramework(null);
              setGeneratedChapters([]);
              setSceneStatuses({});
              setWsMessages([]);
              setVideoUrl(null);
            }}
            className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
            data-testid="button-new"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Create New Documentary
          </Button>
        </div>
      )}
    </div>
  );

  const renderImagesView = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Generated Images</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Object.entries(sceneStatuses)
          .filter(([_, status]) => status.imageUrl)
          .map(([key, status]) => (
            <div key={key} className="glass-panel rounded-xl overflow-hidden">
              <img
                src={status.imageUrl}
                alt={`Scene ${key}`}
                className="w-full aspect-video object-cover"
              />
              <div className="p-2">
                <p className="text-xs text-zinc-400">Scene {key.replace("-", ".")}</p>
              </div>
            </div>
          ))}
        {Object.values(sceneStatuses).filter(s => s.imageUrl).length === 0 && (
          <div className="col-span-full text-center py-12 text-zinc-500">
            <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No images generated yet</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderVoiceView = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Generated Voiceovers</h2>
      <div className="space-y-3">
        {Object.entries(sceneStatuses)
          .filter(([_, status]) => status.audioUrl)
          .map(([key, status]) => (
            <div key={key} className="glass-panel rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Volume2 className="h-5 w-5 text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">Scene {key.replace("-", ".")}</p>
                <audio src={status.audioUrl} controls className="w-full mt-2" />
              </div>
            </div>
          ))}
        {Object.values(sceneStatuses).filter(s => s.audioUrl).length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <Mic className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No voiceovers generated yet</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderVideoView = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Generated Video</h2>
      {videoUrl ? (
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <video
            src={videoUrl}
            controls
            className="w-full rounded-lg"
          />
          <Button
            asChild
            className="w-full bg-gradient-to-r from-orange-500 to-amber-600"
          >
            <a href={videoUrl} download>
              <Download className="h-4 w-4 mr-2" />
              Download Video
            </a>
          </Button>
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-500">
          <Film className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No video generated yet</p>
        </div>
      )}
    </div>
  );

  const renderHistoryView = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Project History</h2>
      <div className="space-y-3">
        {projects?.map((project: any) => (
          <div key={project.id} className="glass-panel rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-white font-medium">{project.title}</p>
              <p className="text-xs text-zinc-500">
                {project.chapterCount} chapters • {project.status}
              </p>
            </div>
            <Badge className={cn(
              project.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
              project.status === "generating" ? "bg-amber-500/20 text-amber-400" :
              "bg-zinc-500/20 text-zinc-400"
            )}>
              {project.status}
            </Badge>
          </div>
        ))}
        {(!projects || projects.length === 0) && (
          <div className="text-center py-12 text-zinc-500">
            <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No projects yet</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className="w-20 lg:w-64 bg-gradient-to-b from-orange-600 to-amber-700 flex flex-col items-center lg:items-stretch py-6 px-2 lg:px-4 shrink-0">
        <div className="flex items-center justify-center lg:justify-start gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Film className="h-6 w-6 text-white" />
          </div>
          <span className="hidden lg:block text-xl font-bold text-white">Petr AI</span>
        </div>

        <nav className="flex-1 space-y-2 w-full">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={cn(
                "w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-3 rounded-xl transition-all",
                activeView === item.id
                  ? "bg-white/20 text-white shadow-lg"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
              data-testid={`nav-${item.id}`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-white/20 w-full">
          <button
            className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-3 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all"
            data-testid="nav-settings"
          >
            <Settings className="h-5 w-5 shrink-0" />
            <span className="hidden lg:block font-medium">Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-6xl mx-auto">
          {activeView === "home" && renderHomeView()}
          {activeView === "images" && renderImagesView()}
          {activeView === "voice" && renderVoiceView()}
          {activeView === "video" && renderVideoView()}
          {activeView === "history" && renderHistoryView()}
        </div>
      </main>

      <style>{`
        .glass-panel {
          background: rgba(39, 39, 42, 0.5);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
}
