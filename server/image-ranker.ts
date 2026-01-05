/**
 * Intelligent Image Ranking System
 * Scores and ranks images based on quality, relevance, and suitability for documentary scenes
 */

export interface RankableImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  title?: string;
  source?: string;
  width?: number;
  height?: number;
  originUrl?: string;
}

export interface RankedImage extends RankableImage {
  score: number;
  scoreBreakdown: {
    resolution: number;
    aspectRatio: number;
    relevance: number;
    sourceCredibility: number;
    urlQuality: number;
  };
}

export interface RankingOptions {
  query: string;
  sceneContext?: string;
  preferredAspectRatio?: number; // Default 16:9 = 1.78
  minWidth?: number;
  minHeight?: number;
}

// Trusted domains for high-quality documentary images
const TRUSTED_DOMAINS = new Set([
  'wikipedia.org', 'wikimedia.org', 'britannica.com', 'nationalgeographic.com',
  'history.com', 'smithsonianmag.com', 'bbc.com', 'pbs.org', 'loc.gov',
  'archives.gov', 'getty.edu', 'metmuseum.org', 'si.edu', 'nytimes.com',
  'theguardian.com', 'reuters.com', 'apnews.com', 'time.com', 'life.com',
  'nasa.gov', 'noaa.gov', 'usgs.gov', 'edu', 'gov', 'museum', 'archive.org',
  'flickr.com', 'unsplash.com', 'pexels.com', 'istockphoto.com'
]);

// Domains to avoid (low quality, unreliable, or problematic)
const BLOCKED_DOMAINS = new Set([
  'pinterest.com', 'pinterest.co', 'pinimg.com', // Often duplicates/low quality
  'ebay.com', 'amazon.com', 'aliexpress.com', // E-commerce
  'facebook.com', 'instagram.com', 'tiktok.com', // Social media
  'shutterstock.com', 'dreamstime.com', // Watermarked stock
  'alamy.com', 'gettyimages.com', // Watermarked
  'clipart', 'vector', 'icon', // Usually not documentary-suitable
]);

// File extensions that indicate problematic images
const BAD_EXTENSIONS = ['.gif', '.webp', '.svg', '.ico', '.bmp'];

// Keywords that suggest low-quality or irrelevant images
const BAD_URL_KEYWORDS = [
  'logo', 'icon', 'banner', 'button', 'avatar', 'thumb', 'small', 'tiny',
  'placeholder', 'loading', 'spinner', 'ad', 'advertisement', 'promo',
  'watermark', 'preview', 'sample', 'demo', 'template', 'mock', 'dummy'
];

// Keywords that suggest high-quality documentary images
const GOOD_URL_KEYWORDS = [
  'original', 'full', 'large', 'hires', 'highres', 'hd', '1080', '4k',
  'photo', 'photograph', 'archive', 'historical', 'documentary', 'museum'
];

export function rankImages(
  images: RankableImage[],
  options: RankingOptions
): RankedImage[] {
  const { query, sceneContext, preferredAspectRatio = 16/9, minWidth = 800, minHeight = 450 } = options;
  
  // Filter out obviously bad images first
  const filteredImages = images.filter(img => {
    if (!img.url) return false;
    
    // Check for blocked domains
    const domain = extractDomain(img.url);
    if (BLOCKED_DOMAINS.has(domain)) return false;
    
    // Check for bad extensions
    const lowerUrl = img.url.toLowerCase();
    if (BAD_EXTENSIONS.some(ext => lowerUrl.includes(ext))) return false;
    
    // Check for bad keywords in URL
    if (BAD_URL_KEYWORDS.some(kw => lowerUrl.includes(kw))) return false;
    
    return true;
  });
  
  // Score each image
  const rankedImages: RankedImage[] = filteredImages.map(img => {
    const scoreBreakdown = {
      resolution: scoreResolution(img, minWidth, minHeight),
      aspectRatio: scoreAspectRatio(img, preferredAspectRatio),
      relevance: scoreRelevance(img, query, sceneContext),
      sourceCredibility: scoreSourceCredibility(img.url, img.source),
      urlQuality: scoreUrlQuality(img.url)
    };
    
    // Weighted total score (sum = 100 max)
    const score = 
      scoreBreakdown.resolution * 0.25 +      // 25% weight - resolution matters
      scoreBreakdown.aspectRatio * 0.20 +     // 20% weight - aspect ratio for video
      scoreBreakdown.relevance * 0.30 +       // 30% weight - relevance is most important
      scoreBreakdown.sourceCredibility * 0.15 + // 15% weight - trusted sources
      scoreBreakdown.urlQuality * 0.10;       // 10% weight - URL quality signals
    
    return {
      ...img,
      score,
      scoreBreakdown
    };
  });
  
  // Sort by score descending
  rankedImages.sort((a, b) => b.score - a.score);
  
  // Remove near-duplicates (same domain + similar filename)
  const dedupedImages = removeDuplicates(rankedImages);
  
  return dedupedImages;
}

function scoreResolution(img: RankableImage, minWidth: number, minHeight: number): number {
  if (!img.width || !img.height) {
    // If no dimensions, give moderate score - we'll verify later
    return 50;
  }
  
  // Penalize if below minimum
  if (img.width < minWidth || img.height < minHeight) {
    return Math.max(10, (img.width / minWidth + img.height / minHeight) * 25);
  }
  
  // Score based on total pixels (prefer 1920x1080 = ~2M pixels)
  const pixels = img.width * img.height;
  const targetPixels = 1920 * 1080;
  
  if (pixels >= targetPixels * 2) return 100; // 4K or higher
  if (pixels >= targetPixels) return 90;      // Full HD
  if (pixels >= targetPixels * 0.5) return 75; // HD
  if (pixels >= targetPixels * 0.25) return 60; // SD
  
  return 40;
}

function scoreAspectRatio(img: RankableImage, preferredRatio: number): number {
  if (!img.width || !img.height) {
    return 50; // Unknown, moderate score
  }
  
  const actualRatio = img.width / img.height;
  const ratioDiff = Math.abs(actualRatio - preferredRatio);
  
  // Perfect 16:9 match
  if (ratioDiff < 0.05) return 100;
  
  // Close to 16:9 (within 10%)
  if (ratioDiff < 0.2) return 85;
  
  // Landscape but not ideal
  if (actualRatio > 1 && ratioDiff < 0.5) return 70;
  
  // Square-ish (can be cropped)
  if (actualRatio > 0.8 && actualRatio < 1.2) return 50;
  
  // Portrait (bad for video)
  if (actualRatio < 0.8) return 20;
  
  return 40;
}

function scoreRelevance(img: RankableImage, query: string, sceneContext?: string): number {
  const searchTerms = extractSearchTerms(query);
  const contextTerms = sceneContext ? extractSearchTerms(sceneContext) : [];
  const allTerms = [...searchTerms, ...contextTerms];
  
  if (allTerms.length === 0) return 50;
  
  // Check title for keyword matches
  const title = (img.title || '').toLowerCase();
  const url = img.url.toLowerCase();
  const source = (img.source || '').toLowerCase();
  
  let matchScore = 0;
  let matchCount = 0;
  
  for (const term of allTerms) {
    if (title.includes(term)) {
      matchScore += 15;
      matchCount++;
    }
    if (url.includes(term)) {
      matchScore += 10;
      matchCount++;
    }
    if (source.includes(term)) {
      matchScore += 5;
      matchCount++;
    }
  }
  
  // Bonus for multiple matches
  if (matchCount >= 3) matchScore += 20;
  else if (matchCount >= 2) matchScore += 10;
  
  return Math.min(100, Math.max(20, matchScore));
}

function scoreSourceCredibility(url: string, source?: string): number {
  const domain = extractDomain(url);
  
  // Check if domain is in trusted list
  const trustedArray = Array.from(TRUSTED_DOMAINS);
  for (const trusted of trustedArray) {
    if (domain.includes(trusted)) return 100;
  }
  
  // Check source name for credibility signals
  const sourceLower = (source || '').toLowerCase();
  if (sourceLower.includes('wikipedia') || sourceLower.includes('museum')) return 90;
  if (sourceLower.includes('archive') || sourceLower.includes('library')) return 85;
  if (sourceLower.includes('news') || sourceLower.includes('journal')) return 75;
  
  // HTTPS is better than HTTP
  if (url.startsWith('https://')) return 60;
  
  return 40;
}

function scoreUrlQuality(url: string): number {
  const lowerUrl = url.toLowerCase();
  let score = 50;
  
  // Bonus for good keywords
  for (const kw of GOOD_URL_KEYWORDS) {
    if (lowerUrl.includes(kw)) {
      score += 10;
    }
  }
  
  // Bonus for common high-quality image extensions
  if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') || lowerUrl.includes('.png')) {
    score += 10;
  }
  
  // Bonus for structured paths (suggests organized media library)
  if (lowerUrl.includes('/images/') || lowerUrl.includes('/media/') || lowerUrl.includes('/photos/')) {
    score += 5;
  }
  
  // Penalty for very long URLs (often tracking/redirects)
  if (url.length > 300) score -= 20;
  
  // Penalty for many query parameters
  const queryParams = (url.match(/[&?]/g) || []).length;
  if (queryParams > 5) score -= 15;
  
  return Math.min(100, Math.max(0, score));
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace('www.', '');
  } catch {
    return '';
  }
}

function extractSearchTerms(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been'
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

function removeDuplicates(images: RankedImage[]): RankedImage[] {
  const seen = new Map<string, RankedImage>();
  
  for (const img of images) {
    const domain = extractDomain(img.url);
    const filename = extractFilename(img.url);
    const key = `${domain}:${filename}`;
    
    // If we haven't seen this image or this one scores higher, keep it
    if (!seen.has(key) || seen.get(key)!.score < img.score) {
      seen.set(key, img);
    }
  }
  
  // Re-sort by score after deduplication
  return Array.from(seen.values()).sort((a, b) => b.score - a.score);
}

function extractFilename(url: string): string {
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  } catch {
    return url;
  }
}

/**
 * Select the best image from a ranked list
 * Returns the top-scoring image that passes final validation
 */
export function selectBestImage(rankedImages: RankedImage[], minScore: number = 40): RankedImage | null {
  for (const img of rankedImages) {
    if (img.score >= minScore) {
      return img;
    }
  }
  
  // If no image meets the minimum score, return the best available
  return rankedImages[0] || null;
}

/**
 * Get top N images for scene selection
 */
export function getTopImages(rankedImages: RankedImage[], count: number = 3): RankedImage[] {
  return rankedImages.slice(0, count);
}

/**
 * Log ranking details for debugging
 */
export function logRankingDetails(images: RankedImage[], query: string): void {
  console.log(`\n[ImageRanker] Ranking results for: "${query}"`);
  console.log(`[ImageRanker] Total candidates: ${images.length}`);
  
  images.slice(0, 5).forEach((img, i) => {
    console.log(`  #${i + 1} Score: ${img.score.toFixed(1)} | ${img.title?.slice(0, 40) || 'No title'}`);
    console.log(`       Resolution: ${img.scoreBreakdown.resolution} | Aspect: ${img.scoreBreakdown.aspectRatio} | Relevance: ${img.scoreBreakdown.relevance}`);
    console.log(`       Source: ${img.scoreBreakdown.sourceCredibility} | URL Quality: ${img.scoreBreakdown.urlQuality}`);
  });
}
