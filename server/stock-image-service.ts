
export interface StockImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  photographer: string;
  photographerUrl: string;
  source: "pexels" | "unsplash";
  alt: string;
  width: number;
  height: number;
}

export interface StockImageSearchResult {
  success: boolean;
  images: StockImage[];
  error?: string;
}

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

export async function searchPexelsImages(
  query: string,
  options: { perPage?: number; orientation?: "landscape" | "portrait" | "square" } = {}
): Promise<StockImageSearchResult> {
  const { perPage = 5, orientation = "landscape" } = options;
  
  if (!PEXELS_API_KEY) {
    return {
      success: false,
      images: [],
      error: "PEXELS_API_KEY not configured",
    };
  }
  
  try {
    const params = new URLSearchParams({
      query: query,
      per_page: perPage.toString(),
      orientation: orientation,
    });
    
    const response = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: {
        Authorization: PEXELS_API_KEY,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Pexels] API error:", response.status, errorText);
      return {
        success: false,
        images: [],
        error: `Pexels API error: ${response.status}`,
      };
    }
    
    const data = await response.json() as {
      photos: Array<{
        id: number;
        src: { original: string; large2x: string; medium: string };
        photographer: string;
        photographer_url: string;
        alt: string;
        width: number;
        height: number;
      }>;
    };
    
    const images: StockImage[] = data.photos.map((photo) => ({
      id: photo.id.toString(),
      url: photo.src.large2x || photo.src.original,
      thumbnailUrl: photo.src.medium,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      source: "pexels" as const,
      alt: photo.alt || query,
      width: photo.width,
      height: photo.height,
    }));
    
    return {
      success: true,
      images,
    };
  } catch (error: any) {
    console.error("[Pexels] Search error:", error);
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
  sceneId: string
): Promise<{ success: boolean; imageUrl?: string; error?: string; attribution?: string }> {
  const keywords = extractKeywords(imagePrompt);
  const searchQuery = keywords.slice(0, 5).join(" ");
  
  console.log(`[StockImage] Searching for: "${searchQuery}" (from prompt: ${imagePrompt.substring(0, 50)}...)`);
  
  const result = await searchPexelsImages(searchQuery, {
    perPage: 3,
    orientation: "landscape",
  });
  
  if (!result.success || result.images.length === 0) {
    const fallbackQuery = keywords.slice(0, 2).join(" ");
    console.log(`[StockImage] No results, trying fallback: "${fallbackQuery}"`);
    
    const fallbackResult = await searchPexelsImages(fallbackQuery, {
      perPage: 3,
      orientation: "landscape",
    });
    
    if (!fallbackResult.success || fallbackResult.images.length === 0) {
      return {
        success: false,
        error: fallbackResult.error || "No images found for prompt",
      };
    }
    
    const image = fallbackResult.images[0];
    return {
      success: true,
      imageUrl: image.url,
      attribution: `Photo by ${image.photographer} on Pexels`,
    };
  }
  
  const image = result.images[0];
  return {
    success: true,
    imageUrl: image.url,
    attribution: `Photo by ${image.photographer} on Pexels`,
  };
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
      
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`[StockImage] ${sceneId}: Error -`, error);
    }
  }
  
  return images;
}
