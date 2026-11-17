import { CORS_HEADERS, Env, verifyAdminAuth, verifyAiKeyAuth, hasScope } from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/products
 * Danh sách sản phẩm đa ngành (Phân trang, lọc theo ngành, danh mục, loại hàng vật lý/số, tìm kiếm)
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

    const url = new URL(request.url);
    const industryId = url.searchParams.get('industry_id') || url.searchParams.get('industry') || '';
    const categoryId = url.searchParams.get('category_id') || url.searchParams.get('category') || '';
    const productType = url.searchParams.get('product_type') || url.searchParams.get('type') || '';
    const search = url.searchParams.get('search') || url.searchParams.get('q') || '';
    const sort = url.searchParams.get('sort') || 'newest';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['is_active = 1'];
    const params: any[] = [];

    if (industryId && industryId !== 'all') {
      conditions.push('industry_id = ?');
      params.push(industryId);
    }

    if (categoryId && categoryId !== 'all') {
      conditions.push('category_id = ?');
      params.push(categoryId);
    }

    if (productType) {
      conditions.push('product_type = ?');
      params.push(productType);
    }

    if (search.trim()) {
      conditions.push('(title LIKE ? OR description LIKE ? OR brand_name LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'ORDER BY created_at DESC';
    if (sort === 'price_asc') orderBy = 'ORDER BY current_price ASC';
    else if (sort === 'price_desc') orderBy = 'ORDER BY current_price DESC';
    else if (sort === 'rating') orderBy = 'ORDER BY rating_avg DESC';
    else if (sort === 'sold') orderBy = 'ORDER BY sold_count DESC';

    const countQuery = `SELECT COUNT(*) as total FROM products ${whereClause}`;
    const totalRow = await env.DB.prepare(countQuery).bind(...params).first<any>();
    const total = Number(totalRow?.total || 0);

    const query = `
      SELECT id, title, slug, industry_id, category_id, product_type,
             original_price, current_price, discount_percent, stock_quantity,
             thumbnail_url, images_json, description, specifications_json,
             brand_name, rating_avg, rating_count, sold_count, is_active,
             created_at, updated_at
      FROM products
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const { results } = await env.DB.prepare(query).bind(...params, limit, offset).all<any>();

    const items = (results || []).map((p: any) => {
      let images = [];
      let specs = {};
      try { images = JSON.parse(p.images_json || '[]'); } catch {}
      try { specs = JSON.parse(p.specifications_json || '{}'); } catch {}
      return {
        ...p,
        images,
        specifications: specs,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tải danh sách sản phẩm.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * POST /api/products
 * Thêm mới sản phẩm đa ngành (Kèm quản lý biến thể SKU)
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
      const aiCheck = await verifyAiKeyAuth(request, env.DB, env, 'PRODUCTS_FULL');
      if (aiCheck.authorized) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, message: 'Bạn không có quyền thêm mới sản phẩm (yêu cầu quyền PRODUCTS_FULL hoặc Admin).' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const {
      title,
      slug,
      industry_id,
      category_id,
      product_type = 'physical',
      original_price = 0,
      current_price = 0,
      discount_percent = 0,
      stock_quantity = 0,
      thumbnail_url,
      images = [],
      description = '',
      specifications = {},
      brand_name = '',
      variants = [],
    } = body;

    if (!title || !industry_id) {
      return new Response(
        JSON.stringify({ success: false, message: 'Tên sản phẩm và Ngành hàng (industry_id) là bắt buộc.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const id = `prd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const effectiveSlug = slug || `${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    const imagesJson = typeof images === 'string' ? images : JSON.stringify(images);
    const specsJson = typeof specifications === 'string' ? specifications : JSON.stringify(specifications);

    await env.DB.prepare(`
      INSERT INTO products (
        id, title, slug, industry_id, category_id, product_type,
        original_price, current_price, discount_percent, stock_quantity,
        thumbnail_url, images_json, description, specifications_json,
        brand_name, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      id,
      title,
      effectiveSlug,
      industry_id,
      category_id || null,
      product_type,
      original_price,
      current_price,
      discount_percent,
      stock_quantity,
      thumbnail_url || null,
      imagesJson,
      description,
      specsJson,
      brand_name,
      nowIso,
      nowIso
    ).run();

    // Thêm các biến thể nếu có
    if (Array.isArray(variants) && variants.length > 0) {
      for (const v of variants) {
        const vId = `var_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const sku = v.sku || `SKU_${id}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const attrJson = JSON.stringify(v.attributes || {});
        await env.DB.prepare(`
          INSERT INTO product_variants (
            id, product_id, sku, variant_name, attributes_json,
            price, original_price, stock_quantity, image_url, is_active, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
        `).bind(
          vId,
          id,
          sku,
          v.variant_name || 'Mặc định',
          attrJson,
          v.price || current_price,
          v.original_price || original_price,
          v.stock_quantity || 0,
          v.image_url || thumbnail_url || null
        ).run().catch(() => {});
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tạo sản phẩm mới thành công!',
        data: { id, title, slug: effectiveSlug },
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tạo sản phẩm.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
