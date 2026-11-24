import { authenticateCaller } from '../../../../services/auth_service';
import { ensureSchemaUpgrades } from '../../../../services/d1_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * DELETE /api/seller/affiliate/partners/:id
 * NCC thu hồi khóa cặp / hủy liên kết đối tác (Nhóm 1)
 * Listing bên gán ẩn ngay lập tức, nhưng đơn đang chạy vẫn phải giao xong
 */
export async function onRequestDelete(context: { request: Request; params: any; env: { DB: D1Database; JWT_SECRET?: string } }) {
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
      .prepare('SELECT id, name FROM sellers WHERE owner_member_id = ? AND status = "ACTIVE" LIMIT 1')
      .bind(auth.member.id)
      .first<any>();

    if (!supplier) {
      return new Response(JSON.stringify({ success: false, error: 'Gian hàng không tồn tại hoặc chưa kích hoạt.' }), { status: 403, headers: CORS_HEADERS });
    }

    const partnershipId = params.id;
    const partnership = await env.DB
      .prepare(`
        SELECT sap.*, s_res.name as reseller_name
        FROM seller_affiliate_partnerships sap
        JOIN sellers s_res ON sap.reseller_seller_id = s_res.id
        WHERE sap.id = ? LIMIT 1
      `)
      .bind(partnershipId)
      .first<any>();

    if (!partnership) {
      return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy quan hệ đối tác này.' }), { status: 404, headers: CORS_HEADERS });
    }

    if (partnership.supplier_seller_id !== supplier.id) {
      return new Response(JSON.stringify({ success: false, error: 'Bạn không có quyền thu hồi khóa của gian hàng khác.' }), { status: 403, headers: CORS_HEADERS });
    }

    const nowIso = new Date().toISOString();

    // 1. Cập nhật trạng thái quan hệ sang REVOKED
    await env.DB
      .prepare(`
        UPDATE seller_affiliate_partnerships
        SET status = 'REVOKED',
            revoked_at = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(nowIso, nowIso, partnershipId)
      .run();

    // 2. Ẩn toàn bộ listing gán của đối tác này
    await env.DB
      .prepare(`
        UPDATE seller_affiliate_listings
        SET status = 'SUPPLIER_DISABLED',
            updated_at = ?
        WHERE partnership_id = ?
      `)
      .bind(nowIso, partnershipId)
      .run();

    // 3. Tạm dừng các sản phẩm bên shop gán để không hiển thị trên web
    await env.DB
      .prepare(`
        UPDATE seller_products
        SET status = 'PAUSED',
            updated_at = ?
        WHERE id IN (
          SELECT reseller_product_id FROM seller_affiliate_listings WHERE partnership_id = ?
        )
      `)
      .bind(nowIso, partnershipId)
      .run();

    return new Response(JSON.stringify({
      success: true,
      message: `Đã thu hồi khóa API và hủy liên kết với gian hàng ${partnership.reseller_name}. Toàn bộ sản phẩm gán đã được ẩn khỏi sàn (đơn hàng đang chạy vẫn tiếp tục xử lý).`
    }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi thu hồi đối tác.' }), { status: 500, headers: CORS_HEADERS });
  }
}
