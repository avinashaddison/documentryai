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
  error?: string;
}

export async function searchGoogleImages(
  query: string,
  options: { limit?: number } = {}
): Promise<GoogleImageSearchResult> {
  const { limit = 5 } = options;
  
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
      .slice(0, limit)
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
    
    console.log(`[GoogleImages] Found ${images.length} images for query: "${query}"`);
    
    return {
      success: true,
      images,
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
): Promise<{ success: boolean; imageUrl?: string; error?: string; attribution?: string }> {
  // Combine imagePrompt with narration for better image matching
  const combinedText = narration 
    ? `${imagePrompt} ${narration.slice(0, 100)}` 
    : imagePrompt;
  
  const keywords = extractKeywords(combinedText);
  const searchQuery = keywords.slice(0, 8).join(" ");
  
  console.log(`[GoogleImages] Searching for scene ${sceneId}: "${searchQuery}"`);
  
  const result = await searchGoogleImages(searchQuery, { limit: 5 });
  
  if (!result.success || result.images.length === 0) {
    // Try fallback with fewer keywords
    const fallbackQuery = keywords.slice(0, 4).join(" ");
    console.log(`[GoogleImages] No results, trying fallback: "${fallbackQuery}"`);
    
    const fallbackResult = await searchGoogleImages(fallbackQuery, { limit: 5 });
    
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
      attribution: `Image via Google Images`,
    };
  }
  
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
