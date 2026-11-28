import { verifyMemberAuth } from '../../../../services/mission_service';
import { checkAndExpireSellerOrdersD1 } from '../../../../services/d1_service';
import {
  SellerSepayConfigError,
  SellerSepayConfigRow,
  decryptSellerSepayToken,
  ensureSellerSepaySchema,
  fetchSepayRecentTransactions,
  settleDirectSepayTransfer,
} from '../../../../services/seller_sepay_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  MARKETPLACE_CODE_KEY?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * POST /api/seller-orders/multi/:id/verify-sepay
 * Đối soát dự phòng qua SePay API Token của chủ shop (nếu chủ shop có lưu API Token)
 * khi người mua bấm "Tôi đã chuyển khoản — Kiểm tra ngay" mà Webhook bị trễ mạng.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { params, request, env } = context;
  const orderId = String(params?.id || '').trim();

  try {
    await ensureSellerSepaySchema(env.DB);
    await checkAndExpireSellerOrdersD1(env.DB, orderId);

    const auth = await verifyMemberAuth(request, env as any);
    if (!auth.authorized || !auth.member) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Vui lòng đăng nhập.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const parentOrder = await env.DB.prepare(
      'SELECT * FROM seller_parent_orders WHERE (id = ? OR parent_order_code = ?) AND deleted_at IS NULL LIMIT 1'
    )
      .bind(orderId, orderId)
      .first<any>();

    if (!parentOrder) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không tìm thấy đơn hàng.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (parentOrder.buyer_member_id !== auth.member.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bạn không có quyền kiểm tra đơn hàng này.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const pendingRes = await env.DB.prepare(`
      SELECT DISTINCT seller_id, shop_qr_group_code, order_code
      FROM seller_orders
      WHERE parent_order_id = ? AND status = 'PENDING_PAYMENT' AND deleted_at IS NULL
    `)
      .bind(parentOrder.id)
      .all<{ seller_id: string; shop_qr_group_code: string | null; order_code: string }>();

    const pendingRows = pendingRes?.results || [];
    if (pendingRows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, matched: true, message: 'Đơn hàng đã được xác nhận thanh toán.' }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const bySeller = new Map<string, string[]>();
    for (const r of pendingRows) {
      const list = bySeller.get(r.seller_id) || [];
      if (r.shop_qr_group_code) list.push(r.shop_qr_group_code.toUpperCase());
      if (r.order_code) list.push(r.order_code.toUpperCase());
      bySeller.set(r.seller_id, list);
    }

    let settledAny = false;
    let checkedSellers = 0;
    const details: any[] = [];

    for (const [sellerId, codes] of bySeller.entries()) {
      const cfg = await env.DB.prepare('SELECT * FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
        .bind(sellerId)
        .first<SellerSepayConfigRow>();
      if (!cfg || !cfg.api_token_encrypted || Number(cfg.admin_locked) === 1) {
        continue;
      }
      checkedSellers++;
      let plainToken = '';
      try {
        plainToken = await decryptSellerSepayToken(cfg.api_token_encrypted, env.MARKETPLACE_CODE_KEY);
      } catch (e) {
        if (e instanceof SellerSepayConfigError) continue;
        continue;
      }
      const txRes = await fetchSepayRecentTransactions(plainToken, cfg.account_number, 20);
      if (!txRes.success) continue;

      const compactCodes = codes.map((c) => c.replace(/[^A-Z0-9]/g, ''));
      for (const tx of txRes.transactions) {
        if (tx.transferType !== 'in' || tx.transferAmount <= 0 || !tx.id) continue;
        const txContentCompact = tx.content.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const isMatch = compactCodes.some((cc) => cc && txContentCompact.includes(cc));
        if (!isMatch) continue;

        const settle = await settleDirectSepayTransfer(env.DB, env, cfg, {
          sellerId,
          sepayTxId: tx.id,
          gateway: tx.gateway,
          accountNumber: tx.accountNumber,
          amount: tx.transferAmount,
          content: tx.content,
          source: 'api_poll',
        });
        details.push(settle);
        if (settle.status === 'COMPLETED' || settle.status === 'DUPLICATE_IDEMPOTENT') {
          settledAny = true;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        matched: settledAny,
        checked_sellers: checkedSellers,
        message: settledAny
          ? 'Đã tìm thấy giao dịch chuyển khoản và hoàn tất giao đơn!'
          : checkedSellers === 0
            ? 'Hệ thống đang tự động lắng nghe Webhook từ SePay (chủ shop chưa bật API Token đối soát chủ động).'
            : 'Chưa thấy giao dịch chuyển khoản mới khớp mã đơn trong lịch sử SePay. Vui lòng chờ thêm vài giây rồi thử lại.',
        details,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi kiểm tra thanh toán SePay.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
