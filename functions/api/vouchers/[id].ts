import { CORS_HEADERS, Env, verifyAdminAuth, verifyAiKeyAuth } from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * PUT /api/vouchers/:id
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, params, env } = context;
  const id = params.id as string;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const adminCheck = await verifyAdminAuth(request, env);
    let isAuthorized = adminCheck.authorized;
    if (!isAuthorized) {
      const aiCheck = await verifyAiKeyAuth(request, env.DB, env, 'VOUCHERS_FULL');
      if (aiCheck.authorized) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, message: 'Quyền truy cập bị từ chối.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const { discount_value, min_order_amount, max_discount_amount, usage_limit, is_active, start_date, end_date } = body;

    const updates: string[] = [];
    const bindParams: any[] = [];

    if (discount_value !== undefined) { updates.push('discount_value = ?'); bindParams.push(discount_value); }
    if (min_order_amount !== undefined) { updates.push('min_order_amount = ?'); bindParams.push(min_order_amount); }
    if (max_discount_amount !== undefined) { updates.push('max_discount_amount = ?'); bindParams.push(max_discount_amount); }
    if (usage_limit !== undefined) { updates.push('usage_limit = ?'); bindParams.push(usage_limit); }
    if (is_active !== undefined) { updates.push('is_active = ?'); bindParams.push(is_active ? 1 : 0); }
    if (start_date !== undefined) { updates.push('start_date = ?'); bindParams.push(start_date); }
    if (end_date !== undefined) { updates.push('end_date = ?'); bindParams.push(end_date); }

    if (updates.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'Không có dữ liệu thay đổi.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    bindParams.push(id);
    await env.DB.prepare(`UPDATE vouchers SET ${updates.join(', ')} WHERE id = ?`).bind(...bindParams).run();

    return new Response(
      JSON.stringify({ success: true, message: 'Cập nhật voucher thành công!' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi cập nhật voucher.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * DELETE /api/vouchers/:id
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, params, env } = context;
  const id = params.id as string;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const adminCheck = await verifyAdminAuth(request, env);
    let isAuthorized = adminCheck.authorized;
    if (!isAuthorized) {
      const aiCheck = await verifyAiKeyAuth(request, env.DB, env, 'VOUCHERS_FULL');
      if (aiCheck.authorized) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, message: 'Quyền truy cập bị từ chối.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    await env.DB.prepare('UPDATE vouchers SET is_active = 0 WHERE id = ?').bind(id).run();

    return new Response(
      JSON.stringify({ success: true, message: 'Đã hủy kích hoạt voucher.' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi xóa voucher.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
