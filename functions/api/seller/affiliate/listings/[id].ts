import { authenticateCaller } from '../../../../services/auth_service';
import { ensureSchemaUpgrades } from '../../../../services/d1_service';
import { calculate3WaySplit } from '../../../../services/seller_affiliate_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * PUT /api/seller/affiliate/listings/:id
 * Shop Gán điều chỉnh mức tăng giá, chế độ giá (FORMULA/LOCKED), hiển thị NCC (Nhóm 2)
 */
export async function onRequestPut(context: { request: Request; params: any; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, params, env } = context;
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

    const listingId = params.id;
    const listing = await env.DB
      .prepare(`
        SELECT sal.*, 
               sp_orig.price_core as origin_price,
               sp_orig.resell_discount_pct,
               sp_orig.resell_commission_pct,
               sp_orig.resell_map_price,
               sp_orig.product_type
        FROM seller_affiliate_listings sal
        JOIN seller_products sp_orig ON sal.supplier_product_id = sp_orig.id
        WHERE sal.id = ? LIMIT 1
      `)
      .bind(listingId)
      .first<any>();

    if (!listing) {
      return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy listing này.' }), { status: 404, headers: CORS_HEADERS });
    }

    if (listing.reseller_seller_id !== reseller.id) {
      return new Response(JSON.stringify({ success: false, error: 'Bạn không có quyền chỉnh sửa listing này.' }), { status: 403, headers: CORS_HEADERS });
    }

    const body: any = await request.json().catch(() => ({}));
    const markupType = body.markup_type === 'FIXED' ? 'FIXED' : 'PERCENT';
    const markupValue = Math.max(0, Number(body.markup_value) || 0);
    const priceMode = body.price_mode === 'LOCKED' ? 'LOCKED' : 'FORMULA';
    const showSupplier = body.show_supplier === 0 ? 0 : 1;

    // Tính lại giá bán
    const basePrice = Number(listing.origin_price) || 0;
    const mapPrice = Number(listing.resell_map_price) || 0;
    const isPhysical = listing.product_type === 'physical';

    const split = calculate3WaySplit({
      basePrice,
      markupType,
      markupValue,
      discountPct: Number(listing.resell_discount_pct) || 0,
      commissionPct: Number(listing.resell_commission_pct) || 0,
      isPhysical,
      mapPrice,
      priceMode,
      lockedPrice: priceMode === 'LOCKED' ? basePrice + Math.round(markupType === 'PERCENT' ? basePrice * (markupValue / 100) : markupValue) : null,
    });

    const newSellingPrice = split.sellingPrice;
    const lockedPrice = priceMode === 'LOCKED' ? newSellingPrice : null;
    const nowIso = new Date().toISOString();

    // 1. Cập nhật listing
    await env.DB
      .prepare(`
        UPDATE seller_affiliate_listings
        SET markup_type = ?,
            markup_value = ?,
            price_mode = ?,
            locked_price = ?,
            show_supplier = ?,
            price_warning = NULL,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(markupType, markupValue, priceMode, lockedPrice, showSupplier, nowIso, listingId)
      .run();

    // 2. Cập nhật giá bán trên seller_products của Shop B
    await env.DB
      .prepare(`
        UPDATE seller_products
        SET price_core = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(newSellingPrice, nowIso, listing.reseller_product_id)
      .run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Đã cập nhật cấu hình bán lại thành công.',
      new_selling_price: newSellingPrice,
      is_map_enforced: split.isMapEnforced,
    }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi cập nhật listing.' }), { status: 500, headers: CORS_HEADERS });
  }
}

/**
 * DELETE /api/seller/affiliate/listings/:id
 * Shop Gán hủy gán listing bất cứ lúc nào (Nhóm 2)
 * Listing ẩn ngay trên shop mình, đơn hàng đang chạy vẫn tiếp tục xử lý
 */
export async function onRequestDelete(context: { request: Request; params: any; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, params, env } = context;
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

    const listingId = params.id;
    const listing = await env.DB
      .prepare('SELECT id, reseller_seller_id, reseller_product_id FROM seller_affiliate_listings WHERE id = ? LIMIT 1')
      .bind(listingId)
      .first<any>();

    if (!listing) {
      return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy listing này.' }), { status: 404, headers: CORS_HEADERS });
    }

    if (listing.reseller_seller_id !== reseller.id) {
      return new Response(JSON.stringify({ success: false, error: 'Bạn không có quyền xóa listing này.' }), { status: 403, headers: CORS_HEADERS });
    }

    const nowIso = new Date().toISOString();

    // 1. Chuyển trạng thái listing sang HIDDEN
    await env.DB
      .prepare('UPDATE seller_affiliate_listings SET status = "HIDDEN", updated_at = ? WHERE id = ?')
      .bind(nowIso, listingId)
      .run();

    // 2. Xóa mềm sản phẩm khỏi gian hàng của Shop B
    await env.DB
      .prepare('UPDATE seller_products SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .bind(nowIso, nowIso, listing.reseller_product_id)
      .run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Đã hủy gán sản phẩm. Listing đã được gỡ khỏi gian hàng của bạn.'
    }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi hủy listing.' }), { status: 500, headers: CORS_HEADERS });
  }
}
