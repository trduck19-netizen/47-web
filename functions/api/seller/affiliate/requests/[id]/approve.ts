import { verifyStoreApiAccess } from '../../../../../services/store_api_service';
import { ensureSchemaUpgrades } from '../../../../../services/d1_service';
import { getMarketplaceConfig } from '../../../../../services/marketplace_service';
import { approvePartnershipAndIssueKey } from '../../../../../services/seller_affiliate_service';

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

    await ensureSchemaUpgrades(env.DB);

    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!auth.authorized || !auth.seller) {
      return new Response(JSON.stringify({ success: false, error: auth.error || 'Yêu cầu đăng nhập hoặc quyền gian hàng không hợp lệ.' }), { status: auth.status || 401, headers: CORS_HEADERS });
    }

    const supplier = auth.seller;

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

    const mConfig = await getMarketplaceConfig(env.DB);
    if (!mConfig.affiliate_enabled) {
      return new Response(JSON.stringify({ success: false, error: 'Tính năng bán lại liên gian hàng hiện đang tạm tắt bởi Quản trị viên.', code: 'AFFILIATE_DISABLED' }), { status: 403, headers: CORS_HEADERS });
    }

    if (reqRecord.status === 'APPROVED') {
      return new Response(JSON.stringify({
        success: true,
        status: 'APPROVED',
        requires_admin_approval: false,
        message: `Liên kết với gian hàng ${reqRecord.reseller_name} đã được kích hoạt trước đó.`,
        partnership_id: requestId,
        reseller_name: reqRecord.reseller_name,
        key_prefix: reqRecord.api_key_prefix || '',
      }), { status: 200, headers: CORS_HEADERS });
    }

    if (reqRecord.status === 'PENDING_ADMIN') {
      return new Response(JSON.stringify({
        success: false,
        code: 'AWAITING_ADMIN_APPROVAL',
        error: 'Yêu cầu này đã được NCC đồng ý và đang chờ Quản trị viên phê duyệt.',
      }), { status: 400, headers: CORS_HEADERS });
    }

    if (reqRecord.status !== 'PENDING') {
      return new Response(JSON.stringify({
        success: false,
        code: 'INVALID_PARTNERSHIP_STATUS',
        error: `Không thể duyệt yêu cầu đang ở trạng thái ${reqRecord.status}. Gian hàng bán lại cần gửi yêu cầu liên kết mới.`,
      }), { status: 400, headers: CORS_HEADERS });
    }

    // Nếu Admin bật bắt buộc duyệt (mặc định true): chuyển sang PENDING_ADMIN, chưa sinh Pair Key cho tới khi Admin duyệt
    if (mConfig.affiliate_require_admin_approval) {
      await env.DB
        .prepare(`
          UPDATE seller_affiliate_partnerships
          SET status = 'PENDING_ADMIN',
              updated_at = datetime('now')
          WHERE id = ?
        `)
        .bind(requestId)
        .run();

      return new Response(JSON.stringify({
        success: true,
        status: 'PENDING_ADMIN',
        requires_admin_approval: true,
        message: `Đã xác nhận đồng ý hợp tác với ${reqRecord.reseller_name}. Yêu cầu đã chuyển sang trạng thái chờ Quản trị viên phê duyệt kích hoạt.`,
        partnership_id: requestId,
        reseller_name: reqRecord.reseller_name,
        key_prefix: '',
      }), { status: 200, headers: CORS_HEADERS });
    }

    // Sinh cặp khóa API chuyên dụng và kích hoạt APPROVED qua helper dùng chung
    const { keyPrefix } = await approvePartnershipAndIssueKey(env.DB, requestId);

    return new Response(JSON.stringify({
      success: true,
      status: 'APPROVED',
      requires_admin_approval: false,
      message: `Đã phê duyệt liên kết cho gian hàng ${reqRecord.reseller_name}.`,
      partnership_id: requestId,
      reseller_name: reqRecord.reseller_name,
      key_prefix: keyPrefix,
    }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi phê duyệt yêu cầu.' }), { status: 500, headers: CORS_HEADERS });
  }
}
