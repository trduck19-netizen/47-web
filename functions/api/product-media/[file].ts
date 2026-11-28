import { decode } from 'imagescript';
import { ensureMarketplaceSchema } from '../../services/d1_service';
import { validateImageMagicBytes } from '../../services/ssrf_service';

interface Env {
  DB?: D1Database;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
};

export const onRequestOptions = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet = async (context: {
  request: Request;
  env: Env;
  params: { file?: string };
  waitUntil?: (p: Promise<any>) => void;
}) => {
  const { request, env, params, waitUntil } = context;
  const rawFile = (params.file || '').trim();

  if (
    !rawFile ||
    rawFile.includes('..') ||
    rawFile.includes('/') ||
    rawFile.includes('\\') ||
    rawFile.includes('%2e') ||
    rawFile.includes('%2f') ||
    rawFile.includes('%5c')
  ) {
    return new Response('Not Found', {
      status: 404,
      headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
    });
  }

  const urlObj = new URL(request.url);
  const bypassCache =
    urlObj.searchParams.has('nocache') ||
    urlObj.searchParams.has('fresh') ||
    request.headers.get('Cache-Control')?.includes('no-cache');
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
  const cacheKey = cache ? new Request(request.url, { method: 'GET' }) : null;

  if (cache && cacheKey && !bypassCache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached && cached.status === 200 && (cached.headers.get('Content-Type') || '').startsWith('image/')) {
        return cached;
      }
    } catch {}
  }

  if (!env.DB) {
    return new Response('Database Unavailable', { status: 503, headers: CORS_HEADERS });
  }

  try {
    await ensureMarketplaceSchema(env.DB);
    const cleanId = rawFile.replace(/\.(webp|png|jpe?g|gif)$/i, '');
    const row = await env.DB
      .prepare(
        'SELECT id, content_type, image_base64, size_bytes FROM seller_media_assets WHERE id = ? OR id = ? LIMIT 1'
      )
      .bind(cleanId, rawFile)
      .first<any>();

    if (!row || !row.image_base64) {
      return new Response('Image Not Found', {
        status: 404,
        headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
      });
    }

    const cleanB64 = String(row.image_base64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
    const binaryStr = atob(cleanB64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const verifiedMagic = validateImageMagicBytes(bytes);
    if (!verifiedMagic) {
      return new Response('Invalid Image Asset', {
        status: 404,
        headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
      });
    }

    let finalBytes: Uint8Array = bytes;
    let finalContentType: string = row.content_type || verifiedMagic.mime;

    const reqWidth = parseInt(urlObj.searchParams.get('w') || '0', 10);
    if (reqWidth > 0 && reqWidth <= 1600) {
      try {
        const decoded: any = await decode(bytes);
        if (decoded && decoded.width > reqWidth) {
          const targetHeight = Math.max(1, Math.round((decoded.height * reqWidth) / decoded.width));
          decoded.resize(reqWidth, targetHeight);
          const quality = reqWidth <= 480 ? 72 : reqWidth <= 800 ? 76 : 80;
          const encoded = await decoded.encodeWebP({ quality, effort: 4 });
          if (encoded.byteLength < bytes.byteLength) {
            finalBytes = encoded;
            finalContentType = 'image/webp';
          }
        }
      } catch {}
    }

    const response = new Response(finalBytes as any, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': finalContentType,
        'Content-Length': String(finalBytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });

    if (cache && cacheKey && !bypassCache) {
      const p = cache.put(cacheKey, response.clone()).catch(() => {});
      if (typeof waitUntil === 'function') {
        waitUntil(p);
      }
    }

    return response;
  } catch {
    return new Response('Internal Server Error', {
      status: 500,
      headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
    });
  }
};
