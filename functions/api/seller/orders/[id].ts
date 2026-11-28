import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Chi tiết 1 đơn hàng của gian hàng
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureSchemaUpgrades(env.DB);
    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'ANY' });
    if (!auth.authorized || !auth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: auth.status || 401, headers: CORS_HEADERS }
      );
    }

    const orderId = params.id as string;
    const sellerId = auth.seller.id;

    const order = await env.DB
      .prepare(`
        SELECT so.*, 
               (SELECT code_encrypted FROM seller_codes WHERE id = so.code_id) as delivered_code_encrypted
        FROM seller_orders so
        WHERE so.id = ? AND so.seller_id = ?
        LIMIT 1
      `)
      .bind(orderId, sellerId)
      .first<any>();

    if (!order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Đơn hàng không tồn tại hoặc không thuộc gian hàng của bạn.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ success: true, order }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

// POST: Thao tác trên đơn hàng (CONFIRM: xác nhận đơn, SHIPPING: cập nhật vận chuyển)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureSchemaUpgrades(env.DB);
    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!auth.authorized || !auth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: auth.status || 401, headers: CORS_HEADERS }
      );
    }

    const orderId = params.id as string;
    const sellerId = auth.seller.id;
    const body = (await request.json().catch(() => ({}))) as any;
    const action = String(body.action || 'CONFIRM').toUpperCase().trim();
    const nowIso = new Date().toISOString();

    const order = await env.DB
      .prepare('SELECT * FROM seller_orders WHERE id = ? AND seller_id = ? LIMIT 1')
      .bind(orderId, sellerId)
      .first<any>();

    if (!order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Đơn hàng không tồn tại hoặc không thuộc gian hàng của bạn.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (action === 'CONFIRM') {
      if (order.status !== 'PAID') {
        return new Response(
          JSON.stringify({ success: false, error: `Không thể xác nhận đơn hàng đang ở trạng thái "${order.status}".` }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      await env.DB
        .prepare("UPDATE seller_orders SET status = 'DELIVERED', updated_at = ? WHERE id = ?")
        .bind(nowIso, orderId)
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Đơn hàng "${order.order_code || orderId}" đã được xác nhận hoàn tất thành công.`,
          status: 'DELIVERED',
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    if (action === 'SHIPPING' || action === 'DELIVER_MANUAL') {
      const trackingCode = String(body.tracking_code || '').trim();
      const carrier = String(body.carrier || body.shipping_carrier || '').trim();
      const shippingNote = String(body.note || body.fulfillment_note || '').trim();
      const deliveredPayload = body.delivered_content ? String(body.delivered_content).trim() : null;

      const detailsJson = JSON.stringify({
        tracking_code: trackingCode,
        carrier,
        shipping_note: shippingNote,
        updated_at: nowIso,
      });

      const nextOrderStatus =
        action === 'DELIVER_MANUAL'
          ? 'DELIVERED'
          : action === 'SHIPPING'
            ? 'SHIPPING'
            : order.status;

      await env.DB
        .prepare(`
          UPDATE seller_orders
          SET status = ?,
              tracking_code = COALESCE(?, tracking_code),
              shipping_carrier = COALESCE(?, shipping_carrier),
              fulfillment_note = COALESCE(?, fulfillment_note),
              delivered_code = COALESCE(?, delivered_code),
              resolution_note = ?,
              updated_at = ?
          WHERE id = ?
        `)
        .bind(
          nextOrderStatus,
          trackingCode || null,
          carrier || null,
          shippingNote || null,
          deliveredPayload,
          detailsJson,
          nowIso,
          orderId
        )
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          message:
            action === 'DELIVER_MANUAL'
              ? 'Đã bàn giao dịch vụ / kết quả đơn hàng cho khách thành công!'
              : 'Đã cập nhật thông tin vận chuyển & mã vận đơn thành công!',
          status: nextOrderStatus,
          tracking_code: trackingCode,
          carrier,
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Hành động không hợp lệ. Vui lòng chọn CONFIRM hoặc SHIPPING.' }),
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
