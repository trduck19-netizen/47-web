import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';
import { getMarketplaceConfig } from '../../../services/marketplace_service';
import {
  calculate3WaySplit,
  logAffiliateCall,
  verifyPairShopAccess,
} from '../../../services/seller_affiliate_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * POST /api/seller/affiliate/inventory-push
 * Cho phép NCC (hoặc Bot Telegram của NCC) đẩy cập nhật giá gốc / tồn kho / mở bán lại
 * bằng Seller Session, Store API Key, hoặc Pair Shop Key (wcg_shop_*),
 * đồng thời tự động tính lại giá bán & khóa chống lỗ trên mọi listing liên shop đang gán.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const startMs = Date.now();

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    await ensureSchemaUpgrades(env.DB);

    const authHeader = request.headers.get('Authorization') || '';
    const apiKeyHeader = request.headers.get('X-Api-Key') || '';
    const cleanToken = (authHeader.replace(/^Bearer\s+/i, '').trim() || apiKeyHeader.trim());

    let supplierSellerId = '';
    let partnerId = '';
    let keyPrefix = '';

    if (cleanToken.startsWith('wcg_shop_')) {
      const pairAuth = await verifyPairShopAccess(env.DB, cleanToken);
      if (!pairAuth.authorized || !pairAuth.partnership) {
        await logAffiliateCall(env.DB, {
          endpoint: '/api/seller/affiliate/inventory-push',
          method: 'POST',
          statusCode: pairAuth.status || 401,
          responseTimeMs: Date.now() - startMs,
        }).catch(() => {});
        return new Response(
          JSON.stringify({ success: false, error: pairAuth.error || 'Khóa cặp gian hàng không hợp lệ.' }),
          { status: pairAuth.status || 401, headers: CORS_HEADERS }
        );
      }
      supplierSellerId = pairAuth.partnership.supplier_seller_id;
      partnerId = pairAuth.partnership.id;
      keyPrefix = pairAuth.partnership.api_key_prefix;
    } else {
      const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'ANY' });
      if (!storeAuth.authorized || !storeAuth.seller) {
        return new Response(
          JSON.stringify({ success: false, error: storeAuth.error || 'Yêu cầu xác thực Gian hàng hoặc khóa API hợp lệ.' }),
          { status: storeAuth.status || 401, headers: CORS_HEADERS }
        );
      }
      supplierSellerId = storeAuth.seller.id;
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const rawItems = Array.isArray(body.items) ? body.items : body.product_id ? [body] : [];
    if (rawItems.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Vui lòng cung cấp danh sách items (tối đa 100 sản phẩm/lần).' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
    if (rawItems.length > 100) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mỗi lần đẩy tồn kho/giá tối đa 100 sản phẩm.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const nowIso = new Date().toISOString();
    let updatedProducts = 0;
    let updatedListings = 0;
    let antiLossPausedListings = 0;
    const skipped: Array<{ product_id: string; reason: string }> = [];

    for (const item of rawItems) {
      const productId = String(item?.product_id || '').trim();
      if (!productId) {
        skipped.push({ product_id: '', reason: 'MISSING_PRODUCT_ID' });
        continue;
      }

      const prod = await env.DB
        .prepare(`
          SELECT id, seller_id, price_core, resell_discount_pct, resell_commission_pct,
                 resell_map_price, product_type, resell_enabled
          FROM seller_products
          WHERE id = ? AND seller_id = ? AND deleted_at IS NULL
          LIMIT 1
        `)
        .bind(productId, supplierSellerId)
        .first<any>();

      if (!prod) {
        skipped.push({ product_id: productId, reason: 'NOT_FOUND_OR_NOT_OWNED' });
        continue;
      }

      const nextPrice =
        item.price_core !== undefined && Number.isFinite(Number(item.price_core)) && Number(item.price_core) > 0
          ? Math.round(Number(item.price_core))
          : Number(prod.price_core);
      const nextResellEnabled =
        item.resell_enabled !== undefined ? (item.resell_enabled ? 1 : 0) : Number(prod.resell_enabled ?? 1);
      const hasStockQty = item.stock_quantity !== undefined && Number.isFinite(Number(item.stock_quantity));
      const nextStockQty = hasStockQty ? Math.max(0, Math.floor(Number(item.stock_quantity))) : null;

      if (hasStockQty) {
        await env.DB
          .prepare(`
            UPDATE seller_products
            SET price_core = ?, resell_enabled = ?, stock_quantity = ?, updated_at = ?
            WHERE id = ? AND seller_id = ?
          `)
          .bind(nextPrice, nextResellEnabled, nextStockQty, nowIso, productId, supplierSellerId)
          .run();
      } else {
        await env.DB
          .prepare(`
            UPDATE seller_products
            SET price_core = ?, resell_enabled = ?, updated_at = ?
            WHERE id = ? AND seller_id = ?
          `)
          .bind(nextPrice, nextResellEnabled, nowIso, productId, supplierSellerId)
          .run();
      }
      updatedProducts++;

      // Đồng bộ toàn bộ listing liên shop đang trỏ vào sản phẩm gốc này + khóa chống lỗ
      const listingsRes = await env.DB
        .prepare(`
          SELECT id, reseller_product_id, markup_type, markup_value, price_mode, locked_price, status
          FROM seller_affiliate_listings
          WHERE supplier_product_id = ?
        `)
        .bind(productId)
        .all<any>();

      const mConfig = await getMarketplaceConfig(env.DB);
      for (const listing of listingsRes.results || []) {
        const split = calculate3WaySplit({
          basePrice: nextPrice,
          markupType: listing.markup_type === 'FIXED' ? 'FIXED' : 'PERCENT',
          markupValue: Number(listing.markup_value) || 0,
          discountPct: Number(prod.resell_discount_pct) || 0,
          commissionPct: Number(prod.resell_commission_pct) || 0,
          isPhysical: String(prod.product_type || '').toLowerCase() === 'physical',
          mapPrice: Number(prod.resell_map_price) || 0,
          priceMode: listing.price_mode === 'LOCKED' ? 'LOCKED' : 'FORMULA',
          lockedPrice: listing.locked_price !== null ? Number(listing.locked_price) : null,
          digitalFeePct: mConfig.affiliate_digital_fee_pct,
          physicalFeePct: mConfig.affiliate_physical_fee_pct,
        });

        const isLoss = split.resellerPayout < 0 || split.sellingPrice < nextPrice;
        const isOutOfStock = hasStockQty && nextStockQty !== null && nextStockQty <= 0;
        let nextStatus = String(listing.status || 'ACTIVE');
        let priceWarning: string | null = null;

        if (nextResellEnabled === 0) {
          nextStatus = 'SUPPLIER_DISABLED';
          priceWarning = 'SUPPLIER_DISABLED';
        } else if (isOutOfStock) {
          nextStatus = 'OUT_OF_STOCK';
          priceWarning = 'OUT_OF_STOCK';
        } else if (isLoss && mConfig.affiliate_auto_pause_on_loss) {
          nextStatus = 'HIDDEN';
          priceWarning = 'ANTI_LOSS_PAUSED';
          antiLossPausedListings++;
        } else if (isLoss) {
          nextStatus = 'ACTIVE';
          priceWarning = `CẢNH BÁO: Giá bán (${split.sellingPrice.toLocaleString('vi-VN')} đ) thấp hơn giá vốn NCC (${nextPrice.toLocaleString('vi-VN')} đ).`;
        } else {
          nextStatus = 'ACTIVE';
          priceWarning = null;
        }

        await env.DB.batch([
          env.DB
            .prepare(`
              UPDATE seller_affiliate_listings
              SET status = ?, price_warning = ?, updated_at = ?
              WHERE id = ?
            `)
            .bind(nextStatus, priceWarning, nowIso, listing.id),
          env.DB
            .prepare(`
              UPDATE seller_products
              SET price_core = ?, updated_at = ?
              WHERE id = ?
            `)
            .bind(split.sellingPrice, nowIso, listing.reseller_product_id),
        ]);
        updatedListings++;
      }
    }

    if (partnerId) {
      await logAffiliateCall(env.DB, {
        partnershipId: partnerId,
        callerSellerId: supplierSellerId,
        keyPrefix,
        endpoint: '/api/seller/affiliate/inventory-push',
        method: 'POST',
        statusCode: 200,
        responseTimeMs: Date.now() - startMs,
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        updated_products: updatedProducts,
        updated_listings: updatedListings,
        anti_loss_paused_listings: antiLossPausedListings,
        skipped,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi đồng bộ giá & tồn kho NCC.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
