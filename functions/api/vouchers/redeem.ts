import { CORS_HEADERS, Env } from '../../services/mission_service';
import { authenticateCaller, authenticateAdmin } from '../../services/auth_service';
import { ensureSchemaUpgrades } from '../../services/d1_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * POST /api/vouchers/redeem
 * Ghi nhận trừ lượt dùng voucher trong Cloudflare D1 khi đơn hàng hoàn tất.
 * Bảo vệ: Bắt buộc xác thực danh tính người mua sở hữu đơn hàng, kiểm tra giới hạn lượt dùng nguyên tử,
 * và ràng buộc tính duy nhất (UNIQUE) trên cặp (order_id, code) để chống cạn kiệt quota trái phép.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    const callerAuth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
    const adminAuth = await authenticateAdmin(env.DB, token, env);
    const isAdmin = adminAuth.authenticated;
    const callerMember = callerAuth.member;

    if (!isAdmin && !callerMember) {
      return new Response(
        JSON.stringify({ success: false, message: 'Yêu cầu đăng nhập để áp dụng voucher.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const { code, order_id } = body;

    if (!code || typeof code !== 'string') {
      return new Response(
        JSON.stringify({ success: false, message: 'Thiếu mã voucher.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cleanOrderId = String(order_id || '').trim();
    if (!cleanOrderId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Thiếu mã đơn hàng (order_id).' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cleanCode = code.trim().toUpperCase();

    // 1. Kiểm tra đơn hàng có tồn tại và thuộc quyền sở hữu của người gọi
    let orderOwnerId: string | null = null;
    const directOrder = await env.DB.prepare(
      'SELECT id, member_id FROM orders WHERE id = ? LIMIT 1'
    ).bind(cleanOrderId).first<any>();

    if (directOrder) {
      orderOwnerId = directOrder.member_id;
    } else {
      const parentOrder = await env.DB.prepare(
        'SELECT id, buyer_member_id FROM seller_parent_orders WHERE (id = ? OR parent_order_code = ?) LIMIT 1'
      ).bind(cleanOrderId, cleanOrderId).first<any>();

      if (parentOrder) {
        orderOwnerId = parentOrder.buyer_member_id;
      } else {
        const sellerChild = await env.DB.prepare(
          'SELECT id, buyer_member_id FROM seller_orders WHERE (id = ? OR order_code = ?) LIMIT 1'
        ).bind(cleanOrderId, cleanOrderId).first<any>();
        if (sellerChild) {
          orderOwnerId = sellerChild.buyer_member_id;
        }
      }
    }

    if (!orderOwnerId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Không tìm thấy đơn hàng tương ứng.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (!isAdmin && callerMember.id !== orderOwnerId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Bạn không có quyền áp dụng voucher cho đơn hàng của người khác.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // 2. Chống lặp: Kiểm tra đơn hàng đã áp dụng voucher này chưa
    const existing = await env.DB.prepare(
      'SELECT id FROM voucher_redemptions WHERE order_id = ? AND UPPER(code) = ? LIMIT 1'
    ).bind(cleanOrderId, cleanCode).first<any>();

    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Voucher đã được áp dụng cho đơn hàng này.',
          already_redeemed: true,
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 2.5 Kiểm tra tính hợp lệ của Voucher (Active + Thời hạn hiệu lực start_date / end_date)
    const targetVoucher = await env.DB.prepare(`
      SELECT id, code, is_active, usage_count, usage_limit, start_date, end_date, voucher_type
      FROM vouchers
      WHERE UPPER(TRIM(code)) = ?
      LIMIT 1
    `).bind(cleanCode).first<any>();

    if (!targetVoucher) {
      return new Response(
        JSON.stringify({ success: false, message: 'Mã voucher không tồn tại trên hệ thống.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (!targetVoucher.is_active) {
      return new Response(
        JSON.stringify({ success: false, message: 'Mã voucher đang bị tạm khóa hoặc không còn hoạt động.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const now = new Date();
    if (targetVoucher.start_date && new Date(targetVoucher.start_date) > now) {
      return new Response(
        JSON.stringify({ success: false, message: 'Mã voucher chưa đến thời gian áp dụng.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (targetVoucher.end_date && new Date(targetVoucher.end_date) < now) {
      return new Response(
        JSON.stringify({ success: false, message: 'Mã voucher đã hết hạn sử dụng.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (targetVoucher.usage_limit && targetVoucher.usage_limit > 0 && targetVoucher.usage_count >= targetVoucher.usage_limit) {
      return new Response(
        JSON.stringify({ success: false, message: 'Mã voucher đã hết lượt sử dụng.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 3. Cập nhật tăng số lượt dùng trong D1 (Atomic check usage_limit & date validity)
    const nowIso = now.toISOString();
    const updateRes: any = await env.DB.prepare(`
      UPDATE vouchers
      SET usage_count = usage_count + 1
      WHERE UPPER(TRIM(code)) = ? AND is_active = 1
        AND (usage_limit IS NULL OR usage_limit = 0 OR usage_count < usage_limit)
        AND (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
    `).bind(cleanCode, nowIso, nowIso).run();

    if (!updateRes || updateRes.meta?.changes === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'Mã voucher đã hết lượt sử dụng hoặc không còn hiệu lực.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 4. Ghi nhận nhật ký đổi mã nguyên tử
    const redBytes = new Uint8Array(4);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(redBytes);
    const redSuffix = Array.from(redBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const redId = `vred_${Date.now()}_${redSuffix}`;
    await env.DB.prepare(`
      INSERT OR IGNORE INTO voucher_redemptions (id, order_id, code, member_id, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(redId, cleanOrderId, cleanCode, callerMember ? callerMember.id : 'admin').run();

    const voucher = await env.DB.prepare(`
      SELECT id, code, usage_count, usage_limit, voucher_type
      FROM vouchers
      WHERE UPPER(TRIM(code)) = ?
      LIMIT 1
    `).bind(cleanCode).first<any>();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Đã ghi nhận áp dụng voucher ${cleanCode} thành công.`,
        data: {
          code: cleanCode,
          usage_count: voucher?.usage_count || 1,
          usage_limit: voucher?.usage_limit || 1000,
          order_id: cleanOrderId,
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi ghi nhận voucher.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
