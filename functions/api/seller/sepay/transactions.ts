import { verifyStoreApiAccess } from '../../../services/store_api_service';
import { decryptCode } from '../../../services/marketplace_service';
import { ensureSellerSepaySchema } from '../../../services/seller_sepay_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  MARKETPLACE_CODE_KEY?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSellerSepaySchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'ANY' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Chưa xác thực gian hàng.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }
    const url = new URL(request.url);
    const filter = (url.searchParams.get('filter') || 'all').toLowerCase();
    const limit = Math.min(100, Math.max(10, Number(url.searchParams.get('limit') || 50)));

    let whereExtra = '';
    if (filter === 'exceptions') {
      whereExtra = "AND status IN ('UNDERPAID', 'EXPIRED_PAYMENT', 'DUPLICATE_PAYMENT', 'UNMATCHED', 'PENDING_MANUAL_CODE')";
    } else if (filter === 'success') {
      whereExtra = "AND status IN ('SUCCESS', 'RESOLVED_DELIVERED', 'RESOLVED_REFUNDED_BANK')";
    }

    const [rowsRes, summaryRow] = await Promise.all([
      env.DB.prepare(`
        SELECT * FROM seller_sepay_transactions
        WHERE seller_id = ? ${whereExtra}
        ORDER BY created_at DESC
        LIMIT ?
      `)
        .bind(storeAuth.seller.id, limit)
        .all<any>(),
      env.DB.prepare(`
        SELECT
          COUNT(*) as total_count,
          SUM(CASE WHEN status IN ('UNDERPAID', 'EXPIRED_PAYMENT', 'DUPLICATE_PAYMENT', 'UNMATCHED', 'PENDING_MANUAL_CODE') THEN 1 ELSE 0 END) as open_exceptions,
          SUM(CASE WHEN status IN ('SUCCESS', 'RESOLVED_DELIVERED') THEN amount_in ELSE 0 END) as total_volume_vnd
        FROM seller_sepay_transactions
        WHERE seller_id = ?
      `)
        .bind(storeAuth.seller.id)
        .first<any>(),
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        transactions: rowsRes?.results || [],
        summary: {
          total_count: Number(summaryRow?.total_count || 0),
          open_exceptions: Number(summaryRow?.open_exceptions || 0),
          total_volume_vnd: Number(summaryRow?.total_volume_vnd || 0),
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi tải nhật ký giao dịch SePay gian hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * POST /api/seller/sepay/transactions/:txId/resolve
 * Chủ gian hàng tự xử lý giao dịch ngoại lệ (vì tiền nằm trực tiếp trong STK chủ shop):
 * - action = 'MARK_BANK_REFUNDED': Đánh dấu đã hoàn tiền qua ngân hàng cho khách
 * - action = 'DELIVER_ORDER': Cấp mã bù cho đơn bị chuyển muộn / chuyển thiếu đã đối soát xong
 */
export const handleResolveSellerSepayTx = async (
  context: { request: Request; env: Env },
  txId: string
): Promise<Response> => {
  const { request, env } = context;
  try {
    await ensureSellerSepaySchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Chỉ chủ gian hàng mới được xử lý ngoại lệ SePay.' }),
        { status: storeAuth.status || 403, headers: CORS_HEADERS }
      );
    }

    const seller = storeAuth.seller;
    const body = (await request.json().catch(() => ({}))) as any;
    const action = String(body.action || '').toUpperCase().trim();
    const note = String(body.note || '').trim();

    if (action !== 'MARK_BANK_REFUNDED' && action !== 'DELIVER_ORDER') {
      return new Response(
        JSON.stringify({ success: false, error: 'Hành động không hợp lệ (DELIVER_ORDER hoặc MARK_BANK_REFUNDED).' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const tx = await env.DB.prepare(
      'SELECT * FROM seller_sepay_transactions WHERE id = ? AND seller_id = ? LIMIT 1'
    )
      .bind(txId, seller.id)
      .first<any>();

    if (!tx) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không tìm thấy giao dịch SePay này của gian hàng.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (tx.status === 'RESOLVED_DELIVERED' || tx.status === 'RESOLVED_REFUNDED_BANK') {
      return new Response(
        JSON.stringify({ success: false, error: 'Giao dịch ngoại lệ này đã được xử lý trước đó.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const nowIso = new Date().toISOString();

    if (action === 'MARK_BANK_REFUNDED') {
      await env.DB.prepare(`
        UPDATE seller_sepay_transactions
        SET status = 'RESOLVED_REFUNDED_BANK',
            seller_resolution_note = ?,
            resolved_at = ?
        WHERE id = ? AND seller_id = ?
      `)
        .bind(note || 'Chủ gian hàng xác nhận đã chuyển khoản hoàn tiền qua ngân hàng cho khách.', nowIso, tx.id, seller.id)
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Đã đánh dấu hoàn tiền ngân hàng cho giao dịch ngoại lệ.',
          status: 'RESOLVED_REFUNDED_BANK',
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // action === 'DELIVER_ORDER'
    const targetOrderId = String(body.order_id || tx.matched_order_id || '').trim();
    if (!targetOrderId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Thiếu mã đơn hàng cần giao mã bù.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const order = await env.DB.prepare(
      'SELECT * FROM seller_orders WHERE id = ? AND seller_id = ? AND deleted_at IS NULL LIMIT 1'
    )
      .bind(targetOrderId, seller.id)
      .first<any>();

    if (!order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không tìm thấy đơn hàng tương ứng của gian hàng.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (['PAID', 'COMPLETED', 'DELIVERED'].includes(order.status)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Đơn hàng này đã giao mã trước đó.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const isPhysical = String(order.product_type || '').toLowerCase() === 'physical';
    if (isPhysical) {
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE seller_orders
          SET status = 'PROCESSING', payment_method = 'QR_SEPAY', payment_channel = 'DIRECT_SEPAY',
              sepay_transaction_id = ?, updated_at = ?
          WHERE id = ?
        `).bind(tx.sepay_tx_id, nowIso, order.id),
        env.DB.prepare(`
          UPDATE seller_sepay_transactions
          SET status = 'RESOLVED_DELIVERED', matched_order_id = ?, seller_resolution_note = ?, resolved_at = ?
          WHERE id = ?
        `).bind(order.id, note || 'Chủ shop đã xác nhận giao đơn vật lý bù.', nowIso, tx.id),
      ]);
      return new Response(
        JSON.stringify({ success: true, message: 'Đã xác nhận giao đơn hàng vật lý cho khách.', status: 'RESOLVED_DELIVERED' }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // Digital item: deliver manual_code if provided, or grab an IN_STOCK code from seller's own inventory
    let plainCode = typeof body.manual_code === 'string' ? body.manual_code.trim() : '';
    let pickedCodeId: string | null = null;
    if (!plainCode) {
      if (Number(order.is_affiliate_order || 0) === 1) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Đơn Liên Shop quá hạn cần tạo đơn mới hoặc hoàn tiền ngân hàng (không tự bóc mã kho NCC sau khi hết hạn).',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      const stockCode = await env.DB.prepare(`
        SELECT id, code_encrypted FROM seller_codes
        WHERE product_id = ? AND seller_id = ? AND status = 'IN_STOCK' AND deleted_at IS NULL
        ORDER BY created_at ASC LIMIT 1
      `)
        .bind(order.product_id, seller.id)
        .first<any>();

      if (!stockCode) {
        return new Response(
          JSON.stringify({ success: false, error: 'Kho mã sản phẩm đã hết. Vui lòng nhập mã bù thủ công hoặc hoàn tiền ngân hàng.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      if (!env.MARKETPLACE_CODE_KEY || env.MARKETPLACE_CODE_KEY.trim().length < 16) {
        return new Response(
          JSON.stringify({ success: false, error: 'Thiếu khóa MARKETPLACE_CODE_KEY để giải mã tự động. Vui lòng nhập mã bù thủ công.' }),
          { status: 503, headers: CORS_HEADERS }
        );
      }
      plainCode = await decryptCode(stockCode.code_encrypted, env.MARKETPLACE_CODE_KEY);
      pickedCodeId = stockCode.id;
    }

    const stmts: any[] = [
      env.DB.prepare(`
        UPDATE seller_orders
        SET status = 'PAID', code_id = COALESCE(?, code_id), delivered_code = ?,
            payment_method = 'QR_SEPAY', payment_channel = 'DIRECT_SEPAY',
            sepay_transaction_id = ?, pending_manual_code = 0, updated_at = ?
        WHERE id = ?
      `).bind(pickedCodeId, plainCode, tx.sepay_tx_id, nowIso, order.id),
      env.DB.prepare(`
        UPDATE seller_sepay_transactions
        SET status = 'RESOLVED_DELIVERED', matched_order_id = ?, seller_resolution_note = ?, resolved_at = ?
        WHERE id = ?
      `).bind(order.id, note || 'Chủ gian hàng đã xác nhận giao mã bù thành công.', nowIso, tx.id),
    ];
    if (pickedCodeId) {
      stmts.push(
        env.DB.prepare(`
          UPDATE seller_codes SET status = 'SOLD', order_id = ?, sold_at = ?, updated_at = ?
          WHERE id = ? AND status = 'IN_STOCK'
        `).bind(order.id, nowIso, nowIso, pickedCodeId)
      );
    }
    await env.DB.batch(stmts);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đã giao mã bù cho khách hàng và đóng giao dịch ngoại lệ.',
        status: 'RESOLVED_DELIVERED',
        order_id: order.id,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi xử lý giao dịch ngoại lệ.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
