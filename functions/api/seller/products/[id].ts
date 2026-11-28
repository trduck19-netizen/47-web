import { ensureMarketplaceSchema } from '../../../services/d1_service';
import { getMarketplaceConfig } from '../../../services/marketplace_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';
import { syncAffiliatePriceAndStock } from '../../../services/seller_affiliate_service';
import { bumpCatalogEpoch } from '../../../services/cache_service';
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
  'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Chi tiết 1 sản phẩm
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'ANY' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const productId = params.id as string;
    const sellerId = storeAuth.seller.id;

    const product = await env.DB
      .prepare(`
        SELECT sp.*,
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
               (SELECT COUNT(*) FROM seller_orders so WHERE so.product_id = sp.id AND so.status IN ('PAID', 'DELIVERED', 'COMPLETED')) as sold_count
        FROM seller_products sp
        LEFT JOIN seller_product_digital_configs dc ON sp.id = dc.product_id
        LEFT JOIN seller_product_physical_configs pc ON sp.id = pc.product_id
        WHERE sp.id = ? AND sp.seller_id = ? AND sp.deleted_at IS NULL
        LIMIT 1
      `)
      .bind(productId, sellerId)
      .first<any>();

    if (!product) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sản phẩm không tồn tại hoặc bạn không có quyền truy cập.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const images = parseSafeJsonArray<string>(product.images_json).filter((u) => typeof u === 'string' && u.trim());
    return new Response(
      JSON.stringify({
        success: true,
        product: {
          ...product,
          images: images.length > 0 ? images.slice(0, 10) : product.cover_url ? [product.cover_url] : [],
          specs: parseSafeJsonArray(product.specs_json),
          variants: parseSafeJsonArray(product.variants_json),
        },
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

// PUT: Cập nhật toàn diện sản phẩm đa ngành (tối đa 10 ảnh, biến thể, thông số, ngành hàng)
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const productId = params.id as string;
    const sellerId = storeAuth.seller.id;
    const body = (await request.json().catch(() => ({}))) as any;

    const product = await env.DB
      .prepare(`
        SELECT sp.*, s.status as seller_status, s.trial_order_max
        FROM seller_products sp
        JOIN sellers s ON sp.seller_id = s.id
        WHERE sp.id = ? AND sp.seller_id = ? AND sp.deleted_at IS NULL
        LIMIT 1
      `)
      .bind(productId, sellerId)
      .first<any>();

    if (!product) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sản phẩm không tồn tại hoặc bạn không có quyền chỉnh sửa.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    let newStatus = product.status;
    let newPrice = product.price_core;

    if (body.price_core !== undefined) {
      const parsedPrice = parseInt(body.price_core, 10);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Giá bán không hợp lệ.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      const marketplaceConfig = await getMarketplaceConfig(env.DB);
      const maxOrderPrice =
        product.trial_order_max !== null && product.trial_order_max !== undefined
          ? Number(product.trial_order_max)
          : marketplaceConfig.default_trial_order_max;

      if (product.seller_status === 'TRIAL' && parsedPrice > maxOrderPrice) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Gian hàng thử việc chỉ được đặt giá tối đa ${maxOrderPrice}.`,
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      newPrice = parsedPrice;
      if (product.seller_status === 'TRIAL' && newPrice !== product.price_core) {
        newStatus = 'PENDING_REVIEW';
      }
    }

    let nextImagesJson: string | null = product.images_json || null;
    let nextCoverUrl: string = product.cover_url;
    if (body.images !== undefined || body.images_json !== undefined || body.cover_url !== undefined) {
      const check = sanitizeProductImagesList(
        body.images !== undefined ? body.images : body.images_json,
        body.cover_url || product.cover_url
      );
      if (!check.ok) {
        return new Response(
          JSON.stringify({ success: false, error: check.error, code: check.code }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      if (check.images.length > 0) {
        nextImagesJson = JSON.stringify(check.images);
        nextCoverUrl = check.images[0];
      }
    }

    const nowIso = new Date().toISOString();
    const resolvedProductType = body.product_type
      ? String(body.product_type).toLowerCase() === 'physical'
        ? 'physical'
        : 'digital'
      : product.product_type || 'digital';
    const resolvedFulfillmentMode =
      resolvedProductType === 'physical'
        ? 'SHIPPING'
        : body.fulfillment_mode
          ? String(body.fulfillment_mode).toUpperCase()
          : product.fulfillment_mode || 'AUTO_VAULT';

    const parsedWeight = body.weight_grams !== undefined ? parseInt(body.weight_grams, 10) : undefined;
    const cleanWarehouse = body.warehouse_address !== undefined ? String(body.warehouse_address).trim() : undefined;

    let parsedStockQty: number | undefined = undefined;
    if (body.stock_quantity !== undefined && body.stock_quantity !== null && body.stock_quantity !== '') {
      const numStock = Number(body.stock_quantity);
      if (!Number.isFinite(numStock) || !Number.isInteger(numStock) || numStock < 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Số lượng tồn kho (stock_quantity) phải là số nguyên >= 0.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      parsedStockQty = numStock;
    }

    const nextIndustryId =
      body.industry_id !== undefined ? String(body.industry_id).trim().toLowerCase() : product.industry_id || 'other';
    const indOpt = getSellerIndustryById(nextIndustryId);
    const nextCategoryName =
      body.category_name !== undefined
        ? String(body.category_name).trim().slice(0, 80) || indOpt.labelVi
        : product.category_name || product.game_name || indOpt.labelVi;
    const nextShopCategory =
      body.shop_category !== undefined ? String(body.shop_category).trim().slice(0, 60) || null : product.shop_category;
    const nextSku = body.sku !== undefined ? String(body.sku).trim().slice(0, 50) || null : product.sku;
    const nextBuyerPrompt =
      body.buyer_note_prompt !== undefined
        ? String(body.buyer_note_prompt).trim().slice(0, 180) || null
        : product.buyer_note_prompt;
    const nextPaused = body.is_paused !== undefined ? (body.is_paused ? 1 : 0) : Number(product.is_paused || 0);
    const nextFeatured = body.is_featured !== undefined ? (body.is_featured ? 1 : 0) : Number(product.is_featured || 0);

    const nextSpecsJson =
      body.specs !== undefined || body.specs_json !== undefined
        ? (() => {
            const s = sanitizeProductSpecs(body.specs ?? body.specs_json);
            return s.length > 0 ? JSON.stringify(s) : null;
          })()
        : product.specs_json;

    const nextVariantsJson =
      body.variants !== undefined || body.variants_json !== undefined
        ? (() => {
            const v = sanitizeProductVariants(body.variants ?? body.variants_json, newPrice);
            return v.length > 0 ? JSON.stringify(v) : null;
          })()
        : product.variants_json;

    await env.DB
      .prepare(`
        UPDATE seller_products
        SET name = COALESCE(?, name),
            industry_id = ?,
            category_name = ?,
            game_name = ?,
            shop_category = ?,
            sku = ?,
            cover_url = ?,
            images_json = ?,
            specs_json = ?,
            variants_json = ?,
            fulfillment_mode = ?,
            buyer_note_prompt = ?,
            is_paused = ?,
            is_featured = ?,
            description = COALESCE(?, description),
            price_core = ?,
            original_price_core = ?,
            warranty_type = COALESCE(?, warranty_type),
            warranty_hours = COALESCE(?, warranty_hours),
            delivery_type = COALESCE(?, delivery_type),
            low_stock_threshold = COALESCE(?, low_stock_threshold),
            product_type = COALESCE(?, product_type),
            stock_quantity = COALESCE(?, stock_quantity),
            weight_grams = COALESCE(?, weight_grams),
            warehouse_address = COALESCE(?, warehouse_address),
            status = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        body.name?.trim() || null,
        nextIndustryId,
        nextCategoryName,
        nextCategoryName,
        nextShopCategory,
        nextSku,
        nextCoverUrl,
        nextImagesJson,
        nextSpecsJson,
        nextVariantsJson,
        resolvedFulfillmentMode,
        nextBuyerPrompt,
        nextPaused,
        nextFeatured,
        body.description !== undefined ? body.description?.trim() : null,
        newPrice,
        body.original_price_core !== undefined
          ? body.original_price_core
            ? parseInt(body.original_price_core, 10)
            : null
          : product.original_price_core,
        body.warranty_type || null,
        body.warranty_hours !== undefined ? parseInt(body.warranty_hours, 10) : null,
        resolvedFulfillmentMode === 'MANUAL_SERVICE' ? 'MANUAL' : body.delivery_type || null,
        body.low_stock_threshold !== undefined ? parseInt(body.low_stock_threshold, 10) : null,
        resolvedProductType,
        parsedStockQty !== undefined ? parsedStockQty : null,
        parsedWeight !== undefined ? parsedWeight : null,
        cleanWarehouse !== undefined ? cleanWarehouse : null,
        newStatus,
        nowIso,
        productId
      )
      .run();

    if (nextShopCategory) {
      const sRow = await env.DB
        .prepare('SELECT shop_categories_json FROM sellers WHERE id = ? LIMIT 1')
        .bind(sellerId)
        .first<any>()
        .catch(() => null);
      const curList = parseSafeJsonArray<string>(sRow?.shop_categories_json).filter(
        (c) => typeof c === 'string' && c.trim()
      );
      if (!curList.includes(nextShopCategory) && curList.length < 15) {
        curList.push(nextShopCategory);
        await env.DB
          .prepare('UPDATE sellers SET shop_categories_json = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(curList), nowIso, sellerId)
          .run()
          .catch(() => {});
      }
    }

    if (resolvedProductType === 'digital') {
      const delMode =
        resolvedFulfillmentMode === 'WEBHOOK'
          ? 'WEBHOOK'
          : resolvedFulfillmentMode === 'MANUAL_SERVICE'
            ? 'MANUAL'
            : body.delivery_mode
              ? String(body.delivery_mode).toUpperCase()
              : 'INVENTORY';
      const webUrl = body.webhook_url !== undefined ? String(body.webhook_url).trim() : null;
      const wHours = body.warranty_hours !== undefined ? parseInt(body.warranty_hours, 10) : 24;
      await env.DB
        .prepare(`
          INSERT INTO seller_product_digital_configs (
            product_id, seller_id, delivery_mode, webhook_url, warranty_hours, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(product_id) DO UPDATE SET
            delivery_mode = COALESCE(excluded.delivery_mode, delivery_mode),
            webhook_url = COALESCE(excluded.webhook_url, webhook_url),
            warranty_hours = COALESCE(excluded.warranty_hours, warranty_hours),
            updated_at = excluded.updated_at
        `)
        .bind(productId, sellerId, delMode, webUrl, wHours, nowIso, nowIso)
        .run()
        .catch(() => {});
    } else {
      const lenCm = body.length_cm !== undefined ? parseInt(body.length_cm, 10) : 10;
      const wWidthCm = body.width_cm !== undefined ? parseInt(body.width_cm, 10) : 10;
      const hHeightCm = body.height_cm !== undefined ? parseInt(body.height_cm, 10) : 10;
      const codVal = body.cod_allowed !== undefined ? (body.cod_allowed ? 1 : 0) : 0;
      const wGrams = parsedWeight || product.weight_grams || 500;
      const wAddr = cleanWarehouse || product.warehouse_address || 'Kho Tổng Universal Mall';

      await env.DB
        .prepare(`
          INSERT INTO seller_product_physical_configs (
            product_id, seller_id, weight_grams, length_cm, width_cm, height_cm, warehouse_address, variants_json, cod_allowed, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(product_id) DO UPDATE SET
            weight_grams = COALESCE(excluded.weight_grams, weight_grams),
            length_cm = COALESCE(excluded.length_cm, length_cm),
            width_cm = COALESCE(excluded.width_cm, width_cm),
            height_cm = COALESCE(excluded.height_cm, height_cm),
            warehouse_address = COALESCE(excluded.warehouse_address, warehouse_address),
            variants_json = COALESCE(excluded.variants_json, variants_json),
            cod_allowed = COALESCE(excluded.cod_allowed, cod_allowed),
            updated_at = excluded.updated_at
        `)
        .bind(productId, sellerId, wGrams, lenCm, wWidthCm, hHeightCm, wAddr, nextVariantsJson, codVal, nowIso, nowIso)
        .run()
        .catch(() => {});
    }

    if (newPrice !== product.price_core) {
      await syncAffiliatePriceAndStock(env.DB, productId, 'PRICE_CHANGE', { newBasePrice: newPrice });
    }
    if (
      resolvedProductType === 'physical' &&
      parsedStockQty !== undefined &&
      parsedStockQty !== Number(product.stock_quantity || 0)
    ) {
      await syncAffiliatePriceAndStock(env.DB, productId, 'STOCK_CHANGE', { newStock: parsedStockQty });
    }
    if (nextPaused !== Number(product.is_paused || 0)) {
      await syncAffiliatePriceAndStock(env.DB, productId, 'STATUS_CHANGE', { isDisabled: nextPaused === 1 });
    }

    await bumpCatalogEpoch(env.DB).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đã lưu cập nhật sản phẩm thành công!',
        status: newStatus,
        ...(parsedStockQty !== undefined ? { stock_quantity: parsedStockQty } : {}),
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

// PATCH: Bật/tắt tạm ẩn (is_paused), ghim nổi bật (is_featured), hoặc sửa nhanh Giá/Tồn kho
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const productId = params.id as string;
    const sellerId = storeAuth.seller.id;
    const body = (await request.json().catch(() => ({}))) as any;

    const product = await env.DB
      .prepare('SELECT * FROM seller_products WHERE id = ? AND seller_id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(productId, sellerId)
      .first<any>();

    if (!product) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sản phẩm không tồn tại hoặc bạn không có quyền cập nhật.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    let targetStatus = product.status;
    let nextPaused = Number(product.is_paused || 0);
    let nextFeatured = Number(product.is_featured || 0);
    let nextPrice = Number(product.price_core);
    let nextStock = Number(product.stock_quantity || 0);

    if (body.is_paused !== undefined) {
      nextPaused = body.is_paused ? 1 : 0;
    } else if (body.is_featured !== undefined) {
      nextFeatured = body.is_featured ? 1 : 0;
    } else if (body.status !== undefined) {
      const s = String(body.status).toUpperCase().trim();
      if (['DRAFT', 'APPROVED', 'PENDING_REVIEW'].includes(s)) {
        targetStatus = s;
      }
    } else if (body.is_active !== undefined) {
      targetStatus = body.is_active ? 'APPROVED' : 'DRAFT';
    } else if (body.price_core === undefined && body.stock_quantity === undefined) {
      nextPaused = nextPaused === 1 ? 0 : 1;
    }

    if (body.is_featured !== undefined) {
      nextFeatured = body.is_featured ? 1 : 0;
    }
    if (body.price_core !== undefined) {
      const pVal = parseInt(body.price_core, 10);
      if (!isNaN(pVal) && pVal > 0) nextPrice = pVal;
    }
    if (body.stock_quantity !== undefined) {
      const sVal = parseInt(body.stock_quantity, 10);
      if (!isNaN(sVal) && sVal >= 0) nextStock = sVal;
    }

    const nowIso = new Date().toISOString();
    await env.DB
      .prepare(`
        UPDATE seller_products
        SET status = ?, is_paused = ?, is_featured = ?, price_core = ?, stock_quantity = ?, updated_at = ?
        WHERE id = ?
      `)
      .bind(targetStatus, nextPaused, nextFeatured, nextPrice, nextStock, nowIso, productId)
      .run();

    if (targetStatus !== 'APPROVED' || nextPaused === 1) {
      await syncAffiliatePriceAndStock(env.DB, productId, 'STATUS_CHANGE', { isDisabled: true });
    } else if (nextPaused === 0 && Number(product.is_paused || 0) === 1) {
      await syncAffiliatePriceAndStock(env.DB, productId, 'STATUS_CHANGE', { isDisabled: false });
    }
    if (nextPrice !== Number(product.price_core)) {
      await syncAffiliatePriceAndStock(env.DB, productId, 'PRICE_CHANGE', { newBasePrice: nextPrice });
    }
    if (nextStock !== Number(product.stock_quantity || 0)) {
      await syncAffiliatePriceAndStock(env.DB, productId, 'STOCK_CHANGE', { newStock: nextStock });
    }

    await bumpCatalogEpoch(env.DB).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        status: targetStatus,
        is_paused: nextPaused,
        is_featured: nextFeatured,
        price_core: nextPrice,
        stock_quantity: nextStock,
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

// DELETE: Xóa mềm sản phẩm (§0: cấm hard delete)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const productId = params.id as string;
    const sellerId = storeAuth.seller.id;

    const product = await env.DB
      .prepare(
        'SELECT sp.id, sp.seller_id FROM seller_products sp WHERE sp.id = ? AND sp.seller_id = ? AND deleted_at IS NULL LIMIT 1'
      )
      .bind(productId, sellerId)
      .first<any>();

    if (!product) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sản phẩm không tồn tại hoặc bạn không có quyền xóa.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const pendingDispute = await env.DB
      .prepare("SELECT COUNT(*) as count FROM seller_orders WHERE product_id = ? AND status = 'REPORTED'")
      .bind(productId)
      .first<{ count: number }>();

    if (pendingDispute && pendingDispute.count > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Không thể xóa sản phẩm khi đang có đơn hàng khiếu nại báo lỗi chưa giải quyết.',
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const nowIso = new Date().toISOString();
    await env.DB
      .prepare('UPDATE seller_products SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .bind(nowIso, nowIso, productId)
      .run();

    await syncAffiliatePriceAndStock(env.DB, productId, 'STATUS_CHANGE', { isDeleted: true });
    await bumpCatalogEpoch(env.DB).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, message: 'Đã xóa sản phẩm thành công.' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
