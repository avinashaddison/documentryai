import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Settings from "@/pages/settings";
import Home from "@/pages/home";
import Projects from "@/pages/projects";
import SavedVideos from "@/pages/saved-videos";
import ProjectEditor from "@/pages/project-editor";
import VideoEditorPage from "@/pages/video-editor-page";
import FilmMaker from "@/pages/film-maker";
import DocumentaryMaker from "@/pages/documentary-maker";
import DocumentaryEditor from "@/pages/documentary-editor";

function Router() {
  return (
    <Switch>
      <Route path="/" component={DocumentaryMaker} />
      <Route path="/create" component={DocumentaryMaker} />
      <Route path="/documentary-maker" component={DocumentaryMaker} />
      <Route path="/editor" component={DocumentaryEditor} />
      <Route path="/documentary-editor" component={DocumentaryEditor} />
      <Route path="/film-maker" component={FilmMaker} />
      <Route path="/projects" component={Projects} />
      <Route path="/saved" component={SavedVideos} />
      <Route path="/home" component={Home} />
      <Route path="/settings" component={Settings} />
      <Route path="/project/:id" component={ProjectEditor} />
      <Route path="/video-editor" component={VideoEditorPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;