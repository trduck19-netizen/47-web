import { ensureMarketplaceSchema } from '../../../services/d1_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';
import { bumpCatalogEpoch } from '../../../services/cache_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Không có quyền cập nhật mã giảm giá.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const voucherId = String(params.id || '').trim();
    const sellerId = storeAuth.seller.id;
    const existing = await env.DB
      .prepare('SELECT * FROM seller_vouchers WHERE id = ? AND seller_id = ? LIMIT 1')
      .bind(voucherId, sellerId)
      .first<any>();

    if (!existing) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mã giảm giá không tồn tại.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const nextActive =
      body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active ? 0 : 1;
    const nextTitle = body.title !== undefined ? String(body.title).trim() || existing.title : existing.title;
    const nextLimit =
      body.usage_limit !== undefined
        ? Math.max(Number(existing.used_count || 0), parseInt(body.usage_limit, 10) || existing.usage_limit)
        : existing.usage_limit;
    const nextExpires =
      body.expires_at !== undefined ? (body.expires_at ? String(body.expires_at).trim() : null) : existing.expires_at;

    await env.DB
      .prepare(`
        UPDATE seller_vouchers
        SET is_active = ?, title = ?, usage_limit = ?, expires_at = ?
        WHERE id = ? AND seller_id = ?
      `)
      .bind(nextActive, nextTitle, nextLimit, nextExpires, voucherId, sellerId)
      .run();

    await bumpCatalogEpoch(env.DB).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        is_active: nextActive,
        message: nextActive ? 'Đã kích hoạt mã giảm giá.' : 'Đã tạm dừng mã giảm giá.',
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi cập nhật mã giảm giá.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Không có quyền xóa mã giảm giá.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const voucherId = String(params.id || '').trim();
    const res = await env.DB
      .prepare('DELETE FROM seller_vouchers WHERE id = ? AND seller_id = ?')
      .bind(voucherId, storeAuth.seller.id)
      .run();

    if (!res?.meta?.changes) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mã giảm giá không tồn tại.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    await bumpCatalogEpoch(env.DB).catch(() => {});
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi xóa mã giảm giá.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
