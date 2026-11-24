import { authenticateCaller } from '../../../../../services/auth_service';
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

    const auth = await authenticateCaller(request, env.DB, env.JWT_SECRET);
    if (!auth || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập.' }), { status: 401, headers: CORS_HEADERS });
    }

    await ensureSchemaUpgrades(env.DB);

    const supplier = await env.DB
      .prepare('SELECT id FROM sellers WHERE owner_member_id = ? AND status = "ACTIVE" LIMIT 1')
      .bind(auth.member.id)
      .first<any>();

    if (!supplier) {
      return new Response(JSON.stringify({ success: false, error: 'Gian hàng không tồn tại hoặc chưa kích hoạt.' }), { status: 403, headers: CORS_HEADERS });
    }

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
