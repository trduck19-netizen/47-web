import { authenticateCaller } from '../../../../../services/auth_service';
import { ensureSchemaUpgrades } from '../../../../../services/d1_service';
import { generatePairShopApiKey } from '../../../../../services/seller_affiliate_service';

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
 * POST /api/seller/affiliate/requests/:id/approve
 * NCC phê duyệt yêu cầu liên kết bán lại -> Sinh khóa cặp wcg_shop_<32 hex> (Nhóm 1)
 * Khóa thô chỉ hiển thị DUY NHẤT 1 lần, D1 chỉ lưu hash SHA-256
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
      .prepare('SELECT id, name FROM sellers WHERE owner_member_id = ? AND status = "ACTIVE" LIMIT 1')
      .bind(auth.member.id)
      .first<any>();

    if (!supplier) {
      return new Response(JSON.stringify({ success: false, error: 'Gian hàng không tồn tại hoặc chưa kích hoạt.' }), { status: 403, headers: CORS_HEADERS });
    }

    const requestId = params.id;
    const reqRecord = await env.DB
      .prepare(`
        SELECT sap.*, s_res.name as reseller_name
        FROM seller_affiliate_partnerships sap
        JOIN sellers s_res ON sap.reseller_seller_id = s_res.id
        WHERE sap.id = ? LIMIT 1
      `)
      .bind(requestId)
      .first<any>();

    if (!reqRecord) {
      return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy yêu cầu liên kết này.' }), { status: 404, headers: CORS_HEADERS });
    }

    if (reqRecord.supplier_seller_id !== supplier.id) {
      return new Response(JSON.stringify({ success: false, error: 'Bạn không có quyền duyệt yêu cầu liên kết của gian hàng khác.' }), { status: 403, headers: CORS_HEADERS });
    }

    // Sinh cặp khóa API chuyên dụng
    const { rawKey, keyHash, keyPrefix } = await generatePairShopApiKey();

    await env.DB
      .prepare(`
        UPDATE seller_affiliate_partnerships
        SET status = 'APPROVED',
            api_key_hash = ?,
            api_key_prefix = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(keyHash, keyPrefix, requestId)
      .run();

    return new Response(JSON.stringify({
      success: true,
      message: `Đã phê duyệt liên kết cho gian hàng ${reqRecord.reseller_name}.`,
      partnership_id: requestId,
      reseller_name: reqRecord.reseller_name,
      key_prefix: keyPrefix,
      raw_key: rawKey, // Chỉ trả DUY NHẤT 1 LẦN ngay lúc duyệt!
      warning: 'LƯU Ý QUAN TRỌNG: Khóa API đầy đủ chỉ hiển thị DUY NHẤT 1 lần này. Hãy sao chép và gửi cho đối tác hoặc lưu trữ cẩn thận.'
    }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi phê duyệt yêu cầu.' }), { status: 500, headers: CORS_HEADERS });
  }
}
