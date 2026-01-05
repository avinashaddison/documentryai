/**
 * Image URL Validator
 * Verifies that image URLs are accessible and return valid image data
 */

export interface ValidationResult {
  valid: boolean;
  url: string;
  contentType?: string;
  contentLength?: number;
  error?: string;
}

// Common user agents to avoid bot detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

// Valid image content types
const VALID_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
];

// Minimum acceptable file size (5KB - very small images are usually icons/placeholders)
const MIN_FILE_SIZE = 5 * 1024;

// Maximum time to wait for validation (5 seconds)
const VALIDATION_TIMEOUT = 5000;

/**
 * Validate a single image URL by making a HEAD request
 * Returns true if the image is accessible and valid
 */
export async function validateImageUrl(url: string): Promise<ValidationResult> {
  if (!url || !url.startsWith('http')) {
    return { valid: false, url, error: 'Invalid URL format' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT);

    // Use a random user agent
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    // First try HEAD request (faster)
    let response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    // If HEAD fails, try GET with range header (some servers don't support HEAD)
    if (!response.ok) {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), VALIDATION_TIMEOUT);

      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          'Accept': 'image/*,*/*;q=0.8',
          'Range': 'bytes=0-1023', // Only get first 1KB to check
          'Referer': 'https://www.google.com/',
        },
        signal: controller2.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId2);
    }

    // Check status code
    if (!response.ok && response.status !== 206) {
      return { 
        valid: false, 
        url, 
        error: `HTTP ${response.status}: ${response.statusText}` 
      };
    }

    // Check content type
    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    const isImage = VALID_IMAGE_TYPES.some(type => contentType.includes(type)) ||
                    contentType.includes('image/');

    if (!isImage && contentType && !contentType.includes('octet-stream')) {
      return { 
        valid: false, 
        url, 
        contentType,
        error: `Not an image: ${contentType}` 
      };
    }

    // Check content length if available
    const contentLengthStr = response.headers.get('content-length');
    const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : null;

    if (contentLength !== null && contentLength < MIN_FILE_SIZE) {
      return { 
        valid: false, 
        url, 
        contentLength,
        error: `Image too small: ${contentLength} bytes` 
      };
    }

    return {
      valid: true,
      url,
      contentType,
      contentLength: contentLength || undefined,
    };

  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { valid: false, url, error: 'Request timeout' };
    }
    return { valid: false, url, error: error.message || 'Unknown error' };
  }
}

/**
 * Validate multiple images and return the first valid one
 */
export async function findFirstValidImage(
  urls: string[],
  options: { maxAttempts?: number; logPrefix?: string } = {}
): Promise<{ url: string; index: number } | null> {
  const { maxAttempts = 5, logPrefix = '[ImageValidator]' } = options;

  for (let i = 0; i < Math.min(urls.length, maxAttempts); i++) {
    const url = urls[i];
    console.log(`${logPrefix} Validating image ${i + 1}/${urls.length}: ${url.slice(0, 80)}...`);

    const result = await validateImageUrl(url);

    if (result.valid) {
      console.log(`${logPrefix} Image ${i + 1} is VALID (${result.contentType}, ${result.contentLength || 'unknown'} bytes)`);
      return { url, index: i };
    } else {
      console.log(`${logPrefix} Image ${i + 1} FAILED: ${result.error}`);
    }
  }

  console.log(`${logPrefix} No valid images found after checking ${Math.min(urls.length, maxAttempts)} URLs`);
  return null;
}

/**
 * Validate and filter a list of image URLs, returning only valid ones
 */
export async function filterValidImages(
  urls: string[],
  options: { parallel?: boolean; maxConcurrent?: number } = {}
): Promise<string[]> {
  const { parallel = true, maxConcurrent = 3 } = options;

  if (!parallel) {
    // Sequential validation
    const validUrls: string[] = [];
    for (const url of urls) {
      const result = await validateImageUrl(url);
      if (result.valid) {
        validUrls.push(url);
      }
    }
    return validUrls;
  }

  // Parallel validation with concurrency limit
  const results: boolean[] = new Array(urls.length).fill(false);
  
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(url => validateImageUrl(url))
    );
    
    batchResults.forEach((result, j) => {
      results[i + j] = result.valid;
    });
  }

  return urls.filter((_, i) => results[i]);
}
