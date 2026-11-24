import { authenticateCaller } from '../../../../services/auth_service';
import { ensureSchemaUpgrades } from '../../../../services/d1_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * PUT /api/seller/products/:id/resell
 * NCC bật/tắt bán lại, thiết lập chiết khấu %, hoa hồng %, giá sàn MAP (Nhóm 1)
 * Chặn tuyệt đối gán lại tầng 2 (Single-tier guard)
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

    const seller = await env.DB
      .prepare('SELECT id FROM sellers WHERE owner_member_id = ? AND status = "ACTIVE" LIMIT 1')
      .bind(auth.member.id)
      .first<any>();

    if (!seller) {
      return new Response(JSON.stringify({ success: false, error: 'Gian hàng không tồn tại hoặc chưa kích hoạt.' }), { status: 403, headers: CORS_HEADERS });
    }

    const productId = params.id;
    const existing = await env.DB
      .prepare('SELECT id, seller_id, is_affiliate, origin_product_id FROM seller_products WHERE id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(productId)
      .first<any>();

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy sản phẩm.' }), { status: 404, headers: CORS_HEADERS });
    }

    if (existing.seller_id !== seller.id) {
      return new Response(JSON.stringify({ success: false, error: 'Bạn không có quyền chỉnh sửa sản phẩm này.' }), { status: 403, headers: CORS_HEADERS });
    }

    // CHẶN GÁN LẠI TẦNG 2 (Single-tier guard):
    // Sản phẩm đã là listing gán từ shop khác thì tuyệt đối không được phép mở bán lại
    if (existing.is_affiliate === 1 || existing.origin_product_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Sản phẩm được gán lại từ shop khác không được phép mở bán lại (chỉ hỗ trợ mô hình 1 tầng).',
        code: 'MULTI_TIER_RESELL_FORBIDDEN'
      }), { status: 400, headers: CORS_HEADERS });
    }

    const body: any = await request.json().catch(() => ({}));
    const resellEnabled = body.resell_enabled ? 1 : 0;
    const discountPct = Math.max(0, Math.min(100, Number(body.resell_discount_pct) || 0));
    const commissionPct = Math.max(0, Math.min(100, Number(body.resell_commission_pct) || 0));
    const mapPrice = Math.max(0, Math.round(Number(body.resell_map_price) || 0));

    await env.DB
      .prepare(`
        UPDATE seller_products
        SET resell_enabled = ?,
            resell_discount_pct = ?,
            resell_commission_pct = ?,
            resell_map_price = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(resellEnabled, discountPct, commissionPct, mapPrice, productId)
      .run();

    return new Response(JSON.stringify({
      success: true,
      message: resellEnabled ? 'Đã kích hoạt chế độ cho phép bán lại cho sản phẩm này.' : 'Đã tắt chế độ bán lại cho sản phẩm.',
      product: {
        id: productId,
        resell_enabled: resellEnabled,
        resell_discount_pct: discountPct,
        resell_commission_pct: commissionPct,
        resell_map_price: mapPrice,
      }
    }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi xử lý yêu cầu.' }), { status: 500, headers: CORS_HEADERS });
  }
}
