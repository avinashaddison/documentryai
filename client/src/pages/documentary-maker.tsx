import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";

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

type GenerationStep = "idle" | "framework" | "outline" | "chapters" | "images" | "voiceover" | "assembly" | "complete";

export default function DocumentaryMaker() {
  const [, navigate] = useLocation();
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
    narratorVoice: "male-deep",
    storyLength: "medium",
    hookImageModel: "flux-1.1-pro",
    hookImageCount: 3,
    chapterImageModel: "flux-1.1-pro",
    imagesPerChapter: 5,
  });

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
    setCurrentStep("framework");
    setProgress(5);
    
    const project = await createProjectMutation.mutateAsync({ 
      projectTitle: title, 
      chapterCount: totalChapters 
    });
    const id = project.id;
    setProjectId(id);
    
    const result = await generateFrameworkMutation.mutateAsync({ id, numChapters: totalChapters });
    setFramework(result.storedFramework);
    setProgress(15);
    
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
    mutationFn: async ({ id, chapterNumber, scenes, model }: { 
      id: number; 
      chapterNumber: number; 
      scenes: Array<{ sceneNumber: number; imagePrompt: string }>;
      model: string;
    }) => {
      const res = await fetch(`/api/projects/${id}/generate-chapter-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterNumber, scenes, model }),
      });
      if (!res.ok) throw new Error("Failed to generate images");
      return res.json();
    },
  });

  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [currentImageScene, setCurrentImageScene] = useState("");

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
        const imageResult = await generateImagesMutation.mutateAsync({
          id: projectId,
          chapterNumber: chapter.chapterNumber,
          scenes: chapter.scenes.map(s => ({
            sceneNumber: s.sceneNumber,
            imagePrompt: s.imagePrompt,
          })),
          model: config.hookImageModel,
        });
        
        imageResult.results.forEach((r: any) => {
          if (r.success && r.imageUrl) {
            setGeneratedImages(prev => ({
              ...prev,
              [`ch${chapter.chapterNumber}_sc${r.sceneNumber}`]: r.imageUrl,
            }));
          }
        });
      } catch (error) {
        console.error(`Failed to generate images for chapter ${i + 1}:`, error);
      }
      
      setProgress(imageProgress);
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
      };
      sessionStorage.setItem("documentaryEditorData", JSON.stringify(editorData));
      navigate("/documentary-editor");
    }
  };

  const isGenerating = currentStep !== "idle" && currentStep !== "complete";

  const voiceOptions = [
    { value: "male-deep", label: "Male - Deep & Dramatic" },
    { value: "male-warm", label: "Male - Warm & Authoritative" },
    { value: "female-soft", label: "Female - Soft & Mysterious" },
    { value: "female-dramatic", label: "Female - Dramatic Narrator" },
    { value: "neutral", label: "Neutral - Documentary Style" },
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
    { id: "framework", label: "Framework", icon: FileText },
    { id: "outline", label: "Outline", icon: BookOpen },
    { id: "chapters", label: "Chapters", icon: Layers },
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

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      
      <header className="relative z-10 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button 
              onClick={() => navigate("/")}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
                <Film className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">DocuAI</span>
            </div>
            <div className="w-16" />
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-5xl mx-auto py-8 px-4 space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-mono uppercase tracking-wider">
            <Film className="h-3 w-3" />
            AI Documentary Maker
          </div>
          <h1 className="text-4xl font-display font-bold text-white">
            Create Your Documentary
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Enter a topic and let AI generate a complete documentary with narration, visuals, and professional editing.
          </p>
        </div>

        {/* Progress Steps */}
        {currentStep !== "idle" && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              {steps.map((step, i) => {
                const stepIndex = steps.findIndex(s => s.id === currentStep);
                const isActive = step.id === currentStep;
                const isComplete = i < stepIndex || currentStep === "complete";
                
                return (
                  <div key={step.id} className="flex items-center">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                      isComplete ? "bg-green-500 text-white" :
                      isActive ? "bg-primary text-white animate-pulse" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {isComplete ? <Check className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
                    </div>
                    {i < steps.length - 1 && (
                      <ChevronRight className={cn(
                        "h-4 w-4 mx-2",
                        isComplete ? "text-green-500" : "text-muted-foreground"
                      )} />
                    )}
                  </div>
                );
              })}
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2 text-center">
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
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <Label className="text-sm font-medium text-white">Documentary Topic</Label>
          <div className="flex gap-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., The Dark Secrets of the Woolworth Mansion..."
              className="flex-1 h-12 bg-background/50 border-border text-white placeholder:text-muted-foreground"
              disabled={isGenerating}
              data-testid="input-title"
            />
            <Button
              onClick={handleGenerateFramework}
              disabled={!title.trim() || isGenerating}
              className="h-12 px-6 gap-2 bg-primary hover:bg-primary/90"
              data-testid="button-generate-framework"
            >
              {isGenerating && currentStep !== "chapters" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate Framework
                </>
              )}
            </Button>
          </div>
          
          {/* Chapter Count Selector with Visual Boxes */}
          <div className="space-y-3">
            <Label className="text-sm text-muted-foreground flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Number of Chapters
            </Label>
            
            {/* Preset Chapter Boxes */}
            <div className="grid grid-cols-4 gap-3">
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
                      "relative group overflow-hidden rounded-xl p-4 transition-all duration-300",
                      "border-2",
                      isSelected 
                        ? "border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/20" 
                        : "border-border bg-card hover:border-primary/50 hover:bg-card/80",
                      isGenerating && "opacity-50 cursor-not-allowed"
                    )}
                    data-testid={`button-chapter-${preset.count}`}
                  >
                    {/* Gradient background effect on hover/select */}
                    <div className={cn(
                      "absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300",
                      preset.color,
                      isSelected ? "opacity-10" : "group-hover:opacity-5"
                    )} />
                    
                    {/* Animated border glow */}
                    {isSelected && (
                      <div className="absolute inset-0 rounded-xl animate-pulse">
                        <div className={cn(
                          "absolute inset-0 rounded-xl bg-gradient-to-br blur-sm opacity-30",
                          preset.color
                        )} />
                      </div>
                    )}
                    
                    {/* Content */}
                    <div className="relative z-10 text-center space-y-1">
                      <div className={cn(
                        "text-3xl font-bold transition-all duration-300",
                        isSelected ? "text-white scale-110" : "text-white/70 group-hover:text-white"
                      )}>
                        {preset.count}
                      </div>
                      <div className={cn(
                        "text-xs font-medium uppercase tracking-wider transition-colors",
                        isSelected ? "text-primary" : "text-muted-foreground group-hover:text-white/70"
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
                          "w-5 h-5 rounded-full bg-gradient-to-br flex items-center justify-center",
                          preset.color
                        )}>
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            
            {/* Custom Chapter Input */}
            <div className="flex items-center gap-3 pt-2">
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
                  className="w-20 h-9 text-center bg-background/50 border-border text-white font-bold"
                  data-testid="input-custom-chapters"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                chapters (~{Math.round(totalChapters * 3)} min)
              </span>
            </div>
          </div>
        </div>

        {/* Generated Framework Display */}
        {framework && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-display font-bold text-white">Generated Framework</h2>
              <Badge variant="outline" className="ml-2 text-xs bg-green-500/10 text-green-400 border-green-500/20">
                Claude Sonnet 4.5
              </Badge>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Title</Label>
              <h3 className="text-2xl font-display font-bold text-white" data-testid="text-generated-title">
                {framework.generatedTitle}
              </h3>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Genres</Label>
              <div className="flex gap-2" data-testid="container-genres">
                {framework.genres?.map((genre, i) => (
                  <Badge key={i} variant="secondary" className="bg-primary/20 text-primary border-0">
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
    </div>
  );
}
