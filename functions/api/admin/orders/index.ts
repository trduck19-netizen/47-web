import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyAdminAuth } from '../../../services/mission_service';

interface Env {
  DB: D1Database;
  ADMIN_SYNC_SECRET?: string;
  PINE_API_KEY?: string;
  MUSE_API_KEY?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Admin-Key, X-Api-Key, x-admin-sync-key, X-Requested-With',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/admin/orders
 * Danh sách đơn hàng code + phân trang + lọc trạng thái & thanh toán
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: 'Database not available' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const auth = await verifyAdminAuth(request, env as any, 'STORE_FULL');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Unauthorized: Yêu cầu quyền STORE_FULL hoặc ADMIN_FULL.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20));
    const status = (url.searchParams.get('status') || 'ALL').toUpperCase().trim();
    const paymentMethod = (url.searchParams.get('paymentMethod') || url.searchParams.get('method') || 'ALL').toUpperCase().trim();
    const search = (url.searchParams.get('search') || url.searchParams.get('q') || '').trim();

    const conditions: string[] = [];
    const params: any[] = [];

    if (status !== 'ALL' && status !== '') {
      conditions.push('status = ?');
      params.push(status);
    }

    if (paymentMethod !== 'ALL' && paymentMethod !== '') {
      conditions.push('payment_method = ?');
      params.push(paymentMethod);
    }

    if (search) {
      conditions.push('(id LIKE ? OR order_code LIKE ? OR customer_email LIKE ? OR customer_name LIKE ? OR product_title LIKE ?)');
      const wild = `%${search}%`;
      params.push(wild, wild, wild, wild, wild);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as total FROM orders ${whereClause}`;
    const totalRow = await env.DB.prepare(countSql).bind(...params).first<any>();
    const total = Number(totalRow?.total || 0);
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;

    const dataSql = `
      SELECT 
        id, order_code, user_id, product_id, product_title, product_type,
        quantity, unit_price, subtotal_amount, shipping_fee, discount_amount, total_amount,
        voucher_code, freeship_voucher_code, payment_method, payment_status,
        shipping_status, shipping_carrier, tracking_code, customer_name, customer_email,
        customer_phone, shipping_address, created_at
      FROM orders
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await env.DB.prepare(dataSql).bind(...params, limit, offset).all<any>();

    const orders = (rows?.results || []).map((o: any) => ({
      id: o.id,
      orderCode: o.order_code,
      memberId: o.user_id,
      buyerName: o.customer_name || o.customer_email || 'Khách hàng',
      buyerEmail: o.customer_email || '',
      buyerPhone: o.customer_phone || '',
      productId: o.product_id,
      productTitle: o.product_title || '',
      productType: o.product_type || 'physical',
      quantity: Number(o.quantity || 1),
      unitPrice: Number(o.unit_price || 0),
      subtotalAmount: Number(o.subtotal_amount || 0),
      shippingFee: Number(o.shipping_fee || 0),
      discountAmount: Number(o.discount_amount || 0),
      amount: Number(o.total_amount || 0),
      totalAmount: Number(o.total_amount || 0),
      voucherCode: o.voucher_code || null,
      paymentMethod: o.payment_method || 'vietqr',
      paymentStatus: o.payment_status || 'PENDING',
      shippingStatus: o.shipping_status || 'PENDING',
      shippingCarrier: o.shipping_carrier || null,
      trackingCode: o.tracking_code || null,
      status: o.payment_status === 'PAID' ? 'COMPLETED' : (o.payment_status || 'PENDING'),
      createdAt: o.created_at,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        page,
        limit,
        total,
        totalPages,
        orders,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: 'Lỗi máy chủ khi lấy danh sách đơn hàng: ' + (err?.message || String(err)) }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
