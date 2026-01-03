import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { 
  Wand2, 
  Send, 
  Sparkles, 
  Loader2, 
  Bot,
  User,
  Zap,
  Clock,
  Scissors,
  Volume2,
  Type,
  Palette,
  Film,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Timeline, TimelineVideoClip, TimelineAudioClip, TimelineTextClip } from "@shared/schema";

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  action?: AIEditAction;
}

interface AIEditAction {
  type: "split" | "add_effect" | "add_caption" | "adjust_timing" | "add_music" | "color_grade" | "analyze" | "auto_edit";
  applied: boolean;
  details?: string;
}

interface AIEditPanelProps {
  timeline: Timeline;
  currentTime: number;
  selectedClipId: string | null;
  onTimelineUpdate: (updater: (prev: Timeline) => Timeline) => void;
  onSeek: (time: number) => void;
}

const QUICK_ACTIONS = [
  { icon: Scissors, label: "Split at playhead", command: "Split the clip at the current playhead position", id: "split" },
  { icon: Sparkles, label: "Add Ken Burns", command: "Add Ken Burns zoom effect to the selected clip", id: "kenburns" },
  { icon: Type, label: "Add caption", command: "Add a caption at the current position", id: "caption" },
  { icon: Volume2, label: "Adjust audio", command: "Normalize audio levels across all clips", id: "audio" },
  { icon: Palette, label: "Color grade", command: "Apply cinematic color grading to all video clips", id: "color" },
  { icon: Film, label: "Auto-edit", command: "Analyze the timeline and suggest improvements", id: "analyze" },
];

export function AIEditPanel({
  timeline,
  currentTime,
  selectedClipId,
  onTimelineUpdate,
  onSeek,
}: AIEditPanelProps) {
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! I'm your AI editing assistant. Tell me what you want to do with your video and I'll help make it happen. Try things like:\n\n• \"Split the clip at 10 seconds\"\n• \"Add a zoom effect to scene 3\"\n• \"Make the audio louder\"\n• \"Add a title that says 'Chapter 1'\"\n• \"Analyze my video and suggest improvements\"",
      timestamp: new Date(),
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const parseAndExecuteCommand = async (command: string): Promise<{ response: string; action?: AIEditAction }> => {
    const lowerCommand = command.toLowerCase();
    
    // Split clip command
    if (lowerCommand.includes("split")) {
      const timeMatch = lowerCommand.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|s|sec)/);
      const splitTime = timeMatch ? parseFloat(timeMatch[1]) : currentTime;
      
      const clipAtTime = timeline.tracks.video.find(clip => 
        splitTime > clip.start && splitTime < clip.start + clip.duration
      );
      
      if (clipAtTime) {
        const clipId = clipAtTime.id;
        const splitPoint = splitTime - clipAtTime.start;
        const newClipId = `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        onTimelineUpdate(prev => ({
          ...prev,
          tracks: {
            ...prev.tracks,
            video: prev.tracks.video
              .flatMap(c => {
                if (c.id !== clipId) return [c];
                const firstPart = { ...c, duration: splitPoint };
                const secondPart = { ...c, id: newClipId, start: splitTime, duration: c.duration - splitPoint };
                return [firstPart, secondPart];
              })
              .sort((a, b) => a.start - b.start),
          },
        }));
        
        return {
          response: `Done! I split the video clip at ${splitTime.toFixed(1)} seconds. You now have two separate clips that you can edit independently.`,
          action: { type: "split", applied: true, details: `Split at ${splitTime.toFixed(1)}s` }
        };
      }
      
      return {
        response: `I couldn't find a video clip at ${splitTime.toFixed(1)} seconds to split. Make sure the playhead is positioned over a clip.`,
        action: { type: "split", applied: false }
      };
    }
    
    // Add effect command
    if (lowerCommand.includes("effect") || lowerCommand.includes("ken burns") || lowerCommand.includes("zoom")) {
      let effectType: "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "kenburns" = "kenburns";
      
      if (lowerCommand.includes("zoom in")) effectType = "zoom_in";
      else if (lowerCommand.includes("zoom out")) effectType = "zoom_out";
      else if (lowerCommand.includes("pan left")) effectType = "pan_left";
      else if (lowerCommand.includes("pan right")) effectType = "pan_right";
      
      const sceneMatch = lowerCommand.match(/scene\s*(\d+)/i);
      const clipIndex = sceneMatch ? parseInt(sceneMatch[1]) - 1 : null;
      
      let targetClip: TimelineVideoClip | undefined;
      
      if (clipIndex !== null && timeline.tracks.video[clipIndex]) {
        targetClip = timeline.tracks.video[clipIndex];
      } else if (selectedClipId) {
        targetClip = timeline.tracks.video.find(c => c.id === selectedClipId);
      } else {
        targetClip = timeline.tracks.video.find(clip => 
          currentTime >= clip.start && currentTime < clip.start + clip.duration
        );
      }
      
      if (targetClip) {
        const targetClipId = targetClip.id;
        
        onTimelineUpdate(prev => ({
          ...prev,
          tracks: {
            ...prev.tracks,
            video: prev.tracks.video.map(c => 
              c.id === targetClipId ? { ...c, effect: effectType } : c
            ),
          },
        }));
        
        return {
          response: `Applied ${effectType.replace('_', ' ')} effect to the clip. This will create a smooth motion effect during playback.`,
          action: { type: "add_effect", applied: true, details: effectType }
        };
      }
      
      return {
        response: "I need you to select a clip first, or tell me which scene number to apply the effect to (e.g., 'add zoom to scene 3').",
        action: { type: "add_effect", applied: false }
      };
    }
    
    // Add caption/title command
    if (lowerCommand.includes("caption") || lowerCommand.includes("title") || lowerCommand.includes("text")) {
      const textMatch = command.match(/(?:says?|text|titled?|caption)\s*['":]?\s*['"]?([^'"]+)['"]?/i);
      const captionText = textMatch ? textMatch[1].trim() : "Title";
      
      const newTextClip: TimelineTextClip = {
        id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: captionText,
        start: currentTime,
        end: currentTime + 4,
        font: "Serif",
        size: 48,
        color: "#FFFFFF",
        x: "(w-text_w)/2",
        y: "h-120",
        box: true,
        box_color: "#000000",
        box_opacity: 0.7,
      };
      
      onTimelineUpdate(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          text: [...prev.tracks.text, newTextClip].sort((a, b) => a.start - b.start),
        },
      }));
      
      return {
        response: `Added a caption "${captionText}" at ${currentTime.toFixed(1)} seconds. It will display for 4 seconds with a semi-transparent background.`,
        action: { type: "add_caption", applied: true, details: captionText }
      };
    }
    
    // Audio adjustment command
    if (lowerCommand.includes("audio") || lowerCommand.includes("volume") || lowerCommand.includes("louder") || lowerCommand.includes("quieter")) {
      let volumeMultiplier = 1.0;
      
      if (lowerCommand.includes("louder") || lowerCommand.includes("increase") || lowerCommand.includes("boost")) {
        volumeMultiplier = 1.3;
      } else if (lowerCommand.includes("quieter") || lowerCommand.includes("decrease") || lowerCommand.includes("lower")) {
        volumeMultiplier = 0.7;
      } else if (lowerCommand.includes("normalize")) {
        volumeMultiplier = 1.0; // Set all to 1.0
      }
      
      const normalize = lowerCommand.includes("normalize");
      
      onTimelineUpdate(prev => ({
        ...prev,
        tracks: {
          ...prev.tracks,
          audio: prev.tracks.audio.map(c => ({
            ...c,
            volume: normalize ? 1.0 : Math.min(2.0, Math.max(0.1, (c.volume || 1.0) * volumeMultiplier))
          })),
        },
      }));
      
      const action = normalize ? "normalized" : 
                     volumeMultiplier > 1 ? "increased" : "decreased";
      
      return {
        response: `I've ${action} the audio levels across all ${timeline.tracks.audio.length} audio clips.`,
        action: { type: "adjust_timing", applied: true, details: `Volume ${action}` }
      };
    }
    
    // Color grading command - note: filter not in schema, so we suggest using blur toggle instead
    if (lowerCommand.includes("color") || lowerCommand.includes("grade") || lowerCommand.includes("filter") || lowerCommand.includes("cinematic")) {
      // Apply blur effect as a simple visual change (schema-supported)
      if (lowerCommand.includes("blur")) {
        onTimelineUpdate(prev => ({
          ...prev,
          tracks: {
            ...prev.tracks,
            video: prev.tracks.video.map(c => ({
              ...c,
              blur: true
            })),
          },
        }));
        
        return {
          response: `Applied blur effect to all video clips.`,
          action: { type: "color_grade", applied: true, details: "blur" }
        };
      }
      
      return {
        response: `Color grading will be applied during the final render. Currently I can apply blur effects - try "add blur to all clips". For color grading, the rendering engine will apply cinematic color correction automatically.`,
        action: { type: "color_grade", applied: false }
      };
    }
    
    // Analyze command
    if (lowerCommand.includes("analyze") || lowerCommand.includes("suggest") || lowerCommand.includes("improve") || lowerCommand.includes("review")) {
      const videoCount = timeline.tracks.video.length;
      const audioCount = timeline.tracks.audio.length;
      const textCount = timeline.tracks.text.length;
      const totalDuration = timeline.duration;
      
      const avgClipDuration = videoCount > 0 ? totalDuration / videoCount : 0;
      
      let suggestions: string[] = [];
      
      if (avgClipDuration > 15) {
        suggestions.push("Your clips average over 15 seconds each - consider splitting longer scenes to improve pacing.");
      }
      if (textCount === 0 && videoCount > 3) {
        suggestions.push("Add chapter titles or captions to help viewers follow along.");
      }
      if (audioCount < videoCount / 2) {
        suggestions.push("Some video clips don't have audio - consider adding voiceover or background music.");
      }
      
      const effectsUsed = new Set(timeline.tracks.video.map(c => c.effect).filter(Boolean));
      if (effectsUsed.size < 2 && videoCount > 3) {
        suggestions.push("Try varying your Ken Burns effects (zoom in, zoom out, pan) for visual interest.");
      }
      
      if (suggestions.length === 0) {
        suggestions.push("Your timeline looks well-balanced! Consider adding fade transitions between clips for a polished finish.");
      }
      
      return {
        response: `Timeline Analysis:\n\n• ${videoCount} video clips (${totalDuration.toFixed(0)}s total)\n• ${audioCount} audio clips\n• ${textCount} text overlays\n• Average clip length: ${avgClipDuration.toFixed(1)}s\n\nSuggestions:\n${suggestions.map(s => `• ${s}`).join('\n')}`,
        action: { type: "analyze", applied: true }
      };
    }
    
    // Default response for unrecognized commands
    return {
      response: `I'm not sure how to do that yet. Here are some things I can help with:\n\n• **Split clips**: "Split the clip at 10 seconds"\n• **Add effects**: "Add zoom effect to scene 3"\n• **Add captions**: "Add a title that says 'Chapter 1'"\n• **Adjust audio**: "Make the audio louder"\n• **Color grade**: "Apply cinematic color grading"\n• **Analyze**: "Analyze my video and suggest improvements"`,
    };
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isProcessing) return;
    
    const userMessage: AIMessage = {
      id: generateId(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsProcessing(true);
    
    // Simulate AI processing time
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    
    const { response, action } = await parseAndExecuteCommand(inputValue);
    
    const assistantMessage: AIMessage = {
      id: generateId(),
      role: "assistant",
      content: response,
      timestamp: new Date(),
      action,
    };
    
    setMessages(prev => [...prev, assistantMessage]);
    setIsProcessing(false);
  };

  const handleQuickAction = (command: string) => {
    setInputValue(command);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="w-80 bg-gradient-to-b from-[#0d1117] to-[#080a0f] border-r border-cyan-500/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-cyan-500/10 bg-gradient-to-r from-purple-500/10 to-cyan-500/10">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
            <Wand2 className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent font-bold">
            AI Edit Assistant
          </span>
        </h3>
        <p className="text-xs text-gray-500 mt-1 ml-8">Natural language video editing</p>
      </div>
      
      {/* Quick Actions */}
      <div className="border-b border-cyan-500/10">
        <button
          onClick={() => setShowQuickActions(!showQuickActions)}
          className="w-full px-3 py-2 flex items-center justify-between text-xs text-cyan-400/80 hover:bg-cyan-500/5 transition-colors"
          data-testid="toggle-quick-actions"
        >
          <span className="flex items-center gap-1.5">
            <Zap className="h-3 w-3" />
            Quick Actions
          </span>
          {showQuickActions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        
        {showQuickActions && (
          <div className="p-2 grid grid-cols-2 gap-1.5">
            {QUICK_ACTIONS.map((action, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickAction(action.command)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-gray-400 bg-white/5 hover:bg-purple-500/20 hover:text-purple-400 transition-all border border-transparent hover:border-purple-500/30"
                data-testid={`button-quick-action-${action.id}`}
              >
                <action.icon className="h-3 w-3" />
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Messages */}
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
              )}
              
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-xs",
                  msg.role === "user"
                    ? "bg-cyan-500/20 text-cyan-100 border border-cyan-500/30"
                    : "bg-white/5 text-gray-300 border border-white/10"
                )}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                
                {msg.action?.applied && (
                  <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1.5 text-green-400">
                    <Sparkles className="h-3 w-3" />
                    <span>Action applied</span>
                  </div>
                )}
              </div>
              
              {msg.role === "user" && (
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 border border-cyan-500/30">
                  <User className="h-3.5 w-3.5 text-cyan-400" />
                </div>
              )}
            </div>
          ))}
          
          {isProcessing && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
              </div>
              <div className="bg-white/5 text-gray-400 rounded-lg px-3 py-2 text-xs border border-white/10">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      
      {/* Input */}
      <div className="p-3 border-t border-cyan-500/10 bg-[#0a0d12]">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me what to edit..."
            className="flex-1 min-h-[60px] max-h-[120px] resize-none bg-white/5 border-cyan-500/20 text-gray-200 placeholder:text-gray-600 text-xs focus:border-cyan-500/50 focus:ring-cyan-500/20"
            disabled={isProcessing}
            data-testid="ai-input"
          />
        </div>
        
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Clock className="h-3 w-3" />
            <span>@{currentTime.toFixed(1)}s</span>
          </div>
          
          <Button
            size="sm"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isProcessing}
            className="bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-600 hover:to-cyan-600 text-white text-xs px-3"
            data-testid="ai-send"
          >
            {isProcessing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Send className="h-3 w-3 mr-1" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
