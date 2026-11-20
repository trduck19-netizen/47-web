import { verifyMemberAuth } from '../../../services/mission_service';
import { ensureMarketplaceSchema, logAdminAudit } from '../../../services/d1_service';
import { verifySellerAccess, getMarketplaceConfig } from '../../../services/marketplace_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';
import fallbackGamesData from '../../../../src/data/games188.json';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Danh sách sản phẩm của gian hàng
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'ANY' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API gian hàng hợp lệ.' }),
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
          pc.weight_grams,
          pc.length_cm,
          pc.width_cm,
          pc.height_cm,
          pc.warehouse_address,
          pc.variants_json,
          pc.cod_allowed,
          (SELECT COUNT(*) FROM seller_codes sc WHERE sc.product_id = sp.id AND sc.status = 'IN_STOCK' AND sc.deleted_at IS NULL) as in_stock_count,
          (SELECT COUNT(*) FROM seller_codes sc WHERE sc.product_id = sp.id AND sc.status = 'SOLD' AND sc.deleted_at IS NULL) as sold_count,
          (SELECT COUNT(*) FROM seller_codes sc WHERE sc.product_id = sp.id AND sc.status = 'REPORTED' AND sc.deleted_at IS NULL) as reported_count
        FROM seller_products sp
        LEFT JOIN seller_product_digital_configs dc ON sp.id = dc.product_id
        LEFT JOIN seller_product_physical_configs pc ON sp.id = pc.product_id
        WHERE sp.seller_id = ? AND sp.deleted_at IS NULL
        ORDER BY sp.created_at DESC
      `)
      .bind(seller.id)
      .all<any>();

    return new Response(
      JSON.stringify({ success: true, products: products.results || [] }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

// POST: Tạo sản phẩm mới (§5.1, §5.3)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API gian hàng hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const sellerRow = storeAuth.seller;
    const memberId = storeAuth.memberId || sellerRow.owner_member_id;
    const body = (await request.json().catch(() => ({}))) as any;
    const productType = String(body.product_type || 'digital').toLowerCase() === 'physical' ? 'physical' : 'digital';
    const {
      game_slug,
      name,
      description,
      price_core,
      original_price_core,
      warranty_type,
      warranty_hours,
      delivery_type,
      low_stock_threshold,
      delivery_mode,
      webhook_url,
      weight_grams,
      length_cm,
      width_cm,
      height_cm,
      warehouse_address,
      variants_json,
      cod_allowed,
    } = body;

    // 2. Kiểm tra trạng thái gian hàng
    if (sellerRow.status === 'SUSPENDED' || sellerRow.status === 'REJECTED') {
      return new Response(
        JSON.stringify({ success: false, error: 'Gian hàng đang bị khóa hoặc bị từ chối, không thể tạo sản phẩm.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // 3. Kiểm tra giới hạn sản phẩm khi ở TRIAL (§3.2, §5.1, §1.3)
    const marketplaceConfig = await getMarketplaceConfig(env.DB);

    if (sellerRow.status === 'TRIAL') {
      const activeProdCount = await env.DB
        .prepare("SELECT COUNT(*) as count FROM seller_products WHERE seller_id = ? AND deleted_at IS NULL")
        .bind(sellerRow.id)
        .first<{ count: number }>();

      const limit = (sellerRow.trial_product_limit !== null && sellerRow.trial_product_limit !== undefined)
        ? Number(sellerRow.trial_product_limit)
        : marketplaceConfig.default_trial_product_limit;

      if ((activeProdCount?.count || 0) >= limit) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Gian hàng đang trong giai đoạn thử việc (TRIAL) chỉ được đăng tối đa ${limit} sản phẩm. Vui lòng chờ nâng cấp gian hàng.`,
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
    }

    const prodName = String(body.name || body.title || '').trim();
    if (!prodName || prodName.length < 3) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tên sản phẩm phải từ 3 ký tự trở lên.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Xác thực chi tiết theo loại sản phẩm: Số vs Vật lý
    let weightGramsParsed: number | null = null;
    let warehouseAddressClean: string | null = null;
    let deliveryModeClean = 'INVENTORY';
    let webhookUrlClean: string | null = null;
    let warrantyHoursParsed = warranty_hours ? parseInt(warranty_hours, 10) : 24;

    if (productType === 'physical') {
      weightGramsParsed = parseInt(weight_grams, 10);
      if (isNaN(weightGramsParsed) || weightGramsParsed <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Sản phẩm vật lý bắt buộc phải nhập cân nặng (gram) lớn hơn 0.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      warehouseAddressClean = String(warehouse_address || '').trim();
      if (!warehouseAddressClean) {
        return new Response(
          JSON.stringify({ success: false, error: 'Sản phẩm vật lý bắt buộc phải có địa chỉ kho lấy hàng.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
    } else {
      deliveryModeClean = String(delivery_mode || 'INVENTORY').toUpperCase();
      if (deliveryModeClean === 'WEBHOOK') {
        webhookUrlClean = String(webhook_url || '').trim();
        if (!webhookUrlClean) {
          return new Response(
            JSON.stringify({ success: false, error: 'Hình thức giao hàng qua Webhook API yêu cầu nhập webhook_url.' }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
      }
    }

    let game: any = null;
    if (game_slug) {
      game = await env.DB
        .prepare("SELECT slug, name, icon_url FROM games WHERE slug = ? LIMIT 1")
        .bind(game_slug)
        .first<any>();

      if (!game && Array.isArray(fallbackGamesData)) {
        const found = (fallbackGamesData as any[]).find(
          (g) => (g.slug || g.id) === game_slug || (g.slug || g.id) === game_slug.toLowerCase()
        );
        if (found) {
          const gameSlugClean = found.slug || found.id;
          const iconClean = found.icon_url || found.iconUrl || `/game_icons/${gameSlugClean}.webp`;
          game = {
            slug: gameSlugClean,
            name: found.name,
            icon_url: iconClean,
          };
          await env.DB
            .prepare(`
              INSERT INTO games (id, slug, name, icon_url, category, publisher, is_active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
              ON CONFLICT(slug) DO UPDATE SET name = excluded.name, icon_url = excluded.icon_url
            `)
            .bind(
              `gm_${gameSlugClean}`,
              gameSlugClean,
              found.name,
              iconClean,
              found.category || 'Game Hot',
              found.publisher || 'Nhà phát hành'
            )
            .run()
            .catch(() => {});
        }
      }
    }

    if (!game && productType === 'digital') {
      return new Response(
        JSON.stringify({ success: false, error: 'Sản phẩm số yêu cầu chọn tựa game hợp lệ từ danh mục.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const officialGameSlug = game ? game.slug : 'physical_goods';
    const officialGameName = game ? game.name : 'Hàng Vật Lý & Phụ Kiện';
    const officialCoverUrl = game?.icon_url || body.cover_url || `/game_icons/physical-default.webp`;

    // 5. Kiểm tra giá Core
    const priceCore = parseInt(price_core, 10);
    if (isNaN(priceCore) || priceCore <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Giá Core bán ra phải lớn hơn 0.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Nếu ở TRIAL, kiểm tra giới hạn giá tối đa 1 đơn (§3.2, §1.3)
    const maxOrderPrice = (sellerRow.trial_order_max !== null && sellerRow.trial_order_max !== undefined)
      ? Number(sellerRow.trial_order_max)
      : marketplaceConfig.default_trial_order_max;

    if (sellerRow.status === 'TRIAL' && priceCore > maxOrderPrice) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Gian hàng thử việc chỉ được đặt giá tối đa ${maxOrderPrice} Core cho mỗi sản phẩm.`,
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 6. Xác định trạng thái duyệt sản phẩm (§5.3):
    const initialStatus = sellerRow.status === 'ACTIVE' ? 'APPROVED' : 'PENDING_REVIEW';
    const prodId = `sprod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    await env.DB
      .prepare(`
        INSERT INTO seller_products (
          id, seller_id, game_slug, game_name, name, cover_url, description,
          price_core, original_price_core, warranty_type, warranty_hours,
          delivery_type, low_stock_threshold, product_type, weight_grams, warehouse_address, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        prodId,
        sellerRow.id,
        officialGameSlug,
        officialGameName,
        prodName,
        officialCoverUrl,
        description?.trim() || null,
        priceCore,
        original_price_core ? parseInt(original_price_core, 10) : null,
        warranty_type || '24H',
        warrantyHoursParsed,
        delivery_type === 'MANUAL' ? 'MANUAL' : 'AUTO',
        low_stock_threshold ? parseInt(low_stock_threshold, 10) : 2,
        productType,
        weightGramsParsed,
        warehouseAddressClean,
        initialStatus,
        nowIso,
        nowIso
      )
      .run();

    // Lưu vào bảng vệ tinh tương ứng
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
      const lengthCm = parseInt(length_cm, 10) || 10;
      const widthCm = parseInt(width_cm, 10) || 10;
      const heightCm = parseInt(height_cm, 10) || 10;
      const codAllowedVal = cod_allowed ? 1 : 0;
      const variantsJsonStr = variants_json ? (typeof variants_json === 'string' ? variants_json : JSON.stringify(variants_json)) : null;

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

    return new Response(
      JSON.stringify({
        success: true,
        message: initialStatus === 'APPROVED' ? 'Đã tạo sản phẩm thành công.' : 'Sản phẩm đã tạo và đang chờ Quản trị viên duyệt trước khi công khai.',
        product_id: prodId,
        product: {
          id: prodId,
          seller_id: sellerRow.id,
          name: prodName,
          product_type: productType,
          price_core: priceCore,
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
