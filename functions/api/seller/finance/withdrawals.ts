import { verifyMemberAuth } from '../../../services/mission_service';
import { ensureMarketplaceSchema } from '../../../services/d1_service';
import { SellerRecord } from '../../../services/marketplace_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: 'D1 Database chưa sẵn sàng.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    await ensureMarketplaceSchema(env.DB);

    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const seller = storeAuth.seller;

    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get('limit') || '50', 10)));
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const offset = (page - 1) * limit;

    const listRes = await env.DB.prepare(`
      SELECT * FROM seller_withdrawals
      WHERE seller_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(seller.id, limit, offset).all<any>();

    const totalCountRes = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM seller_withdrawals
      WHERE seller_id = ? AND deleted_at IS NULL
    `).bind(seller.id).first<{ total: number }>();

    return new Response(
      JSON.stringify({
        success: true,
        withdrawals: listRes?.results || [],
        pagination: {
          page,
          limit,
          total: totalCountRes?.total || 0,
          total_pages: Math.ceil((totalCountRes?.total || 0) / limit),
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error('[getSellerWithdrawals error]', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi khi lấy lịch sử rút tiền.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
