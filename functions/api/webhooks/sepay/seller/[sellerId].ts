import {
  SEPAY_WEBHOOK_FAIL_LIMIT_1H,
  SellerSepayConfigRow,
  ensureSellerSepaySchema,
  evaluateSepayWebhookRateLimit,
  hashSecretSha256,
  settleDirectSepayTransfer,
  timingSafeEqualStr,
} from '../../../../services/seller_sepay_service';

interface Env {
  DB: D1Database;
  MARKETPLACE_CODE_KEY?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Apikey, apikey, x-api-key, X-Api-Key, X-Sepay-Key',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, env } = context;
  const sellerId = String(params?.sellerId || '').trim();
  if (!sellerId || !env.DB) {
    return new Response(
      JSON.stringify({ success: false, error: 'Thiếu sellerId hoặc D1 chưa sẵn sàng.' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }
  await ensureSellerSepaySchema(env.DB);
  const cfg = await env.DB.prepare(
    'SELECT seller_id, is_enabled, admin_locked, webhook_key_hash FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1'
  )
    .bind(sellerId)
    .first<Pick<SellerSepayConfigRow, 'seller_id' | 'is_enabled' | 'admin_locked' | 'webhook_key_hash'>>();

  return new Response(
    JSON.stringify({
      success: true,
      status: 'ONLINE',
      endpoint: 'Seller Direct SePay Webhook Receiver (DIRECT_SEPAY)',
      seller_id: sellerId,
      configured: Boolean(cfg && cfg.webhook_key_hash),
      is_enabled: Boolean(cfg && Number(cfg.is_enabled) === 1),
      admin_locked: Boolean(cfg && Number(cfg.admin_locked) === 1),
      timestamp: new Date().toISOString(),
    }),
    { status: 200, headers: CORS_HEADERS }
  );
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { params, request, env } = context;
  const sellerId = String(params?.sellerId || '').trim();

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: 'Database Cloudflare D1 chưa sẵn sàng.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }
    if (!sellerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Thiếu mã định danh gian hàng (sellerId).' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    await ensureSellerSepaySchema(env.DB);

    const cfg = await env.DB.prepare('SELECT * FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
      .bind(sellerId)
      .first<SellerSepayConfigRow>();

    if (!cfg || !cfg.webhook_key_hash) {
      return new Response(
        JSON.stringify({ success: false, error: 'Gian hàng chưa khởi tạo cấu hình Webhook SePay riêng.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (Number(cfg.admin_locked) === 1) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cổng SePay riêng của gian hàng đang bị Quản trị viên tạm khóa.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const rateLimit = evaluateSepayWebhookRateLimit(cfg);
    if (rateLimit.blocked) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'RATE_LIMITED',
          retry_after_seconds: rateLimit.retryAfterSeconds,
          error: `Quá giới hạn ${SEPAY_WEBHOOK_FAIL_LIMIT_1H} lần xác thực sai trong 1 giờ. Vui lòng thử lại sau ${rateLimit.retryAfterSeconds} giây hoặc xoay khóa Webhook mới.`,
          seller_id: sellerId,
        }),
        {
          status: 429,
          headers: {
            ...CORS_HEADERS,
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    let payload: any = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const transactionId = String(
      payload.id || payload.transactionId || payload.transaction_id || payload.referenceCode || payload.code || ''
    ).trim();
    const amount = Math.round(
      Number(payload.transferAmount || payload.transfer_amount || payload.amount || payload.amount_in || 0)
    );
    const content = String(
      payload.content || payload.transaction_content || payload.description || payload.memo || ''
    ).trim();
    const gateway = String(payload.gateway || payload.bank_brand_name || payload.bank || cfg.bank_name || 'SePay').trim();
    const accountNumber = String(
      payload.accountNumber || payload.account_number || payload.subAccount || payload.sub_account || ''
    ).trim();
    const transferType = String(payload.transferType || payload.transfer_type || 'in').toLowerCase();

    const url = new URL(request.url);
    const incomingApiKey = (
      request.headers.get('Authorization') ||
      request.headers.get('apikey') ||
      request.headers.get('Apikey') ||
      request.headers.get('x-api-key') ||
      request.headers.get('X-Api-Key') ||
      request.headers.get('x-sepay-key') ||
      request.headers.get('x-webhook-secret') ||
      url.searchParams.get('api_key') ||
      url.searchParams.get('apiKey') ||
      url.searchParams.get('key') ||
      payload?.apiKey ||
      payload?.api_key ||
      ''
    )
      .trim()
      .replace(/^Bearer\s+/i, '')
      .replace(/^Apikey\s+/i, '')
      .trim();

    const incomingHash = incomingApiKey ? await hashSecretSha256(incomingApiKey) : '';
    const isAuthorized = Boolean(incomingHash && timingSafeEqualStr(incomingHash, cfg.webhook_key_hash));

    if (!isAuthorized) {
      const nowIso = new Date().toISOString();
      if (transactionId) {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO seller_sepay_transactions (
            id, seller_id, sepay_tx_id, gateway, account_number, amount_in, transaction_content,
            status, exception_code, seller_resolution_note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'UNAUTHORIZED', 'UNAUTHORIZED', ?, ?)
        `)
          .bind(
            `ssptx_unauth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            sellerId,
            transactionId,
            gateway,
            accountNumber,
            amount,
            content,
            'Sai hoặc thiếu khóa xác thực Webhook SePay của gian hàng.',
            nowIso
          )
          .run()
          .catch(() => {});
      }
      if (!rateLimit.windowActive || Number(cfg.unauth_fail_count_1h || 0) <= 0) {
        await env.DB.prepare(`
          UPDATE seller_sepay_configs
          SET unauth_fail_count_1h = 1,
              unauth_fail_window_started_at = ?,
              updated_at = ?
          WHERE seller_id = ?
        `)
          .bind(nowIso, nowIso, sellerId)
          .run()
          .catch(() => {});
      } else {
        await env.DB.prepare(`
          UPDATE seller_sepay_configs
          SET unauth_fail_count_1h = unauth_fail_count_1h + 1,
              updated_at = ?
          WHERE seller_id = ?
        `)
          .bind(nowIso, sellerId)
          .run()
          .catch(() => {});
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized: Khóa xác thực Webhook SePay của gian hàng không hợp lệ.',
          seller_id: sellerId,
        }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    if (Number(cfg.unauth_fail_count_1h || 0) > 0 || cfg.unauth_fail_window_started_at) {
      await env.DB.prepare(`
        UPDATE seller_sepay_configs
        SET unauth_fail_count_1h = 0,
            unauth_fail_window_started_at = NULL,
            updated_at = ?
        WHERE seller_id = ?
      `)
        .bind(new Date().toISOString(), sellerId)
        .run()
        .catch(() => {});
    }

    if (transferType !== 'in' || amount <= 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Bỏ qua giao dịch tiền ra hoặc số tiền <= 0.' }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    if (!transactionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Thiếu mã định danh giao dịch (transaction_id).' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const result = await settleDirectSepayTransfer(env.DB, env, cfg, {
      sellerId,
      sepayTxId: transactionId,
      gateway,
      accountNumber,
      amount,
      content,
      source: 'webhook',
    });

    return new Response(JSON.stringify(result), { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    console.error('[Seller SePay Webhook error]', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi xử lý Webhook SePay gian hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
