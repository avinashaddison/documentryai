import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
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
  Settings, 
  Mic, 
  Clock, 
  Image as ImageIcon,
  Hash,
  Check,
  Wand2,
  Film
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

export default function FilmMaker() {
  const [, navigate] = useLocation();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [framework, setFramework] = useState<StoryFramework | null>(null);
  
  const [config, setConfig] = useState({
    narratorVoice: "male-deep",
    storyLength: "medium",
    hookImageModel: "flux-1.1-pro",
    hookImageCount: 3,
    chapterImageModel: "flux-1.1-pro",
    imagesPerChapter: 5,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (projectTitle: string) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle,
          chapterCount: 3,
          voiceEnabled: true,
          imageModel: "flux-1.1-pro",
          scriptModel: "claude-sonnet-4-5",
        }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      return res.json();
    },
  });

  const generateFrameworkMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/projects/${id}/framework/generate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate framework");
      return res.json();
    },
    onSuccess: (data) => {
      setFramework(data);
    },
  });

  const updateFrameworkMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<StoryFramework> }) => {
      const res = await fetch(`/api/projects/${id}/framework`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update framework");
      return res.json();
    },
  });

  const approveFrameworkMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/projects/${id}/framework/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to approve framework");
      return res.json();
    },
    onSuccess: () => {
      if (projectId) {
        navigate(`/editor/${projectId}`);
      }
    },
  });

  const handleGenerateFramework = async () => {
    if (!title.trim()) return;
    
    let id: number;
    if (projectId) {
      id = projectId;
    } else {
      const project = await createProjectMutation.mutateAsync(title);
      id = project.id;
      setProjectId(id);
    }
    
    await generateFrameworkMutation.mutateAsync(id);
  };

  const handleApprove = async () => {
    if (!projectId || !framework) return;
    
    await updateFrameworkMutation.mutateAsync({
      id: projectId,
      updates: config,
    });
    
    await approveFrameworkMutation.mutateAsync(projectId);
  };

  const isGenerating = createProjectMutation.isPending || generateFrameworkMutation.isPending;

  const voiceOptions = [
    { value: "male-deep", label: "Male - Deep" },
    { value: "male-warm", label: "Male - Warm" },
    { value: "female-soft", label: "Female - Soft" },
    { value: "female-dramatic", label: "Female - Dramatic" },
    { value: "neutral", label: "Neutral - Documentary" },
  ];

  const storyLengthOptions = [
    { value: "short", label: "Short (2-3 min)" },
    { value: "medium", label: "Medium (5-7 min)" },
    { value: "long", label: "Long (10-15 min)" },
    { value: "feature", label: "Feature (20+ min)" },
  ];

  const imageModelOptions = [
    { value: "flux-1.1-pro", label: "Flux 1.1 Pro" },
    { value: "ideogram-v3-turbo", label: "Ideogram V3 Turbo" },
    { value: "flux-schnell", label: "Flux Schnell (Fast)" },
  ];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-mono uppercase tracking-wider">
            <Film className="h-3 w-3" />
            AI Film Maker
          </div>
          <h1 className="text-4xl font-display font-bold text-white">
            Create Your Film
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Enter a title and let Claude generate your story framework. Then configure the visual and audio settings.
          </p>
        </div>

        {/* Title Input Section */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <Label className="text-sm font-medium text-white">Film Title</Label>
          <div className="flex gap-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter your film title or concept..."
              className="flex-1 h-12 bg-background/50 border-border text-white placeholder:text-muted-foreground"
              data-testid="input-title"
            />
            <Button
              onClick={handleGenerateFramework}
              disabled={!title.trim() || isGenerating}
              className="h-12 px-6 gap-2 bg-primary hover:bg-primary/90"
              data-testid="button-generate-framework"
            >
              {isGenerating ? (
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
        </div>

        {/* Generated Framework Display */}
        {framework && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-display font-bold text-white">Generated Framework</h2>
              <Badge variant="outline" className="ml-2 text-xs bg-green-500/10 text-green-400 border-green-500/20">
                Claude 3.5 Sonnet
              </Badge>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Title</Label>
              <h3 className="text-2xl font-display font-bold text-white" data-testid="text-generated-title">
                {framework.generatedTitle}
              </h3>
            </div>

            {/* Genres */}
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

            {/* Premise */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Premise</Label>
              <p className="text-white/90 leading-relaxed" data-testid="text-premise">
                {framework.premise}
              </p>
            </div>

            {/* Opening Hook */}
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

        {/* Story Configuration */}
        {framework && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-display font-bold text-white">Story Configuration</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Narrator Voice */}
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

              {/* Story Length */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium text-white">Story Length</Label>
                </div>
                <Select
                  value={config.storyLength}
                  onValueChange={(value) => setConfig({ ...config, storyLength: value })}
                >
                  <SelectTrigger className="w-full bg-background/50 border-border" data-testid="select-story-length">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storyLengthOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Hook Image Model */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium text-white">Hook Image Model</Label>
                </div>
                <Select
                  value={config.hookImageModel}
                  onValueChange={(value) => setConfig({ ...config, hookImageModel: value })}
                >
                  <SelectTrigger className="w-full bg-background/50 border-border" data-testid="select-hook-image-model">
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

              {/* Number of Hook Images */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium text-white">Number of Hook Images</Label>
                  </div>
                  <span className="text-sm text-primary font-mono">{config.hookImageCount}</span>
                </div>
                <Slider
                  value={[config.hookImageCount]}
                  onValueChange={([value]) => setConfig({ ...config, hookImageCount: value })}
                  min={1}
                  max={10}
                  step={1}
                  className="cursor-pointer"
                  data-testid="slider-hook-image-count"
                />
              </div>

              {/* Chapter Image Model */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium text-white">Chapter Image Model</Label>
                </div>
                <Select
                  value={config.chapterImageModel}
                  onValueChange={(value) => setConfig({ ...config, chapterImageModel: value })}
                >
                  <SelectTrigger className="w-full bg-background/50 border-border" data-testid="select-chapter-image-model">
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

              {/* Images Per Chapter */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium text-white">Images Per Chapter</Label>
                  </div>
                  <span className="text-sm text-primary font-mono">{config.imagesPerChapter}</span>
                </div>
                <Slider
                  value={[config.imagesPerChapter]}
                  onValueChange={([value]) => setConfig({ ...config, imagesPerChapter: value })}
                  min={1}
                  max={15}
                  step={1}
                  className="cursor-pointer"
                  data-testid="slider-images-per-chapter"
                />
              </div>

            </div>

            {/* Approve Button */}
            <div className="pt-4 border-t border-border">
              <Button
                onClick={handleApprove}
                disabled={approveFrameworkMutation.isPending || updateFrameworkMutation.isPending}
                className="w-full h-12 gap-2 bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-lg font-semibold"
                data-testid="button-approve-continue"
              >
                {approveFrameworkMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5" />
                    Approve and Continue
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
