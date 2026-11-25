import { ensureSchemaUpgrades } from '../../services/d1_service';
import { searchUnified, SearchQueryParams } from '../../services/search_service';

interface Env {
  DB: D1Database;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/search: Tìm kiếm và lọc đa tầng trên CSDL D1 (Sản phẩm & Game)
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const reqStart = Date.now();
  const { request, env } = context;
  const colo = String((request as any).cf?.colo || 'unknown');

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, message: 'D1 Database chưa cấu hình.' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const schemaStart = Date.now();
    await ensureSchemaUpgrades(env.DB);
    const schemaMs = Date.now() - schemaStart;

    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const type = (url.searchParams.get('type') as any) || 'all';
    const category = url.searchParams.get('category') || undefined;
    const sellerId = url.searchParams.get('seller_id') || undefined;
    const productType = (url.searchParams.get('product_type') as any) || undefined;
    const minPrice = url.searchParams.get('min_price') ? Number(url.searchParams.get('min_price')) : undefined;
    const maxPrice = url.searchParams.get('max_price') ? Number(url.searchParams.get('max_price')) : undefined;
    const ratingParam = url.searchParams.get('rating') || url.searchParams.get('min_rating');
    const rating = ratingParam ? Number(ratingParam) : undefined;
    const sort = (url.searchParams.get('sort') as any) || 'popular';
    const page = url.searchParams.get('page') ? Number(url.searchParams.get('page')) : 1;
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 20;

    const params: SearchQueryParams = {
      q,
      type,
      category,
      sellerId,
      productType,
      minPrice,
      maxPrice,
      rating,
      sort,
      page,
      limit,
    };

    const searchStart = Date.now();
    const searchData = await searchUnified(env.DB, params);
    const searchMs = Date.now() - searchStart;
    const d1TotalMs = schemaMs + searchMs;
    const totalMs = Date.now() - reqStart;

    return new Response(JSON.stringify(searchData), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'X-Timing-D1-Ms': String(d1TotalMs),
        'X-Timing-Total-Ms': String(totalMs),
        'Server-Timing': `schema;dur=${schemaMs},search_queries;dur=${searchMs},d1_total;dur=${d1TotalMs},total;dur=${totalMs};desc="colo=${colo}"`,
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi xử lý tìm kiếm.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
