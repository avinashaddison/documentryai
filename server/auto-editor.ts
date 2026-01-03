import type { Timeline, TimelineVideoClip, TimelineAudioClip, TimelineTextClip } from "@shared/schema";

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
  metadata?: {
    date?: string;
    location?: string;
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

  const autoColorGrade = colorGrade || detectColorGrade(style, title);

  for (const chapter of chapters) {
    const chapterStartTime = currentTime;

    if (addChapterTitles && chapter.title) {
      textClips.push({
        id: generateId(),
        text: chapter.title.toUpperCase(),
        start: currentTime,
        end: currentTime + 3,
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
        animation: "fade_in",
        boxPadding: 20,
      } as any);
    }

    for (const scene of chapter.scenes) {
      const effect = cycleKenBurnsEffect(sceneIndex);

      videoClips.push({
        id: generateId(),
        src: scene.imageUrl,
        start: currentTime,
        duration: scene.duration,
        effect: effect as any,
        fade_in: sceneIndex === 0 ? 1 : 0.3,
        fade_out: 0.3,
        blur: false,
        colorGrade: autoColorGrade,
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
