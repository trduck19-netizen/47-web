import { verifyStoreApiAccess } from '../../../../../services/store_api_service';
import { ensureSchemaUpgrades } from '../../../../../services/d1_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/seller/affiliate/requests/:id/reject
 * NCC từ chối yêu cầu liên kết bán lại (Nhóm 1)
 */
export async function onRequestPost(context: { request: Request; params: any; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, params, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    await ensureSchemaUpgrades(env.DB);

    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!auth.authorized || !auth.seller) {
      return new Response(JSON.stringify({ success: false, error: auth.error || 'Yêu cầu đăng nhập hoặc quyền gian hàng không hợp lệ.' }), { status: auth.status || 401, headers: CORS_HEADERS });
    }

    const supplier = auth.seller;

    const requestId = params.id;
    const reqRecord = await env.DB
      .prepare('SELECT id, supplier_seller_id FROM seller_affiliate_partnerships WHERE id = ? LIMIT 1')
      .bind(requestId)
      .first<any>();

    if (!reqRecord) {
      return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy yêu cầu liên kết này.' }), { status: 404, headers: CORS_HEADERS });
    }

    if (reqRecord.supplier_seller_id !== supplier.id) {
      return new Response(JSON.stringify({ success: false, error: 'Bạn không có quyền từ chối yêu cầu của gian hàng khác.' }), { status: 403, headers: CORS_HEADERS });
    }

    await env.DB
      .prepare('UPDATE seller_affiliate_partnerships SET status = "REJECTED", updated_at = datetime("now") WHERE id = ?')
      .bind(requestId)
      .run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Đã từ chối yêu cầu liên kết bán lại.'
    }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi từ chối yêu cầu.' }), { status: 500, headers: CORS_HEADERS });
  }
}
