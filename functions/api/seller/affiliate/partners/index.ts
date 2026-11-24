import { authenticateCaller } from '../../../../services/auth_service';
import { ensureSchemaUpgrades } from '../../../../services/d1_service';

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
 * GET /api/seller/affiliate/partners
 * NCC xem danh sách shop đang bán lại sản phẩm của mình (Nhóm 1)
 * (Tên shop, số sản phẩm đang gán, doanh thu từ shop đó)
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

    const supplier = await env.DB
      .prepare('SELECT id, name FROM sellers WHERE owner_member_id = ? AND status = "ACTIVE" LIMIT 1')
      .bind(auth.member.id)
      .first<any>();

    if (!supplier) {
      return new Response(JSON.stringify({ success: false, error: 'Gian hàng không tồn tại hoặc chưa kích hoạt.' }), { status: 403, headers: CORS_HEADERS });
    }

    const query = `
      SELECT sap.id as partnership_id,
             sap.reseller_seller_id,
             sap.status as partnership_status,
             sap.api_key_prefix,
             sap.created_at as connected_at,
             sap.revoked_at,
             s_res.name as reseller_name,
             s_res.slug as reseller_slug,
             (
               SELECT COUNT(*) FROM seller_affiliate_listings sal
               WHERE sal.partnership_id = sap.id AND sal.status = 'ACTIVE'
             ) as active_listings_count,
             (
               SELECT COALESCE(SUM(o.total_amount), 0)
               FROM orders o
               WHERE o.supplier_seller_id = sap.supplier_seller_id
                 AND o.seller_id = sap.reseller_seller_id
                 AND o.status = 'COMPLETED'
             ) as total_revenue_core,
             (
               SELECT COUNT(*)
               FROM orders o
               WHERE o.supplier_seller_id = sap.supplier_seller_id
                 AND o.seller_id = sap.reseller_seller_id
             ) as total_orders_count
      FROM seller_affiliate_partnerships sap
      JOIN sellers s_res ON sap.reseller_seller_id = s_res.id
      WHERE sap.supplier_seller_id = ?
      ORDER BY sap.created_at DESC
    `;

    const result = await env.DB.prepare(query).bind(supplier.id).all();
    const partners = result.results || [];

    return new Response(JSON.stringify({
      success: true,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      partners
    }), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Lỗi lấy danh sách đối tác.' }), { status: 500, headers: CORS_HEADERS });
  }
}
