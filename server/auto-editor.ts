import type { Timeline, TimelineVideoClip, TimelineAudioClip, TimelineTextClip, LayoutType } from "@shared/schema";

interface ChapterData {
  chapterNumber: number;
  title: string;
  scenes: SceneData[];
}

interface SceneData {
  sceneNumber: number;
  imageUrl: string;
  audioUrl?: string;
  narration?: string;
  duration: number;
  layoutType?: LayoutType;
  metadata?: {
    date?: string;
    location?: string;
    caption?: string;
  };
}

interface AutoEditConfig {
  projectId: number;
  title: string;
  chapters: ChapterData[];
  style: "documentary" | "historical" | "modern";
  colorGrade?: "none" | "grayscale" | "sepia" | "vintage";
  addChapterTitles?: boolean;
  addDateLabels?: boolean;
  addCaptions?: boolean;
  bgmUrl?: string;
  bgmVolume?: number;
}

const KEN_BURNS_EFFECTS = ["zoom_in", "zoom_out", "pan_left", "pan_right", "kenburns"] as const;

function generateId(): string {
  return `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function cycleKenBurnsEffect(index: number): string {
  return KEN_BURNS_EFFECTS[index % KEN_BURNS_EFFECTS.length];
}

function detectColorGrade(style: string, title: string): "grayscale" | "sepia" | "vintage" | "none" {
  const lowerTitle = title.toLowerCase();
  
  if (style === "historical" || 
      lowerTitle.includes("1940") || lowerTitle.includes("1930") || 
      lowerTitle.includes("war") || lowerTitle.includes("wwii") ||
      lowerTitle.includes("ww2") || lowerTitle.includes("world war")) {
    return "grayscale";
  }
  
  if (lowerTitle.includes("1950") || lowerTitle.includes("1960") ||
      lowerTitle.includes("1970") || lowerTitle.includes("vintage") ||
      lowerTitle.includes("retro")) {
    return "sepia";
  }
  
  if (lowerTitle.includes("1980") || lowerTitle.includes("1990")) {
    return "vintage";
  }
  
  return "none";
}

function extractYearFromTitle(title: string): string | null {
  // Match 4-digit years (1900-2099)
  const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
  return yearMatch ? yearMatch[1] : null;
}

function extractYearFromNarration(narration: string): string | null {
  // Match years mentioned at the start of sentences or after commas/periods
  // Prioritize years that appear prominently (start of text, after punctuation)
  const prominentYearMatch = narration.match(/^(19\d{2}|20\d{2})\b|[.,]\s*(19\d{2}|20\d{2})\b/);
  if (prominentYearMatch) {
    return prominentYearMatch[1] || prominentYearMatch[2];
  }
  
  // Fallback: any year in the narration
  const yearMatch = narration.match(/\b(19\d{2}|20\d{2})\b/);
  return yearMatch ? yearMatch[1] : null;
}

function shouldShowYearOverlay(sceneNarration: string, previousYearsShown: Set<string>): string | null {
  const year = extractYearFromNarration(sceneNarration);
  if (year && !previousYearsShown.has(year)) {
    return year;
  }
  return null;
}

function extractEraFromTitle(title: string): string | null {
  const lowerTitle = title.toLowerCase();
  
  // Check for specific era keywords
  if (lowerTitle.includes("wwii") || lowerTitle.includes("ww2") || lowerTitle.includes("world war ii")) {
    return "1939-1945";
  }
  if (lowerTitle.includes("world war i") || lowerTitle.includes("ww1") || lowerTitle.includes("wwi")) {
    return "1914-1918";
  }
  if (lowerTitle.includes("cold war")) {
    return "1947-1991";
  }
  if (lowerTitle.includes("vietnam")) {
    return "1955-1975";
  }
  
  return null;
}

// Generate caption for letterbox scenes
function extractLetterboxCaption(scene: SceneData, chapterTitle: string): string {
  // Try to use scene metadata first
  if (scene.metadata?.caption) {
    return scene.metadata.caption;
  }
  
  // Generate from date + location
  if (scene.metadata?.date && scene.metadata?.location) {
    return `${scene.metadata.location}, ${scene.metadata.date}`;
  }
  
  // Extract key phrase from narration for letterbox caption
  if (scene.narration) {
    const firstSentence = scene.narration.split(/[.!?]/)[0]?.trim();
    if (firstSentence && firstSentence.length < 50) {
      return firstSentence;
    }
    // Use a noun phrase from the chapter title
    const shortTitle = chapterTitle.split(/[-:]/)[0]?.trim() || "";
    if (shortTitle.length < 40) {
      const year = extractYearFromTitle(scene.narration || chapterTitle);
      return year ? `${shortTitle}, ${year}` : shortTitle;
    }
  }
  
  return chapterTitle.split(/[-:]/)[0]?.trim() || "Documentary";
}

export function buildDocumentaryTimeline(config: AutoEditConfig): Timeline {
  const {
    chapters,
    bgmUrl,
    bgmVolume = 0.15,
  } = config;

  const videoClips: TimelineVideoClip[] = [];
  const audioClips: TimelineAudioClip[] = [];
  const textClips: TimelineTextClip[] = [];

  let currentTime = 0;
  let sceneIndex = 0;
  
  // Track years that have already been shown to avoid duplicates
  const yearsShown = new Set<string>();

  // Simple clean black and white with smooth fade transitions only
  for (const chapter of chapters) {
    for (const scene of chapter.scenes) {
      // Simple video clip with grayscale and smooth fade transitions - no effects
      videoClips.push({
        id: generateId(),
        src: scene.imageUrl,
        start: currentTime,
        duration: scene.duration,
        effect: "none",  // No Ken Burns or zoom effects
        fade_in: sceneIndex === 0 ? 1.0 : 0.5,  // Smooth fade transitions
        fade_out: 0.5,
        blur: false,
        colorGrade: "grayscale",  // Clean black and white
        layoutType: "standard",   // No fancy layouts
      } as any);

      // Add narration audio
      if (scene.audioUrl) {
        audioClips.push({
          id: generateId(),
          src: scene.audioUrl,
          start: currentTime,
          duration: scene.duration,
          volume: 1.0,
          fade_in: 0.1,
          fade_out: 0.2,
          ducking: false,
          audioType: "narration",
        });
      }
      
      // Detect years in narration and add dramatic year overlay
      if (scene.narration) {
        const yearToShow = shouldShowYearOverlay(scene.narration, yearsShown);
        if (yearToShow) {
          yearsShown.add(yearToShow);
          
          // Add dramatic year text overlay (large centered text with fade animation)
          textClips.push({
            id: generateId(),
            text: yearToShow,
            start: currentTime,
            end: currentTime + Math.min(scene.duration, 4),  // Show for up to 4 seconds
            x: "(w-text_w)/2",   // Centered horizontally
            y: "(h-text_h)/2",   // Centered vertically
            size: 220,
            color: "#F5F0E6",   // Warm off-white color like the image
            box: false,
            textType: "year_splash",
            animation: "fade_in_out",
            animationDuration: 0.8,
            shadow: true,
            shadowColor: "black@0.6",
            outline: true,
            outlineWidth: 4,
            outlineColor: "black@0.3",
          } as any);
        }
      }

      currentTime += scene.duration;
      sceneIndex++;
    }
  }

  const totalDuration = currentTime;

  // Optional background music with ducking
  if (bgmUrl) {
    audioClips.push({
      id: generateId(),
      src: bgmUrl,
      start: 0,
      duration: totalDuration,
      volume: bgmVolume,
      fade_in: 2,
      fade_out: 3,
      ducking: true,
      audioType: "music",
    });
  }

  return {
    resolution: "1920x1080",
    fps: 30,
    duration: totalDuration,
    tracks: {
      video: videoClips,
      audio: audioClips,
      text: textClips,  // Empty - no text overlays
    },
  };
}

export function buildTimelineFromAssets(
  projectId: number,
  title: string,
  assets: Array<{
    chapterNumber: number;
    chapterTitle?: string;
    sceneNumber: number;
    imageUrl: string;
    audioUrl?: string;
    narration?: string;
    duration?: number;
  }>,
  options?: {
    style?: "documentary" | "historical" | "modern";
    colorGrade?: "none" | "grayscale" | "sepia" | "vintage";
    addChapterTitles?: boolean;
    addCaptions?: boolean;
    bgmUrl?: string;
  }
): Timeline {
  const chapterMap = new Map<number, ChapterData>();

  for (const asset of assets) {
    if (!chapterMap.has(asset.chapterNumber)) {
      chapterMap.set(asset.chapterNumber, {
        chapterNumber: asset.chapterNumber,
        title: asset.chapterTitle || `Chapter ${asset.chapterNumber}`,
        scenes: [],
      });
    }

    const chapter = chapterMap.get(asset.chapterNumber)!;
    chapter.scenes.push({
      sceneNumber: asset.sceneNumber,
      imageUrl: asset.imageUrl,
      audioUrl: asset.audioUrl,
      narration: asset.narration,
      duration: asset.duration || 5,
    });
  }

  const sortedChapters = Array.from(chapterMap.values())
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map(ch => ({
      ...ch,
      scenes: ch.scenes.sort((a, b) => a.sceneNumber - b.sceneNumber),
    }));

  return buildDocumentaryTimeline({
    projectId,
    title,
    chapters: sortedChapters,
    style: options?.style || "documentary",
    colorGrade: options?.colorGrade,
    addChapterTitles: options?.addChapterTitles ?? true,
    addDateLabels: false,
    addCaptions: options?.addCaptions ?? true,
    bgmUrl: options?.bgmUrl,
    bgmVolume: 0.15,
  });
}
