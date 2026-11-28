import { verifyStoreApiAccess } from '../../../services/store_api_service';
import {
  SellerSepayConfigError,
  SellerSepayConfigRow,
  decryptSellerSepayToken,
  ensureSellerSepaySchema,
  fetchSepayBankAccounts,
} from '../../../services/seller_sepay_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  MARKETPLACE_CODE_KEY?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSellerSepaySchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Chỉ chủ gian hàng mới được kiểm tra kết nối SePay.' }),
        { status: storeAuth.status || 403, headers: CORS_HEADERS }
      );
    }
    const seller = storeAuth.seller;
    const body = (await request.json().catch(() => ({}))) as any;
    let tokenToUse = typeof body.api_token === 'string' ? body.api_token.trim() : '';

    if (!tokenToUse) {
      const cfg = await env.DB.prepare('SELECT api_token_encrypted FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
        .bind(seller.id)
        .first<Pick<SellerSepayConfigRow, 'api_token_encrypted'>>();
      if (!cfg?.api_token_encrypted) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Chưa có SePay API Token để kiểm tra. Vui lòng dán API Token từ my.sepay.vn hoặc sử dụng kết nối Webhook thuần túy.',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      tokenToUse = await decryptSellerSepayToken(cfg.api_token_encrypted, env.MARKETPLACE_CODE_KEY);
    }

    const result = await fetchSepayBankAccounts(tokenToUse);
    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error || 'Không thể kết nối SePay.', accounts: [] }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const nowIso = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE seller_sepay_configs
      SET connection_verified = 1, last_verified_at = ?, updated_at = ?
      WHERE seller_id = ?
    `)
      .bind(nowIso, nowIso, seller.id)
      .run()
      .catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: `Kết nối SePay thành công! Tìm thấy ${result.accounts.length} tài khoản ngân hàng.`,
        accounts: result.accounts,
        verified_at: nowIso,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof SellerSepayConfigError) {
      return new Response(
        JSON.stringify({ success: false, error: err.message, code: err.code }),
        { status: err.httpStatus, headers: CORS_HEADERS }
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi kiểm tra kết nối SePay.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
