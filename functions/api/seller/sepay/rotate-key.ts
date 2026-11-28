import { verifyStoreApiAccess } from '../../../services/store_api_service';
import {
  ensureSellerSepaySchema,
  generateSellerWebhookKey,
  hashSecretSha256,
  maskSecretPrefix,
} from '../../../services/seller_sepay_service';

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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSellerSepaySchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Chỉ chủ gian hàng mới được xoay khóa Webhook SePay.' }),
        { status: storeAuth.status || 403, headers: CORS_HEADERS }
      );
    }
    const seller = storeAuth.seller;
    const rawKey = generateSellerWebhookKey();
    const keyHash = await hashSecretSha256(rawKey);
    const keyPrefix = maskSecretPrefix(rawKey);
    const nowIso = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO seller_sepay_configs (
        seller_id, is_enabled, bank_name, account_number, account_holder, payment_prefix,
        webhook_key_hash, webhook_key_prefix, created_at, updated_at
      ) VALUES (?, 0, ?, ?, ?, 'SHP', ?, ?, ?, ?)
      ON CONFLICT(seller_id) DO UPDATE SET
        webhook_key_hash = excluded.webhook_key_hash,
        webhook_key_prefix = excluded.webhook_key_prefix,
        unauth_fail_count_1h = 0,
        unauth_fail_window_started_at = NULL,
        updated_at = excluded.updated_at
    `)
      .bind(
        seller.id,
        seller.bank_name || '',
        seller.bank_account || '',
        seller.bank_account_name || '',
        keyHash,
        keyPrefix,
        nowIso,
        nowIso
      )
      .run();

    const origin = new URL(request.url).origin;
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đã tạo mới khóa xác thực Webhook SePay. Vui lòng sao chép ngay — khóa chỉ hiển thị duy nhất 1 lần.',
        one_time_webhook_key: rawKey,
        webhook_key_prefix: keyPrefix,
        webhook_url: `${origin}/api/webhooks/sepay/seller/${seller.id}`,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi xoay khóa Webhook SePay.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
