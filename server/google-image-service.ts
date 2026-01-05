import { rankImages, selectBestImage, logRankingDetails, type RankableImage, type RankedImage } from './image-ranker';

export interface GoogleImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  source: string;
  width?: number;
  height?: number;
}

export interface GoogleImageSearchResult {
  success: boolean;
  images: GoogleImage[];
  rankedImages?: RankedImage[];
  error?: string;
}

export async function searchGoogleImages(
  query: string,
  options: { limit?: number; fetchMore?: boolean } = {}
): Promise<GoogleImageSearchResult> {
  // Fetch more images for better ranking, then return top ones
  const { limit = 5, fetchMore = true } = options;
  const fetchLimit = fetchMore ? Math.max(limit * 3, 15) : limit;
  
  const apiKey = process.env.SERPAPI_API_KEY;
  
  console.log(`[GoogleImages] Checking API key availability: ${apiKey ? 'present' : 'missing'}`);
  
  if (!apiKey) {
    console.error("[GoogleImages] SERPAPI_API_KEY not configured in environment");
    return {
      success: false,
      images: [],
      error: "SERPAPI_API_KEY not configured",
    };
  }
  
  try {
    const params = new URLSearchParams({
      q: query,
      engine: "google_images",
      ijn: "0",
      api_key: apiKey,
    });
    
    console.log(`[GoogleImages] Searching for: "${query}"`);
    
    const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GoogleImages] API error:", response.status, errorText);
      return {
        success: false,
        images: [],
        error: `Google Images API error: ${response.status}`,
      };
    }
    
    const data = await response.json() as {
      images_results?: Array<{
        position?: number;
        thumbnail?: string;
        original?: string;
        title?: string;
        source?: string;
        original_width?: number;
        original_height?: number;
      }>;
      error?: string;
    };
    
    if (data.error) {
      console.error("[GoogleImages] API returned error:", data.error);
      return {
        success: false,
        images: [],
        error: data.error,
      };
    }
    
    const rawImages = data.images_results || [];
    
    const images: GoogleImage[] = rawImages
      .slice(0, fetchLimit)
      .map((img, index) => ({
        id: `google_${index}_${Date.now()}`,
        url: img.original || img.thumbnail || "",
        thumbnailUrl: img.thumbnail || "",
        title: img.title || "",
        source: img.source || "Google Images",
        width: img.original_width,
        height: img.original_height,
      }))
      .filter(img => img.url);
    
    console.log(`[GoogleImages] Fetched ${images.length} raw images for query: "${query}"`);
    
    // Rank images for quality and relevance
    const rankedImages = rankImages(images as RankableImage[], { query });
    
    // Log ranking details for debugging
    if (rankedImages.length > 0) {
      logRankingDetails(rankedImages, query);
    }
    
    // Return top ranked images
    const topImages = rankedImages.slice(0, limit).map(r => ({
      id: r.id,
      url: r.url,
      thumbnailUrl: r.thumbnailUrl || '',
      title: r.title || '',
      source: r.source || 'Google Images',
      width: r.width,
      height: r.height,
    }));
    
    console.log(`[GoogleImages] Selected top ${topImages.length} images after ranking`);
    
    return {
      success: true,
      images: topImages,
      rankedImages,
    };
  } catch (error: any) {
    console.error("[GoogleImages] Search error:", error);
    return {
      success: false,
      images: [],
      error: error.message,
    };
  }
}

export async function fetchGoogleImageForScene(
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
  const searchQuery = keywords.slice(0, 8).join(" ");
  
  console.log(`[GoogleImages] Searching for scene ${sceneId}: "${searchQuery}"`);
  
  // Fetch more images (15+) for intelligent ranking
  const result = await searchGoogleImages(searchQuery, { limit: 5, fetchMore: true });
  
  if (!result.success || !result.rankedImages || result.rankedImages.length === 0) {
    // Try fallback with fewer keywords but still use ranking
    const fallbackQuery = keywords.slice(0, 4).join(" ");
    console.log(`[GoogleImages] No ranked results, trying fallback: "${fallbackQuery}"`);
    
    const fallbackResult = await searchGoogleImages(fallbackQuery, { limit: 5, fetchMore: true });
    
    if (!fallbackResult.success || !fallbackResult.rankedImages || fallbackResult.rankedImages.length === 0) {
      return {
        success: false,
        error: fallbackResult.error || "No images found for prompt",
      };
    }
    
    // Use the best-ranked image from fallback
    const bestImage = selectBestImage(fallbackResult.rankedImages);
    if (bestImage) {
      console.log(`[GoogleImages] Scene ${sceneId}: Selected image with score ${bestImage.score.toFixed(1)}`);
      return {
        success: true,
        imageUrl: bestImage.url,
        attribution: `Image via Google Images`,
        score: bestImage.score,
      };
    }
    
    return {
      success: false,
      error: "No suitable images found after ranking",
    };
  }
  
  // Use the best-ranked image
  const bestImage = selectBestImage(result.rankedImages);
  if (bestImage) {
    console.log(`[GoogleImages] Scene ${sceneId}: Selected BEST image with score ${bestImage.score.toFixed(1)} - "${bestImage.title?.slice(0, 50)}"`);
    return {
      success: true,
      imageUrl: bestImage.url,
      attribution: `Image via Google Images`,
      score: bestImage.score,
    };
  }
  
  // Fallback to first image if no ranked selection
  const image = result.images[0];
  return {
    success: true,
    imageUrl: image.url,
    attribution: `Image via Google Images`,
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
