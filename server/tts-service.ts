import { createClient } from "@deepgram/sdk";
import fs from "fs";
import path from "path";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

export interface TTSOptions {
  voice?: string;
  model?: string;
}

const VOICE_MODELS: Record<string, string> = {
  "male-deep": "aura-2-arcas-en",
  "male-warm": "aura-2-perseus-en", 
  "female-soft": "aura-2-thalia-en",
  "female-dramatic": "aura-2-luna-en",
  "neutral": "aura-asteria-en",
};

export async function generateSpeech(
  text: string,
  outputPath: string,
  options: TTSOptions = {}
): Promise<string> {
  if (!DEEPGRAM_API_KEY) {
    throw new Error("DEEPGRAM_API_KEY is not set. Please add your Deepgram API key.");
  }

  const deepgram = createClient(DEEPGRAM_API_KEY);
  
  const voiceKey = options.voice || "neutral";
  const model = VOICE_MODELS[voiceKey] || options.model || "aura-asteria-en";

  console.log(`[TTS] Generating speech with model: ${model}`);
  console.log(`[TTS] Text length: ${text.length} characters`);

  try {
    const response = await deepgram.speak.request(
      { text },
      {
        model,
        encoding: "mp3",
        container: "mp3",
      }
    );

    const stream = await response.getStream();
    
    if (!stream) {
      throw new Error("Failed to get audio stream from Deepgram");
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const chunks: Buffer[] = [];
    const reader = stream.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }

    const audioBuffer = Buffer.concat(chunks);
    fs.writeFileSync(outputPath, audioBuffer);

    console.log(`[TTS] Audio saved to: ${outputPath} (${audioBuffer.length} bytes)`);
    
    return outputPath;
  } catch (error: any) {
    console.error("[TTS] Error generating speech:", error);
    throw new Error(`TTS generation failed: ${error.message}`);
  }
}

export async function generateChapterVoiceover(
  projectId: number,
  chapterNumber: number,
  narration: string,
  voice: string = "neutral"
): Promise<string> {
  const outputDir = path.join(process.cwd(), "generated_assets", "audio", `project_${projectId}`);
  const outputPath = path.join(outputDir, `chapter_${chapterNumber}.mp3`);

  await generateSpeech(narration, outputPath, { voice });

  return `/generated_assets/audio/project_${projectId}/chapter_${chapterNumber}.mp3`;
}

export async function generateSceneVoiceover(
  projectId: number,
  chapterNumber: number,
  sceneNumber: number,
  narration: string,
  voice: string = "neutral"
): Promise<string> {
  const outputDir = path.join(process.cwd(), "generated_assets", "audio", `project_${projectId}`);
  const outputPath = path.join(outputDir, `ch${chapterNumber}_sc${sceneNumber}.mp3`);

  await generateSpeech(narration, outputPath, { voice });

  return `/generated_assets/audio/project_${projectId}/ch${chapterNumber}_sc${sceneNumber}.mp3`;
}

export function getAvailableVoices(): Array<{ id: string; name: string; description: string }> {
  return [
    { id: "male-deep", name: "Male - Deep & Dramatic", description: "Powerful, authoritative male voice" },
    { id: "male-warm", name: "Male - Warm & Authoritative", description: "Friendly, trustworthy male voice" },
    { id: "female-soft", name: "Female - Soft & Mysterious", description: "Gentle, captivating female voice" },
    { id: "female-dramatic", name: "Female - Dramatic Narrator", description: "Expressive, emotional female voice" },
    { id: "neutral", name: "Neutral - Documentary Style", description: "Clear, professional narration" },
  ];
}
