import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
};

export const onRequestOptions = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * Dẫn xuất escrow_status chuẩn từ các cột thật của seller_orders (status, released_at),
 * khớp logic trạng thái của escrow_service.ts.
 */
export function deriveSellerOrderEscrowStatus(row: { status?: string | null; released_at?: string | null }): string {
  const st = String(row.status || '').trim().toUpperCase();
  if (st === 'COMPLETED' || Boolean(row.released_at)) return 'RELEASED';
  if (st === 'RESOLVED_SELLER_RELEASE') return 'RELEASED';
  if (st === 'RESOLVED_BUYER_REFUND' || st === 'REFUNDED') return 'REFUNDED';
  if (st === 'REPORTED' || st === 'DISPUTED') return 'DISPUTED';
  if (st === 'PAID') return 'HELD';
  if (st === 'PENDING_PAYMENT') return 'PENDING_PAYMENT';
  if (st === 'DELIVERED') return 'DELIVERED';
  if (st === 'EXPIRED') return 'EXPIRED';
  if (st === 'CANCELLED') return 'CANCELLED';
  if (st === 'PROCESSING') return 'PROCESSING';
  return 'PENDING_PAYMENT';
}

/**
 * GET /api/seller/affiliate/orders
 * Chủ gian hàng (hoặc tài khoản phụ có quyền xem đơn) tra cứu lịch sử đơn bán lại liên shop
 * theo vai trò NCC (supplier), Shop Gán (reseller), hoặc cả hai (all), kèm phân rã tiền 3 bên.
 * Selective projection: TUYỆT ĐỐI không trả delivered_code, buyer_email, code_id.
 */
export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    await ensureSchemaUpgrades(env.DB);

    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'ANY' });
    if (!auth.authorized || !auth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu đăng nhập gian hàng để xem đơn liên shop.' }),
        { status: auth.status || 401, headers: CORS_HEADERS }
      );
    }

    const mySellerId = auth.seller.id;
    const url = new URL(request.url);
    const roleParam = (url.searchParams.get('role') || 'all').trim().toLowerCase();
    const roleFilter: 'all' | 'supplier' | 'reseller' =
      roleParam === 'supplier' ? 'supplier' : roleParam === 'reseller' ? 'reseller' : 'all';
    const statusFilter = (url.searchParams.get('status') || '').trim().toUpperCase();
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));

    let sql = `
      SELECT so.id, so.order_code, so.seller_id, so.supplier_seller_id,
             so.product_id, so.product_name, COALESCE(so.product_type, 'digital') AS product_type,
             so.price_core, so.payment_method, so.status,
             so.hold_until, so.released_at, so.fee_core, so.refund_core,
             so.affiliate_breakdown, so.created_at, so.updated_at,
             s_sup.name AS supplier_name,
             s_res.name AS reseller_name
      FROM seller_orders so
      LEFT JOIN sellers s_sup ON so.supplier_seller_id = s_sup.id
      LEFT JOIN sellers s_res ON so.seller_id = s_res.id
      WHERE so.is_affiliate_order = 1
        AND so.deleted_at IS NULL
    `;
    const binds: any[] = [];

    if (roleFilter === 'supplier') {
      sql += ' AND so.supplier_seller_id = ?';
      binds.push(mySellerId);
    } else if (roleFilter === 'reseller') {
      sql += ' AND so.seller_id = ?';
      binds.push(mySellerId);
    } else {
      sql += ' AND (so.supplier_seller_id = ? OR so.seller_id = ?)';
      binds.push(mySellerId, mySellerId);
    }

    if (statusFilter) {
      sql += ' AND so.status = ?';
      binds.push(statusFilter);
    }

    sql += ' ORDER BY so.created_at DESC LIMIT ?';
    binds.push(limit);

    const rowsRes = await env.DB.prepare(sql).bind(...binds).all<any>();
    const rawRows = rowsRes.results || [];

    let asSupplierOrders = 0;
    let asResellerOrders = 0;
    let supplierPayoutTotal = 0;
    let resellerPayoutTotal = 0;
    let platformFeeTotal = 0;

    const orders = rawRows.map((row: any) => {
      let split: any = null;
      if (row.affiliate_breakdown) {
        try {
          const parsed = typeof row.affiliate_breakdown === 'string'
            ? JSON.parse(row.affiliate_breakdown)
            : row.affiliate_breakdown;
          if (parsed && typeof parsed === 'object') {
            split = {
              basePrice: Number(parsed.basePrice) || 0,
              sellingPrice: Number(parsed.sellingPrice) || Number(row.price_core) || 0,
              markupAmount: Number(parsed.markupAmount) || 0,
              discountAmount: Number(parsed.discountAmount) || 0,
              commissionAmount: Number(parsed.commissionAmount) || 0,
              platformFee: Number(parsed.platformFee) || 0,
              feeRatePct: parsed.feeRatePct !== undefined ? Number(parsed.feeRatePct) : undefined,
              supplierPayout: Number(parsed.supplierPayout) || 0,
              resellerPayout: Number(parsed.resellerPayout) || 0,
              shippingFee: Number(parsed.shippingFee) || 0,
            };
          }
        } catch {}
      }

      const myRole: 'SUPPLIER' | 'RESELLER' = row.supplier_seller_id === mySellerId ? 'SUPPLIER' : 'RESELLER';
      const supplierPayout = split ? split.supplierPayout + split.shippingFee : 0;
      const resellerPayout = split ? split.resellerPayout : 0;
      const platformFee = split ? split.platformFee : (Number(row.fee_core) || 0);
      const myPayoutCore = myRole === 'SUPPLIER' ? supplierPayout : resellerPayout;
      const escrowStatus = deriveSellerOrderEscrowStatus(row);

      if (myRole === 'SUPPLIER') asSupplierOrders++;
      else asResellerOrders++;

      if (escrowStatus !== 'REFUNDED' && escrowStatus !== 'EXPIRED' && escrowStatus !== 'CANCELLED') {
        supplierPayoutTotal += supplierPayout;
        resellerPayoutTotal += resellerPayout;
        platformFeeTotal += platformFee;
      }

      return {
        id: row.id,
        order_code: row.order_code,
        seller_id: row.seller_id,
        supplier_seller_id: row.supplier_seller_id,
        supplier_name: row.supplier_name || '',
        reseller_name: row.reseller_name || '',
        product_id: row.product_id,
        product_name: row.product_name,
        product_type: String(row.product_type || 'digital').toLowerCase(),
        price_core: Number(row.price_core) || 0,
        payment_method: row.payment_method || 'CORE',
        status: row.status,
        escrow_status: escrowStatus,
        hold_until: row.hold_until || null,
        released_at: row.released_at || null,
        fee_core: Number(row.fee_core) || 0,
        refund_core: Number(row.refund_core) || 0,
        my_role: myRole,
        my_payout_core: myPayoutCore,
        split,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        my_seller_id: mySellerId,
        role_filter: roleFilter,
        summary: {
          total_orders: orders.length,
          as_supplier_orders: asSupplierOrders,
          as_reseller_orders: asResellerOrders,
          supplier_payout_total: supplierPayoutTotal,
          reseller_payout_total: resellerPayoutTotal,
          platform_fee_total: platformFeeTotal,
        },
        orders,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi lấy sổ đơn hàng bán lại liên shop.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
