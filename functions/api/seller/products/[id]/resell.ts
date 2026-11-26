import { verifyStoreApiAccess } from '../../../../services/store_api_service';
import { ensureSchemaUpgrades } from '../../../../services/d1_service';
import { getMarketplaceConfig } from '../../../../services/marketplace_service';
import { syncAffiliatePriceAndStock } from '../../../../services/seller_affiliate_service';

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

    await ensureSchemaUpgrades(env.DB);

    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!auth.authorized || !auth.seller) {
      return new Response(JSON.stringify({ success: false, error: auth.error || 'Yêu cầu đăng nhập hoặc quyền gian hàng không hợp lệ.' }), { status: auth.status || 401, headers: CORS_HEADERS });
    }

    const seller = auth.seller;

    const productId = params.id;
    const existing = await env.DB
      .prepare('SELECT id, seller_id, is_affiliate, origin_product_id, price_core, product_type FROM seller_products WHERE id = ? AND deleted_at IS NULL LIMIT 1')
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

    const mConfig = await getMarketplaceConfig(env.DB);
    if (resellEnabled && !mConfig.affiliate_enabled) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Tính năng bán lại liên gian hàng hiện đang tạm tắt bởi Quản trị viên.',
        code: 'AFFILIATE_DISABLED'
      }), { status: 403, headers: CORS_HEADERS });
    }

    // Ràng buộc kiểm tra tổng tỷ lệ chiết khấu + hoa hồng + phí sàn động <= 100% (Nhóm 5)
    const isPhysical = String(existing.product_type || '').toLowerCase() === 'physical';
    const feeRatePct = isPhysical ? mConfig.affiliate_physical_fee_pct : mConfig.affiliate_digital_fee_pct;
    if (resellEnabled && (discountPct + commissionPct + feeRatePct > 100)) {
      return new Response(JSON.stringify({
        success: false,
        error: `Tổng chiết khấu (${discountPct}%) + hoa hồng (${commissionPct}%) + phí sàn (${feeRatePct}%) = ${discountPct + commissionPct + feeRatePct}% vượt quá 100% giá gốc. Vui lòng giảm chiết khấu hoặc hoa hồng.`,
        code: 'EXCEEDS_100_PERCENT'
      }), { status: 400, headers: CORS_HEADERS });
    }

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

    // Đồng bộ tức thời thông số resell mới sang các listing gán đang active
    if (resellEnabled) {
      await syncAffiliatePriceAndStock(env.DB, productId, 'RESELL_PARAM_CHANGE', {
        newBasePrice: existing.price_core,
        newMapPrice: mapPrice,
        autoPauseOnLoss: mConfig.affiliate_auto_pause_on_loss,
        digitalFeePct: mConfig.affiliate_digital_fee_pct,
        physicalFeePct: mConfig.affiliate_physical_fee_pct,
      });
    } else {
      await syncAffiliatePriceAndStock(env.DB, productId, 'STATUS_CHANGE', { isDisabled: true });
    }

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
