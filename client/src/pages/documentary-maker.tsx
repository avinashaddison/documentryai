import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
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
  FileText,
  Volume2,
  Layers,
  ArrowRight,
  Settings,
  Search,
  ExternalLink,
  Users
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
  const [editingChapterIndex, setEditingChapterIndex] = useState<number | null>(null);
  const [editingChapterValue, setEditingChapterValue] = useState("");
  
  const [config, setConfig] = useState({
    narratorVoice: "narrator",
    storyLength: "medium",
    hookImageModel: "flux-1.1-pro",
    hookImageCount: 3,
    chapterImageModel: "flux-1.1-pro",
    imagesPerChapter: 5,
    imageStyle: "color" as "color" | "black-and-white",
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
    
    setFramework(null);
    setChapters([]);
    setGeneratedChapters([]);
    setResearchData(null);
    setCurrentStep("research");
    setProgress(2);
    
    const project = await createProjectMutation.mutateAsync({ 
      projectTitle: title, 
      chapterCount: totalChapters 
    });
    const id = project.id;
    setProjectId(id);
    
    // Update URL with project ID so refresh preserves the session
    navigate(`/create/${id}`, { replace: true });
    
    // Start research phase
    try {
      await fetch(`/api/projects/${id}/research`, { method: "POST" });
      
      // Poll for research completion
      let researchComplete = false;
      while (!researchComplete) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const researchRes = await fetch(`/api/projects/${id}/research`);
        const researchStatus = await researchRes.json();
        
        if (researchStatus.status === "completed") {
          setResearchData(researchStatus);
          researchComplete = true;
          setProgress(10);
        } else if (researchStatus.status === "failed") {
          console.error("Research failed:", researchStatus.error);
          researchComplete = true;
          setProgress(10);
        }
      }
    } catch (error) {
      console.error("Research error:", error);
    }
    
    setCurrentStep("framework");
    setProgress(12);
    
    const result = await generateFrameworkMutation.mutateAsync({ id, numChapters: totalChapters });
    setFramework(result.storedFramework);
    setProgress(18);
    
    setCurrentStep("outline");
    const outlineResult = await generateOutlineMutation.mutateAsync({ 
      id, 
      numChapters: totalChapters 
    });
    setChapters(outlineResult.chapters);
    setProgress(25);
    setCurrentStep("idle");
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
          
          // Load script content for chapters
          if (project.scriptContent?.chapters) {
            const chapterTitles = project.scriptContent.chapters.map((ch: any) => ch.title);
            setChapters(chapterTitles);
            setGeneratedChapters(project.scriptContent.chapters);
          }
          
          // Determine current step based on project status
          if (project.status === "RENDERED") {
            setCurrentStep("complete");
            setProgress(100);
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
            }),
          });
        } catch (error) {
          console.error("Failed to save session:", error);
        }
      };
      saveSession();
    }
  }, [projectId, currentStep, generatedImages, generatedAudio, generatedChapters]);

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
    if (projectId && framework) {
      const editorData = {
        projectId,
        title: framework.generatedTitle || title,
        chapters: generatedChapters,
        generatedImages,
        generatedAudio,
      };
      sessionStorage.setItem("documentaryEditorData", JSON.stringify(editorData));
      navigate("/documentary-editor");
    }
  };

  const isGenerating = currentStep !== "idle" && currentStep !== "complete";

  const voiceOptions = [
    { value: "narrator", label: "Mars - Narrator Voice" },
    { value: "male-deep", label: "Zeus - Deep & Trustworthy" },
    { value: "male-warm", label: "Arcas - Natural & Smooth" },
    { value: "female-soft", label: "Athena - Calm & Professional" },
    { value: "female-dramatic", label: "Luna - Friendly & Engaging" },
    { value: "neutral", label: "Asteria - Clear & Confident" },
  ];

  const chapterPresets = [
    { count: 3, label: "Short", duration: "5-8 min", color: "from-blue-500 to-cyan-500" },
    { count: 5, label: "Medium", duration: "15-20 min", color: "from-purple-500 to-pink-500" },
    { count: 8, label: "Long", duration: "30-45 min", color: "from-orange-500 to-red-500" },
    { count: 12, label: "Feature", duration: "60+ min", color: "from-green-500 to-emerald-500" },
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
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-500/10 via-amber-500/5 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

        <div className="relative z-10 max-w-5xl mx-auto py-8 px-4 space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-mono uppercase tracking-wider neon-border">
            <Sparkles className="h-3 w-3" />
            AI Documentary Studio
          </div>
          <h1 className="text-5xl font-display font-bold neon-text text-orange-400">
            Create Your Documentary
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            Enter a topic and let AI generate a complete documentary with narration, visuals, and professional editing.
          </p>
        </div>

        {/* Progress Steps */}
        {currentStep !== "idle" && (
          <div className="glass-panel-glow rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              {steps.map((step, i) => {
                const stepIndex = steps.findIndex(s => s.id === currentStep);
                const isActive = step.id === currentStep;
                const isComplete = i < stepIndex || currentStep === "complete";
                
                return (
                  <div key={step.id} className="flex items-center">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-300",
                      isComplete ? "bg-gradient-to-br from-green-400 to-emerald-600 text-white neon-glow" :
                      isActive ? "bg-gradient-to-br from-orange-400 to-amber-600 text-white animate-pulse-glow" :
                      "bg-card border border-border text-muted-foreground"
                    )}>
                      {isComplete ? <Check className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
                    </div>
                    {i < steps.length - 1 && (
                      <div className={cn(
                        "w-8 h-0.5 mx-2 rounded-full transition-all duration-300",
                        isComplete ? "bg-gradient-to-r from-green-400 to-emerald-600" : "bg-border"
                      )} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="relative h-3 bg-card rounded-full overflow-hidden border border-border">
              <div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 rounded-full transition-all duration-500 animate-shimmer"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-orange-300 mt-3 text-center font-medium">
              {currentStep === "research" && "Researching topic with Perplexity AI..."}
              {currentStep === "framework" && "Generating documentary framework with Claude..."}
              {currentStep === "outline" && "Creating chapter outline..."}
              {currentStep === "chapters" && `Generating chapter scripts (${generatedChapters.length}/${chapters.length})...`}
              {currentStep === "images" && (currentImageScene || "Generating scene images...")}
              {currentStep === "voiceover" && "Creating AI voiceover..."}
              {currentStep === "assembly" && "Assembling final video..."}
              {currentStep === "complete" && `Generation complete! ${Object.keys(generatedImages).length} images generated.`}
            </p>
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
              className="flex-1 h-14 bg-card/50 border-orange-500/30 text-white placeholder:text-muted-foreground rounded-xl focus:border-orange-400 focus:ring-orange-400/20 text-lg neon-input"
              disabled={isGenerating}
              data-testid="input-title"
            />
            <Button
              onClick={handleGenerateFramework}
              disabled={!title.trim() || isGenerating}
              className="h-14 px-10 gap-3 rounded-xl text-base font-bold bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-400 hover:via-amber-400 hover:to-orange-500 border-0 shadow-lg shadow-orange-500/40 hover:shadow-orange-500/60 hover:scale-105 transition-all duration-300 text-white"
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
            <Label className="text-sm text-amber-300 flex items-center gap-2">
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
                      setTotalChapters(preset.count);
                      const lengthMap: Record<number, string> = { 3: "short", 5: "medium", 8: "long", 12: "feature" };
                      setConfig({ ...config, storyLength: lengthMap[preset.count] || "medium" });
                    }}
                    disabled={isGenerating}
                    className={cn(
                      "relative group overflow-hidden rounded-xl p-5 transition-all duration-300",
                      "border",
                      isSelected 
                        ? "border-orange-400/60 bg-orange-500/10 scale-[1.02] neon-glow" 
                        : "border-border bg-card/50 hover:border-orange-500/40 hover:bg-card/80",
                      isGenerating && "opacity-50 cursor-not-allowed"
                    )}
                    data-testid={`button-chapter-${preset.count}`}
                  >
                    {/* Gradient background effect on hover/select */}
                    <div className={cn(
                      "absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300",
                      preset.color,
                      isSelected ? "opacity-15" : "group-hover:opacity-5"
                    )} />
                    
                    {/* Animated border glow */}
                    {isSelected && (
                      <div className="absolute inset-0 rounded-xl">
                        <div className={cn(
                          "absolute inset-0 rounded-xl bg-gradient-to-br blur-md opacity-40",
                          preset.color
                        )} />
                      </div>
                    )}
                    
                    {/* Content */}
                    <div className="relative z-10 text-center space-y-1">
                      <div className={cn(
                        "text-4xl font-bold transition-all duration-300",
                        isSelected ? "text-orange-400 scale-110 neon-text" : "text-white/70 group-hover:text-white"
                      )}>
                        {preset.count}
                      </div>
                      <div className={cn(
                        "text-xs font-semibold uppercase tracking-wider transition-colors",
                        isSelected ? "text-orange-300" : "text-muted-foreground group-hover:text-white/70"
                      )}>
                        {preset.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {preset.duration}
                      </div>
                    </div>
                    
                    {/* Selection indicator */}
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <div className={cn(
                          "w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center shadow-lg",
                          preset.color
                        )}>
                          <Check className="h-3.5 w-3.5 text-white" />
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
                  className="w-20 h-9 text-center bg-card/50 border-orange-500/30 text-white font-bold rounded-lg"
                  data-testid="input-custom-chapters"
                />
              </div>
              <span className="text-xs text-orange-300">
                chapters (~{Math.round(totalChapters * 3)} min)
              </span>
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
                      <span className="text-xs font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded flex-shrink-0">
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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center neon-glow-gold">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-xl font-display font-bold gradient-text">Generated Framework</h2>
              <Badge variant="outline" className="ml-auto text-xs bg-green-500/10 text-green-400 border-green-500/30 px-3 py-1">
                Claude Sonnet 4.5
              </Badge>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-amber-300">Title</Label>
              <h3 className="text-3xl font-display font-bold text-white neon-text-gold" data-testid="text-generated-title">
                {framework.generatedTitle}
              </h3>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-amber-300">Genres</Label>
              <div className="flex gap-2" data-testid="container-genres">
                {framework.genres?.map((genre, i) => (
                  <Badge key={i} className="bg-orange-500/20 text-orange-300 border border-orange-500/30 px-3 py-1">
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

        {/* Story Configuration */}
        {framework && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-display font-bold text-white">Story Configuration</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium text-white">Narrator Voice</Label>
                </div>
                <Select
                  value={config.narratorVoice}
                  onValueChange={(value) => setConfig({ ...config, narratorVoice: value })}
                >
                  <SelectTrigger className="w-full bg-background/50 border-border" data-testid="select-narrator-voice">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {voiceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium text-white">Image Model</Label>
                </div>
                <Select
                  value={config.hookImageModel}
                  onValueChange={(value) => setConfig({ ...config, hookImageModel: value, chapterImageModel: value })}
                >
                  <SelectTrigger className="w-full bg-background/50 border-border" data-testid="select-image-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {imageModelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium text-white">Image Style</Label>
                </div>
                <Select
                  value={config.imageStyle}
                  onValueChange={(value) => setConfig({ ...config, imageStyle: value as "color" | "black-and-white" })}
                >
                  <SelectTrigger className="w-full bg-background/50 border-border" data-testid="select-image-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="color">Color Images</SelectItem>
                    <SelectItem value="black-and-white">Black & White (Vintage)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium text-white">Images Per Scene</Label>
                  </div>
                  <span className="text-sm text-primary font-mono">{config.imagesPerChapter}</span>
                </div>
                <Slider
                  value={[config.imagesPerChapter]}
                  onValueChange={([value]) => setConfig({ ...config, imagesPerChapter: value })}
                  min={3}
                  max={10}
                  step={1}
                  className="cursor-pointer"
                  data-testid="slider-images-per-chapter"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium text-white">Scene Duration (seconds)</Label>
                  </div>
                  <span className="text-sm text-primary font-mono">{config.hookImageCount * 5}s avg</span>
                </div>
                <Slider
                  value={[config.hookImageCount]}
                  onValueChange={([value]) => setConfig({ ...config, hookImageCount: value })}
                  min={2}
                  max={8}
                  step={1}
                  className="cursor-pointer"
                  data-testid="slider-scene-duration"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-border flex gap-3">
              {currentStep === "complete" ? (
                <Button
                  onClick={handleContinueToEditor}
                  className="flex-1 h-12 gap-2 bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-lg font-semibold"
                  data-testid="button-continue-editor"
                >
                  <Film className="h-5 w-5" />
                  Continue to Video Editor
                </Button>
              ) : generatedChapters.length === 0 && chapters.length > 0 ? (
                <Button
                  onClick={handleGenerateAllChapters}
                  disabled={isGenerating}
                  className="flex-1 h-12 gap-2 bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-lg font-semibold"
                  data-testid="button-start-generation"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Generating Chapters...
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5" />
                      Start Full Generation
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {/* Generated Chapters Preview */}
        {generatedChapters.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Generated Scripts Preview
            </h2>
            
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {generatedChapters.map((chapter) => (
                <div key={chapter.chapterNumber} className="bg-background/50 rounded-lg p-4 border border-border">
                  <h3 className="font-bold text-white mb-2">
                    Chapter {chapter.chapterNumber}: {chapter.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {chapter.scenes.length} scenes • ~{Math.round(chapter.estimatedDuration / 60)} minutes
                  </p>
                  <p className="text-sm text-white/70 line-clamp-3">
                    {chapter.narration.substring(0, 300)}...
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generated Images Gallery */}
        {Object.keys(generatedImages).length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              Generated Scene Images ({Object.keys(generatedImages).length})
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto">
              {Object.entries(generatedImages).map(([key, url]) => (
                <div key={key} className="relative group rounded-lg overflow-hidden border border-border">
                  <img 
                    src={url} 
                    alt={key}
                    className="w-full aspect-video object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <span className="text-xs text-white/80 font-mono">{key}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Fixed Footer Logs Panel */}
      {currentStep !== "idle" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0d14] border-t border-white/10">
          <div className="max-w-7xl mx-auto">
            <div 
              className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-white/5"
              onClick={() => setShowLogs(!showLogs)}
              data-testid="button-toggle-logs"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-white uppercase tracking-wide">
                  Generation Logs ({generationLogs.length})
                </span>
              </div>
              <ChevronRight className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                showLogs ? "rotate-90" : "-rotate-90"
              )} />
            </div>
            {showLogs && (
              <div className="bg-black/80 px-4 pb-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1" data-testid="logs-panel">
                {generationLogs.length === 0 ? (
                  <p className="text-muted-foreground py-2">Waiting for logs...</p>
                ) : (
                  generationLogs.map((log) => (
                    <div key={log.id} className="flex gap-2 py-0.5">
                      <span className="text-muted-foreground shrink-0">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                      <span className={cn(
                        "shrink-0 px-1 rounded text-[10px]",
                        log.status === "started" ? "bg-blue-500/20 text-blue-400" :
                        log.status === "completed" ? "bg-green-500/20 text-green-400" :
                        log.status === "failed" ? "bg-red-500/20 text-red-400" :
                        "bg-yellow-500/20 text-yellow-400"
                      )}>
                        {log.status}
                      </span>
                      <span className="text-white/80 break-all">{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </WorkspaceSidebar>
  );
}
