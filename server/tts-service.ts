import { createClient } from "@deepgram/sdk";
import { objectStorageClient } from "./replit_integrations/object_storage";
import * as fs from "fs";
import * as path from "path";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const USE_LOCAL_STORAGE = true; // Fallback to local storage when Object Storage has issues

export interface TTSOptions {
  voice?: string;
  model?: string;
}

const VOICE_MODELS: Record<string, string> = {
  // Aura 2 voices - direct model names
  "aura-2-thalia-en": "aura-2-thalia-en",
  "aura-2-apollo-en": "aura-2-apollo-en",
  "aura-2-aries-en": "aura-2-aries-en",
  "aura-2-athena-en": "aura-2-athena-en",
  "aura-2-atlas-en": "aura-2-atlas-en",
  "aura-2-aurora-en": "aura-2-aurora-en",
  "aura-2-draco-en": "aura-2-draco-en",
  "aura-2-jupiter-en": "aura-2-jupiter-en",
  "aura-2-mars-en": "aura-2-mars-en",
  "aura-2-neptune-en": "aura-2-neptune-en",
  "aura-2-zeus-en": "aura-2-zeus-en",
  "aura-2-orion-en": "aura-2-orion-en",
  // Legacy aliases for backwards compatibility
  "narrator": "aura-2-mars-en",
  "male-deep": "aura-2-zeus-en",
  "male-warm": "aura-2-apollo-en", 
  "female-soft": "aura-2-athena-en",
  "female-dramatic": "aura-2-aurora-en",
  "neutral": "aura-2-orion-en",
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
    
    // Try local storage first (workaround for Object Storage billing issues)
    if (USE_LOCAL_STORAGE) {
      const localPath = path.join(process.cwd(), "public", objectPath.replace("public/", ""));
      const dir = path.dirname(localPath);
      
      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(localPath, audioBuffer);
      const publicUrl = `/${objectPath}`;
      console.log(`[TTS] Audio saved locally: ${publicUrl} (${audioBuffer.length} bytes)`);
      return publicUrl;
    }
    
    // Fallback to Object Storage
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
    { id: "aura-2-thalia-en", name: "Thalia", description: "Warm and expressive female voice" },
    { id: "aura-2-apollo-en", name: "Apollo", description: "Clear and confident male voice" },
    { id: "aura-2-aries-en", name: "Aries", description: "Bold and energetic male voice" },
    { id: "aura-2-athena-en", name: "Athena", description: "Calm and professional female voice" },
    { id: "aura-2-atlas-en", name: "Atlas", description: "Strong and authoritative male voice" },
    { id: "aura-2-aurora-en", name: "Aurora", description: "Friendly and engaging female voice" },
    { id: "aura-2-draco-en", name: "Draco", description: "Deep and dramatic male voice" },
    { id: "aura-2-jupiter-en", name: "Jupiter", description: "Commanding and powerful male voice" },
    { id: "aura-2-mars-en", name: "Mars", description: "Smooth narrator baritone voice" },
    { id: "aura-2-neptune-en", name: "Neptune", description: "Calm and soothing male voice" },
    { id: "aura-2-zeus-en", name: "Zeus", description: "Deep and trustworthy male voice" },
    { id: "aura-2-orion-en", name: "Orion", description: "Clear and knowledgeable voice" },
  ];
}

export async function generateVoicePreview(voice: string): Promise<Buffer> {
  if (!DEEPGRAM_API_KEY) {
    throw new Error("DEEPGRAM_API_KEY is not set");
  }

  const deepgram = createClient(DEEPGRAM_API_KEY);
  const model = VOICE_MODELS[voice] || voice;
  const previewText = "Welcome to the documentary. This is a preview of the narrator voice you've selected.";

  const response = await deepgram.speak.request(
    { text: previewText },
    {
      model,
      encoding: "linear16",
      sample_rate: 24000,
    }
  );

  const stream = await response.getStream();
  if (!stream) {
    throw new Error("Failed to get audio stream");
  }

  const chunks: Buffer[] = [];
  const reader = stream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}
