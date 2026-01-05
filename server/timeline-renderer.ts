import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import type { Timeline, TimelineVideoClip, TimelineAudioClip, TimelineTextClip, LayoutType } from "@shared/schema";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";

// Escape text for FFmpeg drawtext filter
// Single escape for special characters when text is wrapped in single quotes
function escapeForDrawtext(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")       // Backslash
    .replace(/'/g, "'\\''")       // Single quote - close, escape, reopen
    .replace(/:/g, "\\:")         // Colon
    .replace(/\n/g, "\\n");       // Newlines
}

interface RenderProgress {
  status: "pending" | "downloading" | "rendering" | "uploading" | "complete" | "failed";
  progress: number;
  message: string;
  outputPath?: string;
  objectStorageUrl?: string;
}

type ProgressCallback = (progress: RenderProgress) => void;

// Validate that a downloaded image file is valid (not empty/corrupt)
async function validateImageFile(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(filePath);
    // Image files should be at least 1KB to be valid
    if (stats.size < 1000) {
      console.log(`[TimelineRenderer] Image file too small (${stats.size} bytes), likely corrupt: ${filePath}`);
      return false;
    }
    
    // Check for valid image headers (JPEG, PNG, WebP)
    const buffer = Buffer.alloc(12);
    const fd = await fs.promises.open(filePath, 'r');
    await fd.read(buffer, 0, 12, 0);
    await fd.close();
    
    // Check JPEG: starts with 0xFFD8FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return true;
    }
    // Check PNG: starts with 0x89504E47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return true;
    }
    // Check WebP: starts with RIFF...WEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return true;
    }
    
    console.log(`[TimelineRenderer] Invalid image header in: ${filePath}`);
    return false;
  } catch (e) {
    console.log(`[TimelineRenderer] Error validating image: ${filePath}`, e);
    return false;
  }
}

async function downloadAsset(url: string, localPath: string): Promise<boolean> {
  try {
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Handle /public/audio/ paths - check local files first, then object storage
    if (url.startsWith("/public/audio/") || url.startsWith("/public/")) {
      // First, check if file exists locally (remove leading slash)
      const localFilePath = url.replace(/^\//, "");
      if (fs.existsSync(localFilePath)) {
        await fs.promises.copyFile(localFilePath, localPath);
        console.log(`[TimelineRenderer] Copied from local: ${localFilePath}`);
        return true;
      }
      
      // Then try object storage
      try {
        const objectPath = url.replace(/^\//, "");
        const bucket = objectStorageClient.bucket("replit-objstore");
        const file = bucket.file(objectPath);
        const [exists] = await file.exists();
        
        if (exists) {
          await file.download({ destination: localPath });
          console.log(`[TimelineRenderer] Downloaded from object storage: ${objectPath}`);
          return true;
        }
      } catch (e) {
        console.error(`[TimelineRenderer] Object storage download failed for ${url}:`, e);
      }
      console.error(`[TimelineRenderer] Audio file not found: ${url}`);
      return false;
    }

    if (url.startsWith("/objects/public/")) {
      const publicSearchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map(p => p.trim()).filter(Boolean);
      if (publicSearchPaths.length === 0) return false;
      
      const relativePath = url.replace("/objects/public/", "");
      for (const searchPath of publicSearchPaths) {
        try {
          const fullObjectPath = `${searchPath}/${relativePath}`;
          const pathParts = fullObjectPath.split("/").filter(Boolean);
          const bucketName = pathParts[0];
          const objectName = pathParts.slice(1).join("/");
          
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          const [exists] = await file.exists();
          
          if (exists) {
            await file.download({ destination: localPath });
            return true;
          }
        } catch (e) {
          continue;
        }
      }
      return false;
    } else if (url.startsWith("http://") || url.startsWith("https://")) {
      const response = await fetch(url);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.promises.writeFile(localPath, buffer);
        return true;
      }
      return false;
    } else if (fs.existsSync(url)) {
      await fs.promises.copyFile(url, localPath);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`[TimelineRenderer] Failed to download asset ${url}:`, error);
    return false;
  }
}

function generateKenBurnsFilter(effect: string, duration: number, index: number, fps: number): string {
  const d = Math.ceil(duration * fps);
  
  // Note: Input is already scaled to 1920x1080 and looped before this filter
  // zoompan generates d frames at fps framerate with motion effects
  const effects: Record<string, string> = {
    zoom_in: `zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=1920x1080:fps=${fps}`,
    zoom_out: `zoompan=z='if(lte(zoom,1.0),1.5,max(1.0,zoom-0.0015))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=1920x1080:fps=${fps}`,
    pan_left: `zoompan=z='1.2':x='iw*0.2*(1-on/${d})':y='ih/2-(ih/zoom/2)':d=${d}:s=1920x1080:fps=${fps}`,
    pan_right: `zoompan=z='1.2':x='iw*0.2*(on/${d})':y='ih/2-(ih/zoom/2)':d=${d}:s=1920x1080:fps=${fps}`,
    kenburns: `zoompan=z='if(mod(${index},2),min(zoom+0.001,1.3),if(lte(zoom,1.0),1.3,max(1.0,zoom-0.001)))':x='iw/2-(iw/zoom/2)+sin(on*0.01)*50':y='ih/2-(ih/zoom/2)':d=${d}:s=1920x1080:fps=${fps}`,
    // For "none", just trim the looped frames to the right duration without motion
    none: `trim=duration=${duration},fps=${fps}`,
  };
  
  return effects[effect] || effects.none;
}

// Documentary-style color grading filters
function generateColorGradeFilter(colorGrade: string): string {
  const grades: Record<string, string> = {
    none: "",
    grayscale: "colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3",
    sepia: "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=saturation=0.8",
    vintage: "curves=vintage,eq=saturation=0.85:contrast=1.1",
    warm: "colortemperature=temperature=6500,eq=saturation=1.1:contrast=1.05",
    cool: "colortemperature=temperature=8500,eq=saturation=0.95",
  };
  
  return grades[colorGrade] || "";
}

// Professional film grain filter for authentic documentary look
function generateFilmGrainFilter(intensity: number = 15): string {
  // Use noise filter for organic film grain
  // alls = all-planes strength (0-100)
  // Simple noise without flags works more reliably across FFmpeg versions
  const strength = Math.min(100, Math.max(0, intensity));
  return `noise=alls=${strength}`;
}

// Vignette effect for cinematic darkened corners
function generateVignetteFilter(intensity: number = 0.3): string {
  // vignette filter: angle controls fall-off gradient
  // Use standard vignette filter with proper named parameters
  // angle in radians: PI/4 for natural circular vignette
  return `vignette=angle=PI/4`;
}

// Letterbox bars for cinematic widescreen look
function generateLetterboxFilter(barHeight: number = 100): string {
  // Draw black bars at top and bottom for 2.35:1 aspect ratio feel
  const topBar = `drawbox=x=0:y=0:w=1920:h=${barHeight}:c=black:t=fill`;
  const bottomBar = `drawbox=x=0:y=${1080 - barHeight}:w=1920:h=${barHeight}:c=black:t=fill`;
  return `${topBar},${bottomBar}`;
}

// Contrast and sharpening for documentary punch
function generateDocumentaryEnhanceFilter(): string {
  // Slight contrast boost + subtle sharpening for crisp documentary look
  return `eq=contrast=1.05:brightness=0.02,unsharp=5:5:0.5:5:5:0.3`;
}

// Smooth video transitions using FFmpeg xfade filter
function getXfadeTransition(transitionType: string): string {
  const transitions: Record<string, string> = {
    none: "fade",
    fade: "fade",
    dissolve: "dissolve",
    wipeleft: "wipeleft",
    wiperight: "wiperight",
    wipeup: "wipeup",
    wipedown: "wipedown",
    slideleft: "slideleft",
    slideright: "slideright",
    slideup: "slideup",
    slidedown: "slidedown",
    circleopen: "circleopen",
    circleclose: "circleclose",
    radial: "radial",
    smoothleft: "smoothleft",
    smoothright: "smoothright",
    smoothup: "smoothup",
    smoothdown: "smoothdown",
    zoomin: "zoomin",
  };
  return transitions[transitionType] || "fade";
}

// Generate typewriter effect - multiple drawtext filters showing characters appearing one by one
// Returns an array of filter strings, each showing progressively more characters
function generateTypewriterTextFilters(clip: TimelineTextClip): string[] {
  const text = clip.text;
  const size = clip.size || 220;
  const color = clip.color || "#F5F0E6";
  const x = clip.x || "(w-text_w)/2";
  const y = clip.y || "(h-text_h)/2";
  const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf";
  
  // Timing: each character appears every 0.15 seconds
  const charDelay = 0.15;
  const holdTime = clip.end - clip.start - (text.length * charDelay) - 0.8; // Time to hold full text before fade out
  const fadeOutDuration = 0.8;
  
  const filters: string[] = [];
  
  // Create a filter for each character reveal stage
  for (let i = 1; i <= text.length; i++) {
    const partialText = escapeForDrawtext(text.substring(0, i));
    const charStart = clip.start + (i - 1) * charDelay;
    const charEnd = i === text.length 
      ? clip.end // Last character stays until end
      : clip.start + i * charDelay; // Previous chars hidden when next appears
    
    // For the final complete text, add fade out
    let alphaExpr = "1";
    if (i === text.length) {
      const fadeOutStart = clip.end - fadeOutDuration;
      alphaExpr = `if(gt(t,${fadeOutStart}),1-(t-${fadeOutStart})/${fadeOutDuration},1)`;
    }
    
    let filter = `drawtext=text='${partialText}':fontfile=${fontFile}:fontsize=${size}:fontcolor=${color}:alpha='${alphaExpr}':x=${x}:y=${y}`;
    filter += `:shadowcolor=black@0.6:shadowx=10:shadowy=10:borderw=4:bordercolor=black@0.3`;
    filter += `:enable='between(t,${charStart},${charEnd})'`;
    
    filters.push(filter);
  }
  
  return filters;
}

// Generate animated text filter with motion effects
// Uses FFmpeg drawtext with alpha expressions for smooth animations
function generateAnimatedTextFilter(clip: TimelineTextClip): string {
  const escapedText = escapeForDrawtext(clip.text);
  const size = clip.size || 48;
  const color = clip.color || "white";
  const boxPadding = (clip as any).boxPadding || 10;
  const animation = (clip as any).animation || "none";
  const animDuration = (clip as any).animationDuration || 0.5;
  
  // Base position
  let x = clip.x || "(w-text_w)/2";
  let y = clip.y || "h-120";
  
  // Choose font based on text type
  const textType = (clip as any).textType || "caption";
  let fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  
  if (textType === "chapter_title" || textType === "chapter_number" || textType === "date_label" || textType === "era_splash" || textType === "year_splash" || textType === "location_label" || textType === "quote_card" || textType === "place_splash") {
    fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf";
  }
  // Use sans-serif bold for character names (cleaner lower-third look)
  if (textType === "character_lower_third") {
    fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  }
  
  // Use the size passed in from the clip - scene-aware sizing is done at the caller level
  let actualSize = size;
  // Only override for legacy text types that don't specify their own size
  if (textType === "era_splash" && size < 100) {
    actualSize = 220;
  } else if (textType === "chapter_title" && size < 50) {
    actualSize = 56;
  } else if (textType === "quote_card" && size < 30) {
    actualSize = 36;
  } else if (textType === "caption" && size < 30) {
    actualSize = 40;
  }
  
  // Animation alpha expressions - use 'alpha' option for dynamic transparency
  let alphaExpr = "1";
  let fontSizeExpr = String(actualSize);
  
  const fadeInEnd = clip.start + animDuration;
  const fadeOutStart = clip.end - animDuration;
  
  switch (animation) {
    case "fade_in":
      alphaExpr = `if(lt(t,${fadeInEnd}),(t-${clip.start})/${animDuration},1)`;
      break;
    case "fade_out":
      alphaExpr = `if(gt(t,${fadeOutStart}),1-(t-${fadeOutStart})/${animDuration},1)`;
      break;
    case "fade_in_out":
      alphaExpr = `if(lt(t,${fadeInEnd}),(t-${clip.start})/${animDuration},if(gt(t,${fadeOutStart}),1-(t-${fadeOutStart})/${animDuration},1))`;
      break;
    case "scale_in":
      fontSizeExpr = `if(lt(t,${fadeInEnd}),${actualSize}*((t-${clip.start})/${animDuration}),${actualSize})`;
      alphaExpr = `if(lt(t,${fadeInEnd}),(t-${clip.start})/${animDuration},1)`;
      break;
    case "scale_bounce":
      fontSizeExpr = `if(lt(t,${fadeInEnd}),${actualSize}*(1.2-0.2*cos(3.14*(t-${clip.start})/${animDuration})),${actualSize})`;
      break;
    case "slide_up":
      // Simplified slide - just use fade for now
      alphaExpr = `if(lt(t,${fadeInEnd}),(t-${clip.start})/${animDuration},1)`;
      break;
    case "typewriter":
      // Typewriter effect - quick fade in, hold, then fade out
      // Creates a snappy "pop in" feel like text appearing on a typewriter
      alphaExpr = `if(lt(t,${fadeInEnd}),(t-${clip.start})/${animDuration},if(gt(t,${fadeOutStart}),1-(t-${fadeOutStart})/${animDuration},1))`;
      break;
    default:
      alphaExpr = "1";
  }
  
  // Build filter with alpha option for dynamic transparency
  let filter = `drawtext=text='${escapedText}':fontfile=${fontFile}:fontsize=${fontSizeExpr}:fontcolor=${color}:alpha='${alphaExpr}':x=${x}:y=${y}`;
  
  // Add shadow for better readability
  if ((clip as any).shadow || textType === "era_splash" || textType === "year_splash" || textType === "chapter_title") {
    const shadowColor = (clip as any).shadowColor || "black";
    let shadowOffset = 3;
    if (textType === "era_splash" || textType === "year_splash") shadowOffset = 10;
    else if (textType === "chapter_title") shadowOffset = 4;
    filter += `:shadowcolor=${shadowColor}:shadowx=${shadowOffset}:shadowy=${shadowOffset}`;
  }
  
  // Add outline for motion graphics style
  if ((clip as any).outline) {
    const outlineColor = (clip as any).outlineColor || "black";
    const outlineWidth = (clip as any).outlineWidth || 2;
    filter += `:borderw=${outlineWidth}:bordercolor=${outlineColor}`;
  }
  
  // Add box background
  if (clip.box || textType === "quote_card") {
    const boxColor = clip.box_color || "#F5F0E6";
    const boxOpacity = clip.box_opacity || 0.92;
    filter += `:box=1:boxcolor=${boxColor}@${boxOpacity}:boxborderw=${boxPadding}`;
  }
  
  filter += `:enable='between(t,${clip.start},${clip.end})'`;
  
  return filter;
}

function generateTextFilter(clip: TimelineTextClip): string {
  const escapedText = escapeForDrawtext(clip.text);
  const size = clip.size || 48;
  const color = clip.color || "white";
  const x = clip.x || "(w-text_w)/2";
  const y = clip.y || "h-120";
  const boxPadding = (clip as any).boxPadding || 10;
  
  // Choose font based on text type for professional documentary style
  const textType = (clip as any).textType || "caption";
  let fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  
  // Use serif fonts for titles, dates, and era splashes (like the "1945" style)
  if (textType === "chapter_title" || textType === "chapter_number" || textType === "date_label" || textType === "era_splash" || textType === "year_splash" || textType === "location_label" || textType === "quote_card" || textType === "place_splash") {
    fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf";
  }
  // Use sans-serif for character names (cleaner look for lower-thirds)
  if (textType === "character_lower_third") {
    fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  }
  
  // Determine font size based on text type for proper documentary styling
  let actualSize = size;
  if (textType === "era_splash") {
    actualSize = 220; // Very large dramatic year text like "1945"
  } else if (textType === "chapter_title") {
    actualSize = 56; // Chapter titles like "Encirclement and Denial"
  } else if (textType === "quote_card") {
    actualSize = 36; // Quote cards in upper-left
  } else if (textType === "caption") {
    actualSize = 40;
  }
  
  let filter = `drawtext=text='${escapedText}':fontfile=${fontFile}:fontsize=${actualSize}:fontcolor=${color}:x=${x}:y=${y}`;
  
  // Add shadow for better readability - documentary style uses heavier shadows
  if ((clip as any).shadow || textType === "era_splash" || textType === "chapter_title") {
    const shadowColor = (clip as any).shadowColor || "black";
    let shadowOffset = 3;
    if (textType === "era_splash") shadowOffset = 10;
    else if (textType === "chapter_title") shadowOffset = 4;
    filter += `:shadowcolor=${shadowColor}:shadowx=${shadowOffset}:shadowy=${shadowOffset}`;
  }
  
  // Add box background for quote cards and captions
  if (clip.box || textType === "quote_card") {
    const boxColor = clip.box_color || "#F5F0E6";
    const boxOpacity = clip.box_opacity || 0.92;
    filter += `:box=1:boxcolor=${boxColor}@${boxOpacity}:boxborderw=${boxPadding}`;
  }
  
  filter += `:enable='between(t,${clip.start},${clip.end})'`;
  
  return filter;
}

export async function renderTimeline(
  timeline: Timeline, 
  outputName: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; outputPath: string; objectStorageUrl?: string; error?: string }> {
  const tempDir = path.join(process.cwd(), "temp_timeline");
  const outputDir = path.join(process.cwd(), "generated_videos");
  const assetsDir = path.join(tempDir, `timeline_${Date.now()}`);
  
  const reportProgress = (progress: RenderProgress) => {
    console.log(`[TimelineRenderer] ${progress.status}: ${progress.message} (${progress.progress}%)`);
    onProgress?.(progress);
  };
  
  try {
    await fs.promises.mkdir(tempDir, { recursive: true });
    await fs.promises.mkdir(outputDir, { recursive: true });
    await fs.promises.mkdir(assetsDir, { recursive: true });
    
    reportProgress({ status: "downloading", progress: 5, message: "Downloading assets..." });
    
    const fps = timeline.fps || 30;
    const totalDuration = timeline.duration;
    
    const sortedVideoClips = [...timeline.tracks.video].sort((a, b) => a.start - b.start);
    const sortedAudioClips = [...timeline.tracks.audio].sort((a, b) => a.start - b.start);
    
    const localVideoClips: { clip: TimelineVideoClip; localPath: string; index: number }[] = [];
    const localAudioClips: { clip: TimelineAudioClip; localPath: string; index: number }[] = [];
    
    for (let i = 0; i < sortedVideoClips.length; i++) {
      const clip = sortedVideoClips[i];
      // Strip query parameters from URL before extracting extension
      const cleanSrc = clip.src.split('?')[0].split('#')[0];
      let ext = path.extname(cleanSrc);
      // Default to .jpg if no extension or invalid extension
      if (!ext || ext === '.' || ext.length < 2) {
        ext = ".jpg";
      }
      const localPath = path.join(assetsDir, `video_${i}${ext}`);
      
      const downloaded = await downloadAsset(clip.src, localPath);
      if (downloaded) {
        // Validate the image is not corrupt
        const isValid = await validateImageFile(localPath);
        if (isValid) {
          localVideoClips.push({ clip, localPath, index: i });
        } else {
          console.log(`[TimelineRenderer] Skipping corrupt image ${i}: ${clip.src}`);
          // Delete the corrupt file
          try { await fs.promises.unlink(localPath); } catch {}
        }
      }
      
      reportProgress({ 
        status: "downloading", 
        progress: 5 + Math.floor((i / sortedVideoClips.length) * 25), 
        message: `Downloaded video asset ${i + 1}/${sortedVideoClips.length}` 
      });
    }
    
    console.log(`[TimelineRenderer] Processing ${sortedAudioClips.length} audio clips`);
    for (let i = 0; i < sortedAudioClips.length; i++) {
      const clip = sortedAudioClips[i];
      console.log(`[TimelineRenderer] Audio clip ${i}: src=${clip.src}`);
      // Strip query parameters from URL before extracting extension
      const cleanAudioSrc = clip.src.split('?')[0].split('#')[0];
      const ext = cleanAudioSrc.includes(".") ? path.extname(cleanAudioSrc) : ".wav";
      const localPath = path.join(assetsDir, `audio_${i}${ext}`);
      
      const downloaded = await downloadAsset(clip.src, localPath);
      console.log(`[TimelineRenderer] Audio ${i} download result: ${downloaded}, localPath: ${localPath}`);
      if (downloaded) {
        localAudioClips.push({ clip, localPath, index: i });
      }
      
      reportProgress({ 
        status: "downloading", 
        progress: 30 + Math.floor((i / Math.max(1, sortedAudioClips.length)) * 10), 
        message: `Downloaded audio asset ${i + 1}/${sortedAudioClips.length}` 
      });
    }
    console.log(`[TimelineRenderer] Successfully downloaded ${localAudioClips.length} audio clips`);
    
    if (localVideoClips.length === 0) {
      return { success: false, outputPath: "", error: "No video clips to render" };
    }
    
    reportProgress({ status: "rendering", progress: 40, message: "Building FFmpeg command..." });
    
    const outputPath = path.join(outputDir, `${outputName}.mp4`);
    const ffmpegArgs: string[] = [];
    
    ffmpegArgs.push(
      "-f", "lavfi",
      "-i", `color=c=black:s=1920x1080:r=${fps}:d=${totalDuration}`,
    );
    
    for (const { localPath, clip } of localVideoClips) {
      // Don't use -loop with zoompan - zoompan generates its own frames via 'd' parameter
      // Just use -framerate 1 to indicate it's a single image
      ffmpegArgs.push("-framerate", "1", "-i", localPath);
    }
    
    for (const { localPath } of localAudioClips) {
      ffmpegArgs.push("-i", localPath);
    }
    
    let filterComplex = "";
    const overlayInputs: string[] = [];
    
    for (let i = 0; i < localVideoClips.length; i++) {
      const { clip, index } = localVideoClips[i];
      const inputIndex = i + 1;
      const effect = clip.effect || "none";
      const kenBurns = generateKenBurnsFilter(effect, clip.duration, index, fps);
      const layoutType: LayoutType = clip.layoutType || "standard";
      
      // Base scaling and Ken Burns
      filterComplex += `[${inputIndex}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,loop=loop=-1:size=1:start=0,${kenBurns}`;
      
      // Apply color grading (documentary-style - always grayscale for B&W)
      const colorGrade = (clip as any).colorGrade || "grayscale";
      const colorGradeFilter = generateColorGradeFilter(colorGrade);
      if (colorGradeFilter) {
        filterComplex += `,${colorGradeFilter}`;
      }
      
      // Apply documentary enhancement (contrast + sharpening)
      const enhanceFilter = generateDocumentaryEnhanceFilter();
      filterComplex += `,${enhanceFilter}`;
      
      // Apply film grain for authentic look (subtle: 8-12 intensity)
      const filmGrainIntensity = (clip as any).filmGrain ?? 10;
      if (filmGrainIntensity > 0) {
        const grainFilter = generateFilmGrainFilter(filmGrainIntensity);
        filterComplex += `,${grainFilter}`;
      }
      
      // Apply vignette for cinematic darkened corners
      const vignetteIntensity = (clip as any).vignette ?? 0.25;
      if (vignetteIntensity > 0) {
        const vignetteFilter = generateVignetteFilter(vignetteIntensity);
        filterComplex += `,${vignetteFilter}`;
      }
      
      // Apply layout-specific compositing
      if (layoutType === "letterbox") {
        // Add black letterbox bars (140px top and bottom)
        filterComplex += `,drawbox=x=0:y=0:w=1920:h=140:c=black:t=fill`;
        filterComplex += `,drawbox=x=0:y=940:w=1920:h=140:c=black:t=fill`;
        
        // Add caption text at bottom center if available
        const letterboxCaption = clip.letterboxCaption;
        if (letterboxCaption) {
          const escapedCaption = escapeForDrawtext(letterboxCaption);
          filterComplex += `,drawtext=text='${escapedCaption}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf:fontsize=36:fontcolor=#F5F0E6:x=(w-text_w)/2:y=980:shadowcolor=black:shadowx=2:shadowy=2`;
        }
      } else if (layoutType === "era_splash") {
        // Dark overlay for dramatic era splash effect
        filterComplex += `,colorlevels=rimax=0.7:gimax=0.7:bimax=0.7`;
      }
      
      filterComplex += `,format=yuva420p`;
      
      // Ensure duration is valid for fade calculations
      const safeDuration = (clip.duration && !isNaN(clip.duration)) ? clip.duration : 5;
      
      if (clip.fade_in && clip.fade_in > 0) {
        filterComplex += `,fade=t=in:st=0:d=${clip.fade_in}:alpha=1`;
      }
      if (clip.fade_out && clip.fade_out > 0) {
        filterComplex += `,fade=t=out:st=${safeDuration - clip.fade_out}:d=${clip.fade_out}:alpha=1`;
      }
      
      filterComplex += `,setpts=PTS+${clip.start}/TB[v${i}]; `;
      overlayInputs.push(`[v${i}]`);
    }
    
    let currentBase = "[0:v]";
    for (let i = 0; i < overlayInputs.length; i++) {
      const clip = localVideoClips[i].clip;
      // Ensure duration is valid - use fallback of 5 seconds if undefined/NaN
      const clipDuration = (clip.duration && !isNaN(clip.duration)) ? clip.duration : 5;
      const clipEnd = clip.start + clipDuration;
      const enableExpr = `between(t,${clip.start},${clipEnd})`;
      const outputTag = i === overlayInputs.length - 1 ? "[vmerged]" : `[vtmp${i}]`;
      filterComplex += `${currentBase}${overlayInputs[i]}overlay=0:0:enable='${enableExpr}'${outputTag}`;
      if (i < overlayInputs.length - 1) {
        filterComplex += "; ";
      }
      currentBase = outputTag;
    }
    
    let finalVideoTag = "[vmerged]";
    
    if (timeline.tracks.text.length > 0) {
      // Use animated text filter for professional motion graphics
      const allTextFilters: string[] = [];
      
      for (const clip of timeline.tracks.text) {
        const textType = (clip as any).textType || "caption";
        const animation = (clip as any).animation || "none";
        
        // Use typewriter effect for year/era splash text
        if (textType === "era_splash" || textType === "year_splash") {
          const typewriterFilters = generateTypewriterTextFilters(clip);
          allTextFilters.push(...typewriterFilters);
        } else if (animation !== "none") {
          allTextFilters.push(generateAnimatedTextFilter(clip));
        } else {
          allTextFilters.push(generateTextFilter(clip));
        }
      }
      
      const textFilters = allTextFilters.join(",");
      // Add semicolon separator before text filter section
      filterComplex += `; ${finalVideoTag}${textFilters}[vfinal]`;
      finalVideoTag = "[vfinal]";
    }
    
    let audioTag = "";
    if (localAudioClips.length > 0) {
      const audioInputOffset = 1 + localVideoClips.length;
      const audioMerge: string[] = [];
      
      // Find narration clips for ducking
      const narrationClips = localAudioClips
        .filter(({ clip }) => (clip as any).audioType === "narration")
        .map(({ clip }) => ({ start: clip.start, end: clip.start + (clip.duration || 0) }));
      
      for (let i = 0; i < localAudioClips.length; i++) {
        const { clip } = localAudioClips[i];
        const inputIndex = audioInputOffset + i;
        const baseVol = clip.volume ?? 1.0;
        const delayMs = Math.floor(clip.start * 1000);
        const audioType = (clip as any).audioType;
        const shouldDuck = clip.ducking && audioType === "music" && narrationClips.length > 0;
        
        // Add delay and pad with silence to ensure proper mixing
        filterComplex += `; [${inputIndex}:a]adelay=${delayMs}|${delayMs},apad=whole_dur=${Math.ceil(totalDuration)}`;
        
        if (shouldDuck) {
          // Build volume expression that ducks during narration
          // Ducked volume is 30% of base, transitions over 0.3s
          const duckVol = baseVol * 0.3;
          let volumeExpr = `${baseVol}`;
          
          // Build dynamic volume expression
          const conditions: string[] = [];
          for (const narr of narrationClips) {
            // Duck from 0.5s before narration starts to 0.3s after it ends
            const duckStart = Math.max(0, narr.start - 0.5);
            const duckEnd = narr.end + 0.3;
            conditions.push(`between(t,${duckStart},${duckEnd})`);
          }
          
          if (conditions.length > 0) {
            volumeExpr = `if(${conditions.join("+")},${duckVol},${baseVol})`;
          }
          
          filterComplex += `,volume='${volumeExpr}':eval=frame`;
        } else {
          filterComplex += `,volume=${baseVol}`;
        }
        
        if (clip.fade_in && clip.fade_in > 0 && audioType !== "narration") {
          filterComplex += `,afade=t=in:st=0:d=${clip.fade_in}`;
        }
        if (clip.fade_out && clip.fade_out > 0 && clip.duration && audioType !== "narration") {
          const fadeOutStart = clip.duration - clip.fade_out;
          filterComplex += `,afade=t=out:st=${fadeOutStart}:d=${clip.fade_out}`;
        }
        
        filterComplex += `[a${i}]`;
        audioMerge.push(`[a${i}]`);
      }
      
      if (audioMerge.length > 1) {
        // Mix all audio tracks, then apply loudness normalization for broadcast quality
        // loudnorm targets: I=-16 LUFS (broadcast standard), TP=-1.5 dB (true peak), LRA=11 (loudness range)
        filterComplex += `; ${audioMerge.join("")}amix=inputs=${audioMerge.length}:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[afinal]`;
        audioTag = "[afinal]";
      } else if (audioMerge.length === 1) {
        // Single audio track - apply normalization for consistent levels
        // The [a0] label was created in the loop above, apply loudnorm to it
        filterComplex += `; [a0]loudnorm=I=-16:TP=-1.5:LRA=11[afinal]`;
        audioTag = "[afinal]";
      }
    }
    
    ffmpegArgs.push("-filter_complex", filterComplex);
    ffmpegArgs.push("-map", finalVideoTag);
    
    if (audioTag) {
      ffmpegArgs.push("-map", audioTag);
    }
    
    ffmpegArgs.push(
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-t", String(totalDuration),
      "-y",
      outputPath
    );
    
    reportProgress({ status: "rendering", progress: 50, message: "Rendering with FFmpeg..." });
    
    console.log("[TimelineRenderer] FFmpeg args:", ffmpegArgs.join(" "));
    
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", ffmpegArgs);
      
      let stderr = "";
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
        const match = stderr.match(/time=(\d+):(\d+):(\d+)/);
        if (match) {
          const time = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
          const pct = Math.min(90, 50 + Math.floor((time / totalDuration) * 40));
          reportProgress({ status: "rendering", progress: pct, message: `Encoding: ${time}s / ${totalDuration}s` });
        }
      });
      
      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          console.error("[TimelineRenderer] FFmpeg stderr:", stderr);
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-1000)}`));
        }
      });
      
      ffmpeg.on("error", reject);
    });
    
    reportProgress({ status: "uploading", progress: 90, message: "Uploading to storage..." });
    
    let objectStorageUrl = "";
    try {
      const publicSearchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map(p => p.trim()).filter(Boolean);
      if (publicSearchPaths.length > 0) {
        const videoBuffer = await fs.promises.readFile(outputPath);
        const videoFileName = `videos/${outputName}.mp4`;
        
        const pathParts = publicSearchPaths[0].split("/").filter(Boolean);
        const bucketName = pathParts[0];
        const basePath = pathParts.slice(1).join("/");
        
        const bucket = objectStorageClient.bucket(bucketName);
        const fullPath = basePath ? `${basePath}/${videoFileName}` : videoFileName;
        const file = bucket.file(fullPath);
        
        await file.save(videoBuffer, {
          contentType: "video/mp4",
          metadata: {
            timeline: "true",
            resolution: timeline.resolution || "1920x1080",
            fps: String(timeline.fps || 30),
            createdAt: new Date().toISOString()
          }
        });
        
        objectStorageUrl = `/objects/public/${videoFileName}`;
      }
    } catch (uploadErr) {
      console.error("[TimelineRenderer] Upload failed:", uploadErr);
    }
    
    try {
      await fs.promises.rm(assetsDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn("[TimelineRenderer] Cleanup warning:", cleanupErr);
    }
    
    reportProgress({ 
      status: "complete", 
      progress: 100, 
      message: "Render complete!", 
      outputPath, 
      objectStorageUrl 
    });
    
    return { success: true, outputPath, objectStorageUrl };
  } catch (error: any) {
    reportProgress({ status: "failed", progress: 0, message: error.message });
    
    try {
      await fs.promises.rm(assetsDir, { recursive: true, force: true });
    } catch {}
    
    return { success: false, outputPath: "", error: error.message };
  }
}
