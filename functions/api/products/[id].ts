import { CORS_HEADERS, Env, verifyAdminAuth, verifyAiKeyAuth } from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/products/:id
 * Chi tiết sản phẩm kèm toàn bộ biến thể (variants)
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, env } = context;
  const idOrSlug = params.id as string;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const product = await env.DB.prepare(`
      SELECT * FROM products
      WHERE id = ? OR slug = ?
      LIMIT 1
    `).bind(idOrSlug, idOrSlug).first<any>();

    if (!product) {
      return new Response(
        JSON.stringify({ success: false, message: 'Không tìm thấy sản phẩm.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    let images = [];
    let specifications = {};
    try { images = JSON.parse(product.images_json || '[]'); } catch {}
    try { specifications = JSON.parse(product.specifications_json || '{}'); } catch {}

    // Lấy danh sách variants
    const { results: variants } = await env.DB.prepare(`
      SELECT id, sku, variant_name, attributes_json, price, original_price, stock_quantity, image_url, is_active
      FROM product_variants
      WHERE product_id = ? AND is_active = 1
      ORDER BY price ASC
    `).bind(product.id).all<any>();

    const parsedVariants = (variants || []).map((v: any) => {
      let attributes = {};
      try { attributes = JSON.parse(v.attributes_json || '{}'); } catch {}
      return { ...v, attributes };
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...product,
          images,
          specifications,
          variants: parsedVariants,
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tải chi tiết sản phẩm.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * PUT /api/products/:id
 * Cập nhật thông tin sản phẩm và tồn kho
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
      const aiCheck = await verifyAiKeyAuth(request, env.DB, env, 'PRODUCTS_FULL');
      if (aiCheck.authorized) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, message: 'Quyền truy cập bị từ chối (yêu cầu quyền PRODUCTS_FULL).' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const {
      title,
      current_price,
      original_price,
      discount_percent,
      stock_quantity,
      thumbnail_url,
      images,
      description,
      specifications,
      brand_name,
      is_active,
    } = body;

    const existing = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first<any>();
    if (!existing) {
      return new Response(
        JSON.stringify({ success: false, message: 'Không tìm thấy sản phẩm để cập nhật.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const updates: string[] = ["updated_at = datetime('now')"];
    const bindParams: any[] = [];

    if (title !== undefined) { updates.push('title = ?'); bindParams.push(title); }
    if (current_price !== undefined) { updates.push('current_price = ?'); bindParams.push(current_price); }
    if (original_price !== undefined) { updates.push('original_price = ?'); bindParams.push(original_price); }
    if (discount_percent !== undefined) { updates.push('discount_percent = ?'); bindParams.push(discount_percent); }
    if (stock_quantity !== undefined) { updates.push('stock_quantity = ?'); bindParams.push(stock_quantity); }
    if (thumbnail_url !== undefined) { updates.push('thumbnail_url = ?'); bindParams.push(thumbnail_url); }
    if (images !== undefined) { updates.push('images_json = ?'); bindParams.push(JSON.stringify(images)); }
    if (description !== undefined) { updates.push('description = ?'); bindParams.push(description); }
    if (specifications !== undefined) { updates.push('specifications_json = ?'); bindParams.push(JSON.stringify(specifications)); }
    if (brand_name !== undefined) { updates.push('brand_name = ?'); bindParams.push(brand_name); }
    if (is_active !== undefined) { updates.push('is_active = ?'); bindParams.push(is_active ? 1 : 0); }

    bindParams.push(id);

    await env.DB.prepare(`
      UPDATE products
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...bindParams).run();

    return new Response(
      JSON.stringify({ success: true, message: 'Cập nhật sản phẩm thành công!' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi cập nhật sản phẩm.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * DELETE /api/products/:id
 * Xóa mềm hoặc xóa sản phẩm
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
      const aiCheck = await verifyAiKeyAuth(request, env.DB, env, 'PRODUCTS_FULL');
      if (aiCheck.authorized) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, message: 'Quyền truy cập bị từ chối.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();

    return new Response(
      JSON.stringify({ success: true, message: 'Đã xóa hoàn toàn sản phẩm khỏi hệ thống!' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi xóa sản phẩm.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
