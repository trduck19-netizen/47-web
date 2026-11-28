import { CORS_HEADERS, Env, verifyAdminAuth, verifyAiKeyAuth } from '../../services/mission_service';
import { ensureSchemaUpgrades } from '../../services/d1_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/vouchers
 * Lấy danh sách Voucher (Mã giảm giá đơn hàng & Freeship Xtra)
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);

    const url = new URL(request.url);
    const voucherType = url.searchParams.get('type') || ''; // 'freeship' | 'discount'
    const activeOnly = url.searchParams.get('active_only') !== 'false';

    let query = 'SELECT * FROM vouchers';
    const conditions: string[] = [];
    const params: any[] = [];

    if (activeOnly) {
      conditions.push('is_active = 1');
    }

    if (voucherType) {
      conditions.push('voucher_type = ?');
      params.push(voucherType);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC';

    const { results } = await env.DB.prepare(query).bind(...params).all<any>();

    return new Response(
      JSON.stringify({ success: true, data: results || [] }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tải danh sách voucher.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * POST /api/vouchers
 * Thêm mới mã giảm giá / Freeship
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

    const adminCheck = await verifyAdminAuth(request, env);
    let isAuthorized = adminCheck.authorized;
    if (!isAuthorized) {
      const aiCheck = await verifyAiKeyAuth(request, env.DB, env, 'VOUCHERS_FULL');
      if (aiCheck.authorized) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, message: 'Quyền truy cập bị từ chối (yêu cầu quyền VOUCHERS_FULL).' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const {
      code,
      voucher_type = 'discount',
      discount_type = 'fixed',
      discount_value,
      min_order_amount = 0,
      max_discount_amount,
      usage_limit = 1000,
      start_date,
      end_date,
    } = body;

    if (!code || !discount_value) {
      return new Response(
        JSON.stringify({ success: false, message: 'Mã voucher (code) và giá trị giảm (discount_value) là bắt buộc.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const id = `vc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cleanCode = String(code).trim().toUpperCase();

    await env.DB.prepare(`
      INSERT INTO vouchers (
        id, code, voucher_type, discount_type, discount_value,
        min_order_amount, max_discount_amount, usage_limit, usage_count,
        is_active, start_date, end_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, datetime('now'))
    `).bind(
      id,
      cleanCode,
      voucher_type,
      discount_type,
      discount_value,
      min_order_amount,
      max_discount_amount || null,
      usage_limit,
      start_date || null,
      end_date || null
    ).run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tạo mã voucher thành công!',
        data: { id, code: cleanCode },
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tạo voucher.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
