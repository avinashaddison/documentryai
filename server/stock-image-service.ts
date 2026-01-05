import { rankImages, selectBestImage, logRankingDetails, type RankableImage, type RankedImage } from './image-ranker';
import { validateImageUrl, findFirstValidImage } from './image-validator';

export interface StockImage {
  id: string;
  url: string;
  originUrl: string;
  source: "perplexity" | "pexels";
  width?: number;
  height?: number;
  title?: string;
}

export interface StockImageSearchResult {
  success: boolean;
  images: StockImage[];
  rankedImages?: RankedImage[];
  error?: string;
}

export async function searchPerplexityImages(
  query: string,
  options: { limit?: number; fetchMore?: boolean } = {}
): Promise<StockImageSearchResult> {
  // Fetch more images for better ranking
  const { limit = 5, fetchMore = true } = options;
  
  // Read API key dynamically each time (not at module load)
  const apiKey = process.env.PERPLEXITY_API_KEY;
  
  console.log(`[Perplexity] Checking API key availability: ${apiKey ? 'present' : 'missing'}`);
  
  if (!apiKey) {
    console.error("[Perplexity] PERPLEXITY_API_KEY not configured in environment");
    return {
      success: false,
      images: [],
      error: "PERPLEXITY_API_KEY not configured",
    };
  }
  
  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        return_images: true,
        messages: [
          {
            role: "user",
            content: `Find high quality images of: ${query}. Focus on documentary-style, historical, or educational images that would work well in a video documentary.`
          }
        ]
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Perplexity] API error:", response.status, errorText);
      return {
        success: false,
        images: [],
        error: `Perplexity API error: ${response.status}`,
      };
    }
    
    const data = await response.json() as {
      images?: Array<{
        imageUrl?: string;
        image_url?: string;
        originUrl?: string;
        origin_url?: string;
        url?: string;
        height?: number;
        width?: number;
      }>;
    };
    
    const rawImages = data.images || [];
    
    // Fetch all available images for ranking
    const images: StockImage[] = rawImages
      .map((img, index) => ({
        id: `perplexity_${index}_${Date.now()}`,
        url: img.imageUrl || img.image_url || img.url || "",
        originUrl: img.originUrl || img.origin_url || "",
        source: "perplexity" as const,
        width: img.width,
        height: img.height,
        title: "",
      }))
      .filter(img => img.url);
    
    console.log(`[Perplexity] Fetched ${images.length} raw images for query: "${query}"`);
    
    // Rank images for quality and relevance
    const rankedImages = rankImages(images as RankableImage[], { query });
    
    // Log ranking details
    if (rankedImages.length > 0) {
      logRankingDetails(rankedImages, query);
    }
    
    // Return top ranked images
    const topImages = rankedImages.slice(0, limit).map(r => ({
      id: r.id,
      url: r.url,
      originUrl: r.originUrl || '',
      source: "perplexity" as const,
      width: r.width,
      height: r.height,
      title: r.title,
    }));
    
    console.log(`[Perplexity] Selected top ${topImages.length} images after ranking`);
    
    return {
      success: true,
      images: topImages,
      rankedImages,
    };
  } catch (error: any) {
    console.error("[Perplexity] Search error:", error);
    return {
      success: false,
      images: [],
      error: error.message,
    };
  }
}

export async function fetchStockImageForScene(
  imagePrompt: string,
  projectId: number,
  sceneId: string,
  narration?: string
): Promise<{ success: boolean; imageUrl?: string; error?: string; attribution?: string; score?: number }> {
  // Combine imagePrompt with narration for better image matching
  const combinedText = narration 
    ? `${imagePrompt} ${narration.slice(0, 100)}` 
    : imagePrompt;
  
  const keywords = extractKeywords(combinedText);
  const searchQuery = keywords.slice(0, 10).join(" ");
  
  console.log(`[StockImage] Searching Perplexity for: "${searchQuery}"`);
  
  // Fetch and rank images
  const result = await searchPerplexityImages(searchQuery, { limit: 10, fetchMore: true });
  
  if (!result.success || !result.rankedImages || result.rankedImages.length === 0) {
    const fallbackQuery = keywords.slice(0, 3).join(" ");
    console.log(`[StockImage] No ranked results, trying fallback: "${fallbackQuery}"`);
    
    const fallbackResult = await searchPerplexityImages(fallbackQuery, { limit: 10, fetchMore: true });
    
    if (!fallbackResult.success || !fallbackResult.rankedImages || fallbackResult.rankedImages.length === 0) {
      return {
        success: false,
        error: fallbackResult.error || "No images found for prompt",
      };
    }
    
    // Validate and find first working image from ranked list
    const validImage = await findFirstValidImageFromRankedStock(fallbackResult.rankedImages, sceneId);
    if (validImage) {
      return validImage;
    }
    
    return {
      success: false,
      error: "No accessible images found after validation",
    };
  }
  
  // Validate and find first working image from ranked list
  const validImage = await findFirstValidImageFromRankedStock(result.rankedImages, sceneId);
  if (validImage) {
    return validImage;
  }
  
  return {
    success: false,
    error: "No accessible images found after validation",
  };
}

/**
 * Find the first valid/accessible image from a ranked list
 * Validates each image URL to ensure it can be loaded
 */
async function findFirstValidImageFromRankedStock(
  rankedImages: RankedImage[],
  sceneId: string
): Promise<{ success: boolean; imageUrl: string; attribution: string; score: number } | null> {
  console.log(`[StockImage] Scene ${sceneId}: Validating ${rankedImages.length} ranked images...`);
  
  for (let i = 0; i < Math.min(rankedImages.length, 8); i++) {
    const image = rankedImages[i];
    console.log(`[StockImage] Scene ${sceneId}: Checking image ${i + 1} (score: ${image.score.toFixed(1)})...`);
    
    const validation = await validateImageUrl(image.url);
    
    if (validation.valid) {
      console.log(`[StockImage] Scene ${sceneId}: Image ${i + 1} VALID - "${image.title?.slice(0, 40) || 'Perplexity image'}"`);
      return {
        success: true,
        imageUrl: image.url,
        attribution: `Image via Perplexity Search`,
        score: image.score,
      };
    } else {
      console.log(`[StockImage] Scene ${sceneId}: Image ${i + 1} FAILED - ${validation.error}`);
    }
  }
  
  console.log(`[StockImage] Scene ${sceneId}: No valid images found after checking ${Math.min(rankedImages.length, 8)} URLs`);
  return null;
}

function extractKeywords(prompt: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
    "be", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "shall", "can", "need",
    "this", "that", "these", "those", "it", "its", "they", "their",
    "showing", "depicting", "featuring", "image", "photo", "photograph",
    "scene", "shot", "capture", "capturing", "view", "wide", "close",
    "cinematic", "dramatic", "atmospheric", "realistic", "detailed",
    "high", "quality", "professional", "documentary", "style"
  ]);
  
  const words = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
  
  const uniqueWords = Array.from(new Set(words));
  
  return uniqueWords;
}

export async function generateSceneImagesFromStock(
  scenes: Array<{
    chapterNumber: number;
    sceneNumber: number;
    imagePrompt: string;
  }>,
  projectId: number,
  options: { onProgress?: (current: number, total: number, sceneId: string) => void } = {}
): Promise<Record<string, string>> {
  const images: Record<string, string> = {};
  const { onProgress } = options;
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneId = `ch${scene.chapterNumber}_scene${scene.sceneNumber}`;
    
    if (onProgress) {
      onProgress(i + 1, scenes.length, sceneId);
    }
    
    try {
      const result = await fetchStockImageForScene(
        scene.imagePrompt,
        projectId,
        sceneId
      );
      
      if (result.success && result.imageUrl) {
        images[sceneId] = result.imageUrl;
        console.log(`[StockImage] ${sceneId}: Found image`);
      } else {
        console.error(`[StockImage] ${sceneId}: ${result.error}`);
      }
      
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[StockImage] ${sceneId}: Error -`, error);
    }
  }
  
  return images;
}
