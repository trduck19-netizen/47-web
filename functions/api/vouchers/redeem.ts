import { CORS_HEADERS, Env } from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * POST /api/vouchers/redeem
 * Ghi nhận trừ lượt dùng voucher trong Cloudflare D1 khi đơn hàng hoàn tất
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

    const body: any = await request.json().catch(() => ({}));
    const { code, order_id } = body;

    if (!code || typeof code !== 'string') {
      return new Response(
        JSON.stringify({ success: false, message: 'Thiếu mã voucher.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cleanCode = code.trim().toUpperCase();

    // Cập nhật tăng số lượt dùng trong D1
    const res = await env.DB.prepare(`
      UPDATE vouchers
      SET usage_count = usage_count + 1
      WHERE UPPER(TRIM(code)) = ? AND is_active = 1
    `).bind(cleanCode).run();

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
          order_id: order_id || null,
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
