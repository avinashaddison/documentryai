import Anthropic from "@anthropic-ai/sdk";
import type { Timeline, AIEditPlan, AIClipEdit, TimelineVideoClip, TimelineTextClip } from "@shared/schema";
import { AIEditPlanSchema } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

interface DocumentaryContext {
  title: string;
  chapters: {
    title: string;
    scenes: {
      narration: string;
      imagePrompt?: string;
    }[];
  }[];
}

const EDIT_PLAN_PROMPT = `You are a professional documentary film editor. Given a documentary's content and current timeline, generate an intelligent edit plan that creates compelling visual storytelling.

Consider these documentary editing principles:
1. **Pacing**: Dramatic moments need slower pacing with zoom effects. Action needs faster cuts.
2. **Era Splashes**: Use for opening scenes or major time period transitions (large year/date text)
3. **Letterbox**: Use for establishing shots and scenes needing cinematic gravitas
4. **Quote Cards**: Use for powerful statements or key facts (parchment box overlay)
5. **Color Grading**: Historical content often works best in grayscale or sepia
6. **Ken Burns Effects**: Vary between zoom_in (focus), zoom_out (reveal), pan (scanning)
7. **Text Overlays**: Add dates, locations, or key quotes where they enhance understanding

Return a JSON object matching this exact structure:
{
  "overallStyle": {
    "colorGrade": "grayscale" | "sepia" | "vintage" | "none",
    "pacing": "slow" | "normal" | "fast",
    "tone": "string description of overall tone"
  },
  "clipEdits": [
    {
      "clipIndex": 0,
      "layoutType": "era_splash" | "letterbox" | "quote_card" | "chapter_title" | "standard",
      "effect": "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "kenburns" | "none",
      "colorGrade": "grayscale" | "sepia" | "vintage" | "none",
      "textOverlay": {
        "text": "1945",
        "position": "center" | "top-left" | "bottom-center",
        "style": "era_splash" | "chapter_title" | "quote_card" | "caption"
      },
      "transitionIn": "fade" | "dissolve" | "none",
      "pacing": "slow" | "normal" | "fast",
      "emotionalTone": "dramatic" | "somber" | "hopeful" | "neutral" | "tense"
    }
  ],
  "reasoning": "Brief explanation of your editing choices"
}

Be creative but purposeful. Every edit should serve the story.`;

export async function generateAIEditPlan(
  timeline: Timeline,
  context: DocumentaryContext
): Promise<AIEditPlan> {
  const clipCount = timeline.tracks.video.length;
  
  const contextPrompt = `
Documentary Title: ${context.title}

Content Overview:
${context.chapters.map((ch, i) => `
Chapter ${i + 1}: ${ch.title}
${ch.scenes.map((s, j) => `  Scene ${j + 1}: ${s.narration.substring(0, 150)}...`).join('\n')}
`).join('\n')}

Current Timeline:
- ${clipCount} video clips
- Total duration: ${timeline.duration} seconds
- Current clips: ${timeline.tracks.video.map((c, i) => `[${i}] ${c.duration}s`).join(', ')}

Generate an edit plan for all ${clipCount} clips. Make the first clip an era_splash if there's a year in the title. Use letterbox for establishing shots. Add quote_card for powerful narration moments.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${EDIT_PLAN_PROMPT}\n\n${contextPrompt}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not extract JSON from Claude response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = AIEditPlanSchema.parse(parsed);
    
    console.log("[AI Editor] Generated edit plan with", validated.clipEdits.length, "clip edits");
    return validated;
  } catch (error) {
    console.error("[AI Editor] Error generating edit plan:", error);
    return getDefaultEditPlan(clipCount);
  }
}

function getDefaultEditPlan(clipCount: number): AIEditPlan {
  const clipEdits: AIClipEdit[] = [];
  
  for (let i = 0; i < clipCount; i++) {
    const edit: AIClipEdit = {
      clipIndex: i,
      effect: ["zoom_in", "zoom_out", "pan_left", "pan_right", "kenburns"][i % 5] as any,
      colorGrade: "grayscale",
    };
    
    if (i === 0) {
      edit.layoutType = "era_splash";
    } else if (i % 3 === 0) {
      edit.layoutType = "letterbox";
    } else if (i % 4 === 2) {
      edit.layoutType = "quote_card";
    }
    
    clipEdits.push(edit);
  }
  
  return {
    overallStyle: {
      colorGrade: "grayscale",
      pacing: "normal",
      tone: "Historical documentary with dramatic pacing",
    },
    clipEdits,
    reasoning: "Default edit plan applied",
  };
}

export function applyEditPlanToTimeline(
  timeline: Timeline,
  editPlan: AIEditPlan,
  context?: DocumentaryContext
): Timeline {
  const newTimeline = JSON.parse(JSON.stringify(timeline)) as Timeline;
  
  const pacingMultiplier = {
    slow: 1.3,
    normal: 1.0,
    fast: 0.8,
  };
  
  const positionToCoords: Record<string, { x: string; y: string }> = {
    "center": { x: "(w-text_w)/2", y: "(h-text_h)/2" },
    "top-left": { x: "60", y: "60" },
    "top-right": { x: "w-text_w-60", y: "60" },
    "bottom-left": { x: "60", y: "h-100" },
    "bottom-right": { x: "w-text_w-60", y: "h-100" },
    "bottom-center": { x: "(w-text_w)/2", y: "h-100" },
  };
  
  for (const clipEdit of editPlan.clipEdits) {
    const clip = newTimeline.tracks.video[clipEdit.clipIndex];
    if (!clip) continue;
    
    if (clipEdit.layoutType) {
      (clip as any).layoutType = clipEdit.layoutType;
    }
    
    if (clipEdit.effect) {
      clip.effect = clipEdit.effect;
    }
    
    if (clipEdit.colorGrade) {
      (clip as any).colorGrade = clipEdit.colorGrade;
    }
    
    if (clipEdit.transitionIn === "fade") {
      clip.fade_in = 0.8;
    }
    
    if (clipEdit.pacing) {
      const mult = pacingMultiplier[clipEdit.pacing];
      clip.duration = Math.round(clip.duration * mult * 10) / 10;
    }
    
    if (clipEdit.textOverlay) {
      const coords = positionToCoords[clipEdit.textOverlay.position] || positionToCoords["center"];
      const isEraSplash = clipEdit.textOverlay.style === "era_splash";
      const isQuoteCard = clipEdit.textOverlay.style === "quote_card";
      
      // Calculate char delay based on text type for sound effect duration
      const charDelay = isEraSplash ? 0.15 : 0.06;
      const textDuration = clipEdit.textOverlay.text.length * charDelay + 0.3;
      
      const textClip = {
        id: `ai_text_${clipEdit.clipIndex}_${Date.now()}`,
        text: clipEdit.textOverlay.text,
        start: clip.start + 0.5,
        end: clip.start + clip.duration - 0.5,
        font: "Serif",
        size: isEraSplash ? 220 : 48,
        color: isQuoteCard ? "#2a2a2a" : "#F5F5DC",
        x: coords.x,
        y: coords.y,
        box: isQuoteCard,
        box_color: "#F5F0E6",
        box_opacity: 0.92,
        textType: clipEdit.textOverlay.style as any,
        shadow: true,
        shadowColor: "#000000",
        shadowOffset: isEraSplash ? 10 : 3,
        animation: "typewriter" as const,  // Typewriter animation for all text
        boxPadding: isQuoteCard ? 24 : 10,
      };
      
      newTimeline.tracks.text.push(textClip as any);
      
      // Add typewriter sound effect for text
      newTimeline.tracks.audio.push({
        id: `ai_sfx_${clipEdit.clipIndex}_${Date.now()}`,
        src: "public/audio/typewriter_sfx.mp3",
        start: clip.start + 0.5,
        duration: textDuration,
        volume: 0.6,
        fade_in: 0,
        fade_out: 0.2,
        ducking: false,
        audioType: "sfx",
      } as any);
    }
    
    if (clipEdit.layoutType === "letterbox" && context) {
      const chapterIdx = Math.floor(clipEdit.clipIndex / 3);
      const sceneIdx = clipEdit.clipIndex % 3;
      const scene = context.chapters[chapterIdx]?.scenes[sceneIdx];
      
      if (scene?.narration) {
        const caption = scene.narration.split(/[.!?]/)[0]?.trim().substring(0, 50) || "";
        (clip as any).letterboxCaption = caption;
      }
    }
  }
  
  let currentTime = 0;
  for (const clip of newTimeline.tracks.video) {
    clip.start = currentTime;
    currentTime += clip.duration;
  }
  
  newTimeline.duration = currentTime;
  
  return newTimeline;
}
