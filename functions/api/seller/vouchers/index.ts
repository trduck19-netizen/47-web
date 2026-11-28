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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'ANY' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập gian hàng.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const res = await env.DB
      .prepare(`
        SELECT id, seller_id, code, title, discount_type, discount_value,
               max_discount_core, min_order_core, usage_limit, used_count,
               expires_at, is_active, created_at
        FROM seller_vouchers
        WHERE seller_id = ?
        ORDER BY created_at DESC
      `)
      .bind(storeAuth.seller.id)
      .all<any>();

    return new Response(
      JSON.stringify({ success: true, vouchers: res.results || [] }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi tải danh sách mã giảm giá gian hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Không có quyền quản lý mã giảm giá gian hàng.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const sellerId = storeAuth.seller.id;
    const body = (await request.json().catch(() => ({}))) as any;

    const cleanCode = String(body.code || '')
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .trim();
    if (cleanCode.length < 3 || cleanCode.length > 24) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mã giảm giá phải từ 3–24 ký tự (A–Z, 0–9, _, -).' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cleanTitle = String(body.title || '').trim();
    if (cleanTitle.length < 2 || cleanTitle.length > 90) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tên chương trình giảm giá phải từ 2–90 ký tự.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const discountType = String(body.discount_type || 'FIXED').toUpperCase() === 'PERCENT' ? 'PERCENT' : 'FIXED';
    const discountValue = parseInt(body.discount_value, 10);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mức giảm giá phải lớn hơn 0.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
    if (discountType === 'PERCENT' && discountValue > 90) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mức giảm theo phần trăm tối đa là 90%.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const maxDiscountCore =
      body.max_discount_core !== undefined && body.max_discount_core !== null && body.max_discount_core !== ''
        ? Math.max(1, parseInt(body.max_discount_core, 10) || 0)
        : null;
    const minOrderCore = Math.max(0, parseInt(body.min_order_core, 10) || 0);
    const usageLimit = Math.max(1, Math.min(100000, parseInt(body.usage_limit, 10) || 100));
    const expiresAt = body.expires_at ? String(body.expires_at).trim() : null;

    const dup = await env.DB
      .prepare('SELECT id FROM seller_vouchers WHERE seller_id = ? AND code = ? LIMIT 1')
      .bind(sellerId, cleanCode)
      .first<any>();
    if (dup) {
      return new Response(
        JSON.stringify({ success: false, error: `Mã "${cleanCode}" đã tồn tại trong gian hàng của bạn.` }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const voucherId = `svch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();

    await env.DB
      .prepare(`
        INSERT INTO seller_vouchers (
          id, seller_id, code, title, discount_type, discount_value,
          max_discount_core, min_order_core, usage_limit, used_count,
          expires_at, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?)
      `)
      .bind(
        voucherId,
        sellerId,
        cleanCode,
        cleanTitle,
        discountType,
        discountValue,
        maxDiscountCore,
        minOrderCore,
        usageLimit,
        expiresAt,
        nowIso
      )
      .run();

    await bumpCatalogEpoch(env.DB).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        voucher: {
          id: voucherId,
          seller_id: sellerId,
          code: cleanCode,
          title: cleanTitle,
          discount_type: discountType,
          discount_value: discountValue,
          max_discount_core: maxDiscountCore,
          min_order_core: minOrderCore,
          usage_limit: usageLimit,
          used_count: 0,
          expires_at: expiresAt,
          is_active: 1,
          created_at: nowIso,
        },
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi tạo mã giảm giá gian hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
