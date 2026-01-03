import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import type { Timeline, TimelineVideoClip, TimelineAudioClip, TimelineTextClip } from "@shared/schema";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";

interface RenderProgress {
  status: "pending" | "downloading" | "rendering" | "uploading" | "complete" | "failed";
  progress: number;
  message: string;
  outputPath?: string;
  objectStorageUrl?: string;
}

type ProgressCallback = (progress: RenderProgress) => void;

async function downloadAsset(url: string, localPath: string): Promise<boolean> {
  try {
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
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

function generateTextFilter(clip: TimelineTextClip): string {
  const escapedText = clip.text.replace(/'/g, "'\\''").replace(/:/g, "\\:");
  const size = clip.size || 48;
  const color = clip.color || "white";
  const x = clip.x || "(w-text_w)/2";
  const y = clip.y || "h-120";
  const boxPadding = (clip as any).boxPadding || 10;
  
  // Choose font based on text type for documentary style
  const textType = (clip as any).textType || "caption";
  let fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  if (textType === "chapter_title" || textType === "date_label") {
    fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf";
  }
  
  let filter = `drawtext=text='${escapedText}':fontfile=${fontFile}:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}`;
  
  // Add shadow for better readability
  if ((clip as any).shadow) {
    const shadowColor = (clip as any).shadowColor || "black";
    const shadowOffset = (clip as any).shadowOffset || 2;
    filter += `:shadowcolor=${shadowColor}:shadowx=${shadowOffset}:shadowy=${shadowOffset}`;
  }
  
  // Add box background
  if (clip.box) {
    const boxColor = clip.box_color || "black";
    const boxOpacity = clip.box_opacity || 0.5;
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
      const ext = clip.src.includes(".") ? path.extname(clip.src) : ".jpg";
      const localPath = path.join(assetsDir, `video_${i}${ext}`);
      
      const downloaded = await downloadAsset(clip.src, localPath);
      if (downloaded) {
        localVideoClips.push({ clip, localPath, index: i });
      }
      
      reportProgress({ 
        status: "downloading", 
        progress: 5 + Math.floor((i / sortedVideoClips.length) * 25), 
        message: `Downloaded video asset ${i + 1}/${sortedVideoClips.length}` 
      });
    }
    
    for (let i = 0; i < sortedAudioClips.length; i++) {
      const clip = sortedAudioClips[i];
      const ext = clip.src.includes(".") ? path.extname(clip.src) : ".wav";
      const localPath = path.join(assetsDir, `audio_${i}${ext}`);
      
      const downloaded = await downloadAsset(clip.src, localPath);
      if (downloaded) {
        localAudioClips.push({ clip, localPath, index: i });
      }
      
      reportProgress({ 
        status: "downloading", 
        progress: 30 + Math.floor((i / Math.max(1, sortedAudioClips.length)) * 10), 
        message: `Downloaded audio asset ${i + 1}/${sortedAudioClips.length}` 
      });
    }
    
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
      
      // Scale image first, loop it, then apply zoompan for Ken Burns animation
      filterComplex += `[${inputIndex}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,loop=loop=-1:size=1:start=0,${kenBurns}`;
      
      // Apply color grading (documentary-style)
      const colorGrade = (clip as any).colorGrade || "none";
      const colorGradeFilter = generateColorGradeFilter(colorGrade);
      if (colorGradeFilter) {
        filterComplex += `,${colorGradeFilter}`;
      }
      
      filterComplex += `,format=yuva420p`;
      
      if (clip.fade_in && clip.fade_in > 0) {
        filterComplex += `,fade=t=in:st=0:d=${clip.fade_in}:alpha=1`;
      }
      if (clip.fade_out && clip.fade_out > 0) {
        filterComplex += `,fade=t=out:st=${clip.duration - clip.fade_out}:d=${clip.fade_out}:alpha=1`;
      }
      
      filterComplex += `,setpts=PTS+${clip.start}/TB[v${i}]; `;
      overlayInputs.push(`[v${i}]`);
    }
    
    let currentBase = "[0:v]";
    for (let i = 0; i < overlayInputs.length; i++) {
      const clip = localVideoClips[i].clip;
      const enableExpr = `between(t,${clip.start},${clip.start + clip.duration})`;
      const outputTag = i === overlayInputs.length - 1 ? "[vmerged]" : `[vtmp${i}]`;
      filterComplex += `${currentBase}${overlayInputs[i]}overlay=0:0:enable='${enableExpr}'${outputTag}; `;
      currentBase = outputTag;
    }
    
    let finalVideoTag = "[vmerged]";
    
    if (timeline.tracks.text.length > 0) {
      const textFilters = timeline.tracks.text.map((clip, i) => generateTextFilter(clip)).join(",");
      filterComplex += `${finalVideoTag}${textFilters}[vfinal]`;
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
        
        filterComplex += `; [${inputIndex}:a]adelay=${delayMs}|${delayMs}`;
        
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
        
        if (clip.fade_in && clip.fade_in > 0) {
          filterComplex += `,afade=t=in:st=0:d=${clip.fade_in}`;
        }
        if (clip.fade_out && clip.fade_out > 0 && clip.duration) {
          const fadeOutStart = clip.duration - clip.fade_out;
          filterComplex += `,afade=t=out:st=${fadeOutStart}:d=${clip.fade_out}`;
        }
        
        filterComplex += `[a${i}]`;
        audioMerge.push(`[a${i}]`);
      }
      
      if (audioMerge.length > 1) {
        filterComplex += `; ${audioMerge.join("")}amix=inputs=${audioMerge.length}:duration=longest:normalize=0[afinal]`;
        audioTag = "[afinal]";
      } else if (audioMerge.length === 1) {
        audioTag = "[a0]";
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
