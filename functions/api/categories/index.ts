import { CORS_HEADERS, Env, verifyAdminAuth, verifyAiKeyAuth } from '../../services/mission_service';
import { ensureSchemaUpgrades } from '../../services/d1_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/categories
 * Lấy danh mục ngành hàng (có thể lọc theo industry_id)
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
    const industryId = url.searchParams.get('industry_id') || url.searchParams.get('industry') || '';

    let query = 'SELECT * FROM categories WHERE is_active = 1';
    const params: any[] = [];

    if (industryId && industryId !== 'all') {
      query += ' AND industry_id = ?';
      params.push(industryId);
    }

    query += ' ORDER BY sort_order ASC, name ASC';

    const { results } = await env.DB.prepare(query).bind(...params).all<any>();

    return new Response(
      JSON.stringify({ success: true, data: results || [] }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tải danh mục.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * POST /api/categories
 * Thêm mới danh mục
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

    const adminCheck = await verifyAdminAuth(request, env);
    let isAuthorized = adminCheck.authorized;
    if (!isAuthorized) {
      const aiCheck = await verifyAiKeyAuth(request, env.DB, env, 'CATEGORIES_FULL');
      if (aiCheck.authorized) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, message: 'Quyền truy cập bị từ chối (yêu cầu quyền CATEGORIES_FULL).' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const { industry_id, name, slug, icon, description, sort_order = 0 } = body;

    if (!industry_id || !name) {
      return new Response(
        JSON.stringify({ success: false, message: 'Ngành hàng (industry_id) và Tên danh mục là bắt buộc.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const effectiveSlug = slug || `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.random().toString(36).slice(2, 5)}`;

    await env.DB.prepare(`
      INSERT INTO categories (id, industry_id, name, slug, icon, description, sort_order, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `).bind(id, industry_id, name, effectiveSlug, icon || null, description || null, sort_order).run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tạo danh mục mới thành công!',
        data: { id, name, slug: effectiveSlug },
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tạo danh mục.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
