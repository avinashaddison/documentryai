import { createClient } from "@deepgram/sdk";
import { objectStorageClient } from "./replit_integrations/object_storage";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

export interface TTSOptions {
  voice?: string;
  model?: string;
}

const VOICE_MODELS: Record<string, string> = {
  "narrator": "aura-2-mars-en",
  "male-deep": "aura-2-zeus-en",
  "male-warm": "aura-2-arcas-en", 
  "female-soft": "aura-2-athena-en",
  "female-dramatic": "aura-2-luna-en",
  "neutral": "aura-2-asteria-en",
};

function getBucketId(): string {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set. Please set up Object Storage first.");
  }
  return bucketId;
}

export async function generateSpeechToStorage(
  text: string,
  objectPath: string,
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
        encoding: "linear16",
        sample_rate: 24000,
      }
    );

    const stream = await response.getStream();
    
    if (!stream) {
      throw new Error("Failed to get audio stream from Deepgram");
    }

    const chunks: Buffer[] = [];
    const reader = stream.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }

    const audioBuffer = Buffer.concat(chunks);
    
    const bucketId = getBucketId();
    const bucket = objectStorageClient.bucket(bucketId);
    const file = bucket.file(objectPath);
    
    await file.save(audioBuffer, {
      contentType: "audio/wav",
      metadata: {
        "custom:aclPolicy": JSON.stringify({ visibility: "public", owner: "system" }),
      },
    });

    const publicUrl = `/objects/${objectPath}`;
    console.log(`[TTS] Audio saved to object storage: ${publicUrl} (${audioBuffer.length} bytes)`);
    
    return publicUrl;
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
  const objectPath = `public/audio/project_${projectId}/chapter_${chapterNumber}.wav`;
  return generateSpeechToStorage(narration, objectPath, { voice });
}

export async function generateSceneVoiceover(
  projectId: number,
  chapterNumber: number,
  sceneNumber: number,
  narration: string,
  voice: string = "neutral"
): Promise<string> {
  const objectPath = `public/audio/project_${projectId}/ch${chapterNumber}_sc${sceneNumber}.wav`;
  return generateSpeechToStorage(narration, objectPath, { voice });
}

export function getAvailableVoices(): Array<{ id: string; name: string; description: string }> {
  return [
    { id: "narrator", name: "Mars - Narrator Voice", description: "Smooth, patient, trustworthy baritone for narration" },
    { id: "male-deep", name: "Zeus - Deep & Trustworthy", description: "Deep, trustworthy, smooth male voice" },
    { id: "male-warm", name: "Arcas - Natural & Smooth", description: "Natural, smooth, clear, comfortable male voice" },
    { id: "female-soft", name: "Athena - Calm & Professional", description: "Calm, smooth, professional female voice for storytelling" },
    { id: "female-dramatic", name: "Luna - Friendly & Engaging", description: "Friendly, natural, engaging female voice" },
    { id: "neutral", name: "Asteria - Clear & Confident", description: "Clear, confident, knowledgeable, energetic voice" },
  ];
}
