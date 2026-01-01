import { spawn } from "child_process";
import path from "path";

const PYTHON_SCRIPT = path.join(import.meta.dirname, "python", "video_processor.py");

interface VideoProcessorResult {
  success: boolean;
  data?: any;
  error?: string;
}

async function runPythonCommand(command: string, args: string[] = []): Promise<VideoProcessorResult> {
  return new Promise((resolve) => {
    const pythonProcess = spawn("python", [PYTHON_SCRIPT, command, ...args]);
    
    let stdout = "";
    let stderr = "";
    
    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on("close", (code) => {
      if (code === 0) {
        try {
          const data = JSON.parse(stdout);
          resolve({ success: true, data });
        } catch {
          resolve({ success: true, data: stdout });
        }
      } else {
        resolve({ success: false, error: stderr || `Process exited with code ${code}` });
      }
    });
    
    pythonProcess.on("error", (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}

export async function detectScenes(videoPath: string, threshold: number = 27.0): Promise<VideoProcessorResult> {
  return runPythonCommand("detect_scenes", [videoPath, threshold.toString()]);
}

export async function trimVideo(inputPath: string, outputPath: string, startTime: number, endTime: number): Promise<VideoProcessorResult> {
  return runPythonCommand("trim", [inputPath, outputPath, startTime.toString(), endTime.toString()]);
}

export async function mergeVideos(outputPath: string, videoPaths: string[]): Promise<VideoProcessorResult> {
  return runPythonCommand("merge", [outputPath, ...videoPaths]);
}

export async function imagesToVideo(config: {
  images: string[];
  output: string;
  duration?: number;
  fps?: number;
  resolution?: [number, number];
  audio?: string;
  captions?: Array<{ text: string; start: number; end: number }>;
}): Promise<VideoProcessorResult> {
  return runPythonCommand("images_to_video", [JSON.stringify(config)]);
}

export async function getVideoInfo(videoPath: string): Promise<VideoProcessorResult> {
  return runPythonCommand("info", [videoPath]);
}

export async function analyzeAudio(audioPath: string): Promise<VideoProcessorResult> {
  return runPythonCommand("analyze_audio", [audioPath]);
}

export async function assembleChapterVideo(chapterData: {
  chapter_number: number;
  scenes: Array<{ image_path: string; duration: number; prompt: string }>;
  audio_path?: string;
  captions?: Array<{ text: string; start: number; end: number }>;
}, outputPath: string): Promise<VideoProcessorResult> {
  return runPythonCommand("assemble_chapter", [JSON.stringify({ chapter: chapterData, output: outputPath })]);
}

export async function assembleFullVideo(projectData: {
  title: string;
  chapters: Array<any>;
  intro_video?: string;
  outro_video?: string;
  background_music?: string;
}, outputPath: string): Promise<VideoProcessorResult> {
  return runPythonCommand("assemble_full", [JSON.stringify({ project: projectData, output: outputPath })]);
}

export async function createTitleCard(config: {
  text: string;
  output: string;
  style?: "year_title" | "chapter_title" | "date_overlay" | "location_text" | "caption";
  duration?: number;
  background_image?: string;
  background_color?: string;
  typewriter?: boolean;
}): Promise<VideoProcessorResult> {
  return runPythonCommand("title_card", [JSON.stringify(config)]);
}

export async function generateTypewriterSound(config: {
  duration: number;
  output?: string;
  chars_per_second?: number;
}): Promise<VideoProcessorResult> {
  return runPythonCommand("typewriter_sound", [JSON.stringify(config)]);
}

export async function createLetterboxScene(config: {
  image: string;
  output: string;
  caption: string;
  duration?: number;
  audio?: string;
  effect?: string;
}): Promise<VideoProcessorResult> {
  return runPythonCommand("letterbox", [JSON.stringify(config)]);
}

export async function createPipScene(config: {
  main_image: string;
  inset_image: string;
  output: string;
  duration?: number;
  audio?: string;
  inset_position?: "top_left" | "top_right" | "bottom_left" | "bottom_right";
  inset_size?: number;
  border_color?: string;
}): Promise<VideoProcessorResult> {
  return runPythonCommand("pip", [JSON.stringify(config)]);
}

export async function createQuoteBoxScene(config: {
  image: string;
  output: string;
  quote: string;
  duration?: number;
  audio?: string;
  effect?: string;
  position?: "top_left" | "top_right" | "bottom_left" | "center";
  typewriter?: boolean;
}): Promise<VideoProcessorResult> {
  return runPythonCommand("quote_box", [JSON.stringify(config)]);
}

export async function createDateStampScene(config: {
  image: string;
  output: string;
  date: string;
  duration?: number;
  audio?: string;
  effect?: string;
}): Promise<VideoProcessorResult> {
  return runPythonCommand("date_stamp", [JSON.stringify(config)]);
}

export async function createSplitScreenScene(config: {
  left_image: string;
  right_image: string;
  output: string;
  duration?: number;
  audio?: string;
  gap_width?: number;
}): Promise<VideoProcessorResult> {
  return runPythonCommand("split_screen", [JSON.stringify(config)]);
}

export async function createPortraitTitleCard(config: {
  background: string;
  portrait: string;
  output: string;
  title: string;
  subtitle?: string;
  duration?: number;
  audio?: string;
  border_color?: string;
}): Promise<VideoProcessorResult> {
  return runPythonCommand("portrait_title", [JSON.stringify(config)]);
}

export const videoService = {
  detectScenes,
  trimVideo,
  mergeVideos,
  imagesToVideo,
  getVideoInfo,
  analyzeAudio,
  assembleChapterVideo,
  assembleFullVideo,
  createTitleCard,
  generateTypewriterSound,
  createLetterboxScene,
  createPipScene,
  createQuoteBoxScene,
  createDateStampScene,
  createSplitScreenScene,
  createPortraitTitleCard,
};
