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
    title,
    chapters,
    style = "documentary",
    colorGrade,
    addChapterTitles = true,
    addDateLabels = true,
    addCaptions = true,
    bgmUrl,
    bgmVolume = 0.15,
  } = config;

  const videoClips: TimelineVideoClip[] = [];
  const audioClips: TimelineAudioClip[] = [];
  const textClips: TimelineTextClip[] = [];

  let currentTime = 0;
  let sceneIndex = 0;

  // Always use grayscale for black and white documentary style
  const autoColorGrade = colorGrade || "grayscale";
  
  // Add stylized year/era overlay at the start (like "1945" splash)
  const yearFromTitle = extractYearFromTitle(title);
  const eraFromTitle = extractEraFromTitle(title);
  const dateOverlay = yearFromTitle || eraFromTitle;
  
  if (dateOverlay && chapters.length > 0 && chapters[0].scenes.length > 0) {
    // Add large centered year overlay on first scene with dramatic scale animation
    textClips.push({
      id: generateId(),
      text: dateOverlay,
      start: 0.5,
      end: 4.5,
      font: "Serif",
      size: 180,
      color: "#F5F0E6",
      x: "(w-text_w)/2",
      y: "(h-text_h)/2",
      box: false,
      box_color: "#000000",
      box_opacity: 0,
      textType: "era_splash",
      shadow: true,
      shadowColor: "#000000",
      shadowOffset: 6,
      animation: "scale_in",
      animationDuration: 1.2,
      boxPadding: 0,
    } as any);
  }

  for (const chapter of chapters) {
    const chapterStartTime = currentTime;

    if (addChapterTitles && chapter.title) {
      textClips.push({
        id: generateId(),
        text: chapter.title.toUpperCase(),
        start: currentTime,
        end: currentTime + 3.5,
        font: "Serif",
        size: 72,
        color: "#F5F5DC",
        x: "(w-text_w)/2",
        y: "(h-text_h)/2",
        box: false,
        box_color: "#000000",
        box_opacity: 0.6,
        textType: "chapter_title",
        shadow: true,
        shadowColor: "#000000",
        shadowOffset: 3,
        animation: "fade_in_out",
        animationDuration: 0.8,
        boxPadding: 20,
      } as any);
    }

    for (const scene of chapter.scenes) {
      const effect = cycleKenBurnsEffect(sceneIndex);
      
      // Determine layout type based on scene position and content
      let layoutType: LayoutType = scene.layoutType || "standard";
      
      // First scene of first chapter gets era splash if we have a year
      if (sceneIndex === 0 && dateOverlay) {
        layoutType = "era_splash";
      }
      // Every 3rd scene gets letterbox for variety
      else if (sceneIndex > 0 && sceneIndex % 3 === 0) {
        layoutType = "letterbox";
      }
      // Scenes with strong narration get quote cards occasionally
      else if (sceneIndex % 4 === 2 && scene.narration && scene.narration.length > 50) {
        layoutType = "quote_card";
      }

      // Add smooth transitions - dissolve for most, fade for first/last
      const transitionType = sceneIndex === 0 ? "fade" : 
                            sceneIndex % 5 === 0 ? "wipeleft" :
                            sceneIndex % 3 === 0 ? "dissolve" : "fade";
      
      videoClips.push({
        id: generateId(),
        src: scene.imageUrl,
        start: currentTime,
        duration: scene.duration,
        effect: effect as any,
        fade_in: sceneIndex === 0 ? 1 : 0.4,
        fade_out: 0.4,
        blur: false,
        colorGrade: autoColorGrade,
        layoutType: layoutType,
        letterboxCaption: scene.metadata?.caption || (layoutType === "letterbox" ? extractLetterboxCaption(scene, chapter.title) : undefined),
        transitionIn: transitionType,
        transitionOut: transitionType,
        transitionDuration: 0.5,
      } as any);

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
      
      // Add quote card overlay for selected scenes
      if (layoutType === "quote_card" && scene.narration) {
        const sentences = scene.narration.split(/[.!?]+/).filter(s => s.trim().length > 10);
        if (sentences.length > 0) {
          let caption = sentences[0].trim();
          if (caption.length > 70) {
            caption = caption.substring(0, 65).replace(/\s+\S*$/, "") + "...";
          }
          
          textClips.push({
            id: generateId(),
            text: caption,
            start: currentTime + 0.8,
            end: currentTime + Math.min(scene.duration - 0.5, 5),
            font: "Serif",
            size: 38,
            color: "#2a2a2a",
            x: "60",
            y: "60",
            box: true,
            box_color: "#F5F0E6",
            box_opacity: 0.95,
            textType: "quote_card",
            shadow: false,
            shadowColor: "#000000",
            shadowOffset: 0,
            animation: "fade_in_out",
            animationDuration: 0.6,
            boxPadding: 24,
          } as any);
        }
      }

      if (addDateLabels && scene.metadata?.date) {
        textClips.push({
          id: generateId(),
          text: scene.metadata.date,
          start: currentTime + 0.5,
          end: currentTime + scene.duration - 0.5,
          font: "Serif",
          size: 36,
          color: "#F5F5DC",
          x: "50",
          y: "h-80",
          box: true,
          box_color: "#1a1a1a",
          box_opacity: 0.8,
          textType: "date_label",
          shadow: false,
          shadowColor: "#000000",
          shadowOffset: 2,
          animation: "none",
          boxPadding: 12,
        } as any);
      }

      if (addDateLabels && scene.metadata?.location) {
        const dateEnd = scene.metadata.date ? 55 : 50;
        textClips.push({
          id: generateId(),
          text: scene.metadata.location,
          start: currentTime + 0.5,
          end: currentTime + scene.duration - 0.5,
          font: "Sans",
          size: 28,
          color: "#CCCCCC",
          x: `${dateEnd}`,
          y: "h-45",
          box: false,
          box_color: "#000000",
          box_opacity: 0.5,
          textType: "location_label",
          shadow: true,
          shadowColor: "#000000",
          shadowOffset: 1,
          animation: "none",
          boxPadding: 8,
        } as any);
      }

      if (addCaptions && scene.narration) {
        const words = scene.narration.split(" ");
        const wordsPerCaption = 10;
        const captionCount = Math.ceil(words.length / wordsPerCaption);
        const captionDuration = scene.duration / captionCount;

        for (let i = 0; i < captionCount; i++) {
          const captionWords = words.slice(i * wordsPerCaption, (i + 1) * wordsPerCaption);
          const captionText = captionWords.join(" ");
          
          if (captionText.trim()) {
            textClips.push({
              id: generateId(),
              text: captionText,
              start: currentTime + i * captionDuration,
              end: currentTime + (i + 1) * captionDuration,
              font: "Sans",
              size: 32,
              color: "#FFFFFF",
              x: "(w-text_w)/2",
              y: "h-100",
              box: true,
              box_color: "#000000",
              box_opacity: 0.6,
              textType: "caption",
              shadow: false,
              shadowColor: "#000000",
              shadowOffset: 1,
              animation: "none",
              boxPadding: 10,
            } as any);
          }
        }
      }

      currentTime += scene.duration;
      sceneIndex++;
    }
  }

  const totalDuration = currentTime;

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
      text: textClips,
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
