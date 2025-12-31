import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Play,
  Sparkles,
  Loader2,
  Check,
  X,
  Download,
  Clock,
  RefreshCw,
  FileText,
  Mic,
  Image as ImageIcon,
  Film,
  History,
  Settings,
  ChevronRight,
  Pencil,
  Eye,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarView = "create" | "history" | "settings";
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

const lengthOptions = [
  { id: "short", label: "3-5 min", chapters: 3, desc: "Quick & engaging" },
  { id: "medium", label: "8-10 min", chapters: 5, desc: "Standard length" },
  { id: "long", label: "15-18 min", chapters: 8, desc: "In-depth content" },
  { id: "feature", label: "25-30 min", chapters: 12, desc: "Documentary style" },
];

const aiTeam = [
  { id: "script", label: "Script Writer", icon: FileText, color: "from-violet-500 to-purple-600" },
  { id: "voice", label: "Voice Actor", icon: Mic, color: "from-blue-500 to-cyan-600" },
  { id: "images", label: "Image Generator", icon: ImageIcon, color: "from-emerald-500 to-teal-600" },
  { id: "video", label: "Video Editor", icon: Film, color: "from-orange-500 to-amber-600" },
];

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<SidebarView>("create");
  const [sessionKey] = useState(() => getOrCreateSessionKey());
  const [prompt, setPrompt] = useState("");
  const [selectedLength, setSelectedLength] = useState("medium");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [framework, setFramework] = useState<StoryFramework | null>(null);
  const [generatedChapters, setGeneratedChapters] = useState<ChapterScript[]>([]);
  const [autopilotPhase, setAutopilotPhase] = useState<AutopilotPhase>("setup");
  const [progress, setProgress] = useState(0);
  const [sceneStatuses, setSceneStatuses] = useState<Record<string, SceneStatus>>({});
  const [wsMessages, setWsMessages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, "idle" | "working" | "done">>({
    script: "idle",
    voice: "idle",
    images: "idle",
    video: "idle",
  });
  const wsRef = useRef<WebSocket | null>(null);

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
        body: JSON.stringify({ storyLength: selectedLength, totalChapters: numChapters }),
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
      setWsMessages(prev => [...prev, "Connected to generation server"]);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        
        if (msg.type === "progress") {
          setProgress(msg.progress || 0);
          if (msg.message) {
            setWsMessages(prev => [...prev, msg.message!]);
            if (msg.message.includes("script") || msg.message.includes("chapter")) {
              setAgentStatuses(prev => ({ ...prev, script: "working" }));
            }
            if (msg.message.includes("voice") || msg.message.includes("audio")) {
              setAgentStatuses(prev => ({ ...prev, script: "done", voice: "working" }));
            }
            if (msg.message.includes("image")) {
              setAgentStatuses(prev => ({ ...prev, voice: "done", images: "working" }));
            }
            if (msg.message.includes("video") || msg.message.includes("assembl")) {
              setAgentStatuses(prev => ({ ...prev, images: "done", video: "working" }));
            }
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
          setAgentStatuses({ script: "done", voice: "done", images: "done", video: "done" });
          if (msg.data?.videoUrl) {
            setVideoUrl(msg.data.videoUrl);
          }
          setWsMessages(prev => [...prev, "Video generation complete!"]);
        } else if (msg.type === "error") {
          setWsMessages(prev => [...prev, `Error: ${msg.message}`]);
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
    if (!prompt.trim()) return;
    
    const lengthConfig = lengthOptions.find(l => l.id === selectedLength) || lengthOptions[1];
    setAgentStatuses({ script: "working", voice: "idle", images: "idle", video: "idle" });
    
    const project = await createProjectMutation.mutateAsync({ 
      projectTitle: prompt, 
      chapterCount: lengthConfig.chapters 
    });
    setProjectId(project.id);
    
    const fw = await generateFrameworkMutation.mutateAsync({ 
      id: project.id, 
      numChapters: lengthConfig.chapters 
    });
    setFramework(fw.storedFramework || fw);
    setAgentStatuses(prev => ({ ...prev, script: "done" }));
    setAutopilotPhase("review");
  };

  const handleApproveAndStart = async () => {
    if (!projectId) return;
    
    const lengthConfig = lengthOptions.find(l => l.id === selectedLength) || lengthOptions[1];
    
    setAutopilotPhase("generating");
    setGenerationError(null);
    setSceneStatuses({});
    setWsMessages([]);
    setAgentStatuses({ script: "done", voice: "working", images: "idle", video: "idle" });
    connectWebSocket(projectId);
    
    const generated: ChapterScript[] = [];
    for (let i = 0; i < lengthConfig.chapters; i++) {
      const res = await fetch(`/api/projects/${projectId}/documentary/generate-chapter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          chapterNumber: i + 1,
          storyLength: selectedLength,
          totalChapters: lengthConfig.chapters,
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

  const resetToStart = () => {
    setAutopilotPhase("setup");
    setPrompt("");
    setProjectId(null);
    setFramework(null);
    setGeneratedChapters([]);
    setSceneStatuses({});
    setWsMessages([]);
    setVideoUrl(null);
    setGenerationError(null);
    setAgentStatuses({ script: "idle", voice: "idle", images: "idle", video: "idle" });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      {/* Minimal Sidebar */}
      <aside className="w-16 bg-[#12121a] border-r border-white/5 flex flex-col items-center py-6 gap-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Zap className="h-5 w-5 text-white" />
        </div>
        
        <nav className="flex-1 flex flex-col gap-2">
          <button
            onClick={() => setActiveView("create")}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
              activeView === "create" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
            )}
            data-testid="nav-create"
          >
            <Sparkles className="h-5 w-5" />
          </button>
          <button
            onClick={() => setActiveView("history")}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
              activeView === "history" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
            )}
            data-testid="nav-history"
          >
            <History className="h-5 w-5" />
          </button>
        </nav>

        <button
          onClick={() => setActiveView("settings")}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white/40 hover:text-white/70 transition-all"
          data-testid="nav-settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {activeView === "create" && (
          <div className="max-w-5xl mx-auto px-6 py-12">
            {/* Setup Phase */}
            {autopilotPhase === "setup" && (
              <div className="space-y-12">
                <div className="text-center space-y-4">
                  <h1 className="text-4xl md:text-5xl font-bold">
                    <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
                      Transform your ideas into videos
                    </span>
                  </h1>
                  <p className="text-lg text-white/50 max-w-2xl mx-auto">
                    Enter a topic and our AI team will research, write & edit it into a documentary
                  </p>
                </div>

                {/* Input Section */}
                <div className="max-w-3xl mx-auto space-y-6">
                  <div className="relative">
                    <Input
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Create a documentary about..."
                      className="h-16 text-lg bg-[#16161f] border-white/10 rounded-2xl pl-6 pr-32 placeholder:text-white/30"
                      data-testid="input-prompt"
                    />
                    <Button
                      onClick={handleStartGeneration}
                      disabled={!prompt.trim() || createProjectMutation.isPending || generateFrameworkMutation.isPending}
                      className="absolute right-2 top-2 h-12 px-6 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 rounded-xl"
                      data-testid="button-generate"
                    >
                      {createProjectMutation.isPending || generateFrameworkMutation.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          Generate
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Length Options */}
                  <div className="flex flex-wrap justify-center gap-3">
                    {lengthOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setSelectedLength(option.id)}
                        className={cn(
                          "px-4 py-3 rounded-xl border transition-all",
                          selectedLength === option.id
                            ? "bg-violet-500/20 border-violet-500/50 text-white"
                            : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                        )}
                        data-testid={`length-${option.id}`}
                      >
                        <div className="text-sm font-medium">{option.label}</div>
                        <div className="text-xs opacity-60">{option.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Team Preview */}
                <div className="max-w-4xl mx-auto">
                  <p className="text-center text-white/40 text-sm mb-6">Your AI production team</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {aiTeam.map((agent) => (
                      <div
                        key={agent.id}
                        className="bg-[#16161f] rounded-2xl p-4 border border-white/5"
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3",
                          agent.color
                        )}>
                          <agent.icon className="h-5 w-5 text-white" />
                        </div>
                        <p className="text-sm font-medium text-white/80">{agent.label}</p>
                        <p className="text-xs text-white/40">Ready</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Review Phase */}
            {autopilotPhase === "review" && framework && (
              <div className="space-y-8">
                <div className="text-center space-y-2">
                  <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30">
                    <Eye className="h-3 w-3 mr-1" />
                    Review Script
                  </Badge>
                  <h2 className="text-3xl font-bold text-white">{framework.generatedTitle}</h2>
                </div>

                <div className="max-w-3xl mx-auto space-y-4">
                  <div className="bg-[#16161f] rounded-2xl p-6 border border-white/5 space-y-4">
                    <div>
                      <p className="text-sm text-white/40 mb-1">Opening Hook</p>
                      <p className="text-white text-lg">{framework.openingHook}</p>
                    </div>
                    <div>
                      <p className="text-sm text-white/40 mb-1">Premise</p>
                      <p className="text-white/70">{framework.premise}</p>
                    </div>
                    {framework.genres && (
                      <div className="flex gap-2 pt-2">
                        {framework.genres.map((genre, i) => (
                          <Badge key={i} variant="outline" className="border-white/10 text-white/60">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={resetToStart}
                      className="flex-1 h-12 border-white/10 text-white/60 hover:bg-white/5"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={handleApproveAndStart}
                      className="flex-1 h-12 bg-gradient-to-r from-violet-500 to-purple-600"
                      data-testid="button-approve"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Accept & Generate Video
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Generating Phase */}
            {autopilotPhase === "generating" && (
              <div className="space-y-8">
                <div className="text-center space-y-2">
                  <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 animate-pulse">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Generating Video
                  </Badge>
                  <h2 className="text-2xl font-bold text-white">Your AI team is working</h2>
                </div>

                {/* Progress Bar */}
                <div className="max-w-2xl mx-auto">
                  <div className="bg-[#16161f] rounded-2xl p-4 border border-white/5">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-white/60">Progress</span>
                      <span className="text-white">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                </div>

                {/* AI Team Status */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
                  {aiTeam.map((agent) => {
                    const status = agentStatuses[agent.id];
                    return (
                      <div
                        key={agent.id}
                        className={cn(
                          "rounded-2xl p-4 border transition-all",
                          status === "working" 
                            ? "bg-violet-500/10 border-violet-500/30" 
                            : status === "done"
                            ? "bg-emerald-500/10 border-emerald-500/30"
                            : "bg-[#16161f] border-white/5"
                        )}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center",
                            agent.color
                          )}>
                            <agent.icon className="h-5 w-5 text-white" />
                          </div>
                          {status === "working" && <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />}
                          {status === "done" && <Check className="h-4 w-4 text-emerald-400" />}
                        </div>
                        <p className="text-sm font-medium text-white/80">{agent.label}</p>
                        <p className={cn(
                          "text-xs",
                          status === "working" ? "text-violet-400" : 
                          status === "done" ? "text-emerald-400" : "text-white/40"
                        )}>
                          {status === "working" ? "Working..." : status === "done" ? "Complete" : "Waiting"}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Timeline Strip */}
                {generatedChapters.length > 0 && (
                  <div className="bg-[#16161f] rounded-2xl p-4 border border-white/5">
                    <p className="text-sm text-white/40 mb-4">Scene Timeline</p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {generatedChapters.flatMap((chapter, chapterIdx) =>
                        chapter.scenes?.map((scene, sceneIdx) => {
                          const key = `${chapterIdx}-${sceneIdx}`;
                          const status = sceneStatuses[key] || { image: "pending", voice: "pending", video: "pending" };
                          return (
                            <div
                              key={key}
                              className={cn(
                                "shrink-0 w-24 h-16 rounded-lg border overflow-hidden relative",
                                status.image === "completed" && status.imageUrl
                                  ? "border-emerald-500/30"
                                  : status.image === "generating"
                                  ? "border-violet-500/30 animate-pulse"
                                  : "border-white/10 bg-white/5"
                              )}
                            >
                              {status.imageUrl ? (
                                <img src={status.imageUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  {status.image === "generating" ? (
                                    <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
                                  ) : (
                                    <span className="text-[10px] text-white/30">{chapterIdx + 1}.{sceneIdx + 1}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Live Logs */}
                {wsMessages.length > 0 && (
                  <div className="bg-[#16161f] rounded-2xl p-4 border border-white/5 max-h-32 overflow-y-auto">
                    <div className="space-y-1 font-mono text-xs">
                      {wsMessages.slice(-6).map((msg, i) => (
                        <div key={i} className={cn(
                          "text-white/40",
                          msg.includes("Error") && "text-red-400",
                          msg.includes("complete") && "text-emerald-400"
                        )}>{msg}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error */}
                {generationError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center space-y-4">
                    <p className="text-red-400 font-medium">Generation Error</p>
                    <p className="text-sm text-white/60">{generationError}</p>
                    <Button
                      onClick={handleApproveAndStart}
                      className="bg-gradient-to-r from-violet-500 to-purple-600"
                      data-testid="button-retry"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Complete Phase */}
            {autopilotPhase === "complete" && (
              <div className="space-y-8 text-center">
                <div className="space-y-2">
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    <Check className="h-3 w-3 mr-1" />
                    Video Complete
                  </Badge>
                  <h2 className="text-3xl font-bold text-white">Your documentary is ready!</h2>
                </div>

                {videoUrl && (
                  <div className="max-w-3xl mx-auto">
                    <div className="bg-[#16161f] rounded-2xl p-4 border border-white/5 space-y-4">
                      <video
                        src={videoUrl}
                        controls
                        className="w-full rounded-xl"
                        data-testid="video-preview"
                      />
                      <Button
                        asChild
                        className="w-full h-12 bg-gradient-to-r from-violet-500 to-purple-600"
                      >
                        <a href={videoUrl} download data-testid="button-download">
                          <Download className="h-4 w-4 mr-2" />
                          Download Video
                        </a>
                      </Button>
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  onClick={resetToStart}
                  className="border-white/10 text-white/60 hover:bg-white/5"
                  data-testid="button-new"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Create New Video
                </Button>
              </div>
            )}
          </div>
        )}

        {activeView === "history" && (
          <div className="max-w-4xl mx-auto px-6 py-12">
            <h2 className="text-2xl font-bold text-white mb-6">Project History</h2>
            <div className="space-y-3">
              {projects?.map((project: any) => (
                <div key={project.id} className="bg-[#16161f] rounded-2xl p-4 border border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{project.title}</p>
                    <p className="text-xs text-white/40">{project.chapterCount} chapters</p>
                  </div>
                  <Badge className={cn(
                    project.status === "completed" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                    project.status === "generating" ? "bg-violet-500/20 text-violet-400 border-violet-500/30" :
                    "bg-white/10 text-white/60 border-white/10"
                  )}>
                    {project.status}
                  </Badge>
                </div>
              ))}
              {(!projects || projects.length === 0) && (
                <div className="text-center py-12 text-white/40">
                  <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No projects yet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === "settings" && (
          <div className="max-w-4xl mx-auto px-6 py-12">
            <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
            <div className="bg-[#16161f] rounded-2xl p-6 border border-white/5">
              <p className="text-white/40">Settings coming soon...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
