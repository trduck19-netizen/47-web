/**
 * Cloudflare Pages Functions - Direct Game Icon Serving Endpoint
 * Route: /game_icons/[file]
 * 
 * Đảm bảo 100% hình ảnh icon game được phân phối trơn tru:
 * 1. Kiểm tra Edge Cache
 * 2. Thử Static Assets trước (560+ game sẵn có)
 * 3. Nếu 404, nạp từ D1 bảng uploaded_game_icons
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

const ICON_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';
const NOT_FOUND_CACHE_CONTROL = 'no-store, no-cache, must-revalidate, max-age=0';

function isValidImageResponse(res: Response | null | undefined): res is Response {
  if (!res || res.status !== 200) return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  return ct.startsWith('image/');
}

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
  const filename = (params.file || '').trim();

  // Chống path traversal
  if (
    !filename ||
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('%2e') ||
    filename.includes('%2f') ||
    filename.includes('%5c')
  ) {
    return new Response('Not Found', { status: 404 });
  }

  const dotIndex = filename.lastIndexOf('.');
  const slug = (dotIndex >= 0 ? filename.slice(0, dotIndex) : filename).toLowerCase().trim();
  const isThumb = slug.includes('-thumb');
  const baseSlug = slug.replace(/-thumb(?:-256)?$/i, '');

  // 1. Kiểm tra Cloudflare Edge Cache (bỏ qua nếu client yêu cầu làm mới ?nocache/?fresh hoặc Cache-Control: no-cache)
  const urlObj = new URL(request.url);
  const bypassCache = urlObj.searchParams.has('nocache') ||
                      urlObj.searchParams.has('fresh') ||
                      request.headers.get('Cache-Control')?.includes('no-cache');
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
  const cacheKey = cache ? new Request(request.url, { method: 'GET' }) : null;
  if (cache && cacheKey && !bypassCache) {
    try {
      const cached = await cache.match(cacheKey);
      if (isValidImageResponse(cached)) {
        return cached;
      }
    } catch {}
  }

  // 2. Tra cứu D1 bảng uploaded_game_icons trước (Ưu tiên cập nhật mới nhất từ D1 override file tĩnh cũ)
  // Ngoại lệ phòng thủ: idle-cat-gunner đã có bản nén tĩnh tối ưu 24.4 KiB trong Edge Assets, bỏ qua bản D1 cũ nặng 275 KiB
  if (env.DB && baseSlug !== 'idle-cat-gunner') {
    try {
      // Nếu là thumb, CHỈ tìm chính xác slug thumbnail trong D1, KHÔNG fallback sang file gốc baseSlug
      const row: any = isThumb
        ? await env.DB.prepare('SELECT content_type, image_base64, size_bytes FROM uploaded_game_icons WHERE slug = ? LIMIT 1').bind(slug).first()
        : await env.DB.prepare('SELECT content_type, image_base64, size_bytes FROM uploaded_game_icons WHERE slug = ? OR slug = ? LIMIT 1').bind(slug, baseSlug).first();

      if (row && row.image_base64) {
        const cleanB64 = String(row.image_base64).replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
        const binaryStr = atob(cleanB64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const cacheControl = ICON_CACHE_CONTROL;

        const rawRowContentType =
          typeof row.content_type === 'string' ? row.content_type.split(';')[0].trim().toLowerCase() : '';
        const safeRowContentType = /^image\/[a-z0-9.+-]+$/.test(rawRowContentType)
          ? rawRowContentType
          : 'image/webp';
        const contentType = filename.toLowerCase().endsWith('.webp') ? 'image/webp' : safeRowContentType;
        const headers = new Headers({
          ...CORS_HEADERS,
          'Content-Type': contentType,
          'Content-Length': len.toString(),
          'Cache-Control': cacheControl,
          'X-Content-Type-Options': 'nosniff',
          'X-Icon-Source': 'd1-uploaded',
        });

        const iconResponse = new Response(bytes, { status: 200, headers });

        if (cache && cacheKey) {
          waitUntil(cache.put(cacheKey, iconResponse.clone()));
        }

        return iconResponse;
      }
    } catch (err) {
      console.warn('[GameIconFunction] Lỗi đọc D1:', err);
    }
  }

  // 3. Nếu chưa có trong D1, thử nạp từ static assets (BẮT BUỘC kiểm content-type image/* để chặn SPA fallback 200 text/html)
  if (env.ASSETS) {
    try {
      const assetRes = await env.ASSETS.fetch(request);
      if (isValidImageResponse(assetRes)) {
        return assetRes;
      }

      // Fallback 3a: Nếu yêu cầu -thumb-256.webp mà chưa có trong assets, thử -thumb.webp (128px nhẹ)
      if (filename.toLowerCase().endsWith('-thumb-256.webp')) {
        const thumbUrl = new URL(request.url);
        thumbUrl.pathname = `/game_icons/${baseSlug}-thumb.webp`;
        const thumbRes = await env.ASSETS.fetch(new Request(thumbUrl, request));
        if (isValidImageResponse(thumbRes)) {
          return thumbRes;
        }
      }

      // Fallback 3b: Nếu yêu cầu .jpg / .jpeg / .png mà không có trong assets, tự động nạp bản .webp tương ứng
      if (/\.(jpg|jpeg|png)$/i.test(filename)) {
        const webpUrl = new URL(request.url);
        webpUrl.pathname = `/game_icons/${baseSlug}.webp`;
        const webpRes = await env.ASSETS.fetch(new Request(webpUrl, request));
        if (isValidImageResponse(webpRes)) {
          return webpRes;
        }
      }
    } catch (err) {
      console.warn('[GameIconFunction] Asset fetch error:', err);
    }
  }

  return new Response('Icon not found', {
    status: 404,
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': NOT_FOUND_CACHE_CONTROL,
    },
  });
};
