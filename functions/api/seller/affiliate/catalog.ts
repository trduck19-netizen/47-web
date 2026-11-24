import { authenticateCaller } from '../../../services/auth_service';
import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyPairShopAccess, logAffiliateCall } from '../../../services/seller_affiliate_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/seller/affiliate/catalog
 * Shop Gán xem danh sách sản phẩm được NCC mở bán lại (Nhóm 2)
 * Hỗ trợ xác thực bằng Session đăng nhập hoặc Header Authorization: Bearer wcg_shop_<32 hex>
 */
export async function onRequestGet(context: { request: Request; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, env } = context;
  const startMs = Date.now();
  let partnerId = '';
  let callerSellerId = '';
  let keyPrefix = '';

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    await ensureSchemaUpgrades(env.DB);

    const authHeader = request.headers.get('Authorization') || '';
    const cleanToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    let supplierId = '';

    // Trường hợp 1: Gọi bằng khóa cặp wcg_shop_...
    if (cleanToken.startsWith('wcg_shop_')) {
      const authPair = await verifyPairShopAccess(env.DB, cleanToken);
      if (!authPair.authorized || !authPair.partnership) {
        await logAffiliateCall(env.DB, {
          endpoint: '/api/seller/affiliate/catalog',
          method: 'GET',
          statusCode: authPair.status || 401,
          responseTimeMs: Date.now() - startMs
        });
        return new Response(JSON.stringify({ success: false, error: authPair.error || 'Khóa không hợp lệ.' }), { status: authPair.status || 401, headers: CORS_HEADERS });
      }

      partnerId = authPair.partnership.id;
      callerSellerId = authPair.partnership.reseller_seller_id;
      keyPrefix = authPair.partnership.api_key_prefix;
      supplierId = authPair.partnership.supplier_seller_id;
    } else {
      // Trường hợp 2: Gọi bằng phiên web đăng nhập (Session)
      const auth = await authenticateCaller(request, env.DB, env.JWT_SECRET);
      if (!auth || !auth.member) {
        return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập hoặc khóa API hợp lệ.' }), { status: 401, headers: CORS_HEADERS });
      }

      const reseller = await env.DB
        .prepare('SELECT id, name FROM sellers WHERE owner_member_id = ? AND status = "ACTIVE" LIMIT 1')
        .bind(auth.member.id)
        .first<any>();

      if (!reseller) {
        return new Response(JSON.stringify({ success: false, error: 'Gian hàng không tồn tại hoặc chưa kích hoạt.' }), { status: 403, headers: CORS_HEADERS });
      }

      callerSellerId = reseller.id;
      const url = new URL(request.url);
      supplierId = url.searchParams.get('supplier_id') || '';
      partnerId = url.searchParams.get('partnership_id') || '';

      if (!supplierId && partnerId) {
        const pRecord = await env.DB
          .prepare('SELECT supplier_seller_id, status FROM seller_affiliate_partnerships WHERE id = ? AND reseller_seller_id = ? LIMIT 1')
          .bind(partnerId, reseller.id)
          .first<any>();
        if (pRecord && pRecord.status === 'APPROVED') {
          supplierId = pRecord.supplier_seller_id;
        }
      }

      if (!supplierId) {
        return new Response(JSON.stringify({ success: false, error: 'Vui lòng cung cấp supplier_id hoặc partnership_id hợp lệ.' }), { status: 400, headers: CORS_HEADERS });
      }
    }

    // Lấy thông tin NCC
    const supplier = await env.DB
      .prepare('SELECT id, name, slug FROM sellers WHERE id = ? AND status = "ACTIVE" LIMIT 1')
      .bind(supplierId)
      .first<any>();

    if (!supplier) {
      return new Response(JSON.stringify({ success: false, error: 'Nhà Cung Cấp không tồn tại hoặc đã dừng hoạt động.' }), { status: 404, headers: CORS_HEADERS });
    }

    // Truy vấn danh mục sản phẩm NCC đã mở bán lại:
    // CHẶN GÁN TẦNG 2: Chỉ lấy sản phẩm gốc (origin_product_id IS NULL AND is_affiliate = 0)
    const query = `
      SELECT sp.id, sp.seller_id, sp.name, sp.cover_url, sp.description, sp.game_slug, sp.game_name,
             sp.price_core as base_price,
             sp.resell_discount_pct,
             sp.resell_commission_pct,
             sp.resell_map_price,
             sp.product_type,
             sp.warranty_type,
             sp.warranty_hours,
             sp.weight_grams,
             (
               SELECT COUNT(*) FROM seller_codes sc
               WHERE sc.product_id = sp.id AND sc.status = 'IN_STOCK' AND sc.deleted_at IS NULL
             ) as digital_stock_count,
             (
               SELECT sal.id FROM seller_affiliate_listings sal
               WHERE sal.supplier_product_id = sp.id 
                 AND sal.reseller_seller_id = ? 
                 AND sal.status = 'ACTIVE'
               LIMIT 1
             ) as already_listed_id
      FROM seller_products sp
      WHERE sp.seller_id = ?
        AND sp.resell_enabled = 1
        AND (sp.is_affiliate = 0 OR sp.is_affiliate IS NULL)
        AND sp.origin_product_id IS NULL
        AND sp.status = 'APPROVED'
        AND sp.deleted_at IS NULL
      ORDER BY sp.created_at DESC
    `;

    const result = await env.DB.prepare(query).bind(callerSellerId, supplier.id).all();
    const products = (result.results || []).map((p: any) => ({
      ...p,
      has_stock: p.product_type === 'physical' ? true : (p.digital_stock_count || 0) > 0,
      is_already_listed: Boolean(p.already_listed_id),
    }));

    await logAffiliateCall(env.DB, {
      partnershipId: partnerId,
      callerSellerId,
      keyPrefix,
      endpoint: '/api/seller/affiliate/catalog',
      method: 'GET',
      statusCode: 200,
      responseTimeMs: Date.now() - startMs
    });

    return new Response(JSON.stringify({
      success: true,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      total_products: products.length,
      products
    }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi tải danh mục sản phẩm.' }), { status: 500, headers: CORS_HEADERS });
  }
}
