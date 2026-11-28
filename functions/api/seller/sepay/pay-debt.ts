import { verifyStoreApiAccess } from '../../../services/store_api_service';
import { ensureSellerSepaySchema, SellerSepayConfigRow } from '../../../services/seller_sepay_service';
import { invalidateCatalogEdgeCache } from '../../../services/cache_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * POST /api/seller/sepay/pay-debt
 * Chủ gian hàng tất toán công nợ phí SePay trả sau (khi Admin cấu hình % phí > 0) bằng Ví Core thật của chủ shop.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSellerSepaySchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Chỉ chủ gian hàng mới được tất toán công nợ phí SePay.' }),
        { status: storeAuth.status || 403, headers: CORS_HEADERS }
      );
    }

    const seller = storeAuth.seller;
    const cfg = await env.DB.prepare('SELECT * FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
      .bind(seller.id)
      .first<SellerSepayConfigRow>();

    const currentDebt = Math.max(0, Math.round(Number(cfg?.fee_debt_core || 0)));
    if (currentDebt <= 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Gian hàng hiện không có công nợ phí SePay nào cần thanh toán.', remaining_debt_core: 0 }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const requestedAmount = body.amount_core !== undefined ? Math.round(Number(body.amount_core)) : currentDebt;
    const payAmount = Math.min(currentDebt, Math.max(1, requestedAmount || currentDebt));
    const nowIso = new Date().toISOString();

    // Atomic deduction from seller owner's real Core wallet (WHERE balance >= payAmount)
    const deductRes: any = await env.DB.prepare(`
      UPDATE members
      SET balance = balance - ?, updated_at = ?
      WHERE id = ? AND balance >= ?
    `)
      .bind(payAmount, nowIso, seller.owner_member_id, payAmount)
      .run();

    const changes = Number(deductRes?.meta?.changes ?? deductRes?.changes ?? 0);
    if (changes !== 1) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Số dư Ví Core của chủ gian hàng không đủ để thanh toán ${payAmount.toLocaleString('vi-VN')} Core công nợ phí SePay.`,
          code: 'INSUFFICIENT_CORE_BALANCE',
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    await env.DB.prepare(`
      UPDATE seller_sepay_configs
      SET fee_debt_core = MAX(0, fee_debt_core - ?), updated_at = ?
      WHERE seller_id = ?
    `)
      .bind(payAmount, nowIso, seller.id)
      .run();

    await invalidateCatalogEdgeCache(context as any, request, env as any).catch(() => {});

    const refreshed = await env.DB.prepare('SELECT fee_debt_core FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
      .bind(seller.id)
      .first<{ fee_debt_core: number }>();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Đã tất toán ${payAmount.toLocaleString('vi-VN')} Core công nợ phí SePay thành công!`,
        paid_core: payAmount,
        remaining_debt_core: Number(refreshed?.fee_debt_core || 0),
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi thanh toán công nợ phí SePay.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
