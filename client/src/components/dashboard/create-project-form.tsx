import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Wand2, Mic, ImageIcon, Clapperboard, Loader2, Sparkles, BrainCircuit } from "lucide-react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";

const formSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  chapterCount: z.number().min(1).max(50),
  voiceEnabled: z.boolean().default(true),
  imageModel: z.enum(["ideogram-v3", "flux-pro"]),
  scriptModel: z.enum(["claude-3-5", "gpt-5"]),
});

export function CreateProjectForm() {
  const [, setLocation] = useLocation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      chapterCount: 5,
      voiceEnabled: true,
      imageModel: "ideogram-v3",
      scriptModel: "claude-3-5",
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async (project) => {
      await fetch(`/api/projects/${project.id}/generate`, { method: "POST" });
      setLocation(`/editor/${project.id}`);
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createProjectMutation.mutate(values);
  }

  return (
    <Card className="w-full max-w-2xl mx-auto glass-panel border-white/10 shadow-2xl relative overflow-hidden" data-testid="card-create-project">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-50" />
      
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <Clapperboard className="h-6 w-6 text-primary" />
          Start New Production
        </CardTitle>
        <CardDescription>
          Configure your AI video generation pipeline.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Title</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g. The Last Cyberpunk City" 
                      className="bg-secondary/50 border-white/10 focus:border-primary/50 text-lg py-6"
                      data-testid="input-title"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="chapterCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Story Length</FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(parseInt(val))} 
                      defaultValue={field.value.toString()}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-secondary/50 border-white/10" data-testid="select-chapters">
                          <SelectValue placeholder="Select chapters" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">1 Chapter (Short)</SelectItem>
                        <SelectItem value="5">5 Chapters (Standard)</SelectItem>
                        <SelectItem value="9">9 Chapters (Extended)</SelectItem>
                        <SelectItem value="18">18 Chapters (Feature)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="scriptModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-primary" />
                      Script Engine
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-secondary/50 border-white/10" data-testid="select-script-model">
                          <SelectValue placeholder="Select Model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="claude-3-5">Claude 3.5 Sonnet (Best for Story)</SelectItem>
                        <SelectItem value="gpt-5">GPT-5 (Experimental)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="imageModel"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-primary" />
                    Visual Synthesis Model
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="grid grid-cols-2 gap-4"
                    >
                      <FormItem>
                        <FormControl>
                          <RadioGroupItem value="ideogram-v3" className="peer sr-only" data-testid="radio-ideogram" />
                        </FormControl>
                        <FormLabel className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-secondary/30 p-4 hover:bg-secondary/50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary cursor-pointer transition-all">
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="h-4 w-4" />
                            <span className="text-lg font-display font-bold">Ideogram V3</span>
                          </div>
                          <span className="text-xs text-muted-foreground text-center">Best for text & design accuracy</span>
                        </FormLabel>
                      </FormItem>
                      <FormItem>
                        <FormControl>
                          <RadioGroupItem value="flux-pro" className="peer sr-only" data-testid="radio-flux" />
                        </FormControl>
                        <FormLabel className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-secondary/30 p-4 hover:bg-secondary/50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary cursor-pointer transition-all">
                           <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="h-4 w-4" />
                            <span className="text-lg font-display font-bold">Flux 1.1 Pro</span>
                          </div>
                          <span className="text-xs text-muted-foreground text-center">Cinematic photorealism</span>
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
             <FormField
                control={form.control}
                name="voiceEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-white/10 bg-secondary/50 p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base flex items-center gap-2">
                        <Mic className="h-4 w-4 text-primary" />
                        Speechify Voiceover
                      </FormLabel>
                      <div className="text-[0.8rem] text-muted-foreground">
                        Generate neural human speech
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-voice"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

            <Button 
              type="submit" 
              className="w-full py-6 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all hover:shadow-[0_0_30px_rgba(34,211,238,0.5)]"
              disabled={createProjectMutation.isPending}
              data-testid="button-generate"
            >
              {createProjectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Connecting to Replicate API...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-5 w-5" />
                  Generate Video
                </>
              )}
            </Button>

          </form>
        </Form>
      </CardContent>
    </Card>
  );
}