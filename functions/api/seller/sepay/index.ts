import { verifyStoreApiAccess } from '../../../services/store_api_service';
import { getMarketplaceConfig } from '../../../services/marketplace_service';
import {
  SellerSepayConfigError,
  SellerSepayConfigRow,
  encryptSellerSepayToken,
  ensureSellerSepaySchema,
  generateSellerWebhookKey,
  hashSecretSha256,
  maskSecretPrefix,
  normalizeAccountNumber,
  normalizePaymentPrefix,
} from '../../../services/seller_sepay_service';
import { invalidateCatalogEdgeCache } from '../../../services/cache_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  MARKETPLACE_CODE_KEY?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

function buildSafeConfigPayload(
  seller: any,
  cfg: SellerSepayConfigRow | null,
  origin: string,
  mConfig: any,
  ownerCoreBalance: number,
  affiliateMinWholesale: number
) {
  const webhookUrl = `${origin}/api/webhooks/sepay/seller/${seller.id}`;
  return {
    seller_id: seller.id,
    seller_name: seller.name,
    seller_status: seller.status,
    webhook_url: webhookUrl,
    is_enabled: Boolean(cfg && Number(cfg.is_enabled) === 1),
    admin_locked: Boolean(cfg && Number(cfg.admin_locked) === 1),
    admin_lock_reason: cfg?.admin_lock_reason || null,
    bank_name: cfg?.bank_name || seller.bank_name || '',
    account_number: cfg?.account_number || seller.bank_account || '',
    account_holder: cfg?.account_holder || seller.bank_account_name || '',
    payment_prefix: cfg?.payment_prefix || 'SHP',
    has_webhook_key: Boolean(cfg?.webhook_key_hash),
    webhook_key_prefix: cfg?.webhook_key_prefix || null,
    has_api_token: Boolean(cfg?.api_token_encrypted),
    api_token_prefix: cfg?.api_token_prefix || null,
    connection_verified: Boolean(cfg && Number(cfg.connection_verified) === 1),
    last_verified_at: cfg?.last_verified_at || null,
    last_webhook_at: cfg?.last_webhook_at || null,
    fee_debt_core: Number(cfg?.fee_debt_core || 0),
    total_direct_orders: Number(cfg?.total_direct_orders || 0),
    total_direct_volume_vnd: Number(cfg?.total_direct_volume_vnd || 0),
    policy: {
      direct_sepay_global_enabled: Boolean(mConfig.direct_sepay_global_enabled),
      direct_sepay_fee_pct: Number(mConfig.direct_sepay_fee_pct || 0),
      direct_sepay_debt_limit_core: Number(mConfig.direct_sepay_debt_limit_core || 0),
    },
    owner_core_balance: ownerCoreBalance,
    affiliate_min_wholesale_core: affiliateMinWholesale,
    affiliate_wholesale_warning: affiliateMinWholesale > 0 && ownerCoreBalance < affiliateMinWholesale,
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSellerSepaySchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Chỉ chủ gian hàng mới được xem cấu hình SePay riêng.' }),
        { status: storeAuth.status || 403, headers: CORS_HEADERS }
      );
    }
    const seller = storeAuth.seller;
    const [cfg, mConfig, ownerRow, affRow] = await Promise.all([
      env.DB.prepare('SELECT * FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
        .bind(seller.id)
        .first<SellerSepayConfigRow>(),
      getMarketplaceConfig(env.DB),
      env.DB.prepare('SELECT COALESCE(balance, 0) as balance FROM members WHERE id = ? LIMIT 1')
        .bind(seller.owner_member_id)
        .first<{ balance: number }>(),
      env.DB.prepare(`
        SELECT MAX(ROUND(orig.price_core * (1 - COALESCE(orig.resell_discount_pct, 0) / 100.0) * (1 - COALESCE(orig.resell_commission_pct, 0) / 100.0))) as max_wholesale
        FROM seller_products sp
        JOIN seller_products orig ON sp.origin_product_id = orig.id
        WHERE sp.seller_id = ? AND sp.is_affiliate = 1 AND sp.status = 'APPROVED' AND sp.deleted_at IS NULL
      `)
        .bind(seller.id)
        .first<{ max_wholesale: number }>()
        .catch(() => ({ max_wholesale: 0 })),
    ]);

    const origin = new URL(request.url).origin;
    return new Response(
      JSON.stringify({
        success: true,
        config: buildSafeConfigPayload(
          seller,
          cfg || null,
          origin,
          mConfig,
          Number(ownerRow?.balance || 0),
          Math.max(0, Number(affRow?.max_wholesale || 0))
        ),
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi tải cấu hình SePay gian hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSellerSepaySchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Chỉ chủ gian hàng mới được cập nhật cấu hình SePay riêng.' }),
        { status: storeAuth.status || 403, headers: CORS_HEADERS }
      );
    }
    const seller = storeAuth.seller;
    if (seller.status !== 'ACTIVE' && seller.status !== 'TRIAL') {
      return new Response(
        JSON.stringify({ success: false, error: 'Gian hàng cần ở trạng thái đang hoạt động (TRIAL hoặc ACTIVE) để cấu hình SePay riêng.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const existing = await env.DB.prepare('SELECT * FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
      .bind(seller.id)
      .first<SellerSepayConfigRow>();

    if (existing && Number(existing.admin_locked) === 1 && body.is_enabled === true) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Cổng SePay riêng của gian hàng đang bị Quản trị viên tạm khóa${existing.admin_lock_reason ? `: ${existing.admin_lock_reason}` : ''}.`,
          code: 'ADMIN_LOCKED',
        }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const bankName = String(body.bank_name ?? existing?.bank_name ?? seller.bank_name ?? '').trim();
    const accountNumber = normalizeAccountNumber(body.account_number ?? existing?.account_number ?? seller.bank_account ?? '');
    const accountHolder = String(body.account_holder ?? existing?.account_holder ?? seller.bank_account_name ?? '').trim().toUpperCase();
    const paymentPrefix = normalizePaymentPrefix(body.payment_prefix ?? existing?.payment_prefix ?? 'SHP');
    const isEnabled = body.is_enabled !== undefined ? (body.is_enabled ? 1 : 0) : (existing ? Number(existing.is_enabled) : 0);

    if (isEnabled === 1 && (!bankName || !accountNumber || !accountHolder)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Vui lòng điền đầy đủ Ngân hàng, Số tài khoản và Tên chủ tài khoản trước khi bật SePay riêng.',
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Check bank_name + account_number uniqueness across sellers
    if (bankName && accountNumber) {
      const conflict = await env.DB.prepare(
        'SELECT seller_id FROM seller_sepay_configs WHERE UPPER(bank_name) = UPPER(?) AND account_number = ? AND seller_id != ? LIMIT 1'
      )
        .bind(bankName, accountNumber, seller.id)
        .first<{ seller_id: string }>();
      if (conflict) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Số tài khoản ngân hàng này đã được liên kết SePay ở một gian hàng khác.',
            code: 'BANK_ACCOUNT_CONFLICT',
          }),
          { status: 409, headers: CORS_HEADERS }
        );
      }
    }

    // Auto-generate webhook key once if missing
    let oneTimeWebhookKey: string | null = null;
    let webhookKeyHash = existing?.webhook_key_hash || null;
    let webhookKeyPrefix = existing?.webhook_key_prefix || null;
    if (!webhookKeyHash) {
      oneTimeWebhookKey = generateSellerWebhookKey();
      webhookKeyHash = await hashSecretSha256(oneTimeWebhookKey);
      webhookKeyPrefix = maskSecretPrefix(oneTimeWebhookKey);
    }

    // Optional SePay API Token (Fail-Closed AES-256-GCM encryption via MARKETPLACE_CODE_KEY)
    let apiTokenEncrypted = existing?.api_token_encrypted || null;
    let apiTokenPrefix = existing?.api_token_prefix || null;
    if (body.clear_api_token === true) {
      apiTokenEncrypted = null;
      apiTokenPrefix = null;
    } else if (typeof body.api_token === 'string' && body.api_token.trim().length > 0) {
      const rawToken = body.api_token.trim();
      apiTokenEncrypted = await encryptSellerSepayToken(rawToken, env.MARKETPLACE_CODE_KEY);
      apiTokenPrefix = maskSecretPrefix(rawToken);
    }

    const nowIso = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO seller_sepay_configs (
        seller_id, is_enabled, bank_name, account_number, account_holder, payment_prefix,
        webhook_key_hash, webhook_key_prefix, api_token_encrypted, api_token_prefix,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(seller_id) DO UPDATE SET
        is_enabled = excluded.is_enabled,
        bank_name = excluded.bank_name,
        account_number = excluded.account_number,
        account_holder = excluded.account_holder,
        payment_prefix = excluded.payment_prefix,
        webhook_key_hash = excluded.webhook_key_hash,
        webhook_key_prefix = excluded.webhook_key_prefix,
        api_token_encrypted = excluded.api_token_encrypted,
        api_token_prefix = excluded.api_token_prefix,
        updated_at = excluded.updated_at
    `)
      .bind(
        seller.id,
        isEnabled,
        bankName,
        accountNumber,
        accountHolder,
        paymentPrefix,
        webhookKeyHash,
        webhookKeyPrefix,
        apiTokenEncrypted,
        apiTokenPrefix,
        nowIso,
        nowIso
      )
      .run();

    await invalidateCatalogEdgeCache(context as any, request, env as any).catch(() => {});

    const updated = await env.DB.prepare('SELECT * FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
      .bind(seller.id)
      .first<SellerSepayConfigRow>();
    const [mConfig, ownerRow] = await Promise.all([
      getMarketplaceConfig(env.DB),
      env.DB.prepare('SELECT COALESCE(balance, 0) as balance FROM members WHERE id = ? LIMIT 1')
        .bind(seller.owner_member_id)
        .first<{ balance: number }>(),
    ]);
    const origin = new URL(request.url).origin;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đã lưu cấu hình Cổng SePay riêng cho gian hàng thành công.',
        config: buildSafeConfigPayload(seller, updated || null, origin, mConfig, Number(ownerRow?.balance || 0), 0),
        ...(oneTimeWebhookKey ? { one_time_webhook_key: oneTimeWebhookKey } : {}),
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
      JSON.stringify({ success: false, error: err?.message || 'Lỗi lưu cấu hình SePay gian hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
