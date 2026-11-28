import { ensureMarketplaceSchema } from '../../../services/d1_service';
import { getMarketplaceConfig } from '../../../services/marketplace_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';
import { bumpCatalogEpoch } from '../../../services/cache_service';
import fallbackGamesData from '../../../data/compact_games_fallback.json';
import {
  getSellerIndustryById,
  parseSafeJsonArray,
  sanitizeProductImagesList,
  sanitizeProductSpecs,
  sanitizeProductVariants,
} from '../../../../src/config/sellerIndustries';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

function enrichSellerProductRow(p: any) {
  const images = parseSafeJsonArray<string>(p.images_json).filter((u) => typeof u === 'string' && u.trim());
  const finalImages = images.length > 0 ? images.slice(0, 10) : p.cover_url ? [p.cover_url] : [];
  return {
    ...p,
    cover_url: finalImages[0] || p.cover_url,
    images: finalImages,
    specs: parseSafeJsonArray(p.specs_json),
    variants: parseSafeJsonArray(p.variants_json),
    is_paused: Number(p.is_paused || 0) === 1 ? 1 : 0,
    is_featured: Number(p.is_featured || 0) === 1 ? 1 : 0,
  };
}

// GET: Danh sách sản phẩm của gian hàng
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'ANY' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({
          success: false,
          error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API gian hàng hợp lệ.',
        }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const seller = storeAuth.seller;

    const products = await env.DB
      .prepare(`
        SELECT 
          sp.*,
          COALESCE(sp.product_type, 'digital') as product_type,
          dc.delivery_mode,
          dc.webhook_url,
          COALESCE(dc.warranty_hours, sp.warranty_hours, 24) as digital_warranty_hours,
          COALESCE(pc.weight_grams, sp.weight_grams) as weight_grams,
          pc.length_cm,
          pc.width_cm,
          pc.height_cm,
          COALESCE(pc.warehouse_address, sp.warehouse_address) as warehouse_address,
          COALESCE(sp.variants_json, pc.variants_json) as variants_json,
          pc.cod_allowed,
          (SELECT COUNT(*) FROM seller_codes sc WHERE sc.product_id = sp.id AND sc.status = 'IN_STOCK' AND sc.deleted_at IS NULL) as in_stock_count,
          (SELECT COUNT(*) FROM seller_orders so WHERE so.product_id = sp.id AND so.status IN ('PAID', 'DELIVERED', 'COMPLETED')) as sold_count,
          (SELECT COUNT(*) FROM seller_codes sc WHERE sc.product_id = sp.id AND sc.status = 'REPORTED' AND sc.deleted_at IS NULL) as reported_count
        FROM seller_products sp
        LEFT JOIN seller_product_digital_configs dc ON sp.id = dc.product_id
        LEFT JOIN seller_product_physical_configs pc ON sp.id = pc.product_id
        WHERE sp.seller_id = ? AND sp.deleted_at IS NULL
        ORDER BY COALESCE(sp.is_featured, 0) DESC, sp.created_at DESC
      `)
      .bind(seller.id)
      .all<any>();

    return new Response(
      JSON.stringify({
        success: true,
        products: (products.results || []).map(enrichSellerProductRow),
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

// POST: Tạo sản phẩm mới đa ngành (tối đa 10 ảnh, không phụ thuộc game_slug)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({
          success: false,
          error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API gian hàng hợp lệ.',
        }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const sellerRow = storeAuth.seller;
    const body = (await request.json().catch(() => ({}))) as any;

    if (sellerRow.status === 'SUSPENDED' || sellerRow.status === 'REJECTED') {
      return new Response(
        JSON.stringify({ success: false, error: 'Gian hàng đang bị khóa hoặc bị từ chối, không thể tạo sản phẩm.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const marketplaceConfig = await getMarketplaceConfig(env.DB);
    if (sellerRow.status === 'TRIAL') {
      const activeProdCount = await env.DB
        .prepare('SELECT COUNT(*) as count FROM seller_products WHERE seller_id = ? AND deleted_at IS NULL')
        .bind(sellerRow.id)
        .first<{ count: number }>();

      const limit =
        sellerRow.trial_product_limit !== null && sellerRow.trial_product_limit !== undefined
          ? Number(sellerRow.trial_product_limit)
          : marketplaceConfig.default_trial_product_limit;

      if ((activeProdCount?.count || 0) >= limit) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Gian hàng thử việc (TRIAL) được đăng tối đa ${limit} sản phẩm.`,
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
    }

    const prodName = String(body.name || body.title || '').trim();
    if (!prodName || prodName.length < 3 || prodName.length > 160) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tên sản phẩm phải từ 3–160 ký tự.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const priceCore = parseInt(body.price_core, 10);
    if (isNaN(priceCore) || priceCore <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Giá bán phải lớn hơn 0.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const maxOrderPrice =
      sellerRow.trial_order_max !== null && sellerRow.trial_order_max !== undefined
        ? Number(sellerRow.trial_order_max)
        : marketplaceConfig.default_trial_order_max;

    if (sellerRow.status === 'TRIAL' && priceCore > maxOrderPrice) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Gian hàng thử việc chỉ được đặt giá tối đa ${maxOrderPrice} cho mỗi sản phẩm.`,
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Xác thực danh sách tối đa 10 ảnh sản phẩm
    const imgCheck = sanitizeProductImagesList(
      body.images !== undefined ? body.images : body.images_json,
      body.cover_url
    );
    if (!imgCheck.ok) {
      return new Response(
        JSON.stringify({ success: false, error: imgCheck.error, code: imgCheck.code }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Xác định loại sản phẩm & chế độ giao hàng
    const rawFulfillment = String(body.fulfillment_mode || '').toUpperCase().trim();
    const rawProductType = String(body.product_type || '').toLowerCase().trim();
    const industryOpt = getSellerIndustryById(body.industry_id);
    const productType: 'physical' | 'digital' =
      rawProductType === 'physical' || rawFulfillment === 'SHIPPING'
        ? 'physical'
        : rawProductType === 'digital'
          ? 'digital'
          : industryOpt.defaultProductType;

    const fulfillmentMode: 'SHIPPING' | 'AUTO_VAULT' | 'WEBHOOK' | 'MANUAL_SERVICE' =
      productType === 'physical'
        ? 'SHIPPING'
        : rawFulfillment === 'MANUAL_SERVICE' || String(body.delivery_type || '').toUpperCase() === 'MANUAL'
          ? 'MANUAL_SERVICE'
          : rawFulfillment === 'WEBHOOK' || String(body.delivery_mode || '').toUpperCase() === 'WEBHOOK'
            ? 'WEBHOOK'
            : 'AUTO_VAULT';

    let stockQuantityParsed = 0;
    if (body.stock_quantity !== undefined && body.stock_quantity !== null && body.stock_quantity !== '') {
      const numStock = Number(body.stock_quantity);
      if (!Number.isFinite(numStock) || !Number.isInteger(numStock) || numStock < 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Số lượng tồn kho (stock_quantity) phải là số nguyên >= 0.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      stockQuantityParsed = numStock;
    } else if (fulfillmentMode === 'MANUAL_SERVICE') {
      stockQuantityParsed = 50;
    }

    let weightGramsParsed: number | null = null;
    let warehouseAddressClean: string | null = null;
    let deliveryModeClean = 'INVENTORY';
    let webhookUrlClean: string | null = null;
    const warrantyHoursParsed = body.warranty_hours ? parseInt(body.warranty_hours, 10) : 24;

    if (productType === 'physical') {
      weightGramsParsed = parseInt(body.weight_grams ?? '500', 10);
      if (isNaN(weightGramsParsed) || weightGramsParsed <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Sản phẩm vật lý cần nhập cân nặng (gram) lớn hơn 0.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      warehouseAddressClean = String(body.warehouse_address || '').trim();
      if (!warehouseAddressClean) {
        return new Response(
          JSON.stringify({ success: false, error: 'Sản phẩm vật lý cần có địa chỉ kho lấy hàng.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
    } else {
      deliveryModeClean =
        fulfillmentMode === 'WEBHOOK'
          ? 'WEBHOOK'
          : fulfillmentMode === 'MANUAL_SERVICE'
            ? 'MANUAL'
            : 'INVENTORY';
      if (deliveryModeClean === 'WEBHOOK') {
        webhookUrlClean = String(body.webhook_url || '').trim();
        if (!webhookUrlClean) {
          return new Response(
            JSON.stringify({ success: false, error: 'Hình thức giao qua Webhook API yêu cầu nhập webhook_url.' }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
      }
    }

    // Tương thích ngược nếu client cũ vẫn truyền game_slug, nhưng KHÔNG BẮT BUỘC nữa
    let legacyGame: any = null;
    if (body.game_slug) {
      legacyGame = await env.DB
        .prepare('SELECT slug, name, icon_url FROM games WHERE slug = ? LIMIT 1')
        .bind(String(body.game_slug).trim())
        .first<any>()
        .catch(() => null);
      if (!legacyGame && Array.isArray(fallbackGamesData)) {
        const found = (fallbackGamesData as any[]).find(
          (g) => (g.slug || g.id) === body.game_slug || (g.slug || g.id) === String(body.game_slug).toLowerCase()
        );
        if (found) {
          legacyGame = {
            slug: found.slug || found.id,
            name: found.name,
            icon_url: found.icon_url || found.iconUrl || `/game_icons/${found.slug || found.id}.webp`,
          };
        }
      }
    }

    const industryId = String(body.industry_id || (legacyGame ? 'entertainment' : industryOpt.id)).trim().toLowerCase();
    const categoryName =
      String(body.category_name || '').trim().slice(0, 80) ||
      (legacyGame ? legacyGame.name : industryOpt.labelVi);
    const shopCategory = String(body.shop_category || '').trim().slice(0, 60) || null;
    const skuClean = String(body.sku || '').trim().slice(0, 50) || null;
    const buyerNotePrompt = String(body.buyer_note_prompt || '').trim().slice(0, 180) || null;
    const isPaused = body.is_paused ? 1 : 0;
    const isFeatured = body.is_featured ? 1 : 0;

    const finalImages =
      imgCheck.images.length > 0
        ? imgCheck.images
        : legacyGame?.icon_url
          ? [legacyGame.icon_url]
          : ['/game_icons/physical-default.webp?v=2'];
    const officialCoverUrl = finalImages[0];
    const officialGameSlug = legacyGame ? legacyGame.slug : industryId || (productType === 'physical' ? 'physical_goods' : 'digital_service');
    const officialGameName = categoryName;

    const cleanSpecs = sanitizeProductSpecs(body.specs ?? body.specs_json);
    const cleanVariants = sanitizeProductVariants(body.variants ?? body.variants_json, priceCore);
    if (cleanVariants.length > 0 && (body.stock_quantity === undefined || body.stock_quantity === null || body.stock_quantity === '')) {
      const sumVarStock = cleanVariants.reduce((acc, v) => acc + Number(v.stock_quantity || 0), 0);
      if (sumVarStock > 0) stockQuantityParsed = sumVarStock;
    }

    const specsJsonStr = cleanSpecs.length > 0 ? JSON.stringify(cleanSpecs) : null;
    const variantsJsonStr = cleanVariants.length > 0 ? JSON.stringify(cleanVariants) : null;
    const imagesJsonStr = JSON.stringify(finalImages);

    const initialStatus = sellerRow.status === 'ACTIVE' ? 'APPROVED' : 'PENDING_REVIEW';
    const prodId = `sprod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    await env.DB
      .prepare(`
        INSERT INTO seller_products (
          id, seller_id, game_slug, game_name, industry_id, category_name, shop_category, sku,
          name, cover_url, images_json, specs_json, variants_json,
          fulfillment_mode, buyer_note_prompt, is_paused, is_featured,
          description, price_core, original_price_core, warranty_type, warranty_hours,
          delivery_type, low_stock_threshold, product_type, stock_quantity,
          weight_grams, warehouse_address, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        prodId,
        sellerRow.id,
        officialGameSlug,
        officialGameName,
        industryId,
        categoryName,
        shopCategory,
        skuClean,
        prodName,
        officialCoverUrl,
        imagesJsonStr,
        specsJsonStr,
        variantsJsonStr,
        fulfillmentMode,
        buyerNotePrompt,
        isPaused,
        isFeatured,
        body.description ? String(body.description).trim() : null,
        priceCore,
        body.original_price_core ? parseInt(body.original_price_core, 10) : null,
        body.warranty_type || `${warrantyHoursParsed}H`,
        warrantyHoursParsed,
        fulfillmentMode === 'MANUAL_SERVICE' ? 'MANUAL' : 'AUTO',
        body.low_stock_threshold ? parseInt(body.low_stock_threshold, 10) : 2,
        productType,
        stockQuantityParsed,
        weightGramsParsed,
        warehouseAddressClean,
        initialStatus,
        nowIso,
        nowIso
      )
      .run();

    // Lưu tự động bộ sưu tập shop mới vào sellers.shop_categories_json nếu chưa có
    if (shopCategory) {
      const sRow = await env.DB
        .prepare('SELECT shop_categories_json FROM sellers WHERE id = ? LIMIT 1')
        .bind(sellerRow.id)
        .first<any>()
        .catch(() => null);
      const curList = parseSafeJsonArray<string>(sRow?.shop_categories_json).filter(
        (c) => typeof c === 'string' && c.trim()
      );
      if (!curList.includes(shopCategory) && curList.length < 15) {
        curList.push(shopCategory);
        await env.DB
          .prepare('UPDATE sellers SET shop_categories_json = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(curList), nowIso, sellerRow.id)
          .run()
          .catch(() => {});
      }
    }

    if (productType === 'digital') {
      await env.DB
        .prepare(`
          INSERT INTO seller_product_digital_configs (
            product_id, seller_id, delivery_mode, webhook_url, warranty_hours, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(product_id) DO UPDATE SET
            delivery_mode = excluded.delivery_mode,
            webhook_url = excluded.webhook_url,
            warranty_hours = excluded.warranty_hours,
            updated_at = excluded.updated_at
        `)
        .bind(prodId, sellerRow.id, deliveryModeClean, webhookUrlClean, warrantyHoursParsed, nowIso, nowIso)
        .run()
        .catch(() => {});
    } else {
      const lengthCm = parseInt(body.length_cm, 10) || 10;
      const widthCm = parseInt(body.width_cm, 10) || 10;
      const heightCm = parseInt(body.height_cm, 10) || 10;
      const codAllowedVal = body.cod_allowed ? 1 : 0;

      await env.DB
        .prepare(`
          INSERT INTO seller_product_physical_configs (
            product_id, seller_id, weight_grams, length_cm, width_cm, height_cm, warehouse_address, variants_json, cod_allowed, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(product_id) DO UPDATE SET
            weight_grams = excluded.weight_grams,
            length_cm = excluded.length_cm,
            width_cm = excluded.width_cm,
            height_cm = excluded.height_cm,
            warehouse_address = excluded.warehouse_address,
            variants_json = excluded.variants_json,
            cod_allowed = excluded.cod_allowed,
            updated_at = excluded.updated_at
        `)
        .bind(
          prodId,
          sellerRow.id,
          weightGramsParsed,
          lengthCm,
          widthCm,
          heightCm,
          warehouseAddressClean,
          variantsJsonStr,
          codAllowedVal,
          nowIso,
          nowIso
        )
        .run()
        .catch(() => {});
    }

    await bumpCatalogEpoch(env.DB).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message:
          initialStatus === 'APPROVED'
            ? 'Đã đăng sản phẩm thành công lên gian hàng!'
            : 'Sản phẩm đã tạo và đang chờ Quản trị viên duyệt trước khi công khai.',
        product_id: prodId,
        product: {
          id: prodId,
          seller_id: sellerRow.id,
          name: prodName,
          industry_id: industryId,
          category_name: categoryName,
          shop_category: shopCategory,
          sku: skuClean,
          cover_url: officialCoverUrl,
          images: finalImages,
          specs: cleanSpecs,
          variants: cleanVariants,
          fulfillment_mode: fulfillmentMode,
          product_type: productType,
          price_core: priceCore,
          stock_quantity: stockQuantityParsed,
          status: initialStatus,
        },
        status: initialStatus,
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
