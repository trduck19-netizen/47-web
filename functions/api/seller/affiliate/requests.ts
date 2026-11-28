import { verifyStoreApiAccess } from '../../../services/store_api_service';
import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { getMarketplaceConfig } from '../../../services/marketplace_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/seller/affiliate/requests
 * Xem danh sách yêu cầu liên kết bán lại (cả vai trò NCC và vai trò Shop Gán) (Nhóm 1)
 */
export async function onRequestGet(context: { request: Request; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    await ensureSchemaUpgrades(env.DB);

    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!auth.authorized || !auth.seller) {
      return new Response(JSON.stringify({ success: false, error: auth.error || 'Yêu cầu đăng nhập hoặc quyền gian hàng không hợp lệ.' }), { status: auth.status || 401, headers: CORS_HEADERS });
    }

    const seller = auth.seller;

    const url = new URL(request.url);
    const role = url.searchParams.get('role') || 'all'; // 'supplier' | 'reseller' | 'all'

    // 1. Yêu cầu gửi tới (NCC nhận)
    const incomingQuery = `
      SELECT sap.*, 
             s_res.name as reseller_name,
             s_res.slug as reseller_slug,
             (SELECT COUNT(*) FROM seller_affiliate_listings sal WHERE sal.partnership_id = sap.id AND sal.status = 'ACTIVE') as active_listings_count
      FROM seller_affiliate_partnerships sap
      JOIN sellers s_res ON sap.reseller_seller_id = s_res.id
      WHERE sap.supplier_seller_id = ?
      ORDER BY sap.created_at DESC
    `;

    // 2. Yêu cầu gửi đi (Shop gán đã gửi)
    const outgoingQuery = `
      SELECT sap.*, 
             s_sup.name as supplier_name,
             s_sup.slug as supplier_slug,
             (SELECT COUNT(*) FROM seller_affiliate_listings sal WHERE sal.partnership_id = sap.id AND sal.status = 'ACTIVE') as active_listings_count
      FROM seller_affiliate_partnerships sap
      JOIN sellers s_sup ON sap.supplier_seller_id = s_sup.id
      WHERE sap.reseller_seller_id = ?
      ORDER BY sap.created_at DESC
    `;

    let incoming: any[] = [];
    let outgoing: any[] = [];

    const wantIn = role === 'supplier' || role === 'all';
    const wantOut = role === 'reseller' || role === 'all';
    const [resIn, resOut] = await Promise.all([
      wantIn ? env.DB.prepare(incomingQuery).bind(seller.id).all() : Promise.resolve(null),
      wantOut ? env.DB.prepare(outgoingQuery).bind(seller.id).all() : Promise.resolve(null),
    ]);

    if (resIn) {
      // NCC không bao giờ được xem khóa thô hay mã băm, chỉ xem prefix
      incoming = (resIn.results || []).map((r: any) => {
        const { one_time_raw_key, api_key_hash, ...rest } = r;
        return rest;
      });
    }

    if (resOut) {
      outgoing = (resOut.results || []).map((r: any) => {
        const { api_key_hash, ...rest } = r;
        return rest;
      });

      // Shop Gán chỉ nhận one_time_raw_key DUY NHẤT 1 LẦN -> Xóa ngay sau khi đọc
      const idsToClear = outgoing.filter((r: any) => r.one_time_raw_key).map((r: any) => r.id);
      if (idsToClear.length > 0) {
        await Promise.all(
          idsToClear.map((reqId: string) =>
            env.DB
              .prepare("UPDATE seller_affiliate_partnerships SET one_time_raw_key = NULL WHERE id = ?")
              .bind(reqId)
              .run()
              .catch(() => {})
          )
        );
      }
    }

    return new Response(JSON.stringify({
      success: true,
      my_seller_id: seller.id,
      my_seller_name: seller.name,
      incoming_requests: incoming,
      outgoing_requests: outgoing,
    }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi lấy danh sách yêu cầu.' }), { status: 500, headers: CORS_HEADERS });
  }
}

/**
 * POST /api/seller/affiliate/requests
 * Shop Gán gửi yêu cầu liên kết bán lại tới Nhà Cung Cấp (Nhóm 1 & Nhóm 2)
 */
export async function onRequestPost(context: { request: Request; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    await ensureSchemaUpgrades(env.DB);

    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!auth.authorized || !auth.seller) {
      return new Response(JSON.stringify({ success: false, error: auth.error || 'Bạn cần mở gian hàng hoạt động trước khi liên kết bán lại.' }), { status: auth.status || 401, headers: CORS_HEADERS });
    }

    const reseller = auth.seller;

    const mConfig = await getMarketplaceConfig(env.DB);
    if (!mConfig.affiliate_enabled) {
      return new Response(JSON.stringify({ success: false, error: 'Tính năng bán lại liên gian hàng hiện đang tạm tắt bởi Quản trị viên.', code: 'AFFILIATE_DISABLED' }), { status: 403, headers: CORS_HEADERS });
    }

    const body: any = await request.json().catch(() => ({}));
    const targetSupplierId = (body.supplier_seller_id || body.supplier_id || '').trim();

    if (!targetSupplierId) {
      return new Response(JSON.stringify({ success: false, error: 'Vui lòng cung cấp mã gian hàng của Nhà Cung Cấp.' }), { status: 400, headers: CORS_HEADERS });
    }

    // Chặn vòng lặp A -> A
    if (targetSupplierId === reseller.id) {
      return new Response(JSON.stringify({ success: false, error: 'Bạn không thể tự gửi yêu cầu liên kết bán lại cho chính gian hàng của mình.' }), { status: 400, headers: CORS_HEADERS });
    }

    // Kiểm tra NCC tồn tại
    const supplier = await env.DB
      .prepare('SELECT id, name FROM sellers WHERE (id = ? OR slug = ?) AND status = "ACTIVE" LIMIT 1')
      .bind(targetSupplierId, targetSupplierId)
      .first<any>();

    if (!supplier) {
      return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy Nhà Cung Cấp hợp lệ hoặc gian hàng chưa kích hoạt.' }), { status: 404, headers: CORS_HEADERS });
    }

    // Kiểm tra yêu cầu đã tồn tại chưa
    const existing = await env.DB
      .prepare('SELECT id, status FROM seller_affiliate_partnerships WHERE supplier_seller_id = ? AND reseller_seller_id = ? LIMIT 1')
      .bind(supplier.id, reseller.id)
      .first<any>();

    if (existing) {
      if (existing.status === 'APPROVED') {
        return new Response(JSON.stringify({ success: false, error: 'Gian hàng của bạn đã được kết nối với Nhà Cung Cấp này trước đó.' }), { status: 400, headers: CORS_HEADERS });
      }
      if (existing.status === 'PENDING') {
        return new Response(JSON.stringify({ success: false, error: 'Yêu cầu liên kết đang chờ Nhà Cung Cấp phê duyệt.' }), { status: 400, headers: CORS_HEADERS });
      }
      if (existing.status === 'PENDING_ADMIN') {
        return new Response(JSON.stringify({ success: false, error: 'Nhà Cung Cấp đã đồng ý. Yêu cầu đang chờ Quản trị viên phê duyệt kích hoạt.' }), { status: 400, headers: CORS_HEADERS });
      }
      if (existing.status === 'SUSPENDED') {
        return new Response(JSON.stringify({ success: false, error: 'Liên kết này hiện đang bị Quản trị viên tạm khóa. Vui lòng liên hệ Admin.' }), { status: 403, headers: CORS_HEADERS });
      }
      // Nếu REJECTED hoặc REVOKED thì cho phép mở lại thành PENDING
      await env.DB
        .prepare('UPDATE seller_affiliate_partnerships SET status = "PENDING", revoked_at = NULL, updated_at = datetime("now") WHERE id = ?')
        .bind(existing.id)
        .run();

      return new Response(JSON.stringify({
        success: true,
        message: `Đã gửi lại yêu cầu liên kết tới ${supplier.name}.`,
        request_id: existing.id
      }), { status: 200, headers: CORS_HEADERS });
    }

    // Tạo mới yêu cầu
    const requestId = `sap_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    await env.DB
      .prepare(`
        INSERT INTO seller_affiliate_partnerships (
          id, supplier_seller_id, reseller_seller_id, status, api_key_hash, api_key_prefix, created_at, updated_at
        ) VALUES (?, ?, ?, 'PENDING', '', '', datetime('now'), datetime('now'))
      `)
      .bind(requestId, supplier.id, reseller.id)
      .run();

    return new Response(JSON.stringify({
      success: true,
      message: `Đã gửi yêu cầu liên kết tới Nhà Cung Cấp ${supplier.name}. Vui lòng chờ NCC duyệt.`,
      request_id: requestId,
      supplier_name: supplier.name
    }), { status: 201, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi gửi yêu cầu.' }), { status: 500, headers: CORS_HEADERS });
  }
}
