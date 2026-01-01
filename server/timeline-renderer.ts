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

function generateKenBurnsFilter(clip: TimelineVideoClip, index: number, fps: number): string {
  const d = clip.duration * fps;
  const effect = clip.effect || "none";
  
  const effects: Record<string, string> = {
    zoom_in: `zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=1920x1080:fps=${fps}`,
    zoom_out: `zoompan=z='if(lte(zoom,1.0),1.5,max(1.0,zoom-0.0015))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=1920x1080:fps=${fps}`,
    pan_left: `zoompan=z='1.2':x='iw*0.2*(1-on/${d})':y='ih/2-(ih/zoom/2)':d=${d}:s=1920x1080:fps=${fps}`,
    pan_right: `zoompan=z='1.2':x='iw*0.2*(on/${d})':y='ih/2-(ih/zoom/2)':d=${d}:s=1920x1080:fps=${fps}`,
    kenburns: `zoompan=z='if(mod(${index},2),min(zoom+0.001,1.3),if(lte(zoom,1.0),1.3,max(1.0,zoom-0.001)))':x='iw/2-(iw/zoom/2)+sin(on*0.01)*50':y='ih/2-(ih/zoom/2)':d=${d}:s=1920x1080:fps=${fps}`,
    none: `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`,
  };
  
  return effects[effect] || effects.none;
}

function generateTextFilter(clip: TimelineTextClip, index: number): string {
  const escapedText = clip.text.replace(/'/g, "'\\''").replace(/:/g, "\\:");
  const font = clip.font || "Serif";
  const size = clip.size || 48;
  const color = clip.color || "white";
  const x = clip.x || "(w-text_w)/2";
  const y = clip.y || "h-120";
  
  let filter = `drawtext=text='${escapedText}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}`;
  
  if (clip.box) {
    const boxColor = clip.box_color || "black";
    const boxOpacity = clip.box_opacity || 0.5;
    filter += `:box=1:boxcolor=${boxColor}@${boxOpacity}:boxborderw=10`;
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
    
    const [width, height] = (timeline.resolution || "1920x1080").split("x").map(Number);
    const fps = timeline.fps || 30;
    
    const localVideoClips: { clip: TimelineVideoClip; localPath: string }[] = [];
    const localAudioClips: { clip: TimelineAudioClip; localPath: string }[] = [];
    
    for (let i = 0; i < timeline.tracks.video.length; i++) {
      const clip = timeline.tracks.video[i];
      const ext = clip.src.includes(".") ? path.extname(clip.src) : ".jpg";
      const localPath = path.join(assetsDir, `video_${i}${ext}`);
      
      const downloaded = await downloadAsset(clip.src, localPath);
      if (downloaded) {
        localVideoClips.push({ clip, localPath });
      }
      
      reportProgress({ 
        status: "downloading", 
        progress: 5 + Math.floor((i / timeline.tracks.video.length) * 25), 
        message: `Downloaded video asset ${i + 1}/${timeline.tracks.video.length}` 
      });
    }
    
    for (let i = 0; i < timeline.tracks.audio.length; i++) {
      const clip = timeline.tracks.audio[i];
      const ext = clip.src.includes(".") ? path.extname(clip.src) : ".wav";
      const localPath = path.join(assetsDir, `audio_${i}${ext}`);
      
      const downloaded = await downloadAsset(clip.src, localPath);
      if (downloaded) {
        localAudioClips.push({ clip, localPath });
      }
      
      reportProgress({ 
        status: "downloading", 
        progress: 30 + Math.floor((i / Math.max(1, timeline.tracks.audio.length)) * 10), 
        message: `Downloaded audio asset ${i + 1}/${timeline.tracks.audio.length}` 
      });
    }
    
    reportProgress({ status: "rendering", progress: 40, message: "Building FFmpeg command..." });
    
    const outputPath = path.join(outputDir, `${outputName}.mp4`);
    const ffmpegArgs: string[] = [];
    
    for (const { localPath } of localVideoClips) {
      ffmpegArgs.push("-loop", "1", "-t", "0", "-i", localPath);
    }
    
    for (const { localPath } of localAudioClips) {
      ffmpegArgs.push("-i", localPath);
    }
    
    if (localVideoClips.length === 0) {
      return { success: false, outputPath: "", error: "No video clips to render" };
    }
    
    let filterComplex = "";
    const videoOutputs: string[] = [];
    
    for (let i = 0; i < localVideoClips.length; i++) {
      const { clip } = localVideoClips[i];
      const kenBurns = generateKenBurnsFilter(clip, i, fps);
      
      filterComplex += `[${i}:v]${kenBurns},format=yuv420p`;
      
      if (clip.fade_in && clip.fade_in > 0) {
        filterComplex += `,fade=t=in:st=0:d=${clip.fade_in}`;
      }
      if (clip.fade_out && clip.fade_out > 0) {
        filterComplex += `,fade=t=out:st=${clip.duration - clip.fade_out}:d=${clip.fade_out}`;
      }
      
      filterComplex += `[v${i}]; `;
      videoOutputs.push(`[v${i}]`);
    }
    
    filterComplex += videoOutputs.join("");
    filterComplex += `concat=n=${localVideoClips.length}:v=1:a=0[vconcat]; `;
    
    let finalVideoTag = "[vconcat]";
    
    if (timeline.tracks.text.length > 0) {
      let textFilters = "";
      for (let i = 0; i < timeline.tracks.text.length; i++) {
        const clip = timeline.tracks.text[i];
        textFilters += generateTextFilter(clip, i);
        if (i < timeline.tracks.text.length - 1) {
          textFilters += ",";
        }
      }
      filterComplex += `${finalVideoTag}${textFilters}[vfinal]`;
      finalVideoTag = "[vfinal]";
    }
    
    let audioTag = "";
    if (localAudioClips.length > 0) {
      const audioInputOffset = localVideoClips.length;
      const audioMerge: string[] = [];
      
      for (let i = 0; i < localAudioClips.length; i++) {
        const { clip } = localAudioClips[i];
        const inputIndex = audioInputOffset + i;
        const vol = clip.volume ?? 1.0;
        
        filterComplex += `; [${inputIndex}:a]adelay=${Math.floor(clip.start * 1000)}|${Math.floor(clip.start * 1000)},volume=${vol}`;
        
        if (clip.fade_in && clip.fade_in > 0) {
          filterComplex += `,afade=t=in:st=${clip.start}:d=${clip.fade_in}`;
        }
        if (clip.fade_out && clip.fade_out > 0 && clip.duration) {
          filterComplex += `,afade=t=out:st=${clip.start + clip.duration - clip.fade_out}:d=${clip.fade_out}`;
        }
        
        filterComplex += `[a${i}]`;
        audioMerge.push(`[a${i}]`);
      }
      
      if (audioMerge.length > 1) {
        filterComplex += `; ${audioMerge.join("")}amix=inputs=${audioMerge.length}:duration=longest[afinal]`;
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
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      "-y",
      outputPath
    );
    
    reportProgress({ status: "rendering", progress: 50, message: "Rendering with FFmpeg..." });
    
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", ffmpegArgs);
      
      let stderr = "";
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
        const match = stderr.match(/time=(\d+):(\d+):(\d+)/);
        if (match) {
          const time = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
          const pct = Math.min(90, 50 + Math.floor((time / timeline.duration) * 40));
          reportProgress({ status: "rendering", progress: pct, message: `Encoding: ${time}s / ${timeline.duration}s` });
        }
      });
      
      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
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
