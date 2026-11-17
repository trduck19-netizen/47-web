import { CORS_HEADERS, Env, verifyAdminAuth, verifyAiKeyAuth } from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * PUT /api/categories/:id
 * Cập nhật danh mục
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
      const aiCheck = await verifyAiKeyAuth(request, env.DB, env, 'CATEGORIES_FULL');
      if (aiCheck.authorized) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, message: 'Quyền truy cập bị từ chối.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const { name, icon, description, sort_order, is_active } = body;

    const updates: string[] = [];
    const bindParams: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); bindParams.push(name); }
    if (icon !== undefined) { updates.push('icon = ?'); bindParams.push(icon); }
    if (description !== undefined) { updates.push('description = ?'); bindParams.push(description); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); bindParams.push(sort_order); }
    if (is_active !== undefined) { updates.push('is_active = ?'); bindParams.push(is_active ? 1 : 0); }

    if (updates.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'Không có dữ liệu thay đổi.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    bindParams.push(id);
    await env.DB.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).bind(...bindParams).run();

    return new Response(
      JSON.stringify({ success: true, message: 'Cập nhật danh mục thành công!' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi cập nhật danh mục.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * DELETE /api/categories/:id
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
      const aiCheck = await verifyAiKeyAuth(request, env.DB, env, 'CATEGORIES_FULL');
      if (aiCheck.authorized) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, message: 'Quyền truy cập bị từ chối.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    await env.DB.prepare('UPDATE categories SET is_active = 0 WHERE id = ?').bind(id).run();

    return new Response(
      JSON.stringify({ success: true, message: 'Đã xóa danh mục thành công.' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi xóa danh mục.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
