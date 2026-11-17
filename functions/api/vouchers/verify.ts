import { CORS_HEADERS, Env } from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * POST /api/vouchers/verify
 * Kiểm tra tính hợp lệ của mã Voucher và tính toán chính xác số tiền được giảm
 * Tuân thủ quy chuẩn Shopee-Style Voucher Stacking & chống âm tiền đơn hàng.
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
    const { code, order_amount = 0, shipping_fee = 0 } = body;

    if (!code || typeof code !== 'string') {
      return new Response(
        JSON.stringify({ success: false, message: 'Vui lòng cung cấp mã voucher cần kiểm tra.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cleanCode = code.trim().toUpperCase();

    const voucher = await env.DB.prepare(`
      SELECT * FROM vouchers
      WHERE UPPER(TRIM(code)) = ? AND is_active = 1
      LIMIT 1
    `).bind(cleanCode).first<any>();

    if (!voucher) {
      return new Response(
        JSON.stringify({
          success: false,
          valid: false,
          message: 'Mã voucher không tồn tại hoặc đã hết hiệu lực.',
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 1. Kiểm tra giới hạn số lượt dùng
    if (voucher.usage_limit && voucher.usage_count >= voucher.usage_limit) {
      return new Response(
        JSON.stringify({
          success: false,
          valid: false,
          message: 'Mã voucher đã hết lượt sử dụng.',
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 2. Kiểm tra thời hạn hiệu lực
    const now = new Date();
    if (voucher.start_date && new Date(voucher.start_date) > now) {
      return new Response(
        JSON.stringify({
          success: false,
          valid: false,
          message: 'Mã voucher chưa đến thời gian áp dụng.',
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    if (voucher.end_date && new Date(voucher.end_date) < now) {
      return new Response(
        JSON.stringify({
          success: false,
          valid: false,
          message: 'Mã voucher đã hết hạn sử dụng.',
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 3. Kiểm tra đơn hàng tối thiểu
    const orderAmt = Number(order_amount) || 0;
    const minAmt = Number(voucher.min_order_amount) || 0;
    if (orderAmt < minAmt) {
      return new Response(
        JSON.stringify({
          success: false,
          valid: false,
          message: `Đơn hàng tối thiểu phải từ ${minAmt.toLocaleString('vi-VN')}đ để áp dụng mã này.`,
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 4. Tính toán số tiền được giảm
    let discountAmount = 0;
    const vType = voucher.voucher_type; // 'freeship' | 'discount'
    const dType = voucher.discount_type; // 'fixed' | 'percent'
    const dVal = Number(voucher.discount_value) || 0;
    const maxDiscount = voucher.max_discount_amount ? Number(voucher.max_discount_amount) : Infinity;

    if (vType === 'freeship') {
      const shipFee = Number(shipping_fee) || 0;
      if (dType === 'percent') {
        discountAmount = Math.min(Math.round((shipFee * dVal) / 100), maxDiscount, shipFee);
      } else {
        discountAmount = Math.min(dVal, maxDiscount, shipFee);
      }
    } else {
      // Giảm giá đơn hàng
      if (dType === 'percent') {
        discountAmount = Math.min(Math.round((orderAmt * dVal) / 100), maxDiscount, orderAmt);
      } else {
        discountAmount = Math.min(dVal, maxDiscount, orderAmt);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        valid: true,
        message: 'Áp dụng mã voucher thành công!',
        data: {
          code: voucher.code,
          voucher_type: vType,
          discount_type: dType,
          discount_value: dVal,
          discount_amount: Math.max(0, discountAmount),
          min_order_amount: minAmt,
          max_discount_amount: voucher.max_discount_amount,
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi kiểm tra voucher.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
