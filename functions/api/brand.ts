import { getBrandIdentity } from '../services/brand_service';
import { getCatalogEpoch, matchesIfNoneMatch } from '../services/cache_service';

declare const __BUILD_ID__: string | undefined;

interface Env {
  DB?: D1Database;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match, Cache-Control, Pragma',
  'Access-Control-Expose-Headers': 'ETag, X-Catalog-Epoch',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/brand
 * Trả về cấu hình thương hiệu công khai siêu nhẹ (< 1KB) có hỗ trợ ETag theo CatalogEpoch.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const bypass = url.searchParams.has('fresh') || url.searchParams.has('nocache');

  try {
    const epoch = env.DB ? await getCatalogEpoch(env.DB) : '0';
    const buildTag = typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : '';
    const etag = buildTag ? `W/"brand-${buildTag}-${epoch}"` : `W/"brand-${epoch}"`;

    if (!bypass && matchesIfNoneMatch(request.headers.get('If-None-Match'), etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          ...CORS_HEADERS,
          ETag: etag,
          'X-Catalog-Epoch': epoch,
          'Cache-Control': 'public, max-age=0, must-revalidate',
          'CDN-Cache-Control': 'no-store',
        },
      });
    }

    const brand = await getBrandIdentity(env.DB, { bypassCache: bypass });
    return new Response(
      JSON.stringify({
        success: true,
        catalogEpoch: epoch,
        brand,
      }),
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          ETag: etag,
          'X-Catalog-Epoch': epoch,
          'Cache-Control': bypass ? 'no-cache, no-store, must-revalidate' : 'public, max-age=0, must-revalidate',
          'CDN-Cache-Control': 'no-store',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Brand lookup failed' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
