import { ensureMarketplaceSchema } from '../../../services/d1_service';

interface Env {
  DB: D1Database;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Danh sách sản phẩm của gian hàng công khai (§6.1: không lộ số lượng kho thật)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const slug = (params.slug as string || '').toLowerCase().trim();

    const seller = await env.DB
      .prepare("SELECT id, name, status, is_vacation FROM sellers WHERE slug = ? AND deleted_at IS NULL LIMIT 1")
      .bind(slug)
      .first<any>();

    if (!seller || (seller.status !== 'TRIAL' && seller.status !== 'ACTIVE')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Gian hàng không tồn tại hoặc chưa mở cửa.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (seller.is_vacation) {
      return new Response(
        JSON.stringify({
          success: true,
          is_vacation: true,
          products: [],
          message: 'Gian hàng hiện đang trong thời gian nghỉ bán.',
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const products = await env.DB
      .prepare(`
        SELECT 
          sp.id, sp.seller_id, sp.game_slug, sp.game_name,
          sp.industry_id, sp.category_name, sp.shop_category, sp.sku,
          sp.images_json, sp.specs_json, sp.variants_json,
          sp.fulfillment_mode, sp.buyer_note_prompt, COALESCE(sp.is_featured, 0) as is_featured,
          sp.name, sp.cover_url,
          sp.description, sp.price_core, sp.original_price_core, sp.warranty_type,
          sp.warranty_hours, sp.delivery_type, COALESCE(sp.product_type, 'digital') as product_type,
          COALESCE(sp.stock_quantity, 0) as stock_quantity,
          sp.weight_grams, sp.warehouse_address, sp.created_at,
          sp.is_affiliate, sp.origin_seller_id, sp.origin_product_id,
          s_orig.name as supplier_name,
          (
            SELECT sal.show_supplier FROM seller_affiliate_listings sal
            WHERE sal.reseller_product_id = sp.id LIMIT 1
          ) as show_supplier,
          (
            SELECT COUNT(*) FROM seller_codes sc
            WHERE sc.product_id = COALESCE(sp.origin_product_id, sp.id) AND sc.status = 'IN_STOCK' AND sc.deleted_at IS NULL
          ) as stock_count,
          (
            SELECT COUNT(*) FROM seller_orders so
            WHERE so.product_id = sp.id AND so.status IN ('PAID', 'DELIVERED', 'COMPLETED')
          ) as sold_count
        FROM seller_products sp
        LEFT JOIN sellers s_orig ON sp.origin_seller_id = s_orig.id
        WHERE sp.seller_id = ? AND sp.status = 'APPROVED' AND COALESCE(sp.is_paused, 0) = 0 AND sp.deleted_at IS NULL
        ORDER BY COALESCE(sp.is_featured, 0) DESC, sp.created_at DESC
      `)
      .bind(seller.id)
      .all<any>();

    const safeProducts = (products.results || []).map((p) => {
      let images: string[] = [];
      let specs: any[] = [];
      let variants: any[] = [];
      try {
        if (p.images_json) {
          const arr = JSON.parse(p.images_json);
          if (Array.isArray(arr)) images = arr.filter((u: any) => typeof u === 'string' && u.trim()).slice(0, 10);
        }
      } catch {}
      if (images.length === 0 && p.cover_url) {
        images = [p.cover_url];
      }
      try {
        if (p.specs_json) {
          const arr = JSON.parse(p.specs_json);
          if (Array.isArray(arr)) specs = arr;
        }
      } catch {}
      try {
        if (p.variants_json) {
          const arr = JSON.parse(p.variants_json);
          if (Array.isArray(arr)) variants = arr;
        }
      } catch {}

      const isStockQtyMode =
        String(p.product_type || '').toLowerCase() === 'physical' ||
        String(p.fulfillment_mode || '').toUpperCase() === 'MANUAL_SERVICE';

      return {
        id: p.id,
        seller_id: p.seller_id,
        seller_name: seller.name,
        game_slug: p.game_slug,
        game_name: p.category_name || p.game_name,
        industry_id: p.industry_id || 'other',
        category_name: p.category_name || p.game_name || '',
        shop_category: p.shop_category || '',
        sku: p.sku || '',
        name: p.name,
        cover_url: images[0] || p.cover_url,
        images,
        specs,
        variants,
        fulfillment_mode: p.fulfillment_mode || (String(p.product_type || '').toLowerCase() === 'physical' ? 'SHIPPING' : 'AUTO_VAULT'),
        buyer_note_prompt: p.buyer_note_prompt || '',
        is_featured: Number(p.is_featured || 0) === 1,
        description: p.description,
        price_core: p.price_core,
        original_price_core: p.original_price_core,
        warranty_type: p.warranty_type,
        warranty_hours: p.warranty_hours,
        delivery_type: p.delivery_type,
        product_type: p.product_type || 'digital',
        stock_quantity: isStockQtyMode ? Number(p.stock_quantity || 0) : undefined,
        weight_grams: p.weight_grams,
        warehouse_address: p.warehouse_address,
        sold_count: Number(p.sold_count || 0),
        created_at: p.created_at,
        has_stock: isStockQtyMode
          ? Number(p.stock_quantity || 0) > 0
          : (p.stock_count || 0) > 0,
        is_affiliate: p.is_affiliate === 1,
        supplier_name: (p.is_affiliate === 1 && p.show_supplier !== 0) ? p.supplier_name : null,
        show_supplier: p.show_supplier !== 0,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        is_vacation: false,
        products: safeProducts,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
