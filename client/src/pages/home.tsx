import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Play, 
  Sparkles, 
  Film, 
  Mic2, 
  Image as ImageIcon,
  Wand2,
  ChevronRight,
  Zap,
  Clock,
  Globe,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";

const exampleTopics = [
  "The Rise and Fall of Ancient Rome",
  "Inside the World's Most Dangerous Prisons",
  "The Secret Lives of Billionaires",
  "Mysteries of the Deep Ocean",
  "The History of Space Exploration",
  "Inside North Korea",
];

const features = [
  {
    icon: Wand2,
    title: "AI Story Generation",
    description: "Claude-powered scripts with dramatic narration, perfect pacing, and compelling story arcs.",
  },
  {
    icon: ImageIcon,
    title: "Cinematic Visuals",
    description: "Flux & Ideogram generate stunning 4K visuals with Ken Burns motion effects.",
  },
  {
    icon: Mic2,
    title: "AI Voiceover",
    description: "Professional narration with multiple voice styles and emotional range.",
  },
  {
    icon: Film,
    title: "Auto Assembly",
    description: "Intelligent editing with scene transitions, captions, and background music.",
  },
];

const steps = [
  { number: "01", title: "Enter Your Topic", description: "Type any subject - history, science, true crime, nature" },
  { number: "02", title: "AI Generates Story", description: "Claude creates a compelling narrative structure" },
  { number: "03", title: "Visuals Created", description: "AI generates cinematic images for each scene" },
  { number: "04", title: "Export Video", description: "Download your complete documentary video" },
];

export default function Home() {
  const [, navigate] = useLocation();
  const [topic, setTopic] = useState("");

  const handleCreate = () => {
    if (topic.trim()) {
      sessionStorage.setItem("documentaryTopic", topic.trim());
      navigate("/create");
    }
  };

  const handleExampleClick = (example: string) => {
    setTopic(example);
  };

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.02%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] pointer-events-none opacity-50" />
      
      <header className="relative z-10 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
                <Film className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">Petr AI</span>
            </div>
            <nav className="hidden md:flex items-center gap-6 text-sm text-gray-400">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a>
              <a href="#examples" className="hover:text-white transition-colors">Examples</a>
            </nav>
            <Button 
              onClick={() => navigate("/create")}
              variant="outline" 
              size="sm"
              className="border-white/10 hover:bg-white/5"
              data-testid="button-header-create"
            >
              Start Creating
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="py-20 md:py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
                <Sparkles className="h-4 w-4" />
                AI-Powered Documentary Generation
              </div>
              
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
                Create Stunning
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-cyan-400 to-purple-500">
                  Documentaries with AI
                </span>
              </h1>
              
              <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
                Transform any topic into a professional documentary video. AI generates the story, visuals, narration, and editing automatically.
              </p>

              <div className="max-w-2xl mx-auto mb-8">
                <div className="relative">
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    placeholder="Enter your documentary topic..."
                    className="h-14 pl-5 pr-36 text-lg bg-white/5 border-white/10 focus:border-primary/50 rounded-xl"
                    data-testid="input-topic"
                  />
                  <Button
                    onClick={handleCreate}
                    disabled={!topic.trim()}
                    className="absolute right-2 top-2 h-10 px-6 bg-gradient-to-r from-primary to-purple-500 hover:opacity-90 rounded-lg font-semibold"
                    data-testid="button-generate"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Generate
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                <span className="text-gray-500">Try:</span>
                {exampleTopics.slice(0, 3).map((example) => (
                  <button
                    key={example}
                    onClick={() => handleExampleClick(example)}
                    className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all"
                    data-testid={`button-example-${example.slice(0, 10)}`}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-20 relative">
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0d14] via-transparent to-transparent pointer-events-none z-10" />
              <div className="aspect-video max-w-5xl mx-auto rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] shadow-2xl">
                <div className="w-full h-full flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=1920&q=80')] bg-cover bg-center opacity-30" />
                  <div className="relative z-10 text-center">
                    <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mb-4 mx-auto cursor-pointer hover:bg-white/20 transition-all group">
                      <Play className="h-8 w-8 text-white ml-1 group-hover:scale-110 transition-transform" />
                    </div>
                    <p className="text-gray-400 text-sm">Watch Demo</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-20 border-t border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Everything You Need
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Our AI handles every aspect of documentary production, from script to final cut.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-primary/30 transition-all group"
                  data-testid={`feature-card-${index}`}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-400">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="py-20 border-t border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                How It Works
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Create a documentary in minutes, not months.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {steps.map((step, index) => (
                <div key={index} className="relative" data-testid={`step-${index}`}>
                  {index < steps.length - 1 && (
                    <div className="hidden lg:block absolute top-8 left-full w-full">
                      <ArrowRight className="h-6 w-6 text-gray-700 -ml-3" />
                    </div>
                  )}
                  <div className="text-5xl font-bold text-primary/20 mb-4">{step.number}</div>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-400">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="examples" className="py-20 border-t border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Popular Topics
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Get inspired by trending documentary subjects.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {exampleTopics.map((example, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setTopic(example);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="p-6 rounded-xl bg-white/[0.02] border border-white/5 hover:border-primary/30 hover:bg-white/[0.04] transition-all text-left group"
                  data-testid={`topic-card-${index}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{example}</span>
                    <ChevronRight className="h-5 w-5 text-gray-600 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 border-t border-white/5">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Create?
            </h2>
            <p className="text-gray-400 mb-8 max-w-xl mx-auto">
              Start generating your first AI documentary in seconds. No video editing experience required.
            </p>
            <Button
              onClick={() => navigate("/create")}
              size="lg"
              className="h-14 px-8 text-lg bg-gradient-to-r from-primary to-purple-500 hover:opacity-90 rounded-xl font-semibold"
              data-testid="button-cta-create"
            >
              <Sparkles className="h-5 w-5 mr-2" />
              Start Creating Now
            </Button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4" />
              <span>Petr AI</span>
            </div>
            <p>AI-Powered Documentary Generation</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
