import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Loader2,
  Check,
  Play,
  Image as ImageIcon,
  Volume2,
  Film,
  ChevronRight,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  Wand2,
  Mic,
  Video,
  FileText,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "setup" | "review" | "generating" | "complete";
type GenerationStep = "framework" | "outline" | "chapters" | "images" | "voice" | "video" | "done";

interface StoryFramework {
  id: number;
  projectId: number;
  generatedTitle: string | null;
  genres: string[] | null;
  premise: string | null;
  openingHook: string | null;
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
  chapterNumber: number;
  sceneNumber: number;
  imageStatus: "pending" | "generating" | "complete" | "error";
  voiceStatus: "pending" | "generating" | "complete" | "error";
  imageUrl?: string;
  audioUrl?: string;
}

interface LogEntry {
  id: string; // Use string to handle both local and backend IDs
  timestamp: Date;
  step: string;
  message: string;
  status: "info" | "success" | "error" | "progress";
  isLocal?: boolean; // Track local vs backend logs
}

export default function Autopilot() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("setup");
  const [topic, setTopic] = useState("");
  const [chapterCount, setChapterCount] = useState(5);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [framework, setFramework] = useState<StoryFramework | null>(null);
  const [chapters, setChapters] = useState<string[]>([]);
  const [generatedChapters, setGeneratedChapters] = useState<ChapterScript[]>([]);
  const [currentStep, setCurrentStep] = useState<GenerationStep>("framework");
  const [overallProgress, setOverallProgress] = useState(0);
  const [sceneStatuses, setSceneStatuses] = useState<SceneStatus[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastLogIdRef = useRef<number>(0);

  // Load topic from sessionStorage on mount
  useEffect(() => {
    const savedTopic = sessionStorage.getItem("documentaryTopic");
    if (savedTopic) {
      setTopic(savedTopic);
      sessionStorage.removeItem("documentaryTopic");
    }
  }, []);

  const [config] = useState({
    narratorVoice: "aura-2-mars-en",
    imageModel: "flux-1.1-pro",
    imageStyle: "color" as "color" | "black-and-white",
  });

  const addLog = (step: string, message: string, status: LogEntry["status"] = "info", backendId?: number) => {
    const newLog: LogEntry = {
      id: backendId ? `backend_${backendId}` : `local_${Date.now()}`,
      timestamp: new Date(),
      step,
      message,
      status,
      isLocal: !backendId,
    };
    setLogs(prev => {
      // Prevent duplicates by checking if this ID already exists
      if (prev.some(l => l.id === newLog.id)) {
        return prev;
      }
      return [...prev, newLog];
    });
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: topic,
          chapterCount,
          voiceEnabled: true,
          imageModel: config.imageModel,
          scriptModel: "claude-sonnet-4-5",
        }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      return res.json();
    },
  });

  const generateFrameworkMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/projects/${id}/documentary/generate-framework`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyLength: "medium", totalChapters: chapterCount }),
      });
      if (!res.ok) throw new Error("Failed to generate framework");
      return res.json();
    },
  });

  const generateOutlineMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/projects/${id}/documentary/generate-outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalChapters: chapterCount }),
      });
      if (!res.ok) throw new Error("Failed to generate outline");
      return res.json();
    },
  });

  const generateChapterMutation = useMutation({
    mutationFn: async ({ id, chapterNumber, chapterTitle }: { id: number; chapterNumber: number; chapterTitle: string }) => {
      const res = await fetch(`/api/projects/${id}/documentary/generate-chapter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterNumber, totalChapters: chapterCount, chapterTitle }),
      });
      if (!res.ok) throw new Error("Failed to generate chapter");
      return res.json();
    },
  });

  const handleSetupSubmit = async () => {
    if (!topic.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    addLog("setup", "Creating project...", "info");

    try {
      const project = await createProjectMutation.mutateAsync();
      setProjectId(project.id);
      addLog("setup", `Project created: ${topic}`, "success");

      addLog("framework", "Generating story framework with AI...", "progress");
      const frameworkData = await generateFrameworkMutation.mutateAsync(project.id);
      setFramework(frameworkData.framework);
      addLog("framework", "Story framework generated", "success");

      addLog("outline", "Creating chapter outline...", "progress");
      const outlineData = await generateOutlineMutation.mutateAsync(project.id);
      setChapters(outlineData.chapters || []);
      addLog("outline", `Generated ${outlineData.chapters?.length || chapterCount} chapter titles`, "success");

      setPhase("review");
      setIsGenerating(false);
    } catch (err: any) {
      setError(err.message);
      addLog("error", err.message, "error");
      setIsGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!projectId || !framework) return;

    setPhase("generating");
    setIsGenerating(true);
    setCurrentStep("chapters");
    addLog("approved", "Generation approved! Starting full autopilot...", "success");

    try {
      // Generate all chapter scripts
      const allChapters: ChapterScript[] = [];
      for (let i = 0; i < chapters.length; i++) {
        addLog("chapters", `Writing Chapter ${i + 1}: ${chapters[i]}...`, "progress");
        setOverallProgress(Math.round((i / chapters.length) * 20));

        const chapterData = await generateChapterMutation.mutateAsync({
          id: projectId,
          chapterNumber: i + 1,
          chapterTitle: chapters[i],
        });
        
        allChapters.push(chapterData.chapter);
        setGeneratedChapters([...allChapters]);
        addLog("chapters", `Chapter ${i + 1} complete`, "success");
      }

      // Initialize scene statuses
      const scenes: SceneStatus[] = [];
      allChapters.forEach(ch => {
        ch.scenes.forEach(sc => {
          scenes.push({
            chapterNumber: ch.chapterNumber,
            sceneNumber: sc.sceneNumber,
            imageStatus: "pending",
            voiceStatus: "pending",
          });
        });
      });
      setSceneStatuses(scenes);

      // Start autopilot generation
      setCurrentStep("images");
      addLog("autopilot", "Starting image and voice generation...", "progress");
      setOverallProgress(25);

      const autopilotRes = await fetch(`/api/projects/${projectId}/documentary/autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapters: allChapters,
          voice: config.narratorVoice,
          imageModel: config.imageModel,
          imageStyle: config.imageStyle,
        }),
      });

      if (!autopilotRes.ok) throw new Error("Autopilot generation failed");

      // Poll for progress
      startProgressPolling(projectId);

    } catch (err: any) {
      setError(err.message);
      addLog("error", err.message, "error");
      setIsGenerating(false);
    }
  };

  const startProgressPolling = (id: number) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${id}/documentary/status`);
        if (!res.ok) return;

        const data = await res.json();
        
        // Update scene statuses from assets
        if (data.assets && data.assets.length > 0) {
          setSceneStatuses(prev => {
            const updated = [...prev];
            for (const asset of data.assets) {
              const idx = updated.findIndex(
                s => s.chapterNumber === asset.chapterNumber && s.sceneNumber === asset.sceneNumber
              );
              if (idx >= 0) {
                if (asset.assetType === "image") {
                  updated[idx].imageStatus = asset.status === "completed" ? "complete" : asset.status;
                  updated[idx].imageUrl = asset.assetUrl;
                } else if (asset.assetType === "audio") {
                  updated[idx].voiceStatus = asset.status === "completed" ? "complete" : asset.status;
                  updated[idx].audioUrl = asset.assetUrl;
                }
              }
            }
            return updated;
          });

          // Use server-calculated progress for reliability
          if (typeof data.overallProgress === "number") {
            setOverallProgress(data.overallProgress);
          }

          // Update current step based on assets
          const imageAssets = data.assets.filter((a: any) => a.assetType === "image" && a.status === "completed");
          const audioAssets = data.assets.filter((a: any) => a.assetType === "audio" && a.status === "completed");
          const totalScenes = data.session?.totalScenes || 1;
          if (imageAssets.length < totalScenes) {
            setCurrentStep("images");
          } else if (audioAssets.length < totalScenes) {
            setCurrentStep("voice");
          } else {
            setCurrentStep("video");
          }
        }

        // Update logs - only add new ones based on ID
        if (data.logs && data.logs.length > 0) {
          const newLogs = data.logs.filter((log: any) => log.id > lastLogIdRef.current);
          if (newLogs.length > 0) {
            lastLogIdRef.current = Math.max(...newLogs.map((l: any) => l.id));
            for (const log of newLogs) {
              addLog(log.step, log.message || "", log.status === "completed" ? "success" : "progress", log.id);
            }
          }
        }

        // Check for completion or failure
        if (data.session?.status === "completed") {
          clearInterval(pollingRef.current!);
          setCurrentStep("done");
          setOverallProgress(100);
          setPhase("complete");
          setIsGenerating(false);
          addLog("complete", "Documentary generation complete!", "success");

          if (data.videoPath) {
            setExportedVideoUrl(data.videoPath);
          }
        } else if (data.session?.status === "failed") {
          clearInterval(pollingRef.current!);
          setError(data.session.errorMessage || "Generation failed");
          addLog("error", data.session.errorMessage || "Generation failed", "error");
          setIsGenerating(false);
        }

      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const getStepIcon = (step: GenerationStep) => {
    const icons: Record<GenerationStep, any> = {
      framework: FileText,
      outline: Layers,
      chapters: FileText,
      images: ImageIcon,
      voice: Mic,
      video: Video,
      done: CheckCircle2,
    };
    return icons[step] || Sparkles;
  };

  const getStepStatus = (step: GenerationStep) => {
    const steps: GenerationStep[] = ["framework", "outline", "chapters", "images", "voice", "video", "done"];
    const currentIdx = steps.indexOf(currentStep);
    const stepIdx = steps.indexOf(step);
    
    if (stepIdx < currentIdx) return "complete";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white">
      {/* Header */}
      <header className="border-b border-orange-500/20 bg-black/50 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
                Petr AI Autopilot
              </h1>
              <p className="text-xs text-gray-400">Fully automated documentary generation</p>
            </div>
          </div>
          {projectId && (
            <Badge variant="outline" className="border-orange-500/50 text-orange-400">
              Project #{projectId}
            </Badge>
          )}
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Phase: Setup */}
        {phase === "setup" && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center">
                <Wand2 className="w-10 h-10 text-orange-400" />
              </div>
              <h2 className="text-3xl font-bold">Create Your Documentary</h2>
              <p className="text-gray-400">Enter your topic and we'll handle everything automatically</p>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 space-y-6">
              <div className="space-y-3">
                <Label htmlFor="topic" className="text-lg">Documentary Topic</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., The Rise and Fall of Ancient Rome"
                  className="h-14 text-lg bg-black/50 border-gray-700 focus:border-orange-500"
                  data-testid="input-topic"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-lg">Number of Chapters</Label>
                <Select value={String(chapterCount)} onValueChange={(v) => setChapterCount(Number(v))}>
                  <SelectTrigger className="h-14 text-lg bg-black/50 border-gray-700" data-testid="select-chapters">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 Chapters (Short ~5 min)</SelectItem>
                    <SelectItem value="5">5 Chapters (Medium ~10 min)</SelectItem>
                    <SelectItem value="8">8 Chapters (Long ~20 min)</SelectItem>
                    <SelectItem value="12">12 Chapters (Feature ~30 min)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleSetupSubmit}
                disabled={!topic.trim() || isGenerating}
                className="w-full h-14 text-lg bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/30"
                data-testid="button-generate-plan"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating Plan...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Generate Plan
                  </>
                )}
              </Button>
            </div>

            {/* Logs during setup */}
            {logs.length > 0 && (
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-400 mb-3">Generation Log</h3>
                <ScrollArea className="h-32">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 text-sm py-1">
                      {log.status === "success" && <Check className="w-4 h-4 text-green-400 mt-0.5" />}
                      {log.status === "progress" && <Loader2 className="w-4 h-4 text-orange-400 animate-spin mt-0.5" />}
                      {log.status === "error" && <AlertCircle className="w-4 h-4 text-red-400 mt-0.5" />}
                      {log.status === "info" && <Clock className="w-4 h-4 text-gray-400 mt-0.5" />}
                      <span className={cn(
                        log.status === "error" && "text-red-400",
                        log.status === "success" && "text-green-400",
                        log.status === "progress" && "text-orange-400",
                        log.status === "info" && "text-gray-300"
                      )}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {/* Phase: Review */}
        {phase === "review" && framework && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Review Your Documentary Plan</h2>
              <p className="text-gray-400">Approve to start fully automated generation</p>
            </div>

            <div className="grid gap-6">
              {/* Title Card */}
              <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/30 rounded-2xl p-6">
                <Label className="text-orange-400 text-sm uppercase tracking-wider">Generated Title</Label>
                <h3 className="text-2xl font-bold mt-2">{framework.generatedTitle || topic}</h3>
                {framework.genres && framework.genres.length > 0 && (
                  <div className="flex gap-2 mt-3">
                    {framework.genres.map((g, i) => (
                      <Badge key={i} variant="outline" className="border-orange-500/50 text-orange-300">
                        {g}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Hook & Premise */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                  <Label className="text-amber-400 text-sm uppercase tracking-wider">Opening Hook</Label>
                  <p className="text-gray-300 mt-2 leading-relaxed">{framework.openingHook || "Compelling hook will open your documentary..."}</p>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                  <Label className="text-amber-400 text-sm uppercase tracking-wider">Premise</Label>
                  <p className="text-gray-300 mt-2 leading-relaxed">{framework.premise || "The central theme of your documentary..."}</p>
                </div>
              </div>

              {/* Chapter Outline */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <Label className="text-amber-400 text-sm uppercase tracking-wider mb-4 block">Chapter Outline</Label>
                <div className="space-y-2">
                  {chapters.map((ch, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-black/30 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm">
                        {i + 1}
                      </div>
                      <span className="text-gray-200">{ch}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Approve Button */}
              <Button
                onClick={handleApprove}
                className="w-full h-16 text-xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/30"
                data-testid="button-approve"
              >
                <Check className="mr-3 h-6 w-6" />
                Yes, Approved - Start Generation
              </Button>
            </div>
          </div>
        )}

        {/* Phase: Generating */}
        {(phase === "generating" || phase === "complete") && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left: Timeline */}
            <div className="lg:col-span-2 space-y-6">
              {/* Progress Header */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold">Generation Progress</h3>
                  <Badge className={cn(
                    "text-sm",
                    phase === "complete" ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-orange-500/20 text-orange-400 border-orange-500/50"
                  )}>
                    {phase === "complete" ? "Complete" : `${overallProgress}%`}
                  </Badge>
                </div>
                <Progress value={overallProgress} className="h-3 bg-gray-800" />
                
                {/* Step indicators */}
                <div className="flex justify-between mt-6">
                  {(["chapters", "images", "voice", "video", "done"] as GenerationStep[]).map((step) => {
                    const status = getStepStatus(step);
                    const Icon = getStepIcon(step);
                    return (
                      <div key={step} className="flex flex-col items-center gap-2">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                          status === "complete" && "bg-green-500/20 text-green-400",
                          status === "active" && "bg-orange-500/20 text-orange-400 animate-pulse",
                          status === "pending" && "bg-gray-800 text-gray-500"
                        )}>
                          {status === "complete" ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                        </div>
                        <span className={cn(
                          "text-xs capitalize",
                          status === "complete" && "text-green-400",
                          status === "active" && "text-orange-400",
                          status === "pending" && "text-gray-500"
                        )}>
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-bold mb-4">Timeline</h3>
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {sceneStatuses.map((scene, idx) => (
                      <div 
                        key={`${scene.chapterNumber}-${scene.sceneNumber}`}
                        className={cn(
                          "flex items-center gap-4 p-3 rounded-lg transition-all",
                          (scene.imageStatus === "generating" || scene.voiceStatus === "generating") && "bg-orange-500/10 border border-orange-500/30",
                          scene.imageStatus === "complete" && scene.voiceStatus === "complete" && "bg-green-500/5 border border-green-500/20",
                          scene.imageStatus === "pending" && scene.voiceStatus === "pending" && "bg-gray-800/50"
                        )}
                      >
                        {/* Thumbnail */}
                        <div className="w-16 h-10 rounded bg-gray-800 overflow-hidden flex-shrink-0">
                          {scene.imageUrl ? (
                            <img src={scene.imageUrl} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-5 h-5 text-gray-600" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Chapter {scene.chapterNumber}, Scene {scene.sceneNumber}</p>
                        </div>

                        {/* Status badges */}
                        <div className="flex gap-2">
                          <Badge variant="outline" className={cn(
                            "text-xs",
                            scene.imageStatus === "complete" && "border-green-500/50 text-green-400",
                            scene.imageStatus === "generating" && "border-orange-500/50 text-orange-400",
                            scene.imageStatus === "pending" && "border-gray-600 text-gray-500"
                          )}>
                            <ImageIcon className="w-3 h-3 mr-1" />
                            {scene.imageStatus === "generating" && <Loader2 className="w-3 h-3 animate-spin" />}
                            {scene.imageStatus === "complete" && <Check className="w-3 h-3" />}
                          </Badge>
                          <Badge variant="outline" className={cn(
                            "text-xs",
                            scene.voiceStatus === "complete" && "border-green-500/50 text-green-400",
                            scene.voiceStatus === "generating" && "border-orange-500/50 text-orange-400",
                            scene.voiceStatus === "pending" && "border-gray-600 text-gray-500"
                          )}>
                            <Mic className="w-3 h-3 mr-1" />
                            {scene.voiceStatus === "generating" && <Loader2 className="w-3 h-3 animate-spin" />}
                            {scene.voiceStatus === "complete" && <Check className="w-3 h-3" />}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Right: Logs + Actions */}
            <div className="space-y-6">
              {/* Completion Card */}
              {phase === "complete" && (
                <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl p-6 text-center">
                  <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-green-400 mb-2">Task Completed!</h3>
                  <p className="text-gray-300 mb-4">Your documentary has been generated successfully</p>
                  
                  <div className="space-y-3">
                    <Button
                      onClick={() => navigate("/editor")}
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                      data-testid="button-open-editor"
                    >
                      <Film className="mr-2 h-4 w-4" />
                      Open in Editor
                    </Button>
                    {exportedVideoUrl && (
                      <Button
                        variant="outline"
                        className="w-full border-green-500/50 text-green-400 hover:bg-green-500/10"
                        asChild
                        data-testid="button-download"
                      >
                        <a href={exportedVideoUrl} download>
                          <Download className="mr-2 h-4 w-4" />
                          Download Video
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Live Logs */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <RefreshCw className={cn("w-4 h-4", isGenerating && "animate-spin")} />
                  Live Generation Log
                </h3>
                <ScrollArea className="h-80">
                  <div className="space-y-1 font-mono text-xs">
                    {logs.map((log) => (
                      <div key={log.id} className="flex gap-2 py-1">
                        <span className="text-gray-500">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        <span className={cn(
                          log.status === "error" && "text-red-400",
                          log.status === "success" && "text-green-400",
                          log.status === "progress" && "text-orange-400",
                          log.status === "info" && "text-gray-400"
                        )}>
                          [{log.step}]
                        </span>
                        <span className="text-gray-300">{log.message}</span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </ScrollArea>
              </div>

              {/* Error display */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">Error</span>
                  </div>
                  <p className="text-red-300 mt-2 text-sm">{error}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
