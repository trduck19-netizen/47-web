import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyAdminAuth } from '../../../services/mission_service';
import {
  EXTERNAL_SUPPLIER_SAFE_SELECT,
  SupplierConfigError,
  encryptSupplierSecret,
  generateConnectorId,
  maskSecretPrefix,
  validateOutboundHttpsUrl,
  type SupplierAuthType,
  type SupplierMode,
  type MarkupType,
} from '../../../services/supplier_connector_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  MARKETPLACE_CODE_KEY?: string;
  ADMIN_API_KEY?: string;
  PINE_API_KEY?: string;
  MUSE_API_KEY?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key, X-Admin-Key, X-Sync-Key',
};

const VALID_MODES = new Set<SupplierMode>(['POSTPAID_CREDIT', 'AFFILIATE_POSTBACK', 'PREPAID_GUARD']);
const VALID_AUTH_TYPES = new Set<SupplierAuthType>(['BEARER', 'API_KEY_HEADER', 'BASIC', 'NONE']);
const VALID_MARKUP_TYPES = new Set<MarkupType>(['PERCENT', 'FIXED']);

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * GET /api/admin/suppliers
 * Liệt kê nhà cung cấp API ngoài (selective projection — tuyệt đối không trả cột mã hóa)
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const auth = await verifyAdminAuth(request, env as any, 'SUPPLIER_CONNECTORS_FULL');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền quản trị.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);

    const url = new URL(request.url);
    const modeFilter = (url.searchParams.get('mode') || '').trim().toUpperCase();
    const search = (url.searchParams.get('q') || '').trim().toLowerCase();

    let sql = `SELECT ${EXTERNAL_SUPPLIER_SAFE_SELECT} FROM external_suppliers WHERE 1=1`;
    const binds: any[] = [];
    if (modeFilter && VALID_MODES.has(modeFilter as SupplierMode)) {
      sql += ' AND mode = ?';
      binds.push(modeFilter);
    }
    if (search) {
      sql += ' AND (LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(base_url) LIKE ?)';
      const pat = `%${search}%`;
      binds.push(pat, pat, pat);
    }
    sql += ' ORDER BY created_at DESC LIMIT 200';

    const stmt = binds.length > 0 ? env.DB.prepare(sql).bind(...binds) : env.DB.prepare(sql);
    const rowsRes = await stmt.all<any>();
    const suppliers = rowsRes.results || [];

    const [prodStats, ledgerStats, webhookStats] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(*) AS total_products,
               SUM(CASE WHEN anti_loss_paused = 1 THEN 1 ELSE 0 END) AS paused_products
        FROM external_supplier_products
      `).first<any>().catch(() => ({ total_products: 0, paused_products: 0 })),
      env.DB.prepare(`
        SELECT COALESCE(SUM(profit_core), 0) AS total_profit_core,
               COUNT(*) AS total_entries
        FROM external_supplier_ledger
        WHERE status != 'REVERSED'
      `).first<any>().catch(() => ({ total_profit_core: 0, total_entries: 0 })),
      env.DB.prepare(`
        SELECT COUNT(*) AS total_webhooks,
               SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_webhooks
        FROM supplier_fulfillment_webhooks
      `).first<any>().catch(() => ({ total_webhooks: 0, active_webhooks: 0 })),
    ]);

    const summary = {
      total_suppliers: suppliers.length,
      active_suppliers: suppliers.filter((s: any) => Number(s.is_active) === 1).length,
      total_credit_limit_core: suppliers.reduce((acc: number, s: any) => acc + (Number(s.credit_limit_core) || 0), 0),
      total_credit_used_core: suppliers.reduce((acc: number, s: any) => acc + (Number(s.credit_used_core) || 0), 0),
      total_products: Number(prodStats?.total_products || 0),
      paused_products: Number(prodStats?.paused_products || 0),
      total_profit_core: Number(ledgerStats?.total_profit_core || 0),
      total_ledger_entries: Number(ledgerStats?.total_entries || 0),
      total_webhooks: Number(webhookStats?.total_webhooks || 0),
      active_webhooks: Number(webhookStats?.active_webhooks || 0),
    };

    return new Response(
      JSON.stringify({ success: true, suppliers, summary }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi tải danh sách nguồn hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * POST /api/admin/suppliers
 * Tạo mới cấu hình nguồn hàng API ngoài (SSRF HTTPS-only + AES-GCM Fail-Closed)
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const auth = await verifyAdminAuth(request, env as any, 'SUPPLIER_CONNECTORS_FULL');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền quản trị.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);
    const body = (await request.json().catch(() => ({}))) as any;

    const name = String(body.name || '').trim();
    const rawCode = String(body.code || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');
    const mode = String(body.mode || 'POSTPAID_CREDIT').trim().toUpperCase() as SupplierMode;
    const baseUrlRaw = String(body.base_url || '').trim();
    const authType = String(body.auth_type || 'BEARER').trim().toUpperCase() as SupplierAuthType;
    const authHeaderName = String(body.auth_header_name || 'Authorization').trim() || 'Authorization';
    const markupType = String(body.markup_type || 'PERCENT').trim().toUpperCase() as MarkupType;

    if (!name || !rawCode) {
      return new Response(
        JSON.stringify({ success: false, error: 'Vui lòng nhập tên (name) và mã định danh (code) nhà cung cấp.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
    if (!VALID_MODES.has(mode)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Chế độ (mode) không hợp lệ.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
    if (!VALID_AUTH_TYPES.has(authType)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Kiểu xác thực (auth_type) không hợp lệ.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
    if (!VALID_MARKUP_TYPES.has(markupType)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Kiểu biên lợi nhuận (markup_type) không hợp lệ.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const urlCheck = validateOutboundHttpsUrl(baseUrlRaw);
    if (!urlCheck.ok || !urlCheck.normalizedUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `URL không hợp lệ hoặc bị chặn SSRF (${urlCheck.reason || 'HTTPS_REQUIRED'}).`,
          reason: urlCheck.reason,
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const existing = await env.DB
      .prepare('SELECT id FROM external_suppliers WHERE code = ? LIMIT 1')
      .bind(rawCode)
      .first<any>();
    if (existing) {
      return new Response(
        JSON.stringify({ success: false, error: `Mã nguồn hàng '${rawCode}' đã tồn tại.` }),
        { status: 409, headers: CORS_HEADERS }
      );
    }

    let encryptedApiKey: string | null = null;
    let apiKeyPrefix: string | null = null;
    if (typeof body.api_key === 'string' && body.api_key.trim().length > 0) {
      encryptedApiKey = await encryptSupplierSecret(body.api_key.trim(), env);
      apiKeyPrefix = maskSecretPrefix(body.api_key.trim());
    }

    let encryptedWebhookSecret: string | null = null;
    let webhookSecretPrefix: string | null = null;
    if (typeof body.webhook_secret === 'string' && body.webhook_secret.trim().length > 0) {
      encryptedWebhookSecret = await encryptSupplierSecret(body.webhook_secret.trim(), env);
      webhookSecretPrefix = maskSecretPrefix(body.webhook_secret.trim());
    }

    const id = generateConnectorId('esup');
    const nowIso = new Date().toISOString();
    const fieldMappingJson =
      typeof body.field_mapping_json === 'string'
        ? body.field_mapping_json
        : body.field_mapping
          ? JSON.stringify(body.field_mapping)
          : null;

    await env.DB
      .prepare(`
        INSERT INTO external_suppliers (
          id, name, code, mode, base_url, auth_type, auth_header_name,
          encrypted_api_key, api_key_prefix, encrypted_webhook_secret, webhook_secret_prefix,
          catalog_path, order_path, balance_path, field_mapping_json,
          supports_idempotency, markup_type, markup_value, min_margin_core,
          credit_limit_core, credit_used_core, prepaid_balance_core, prepaid_min_balance,
          auto_pause_enabled, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        name,
        rawCode,
        mode,
        urlCheck.normalizedUrl.replace(/\/+$/, ''),
        authType,
        authHeaderName,
        encryptedApiKey,
        apiKeyPrefix,
        encryptedWebhookSecret,
        webhookSecretPrefix,
        body.catalog_path ? String(body.catalog_path).trim() : '/catalog',
        body.order_path ? String(body.order_path).trim() : '/orders',
        body.balance_path ? String(body.balance_path).trim() : '/balance',
        fieldMappingJson,
        body.supports_idempotency ? 1 : 0,
        markupType,
        Math.max(0, Number(body.markup_value ?? 15) || 0),
        Math.max(0, Number(body.min_margin_core ?? 0) || 0),
        Math.max(0, Number(body.credit_limit_core ?? 0) || 0),
        Math.max(0, Number(body.prepaid_balance_core ?? 0) || 0),
        Math.max(0, Number(body.prepaid_min_balance ?? 0) || 0),
        body.auto_pause_enabled === false || body.auto_pause_enabled === 0 ? 0 : 1,
        body.is_active === false || body.is_active === 0 ? 0 : 1,
        nowIso,
        nowIso
      )
      .run();

    const created = await env.DB
      .prepare(`SELECT ${EXTERNAL_SUPPLIER_SAFE_SELECT} FROM external_suppliers WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<any>();

    return new Response(
      JSON.stringify({ success: true, supplier: created }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof SupplierConfigError) {
      return new Response(
        JSON.stringify({ success: false, code: err.code, error: err.message }),
        { status: err.status, headers: CORS_HEADERS }
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi tạo nguồn hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
