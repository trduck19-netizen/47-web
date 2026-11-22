/**
 * Cloudflare Pages Functions - Homepage Section Image Serving Endpoint
 * Route: /api/homepage-images/[file]
 * 
 * Phục vụ ảnh các mục trang chủ với tối ưu Edge Caching:
 * - Edge Cache qua Cloudflare Cache API (caches.default)
 * - Tra cứu Cloudflare D1 bảng homepage_section_images
 * - Header bất biến: Cache-Control: public, max-age=31536000, immutable
 */

interface Env {
  DB?: D1Database;
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
};

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestGet = async (context: {
  request: Request;
  env: Env;
  params: { file?: string };
  waitUntil: (p: Promise<any>) => void;
}) => {
  const { request, env, params, waitUntil } = context;
  const rawFile = (params.file || '').trim();

  // Chống tấn công Path Traversal
  if (
    !rawFile ||
    rawFile.includes('..') ||
    rawFile.includes('/') ||
    rawFile.includes('\\') ||
    rawFile.includes('%2e') ||
    rawFile.includes('%2f') ||
    rawFile.includes('%5c')
  ) {
    return new Response('Not Found', { status: 404 });
  }

  // 1. Kiểm tra Cloudflare Edge Cache
  const urlObj = new URL(request.url);
  const bypassCache = urlObj.searchParams.has('nocache') ||
                      urlObj.searchParams.has('fresh') ||
                      request.headers.get('Cache-Control')?.includes('no-cache');
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
  const cacheKey = cache ? new Request(request.url, { method: 'GET' }) : null;

  if (cache && cacheKey && !bypassCache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return cached;
      }
    } catch {}
  }

  // 2. Tra cứu D1 bảng homepage_section_images
  if (!env.DB) {
    return new Response('Database Unavailable', { status: 503 });
  }

  try {
    const row = await env.DB
      .prepare('SELECT id, file_name, content_type, image_base64, size_bytes, is_compressed FROM homepage_section_images WHERE id = ? LIMIT 1')
      .bind(rawFile)
      .first<any>();

    if (!row || !row.image_base64) {
      return new Response('Image Not Found', { status: 404 });
    }

    // Giải mã Base64 thành binary bytes
    const cleanB64 = String(row.image_base64).replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
    const binaryStr = atob(cleanB64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const contentType = row.content_type || (rawFile.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
    const headers = new Headers({
      ...CORS_HEADERS,
      'Content-Type': contentType,
      'Content-Length': len.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Image-Source': 'd1-homepage-section-images',
      'X-Image-Compressed': String(row.is_compressed || 0),
    });

    const imageResponse = new Response(bytes, { status: 200, headers });

    // Lưu vào Edge Cache cho các lượt tải tiếp theo
    if (cache && cacheKey && !bypassCache) {
      waitUntil(cache.put(cacheKey, imageResponse.clone()));
    }

    return imageResponse;
  } catch (err: any) {
    return new Response(`Error serving image: ${err?.message || 'Internal Server Error'}`, { status: 500 });
  }
};
