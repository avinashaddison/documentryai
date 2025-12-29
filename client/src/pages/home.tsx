import { AppShell } from "@/components/layout/app-shell";
import { CreateProjectForm } from "@/components/dashboard/create-project-form";
import { Sparkles } from "lucide-react";

export default function Home() {
  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-12 py-10">
        
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-mono uppercase tracking-wider">
            <Sparkles className="h-3 w-3" />
            AI Video Production System
          </div>
          <h1 className="text-5xl md:text-7xl font-display font-bold text-white tracking-tight">
            Turn Ideas into <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500 neon-text">Cinema.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            The world's first professional AI video editor. Generate scripts, storyboards, voiceovers, and final cuts in one seamless timeline.
          </p>
        </div>

        <CreateProjectForm />

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-10">
           {[
             { title: "Story Generation", desc: "Claude-powered narrative structures with perfect pacing." },
             { title: "Cinematic Visuals", desc: "Integration with Ideogram & Flux for 8K photorealism." },
             { title: "Auto-Assembly", desc: "Intelligent cutting based on audio energy and beats." }
           ].map((feature, i) => (
             <div key={i} className="p-6 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
               <h3 className="font-display font-bold text-lg mb-2 text-white">{feature.title}</h3>
               <p className="text-sm text-muted-foreground">{feature.desc}</p>
             </div>
           ))}
        </div>

      </div>
    </AppShell>
  );
}