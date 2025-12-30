import Replicate from "replicate";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { Readable } from "stream";

const OUTPUT_DIR = path.join(process.cwd(), "generated_assets", "images");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function getReplicateClient(): Replicate {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is not configured. Please add your Replicate API token.");
  }
  return new Replicate({ auth: token });
}

async function downloadImage(url: string, filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    const protocol = url.startsWith("https") ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadImage(redirectUrl, filepath).then(resolve).catch(reject);
          return;
        }
      }
      
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(filepath);
      });
    }).on("error", (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

async function saveStreamToFile(stream: ReadableStream, filepath: string): Promise<void> {
  const nodeStream = Readable.fromWeb(stream as any);
  const writeStream = fs.createWriteStream(filepath);
  
  return new Promise((resolve, reject) => {
    nodeStream.pipe(writeStream);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    nodeStream.on("error", reject);
  });
}

export interface ImageGenerationResult {
  success: boolean;
  imagePath?: string;
  imageUrl?: string;
  error?: string;
  model?: string;
  prompt?: string;
}

export type ImageStyle = "color" | "black-and-white";

export async function generateImage(
  prompt: string,
  options: {
    model?: "flux-1.1-pro" | "flux-schnell" | "ideogram-v3-turbo";
    aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
    outputFormat?: "webp" | "png" | "jpg";
    projectId?: number;
    sceneId?: string;
    imageStyle?: ImageStyle;
  } = {}
): Promise<ImageGenerationResult> {
  const {
    model = "flux-1.1-pro",
    aspectRatio = "16:9",
    outputFormat = "webp",
    projectId,
    sceneId,
    imageStyle = "color",
  } = options;

  if (!projectId || !sceneId) {
    return {
      success: false,
      error: "Both projectId and sceneId are required for image generation",
      model,
      prompt,
    };
  }

  let replicate: Replicate;
  try {
    replicate = getReplicateClient();
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      model,
      prompt,
    };
  }

  try {
    let output: any;
    let modelId: `${string}/${string}`;

    // For black & white, put style at START of prompt for stronger effect
    const styleModifier = imageStyle === "black-and-white" 
      ? "IMPORTANT: Generate in BLACK AND WHITE ONLY, no color. Vintage 1920s-1940s black and white photograph, monochrome grayscale only, heavy film grain texture, high contrast shadows, historical archive photo style, sepia or pure grayscale tones, aged and weathered photograph aesthetic, realistic documentary photograph from early 20th century"
      : "cinematic photography, professional lighting, 8K ultra HD quality, dramatic atmosphere, documentary style, photorealistic";
    
    // Put style modifier FIRST for black & white to ensure it takes priority
    const cinematicPrompt = imageStyle === "black-and-white"
      ? `${styleModifier}. Scene: ${prompt}`
      : `${prompt}, ${styleModifier}`;

    if (model === "flux-1.1-pro") {
      modelId = "black-forest-labs/flux-1.1-pro" as const;
      output = await replicate.run(modelId, {
        input: {
          prompt: cinematicPrompt,
          aspect_ratio: aspectRatio,
          output_format: outputFormat,
          output_quality: 90,
          safety_tolerance: 2,
          prompt_upsampling: true,
        },
      });
    } else if (model === "flux-schnell") {
      modelId = "black-forest-labs/flux-schnell" as const;
      output = await replicate.run(modelId, {
        input: {
          prompt: cinematicPrompt,
          aspect_ratio: aspectRatio,
          output_format: outputFormat,
          go_fast: true,
          num_outputs: 1,
        },
      });
    } else {
      modelId = "ideogram-ai/ideogram-v2-turbo" as const;
      // Use valid Ideogram V2 resolutions - 1280x768 for landscape, 768x1280 for portrait
      const ideogramResolution = aspectRatio === "16:9" ? "1280x768" 
        : aspectRatio === "9:16" ? "768x1280" 
        : "1024x1024";
      output = await replicate.run(modelId, {
        input: {
          prompt: cinematicPrompt,
          resolution: ideogramResolution,
        },
      });
    }

    const filename = `${projectId}_${sceneId}.${outputFormat}`;
    const filepath = path.join(OUTPUT_DIR, filename);

    try {
      const outputItem = Array.isArray(output) ? output[0] : output;
      
      if (!outputItem) {
        return { success: false, error: "No image generated by the model", model, prompt };
      }

      console.log("Output item type:", typeof outputItem, Object.keys(outputItem || {}));

      if (typeof outputItem === "string") {
        await downloadImage(outputItem, filepath);
      } else if (outputItem && typeof outputItem.getReader === "function") {
        console.log("Saving as ReadableStream...");
        await saveStreamToFile(outputItem as ReadableStream, filepath);
      } else if (outputItem && typeof outputItem === "object" && typeof (outputItem as any).url === "string") {
        await downloadImage((outputItem as any).url, filepath);
      } else if (outputItem && typeof outputItem === "object" && typeof (outputItem as any).url === "function") {
        const url = await (outputItem as any).url();
        console.log("URL from function:", url, typeof url);
        if (typeof url === "string") {
          await downloadImage(url, filepath);
        } else {
          return { success: false, error: "URL method did not return string", model, prompt };
        }
      } else {
        console.error("Unknown Replicate output format:", typeof outputItem, outputItem);
        return { success: false, error: "Unexpected image format from model", model, prompt };
      }
      
      if (!fs.existsSync(filepath)) {
        return {
          success: false,
          error: "Image download failed - file not saved",
          model,
          prompt,
        };
      }

      const stats = fs.statSync(filepath);
      if (stats.size === 0) {
        fs.unlinkSync(filepath);
        return {
          success: false,
          error: "Image download failed - empty file",
          model,
          prompt,
        };
      }
    } catch (downloadError: any) {
      console.error("Download error:", downloadError);
      return {
        success: false,
        error: `Failed to save image: ${downloadError.message}`,
        model,
        prompt,
      };
    }

    return {
      success: true,
      imagePath: filepath,
      imageUrl: `/generated_assets/images/${filename}`,
      model: modelId,
      prompt: cinematicPrompt,
    };
  } catch (error: any) {
    console.error("Image generation error:", error);
    const userSafeMessage = error.message?.includes("API") || error.message?.includes("token")
      ? "Image generation service unavailable. Please check API configuration."
      : "Failed to generate image. Please try again.";
    return {
      success: false,
      error: userSafeMessage,
      model,
      prompt,
    };
  }
}

export async function generateSceneImages(
  scenes: Array<{
    sceneNumber: number;
    imagePrompt: string;
    chapterNumber: number;
  }>,
  projectId: number,
  options: {
    model?: "flux-1.1-pro" | "flux-schnell" | "ideogram-v3-turbo";
    imageStyle?: ImageStyle;
    onProgress?: (completed: number, total: number, scene: any) => void;
  } = {}
): Promise<Array<ImageGenerationResult & { sceneNumber: number; chapterNumber: number }>> {
  const results: Array<ImageGenerationResult & { sceneNumber: number; chapterNumber: number }> = [];
  const { model = "flux-1.1-pro", imageStyle = "color", onProgress } = options;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneId = `ch${scene.chapterNumber}_sc${scene.sceneNumber}`;
    
    const result = await generateImage(scene.imagePrompt, {
      model,
      aspectRatio: "16:9",
      projectId,
      sceneId,
      imageStyle,
    });

    results.push({
      ...result,
      sceneNumber: scene.sceneNumber,
      chapterNumber: scene.chapterNumber,
    });

    if (onProgress) {
      onProgress(i + 1, scenes.length, { ...scene, ...result });
    }

    if (i < scenes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

export async function generateChapterImages(
  chapterData: {
    chapterNumber: number;
    scenes: Array<{
      sceneNumber: number;
      imagePrompt: string;
    }>;
  },
  projectId: number,
  options: {
    model?: "flux-1.1-pro" | "flux-schnell" | "ideogram-v3-turbo";
    imageStyle?: ImageStyle;
    onProgress?: (completed: number, total: number, scene: any) => void;
  } = {}
): Promise<Array<ImageGenerationResult & { sceneNumber: number }>> {
  const scenes = chapterData.scenes.map((s) => ({
    ...s,
    chapterNumber: chapterData.chapterNumber,
  }));
  
  const results = await generateSceneImages(scenes, projectId, options);
  
  return results.map(({ chapterNumber, ...rest }) => rest);
}

export const imageGenerator = {
  generateImage,
  generateSceneImages,
  generateChapterImages,
};
