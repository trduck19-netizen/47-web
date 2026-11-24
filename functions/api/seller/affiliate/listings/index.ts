import { authenticateCaller } from '../../../../services/auth_service';
import { ensureSchemaUpgrades } from '../../../../services/d1_service';
import { calculate3WaySplit } from '../../../../services/seller_affiliate_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/seller/affiliate/listings
 * Shop Gán xem danh sách các sản phẩm mình đã gán bán lại (Nhóm 2)
 */
export async function onRequestGet(context: { request: Request; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    const auth = await authenticateCaller(request, env.DB, env.JWT_SECRET);
    if (!auth || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập.' }), { status: 401, headers: CORS_HEADERS });
    }

    await ensureSchemaUpgrades(env.DB);

    const reseller = await env.DB
      .prepare('SELECT id FROM sellers WHERE owner_member_id = ? AND status = "ACTIVE" LIMIT 1')
      .bind(auth.member.id)
      .first<any>();

    if (!reseller) {
      return new Response(JSON.stringify({ success: false, error: 'Gian hàng không tồn tại hoặc chưa kích hoạt.' }), { status: 403, headers: CORS_HEADERS });
    }

    const query = `
      SELECT sal.*,
             sp_orig.name as product_name,
             sp_orig.cover_url,
             sp_orig.price_core as origin_price,
             sp_orig.resell_map_price as origin_map_price,
             sp_orig.resell_discount_pct,
             sp_orig.resell_commission_pct,
             sp_res.price_core as my_selling_price,
             sp_res.status as product_status,
             s_sup.name as supplier_name,
             s_sup.slug as supplier_slug
      FROM seller_affiliate_listings sal
      JOIN seller_products sp_orig ON sal.supplier_product_id = sp_orig.id
      JOIN seller_products sp_res ON sal.reseller_product_id = sp_res.id
      JOIN sellers s_sup ON sal.supplier_seller_id = s_sup.id
      WHERE sal.reseller_seller_id = ?
        AND sp_res.deleted_at IS NULL
      ORDER BY sal.created_at DESC
    `;

    const result = await env.DB.prepare(query).bind(reseller.id).all();
    return new Response(JSON.stringify({
      success: true,
      listings: result.results || []
    }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi lấy danh sách listing.' }), { status: 500, headers: CORS_HEADERS });
  }
}

/**
 * POST /api/seller/affiliate/listings
 * Shop Gán gán sản phẩm của NCC sang gian hàng mình (Nhóm 2)
 * Thiết lập mức tăng, chế độ giá (FORMULA/LOCKED), hiển thị NCC, kiểm tra MAP và chặn tầng 2
 */
export async function onRequestPost(context: { request: Request; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    const auth = await authenticateCaller(request, env.DB, env.JWT_SECRET);
    if (!auth || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập.' }), { status: 401, headers: CORS_HEADERS });
    }

    await ensureSchemaUpgrades(env.DB);

    const reseller = await env.DB
      .prepare('SELECT id, name FROM sellers WHERE owner_member_id = ? AND status = "ACTIVE" LIMIT 1')
      .bind(auth.member.id)
      .first<any>();

    if (!reseller) {
      return new Response(JSON.stringify({ success: false, error: 'Gian hàng không tồn tại hoặc chưa kích hoạt.' }), { status: 403, headers: CORS_HEADERS });
    }

    const body: any = await request.json().catch(() => ({}));
    const partnershipId = (body.partnership_id || '').trim();
    const supplierProductId = (body.supplier_product_id || '').trim();
    const markupType = body.markup_type === 'FIXED' ? 'FIXED' : 'PERCENT';
    const markupValue = Math.max(0, Number(body.markup_value) || 0);
    const priceMode = body.price_mode === 'LOCKED' ? 'LOCKED' : 'FORMULA';
    const showSupplier = body.show_supplier === 0 ? 0 : 1; // Mặc định 1 (BẬT)

    if (!partnershipId || !supplierProductId) {
      return new Response(JSON.stringify({ success: false, error: 'Thiếu partnership_id hoặc supplier_product_id.' }), { status: 400, headers: CORS_HEADERS });
    }

    // 1. Kiểm tra quan hệ đối tác đã APPROVED
    const partnership = await env.DB
      .prepare('SELECT id, supplier_seller_id, reseller_seller_id, status FROM seller_affiliate_partnerships WHERE id = ? AND reseller_seller_id = ? LIMIT 1')
      .bind(partnershipId, reseller.id)
      .first<any>();

    if (!partnership || partnership.status !== 'APPROVED') {
      return new Response(JSON.stringify({ success: false, error: 'Liên kết đối tác không hợp lệ hoặc chưa được duyệt.' }), { status: 403, headers: CORS_HEADERS });
    }

    // 2. Kiểm tra sản phẩm NCC:
    // CHẶN GÁN TẦNG 2 TUYỆT ĐỐI (Single-tier guard): Sản phẩm phải là gốc (origin_product_id IS NULL)
    const origProduct = await env.DB
      .prepare(`
        SELECT * FROM seller_products 
        WHERE id = ? 
          AND seller_id = ? 
          AND resell_enabled = 1 
          AND deleted_at IS NULL 
        LIMIT 1
      `)
      .bind(supplierProductId, partnership.supplier_seller_id)
      .first<any>();

    if (!origProduct) {
      return new Response(JSON.stringify({ success: false, error: 'Sản phẩm này không tồn tại hoặc Nhà Cung Cấp chưa mở bán lại.' }), { status: 404, headers: CORS_HEADERS });
    }

    if (origProduct.is_affiliate === 1 || origProduct.origin_product_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Sản phẩm này đã là listing gán từ shop khác. Sàn chỉ cho phép gán bán lại tối đa 1 tầng.',
        code: 'MULTI_TIER_RESELL_FORBIDDEN'
      }), { status: 400, headers: CORS_HEADERS });
    }

    // Chặn vòng lặp A -> B -> A
    if (origProduct.seller_id === reseller.id) {
      return new Response(JSON.stringify({ success: false, error: 'Không thể gán sản phẩm của chính mình.' }), { status: 400, headers: CORS_HEADERS });
    }

    // Kiểm tra xem đã gán sản phẩm này trước đó chưa
    const existingListing = await env.DB
      .prepare('SELECT id FROM seller_affiliate_listings WHERE partnership_id = ? AND supplier_product_id = ? AND reseller_seller_id = ? AND status != "HIDDEN" LIMIT 1')
      .bind(partnershipId, supplierProductId, reseller.id)
      .first<any>();

    if (existingListing) {
      return new Response(JSON.stringify({ success: false, error: 'Sản phẩm này đã được gán vào gian hàng của bạn.' }), { status: 400, headers: CORS_HEADERS });
    }

    // 3. Tính toán giá bán & áp dụng MAP
    const basePrice = Number(origProduct.price_core) || 0;
    const mapPrice = Number(origProduct.resell_map_price) || 0;
    const isPhysical = origProduct.product_type === 'physical';

    const split = calculate3WaySplit({
      basePrice,
      markupType,
      markupValue,
      discountPct: Number(origProduct.resell_discount_pct) || 0,
      commissionPct: Number(origProduct.resell_commission_pct) || 0,
      isPhysical,
      mapPrice,
      priceMode,
      lockedPrice: priceMode === 'LOCKED' ? basePrice + Math.round(markupType === 'PERCENT' ? basePrice * (markupValue / 100) : markupValue) : null,
    });

    const finalSellingPrice = split.sellingPrice;
    const lockedPrice = priceMode === 'LOCKED' ? finalSellingPrice : null;

    // 4. Tạo bản ghi sản phẩm hiển thị trên gian hàng của Shop B (seller_products)
    // KẾ THỪA 100% METADATA GỐC TỪ NCC (Không cho Shop B tự ý sửa)
    const resellerProductId = `prd_aff_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    await env.DB
      .prepare(`
        INSERT INTO seller_products (
          id, seller_id, game_slug, game_name, name, cover_url, description,
          price_core, original_price_core, ceiling_price_core, warranty_type, warranty_hours,
          delivery_type, low_stock_threshold, product_type, weight_grams, warehouse_address,
          status, is_affiliate, origin_seller_id, origin_product_id, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          'APPROVED', 1, ?, ?, ?, ?
        )
      `)
      .bind(
        resellerProductId,
        reseller.id,
        origProduct.game_slug,
        origProduct.game_name,
        origProduct.name,
        origProduct.cover_url,
        origProduct.description,
        finalSellingPrice,
        origProduct.original_price_core,
        origProduct.ceiling_price_core,
        origProduct.warranty_type,
        origProduct.warranty_hours,
        origProduct.delivery_type,
        origProduct.low_stock_threshold,
        origProduct.product_type || 'digital',
        origProduct.weight_grams,
        origProduct.warehouse_address,
        partnership.supplier_seller_id,
        origProduct.id,
        nowIso,
        nowIso
      )
      .run();

    // 5. Tạo bản ghi liên kết listing (seller_affiliate_listings)
    const listingId = `sal_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    await env.DB
      .prepare(`
        INSERT INTO seller_affiliate_listings (
          id, partnership_id, supplier_seller_id, reseller_seller_id, supplier_product_id,
          reseller_product_id, markup_type, markup_value, price_mode, locked_price,
          show_supplier, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `)
      .bind(
        listingId,
        partnershipId,
        partnership.supplier_seller_id,
        reseller.id,
        origProduct.id,
        resellerProductId,
        markupType,
        markupValue,
        priceMode,
        lockedPrice,
        showSupplier,
        nowIso,
        nowIso
      )
      .run();

    return new Response(JSON.stringify({
      success: true,
      message: `Đã gán thành công sản phẩm "${origProduct.name}" vào gian hàng của bạn.`,
      listing_id: listingId,
      reseller_product_id: resellerProductId,
      selling_price: finalSellingPrice,
      is_map_enforced: split.isMapEnforced,
      warning: split.isMapEnforced ? `Giá bán được tự động điều chỉnh về mức giá sàn MAP (${mapPrice.toLocaleString('vi-VN')} đ) do Nhà Cung Cấp yêu cầu.` : null,
    }), { status: 201, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi gán sản phẩm.' }), { status: 500, headers: CORS_HEADERS });
  }
}
