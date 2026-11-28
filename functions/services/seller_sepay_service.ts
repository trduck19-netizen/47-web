/**
 * Seller Direct SePay Gateway Service (DIRECT_SEPAY)
 * - Rule 10.2 Fail-Closed AES-256-GCM encryption for optional Seller SePay API Token
 * - Rule 10.1 SHA-256 hashing + constant-time verification for Seller Webhook Key
 * - Zero platform treasury minting on DIRECT_SEPAY orders
 * - Atomic wholesale settlement for Inter-Shop Affiliate DIRECT_SEPAY orders (0% default platform fee)
 */
import {
  decryptCode,
  getMarketplaceConfig,
  MarketplaceConfig,
  recordLedgerTransaction,
} from './marketplace_service';
import { checkAndExpireSellerOrdersD1, ensureMarketplaceSchema } from './d1_service';
import { dispatchSupplierFulfillmentWebhook } from './supplier_connector_service';

export class SellerSepayConfigError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus = 500) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface SellerSepayConfigRow {
  seller_id: string;
  is_enabled: number;
  admin_locked: number;
  admin_lock_reason?: string | null;
  bank_name: string;
  account_number: string;
  account_holder: string;
  payment_prefix: string;
  webhook_key_hash?: string | null;
  webhook_key_prefix?: string | null;
  api_token_encrypted?: string | null;
  api_token_prefix?: string | null;
  connection_verified: number;
  last_verified_at?: string | null;
  last_webhook_at?: string | null;
  unauth_fail_count_1h: number;
  unauth_fail_window_started_at?: string | null;
  fee_debt_core: number;
  total_direct_orders: number;
  total_direct_volume_vnd: number;
  created_at?: string;
  updated_at?: string;
}

export const SEPAY_WEBHOOK_FAIL_LIMIT_1H = 10;
export const SEPAY_WEBHOOK_FAIL_WINDOW_MS = 3600 * 1000;

export function evaluateSepayWebhookRateLimit(
  cfg: Pick<SellerSepayConfigRow, 'unauth_fail_count_1h' | 'unauth_fail_window_started_at' | 'updated_at'>,
  nowMs = Date.now()
): {
  blocked: boolean;
  retryAfterSeconds: number;
  windowActive: boolean;
} {
  const count = Number(cfg.unauth_fail_count_1h || 0);
  const windowIso = cfg.unauth_fail_window_started_at || cfg.updated_at || '';
  const windowStartMs = windowIso ? Date.parse(windowIso) : NaN;
  const windowActive = Number.isFinite(windowStartMs) && nowMs - windowStartMs < SEPAY_WEBHOOK_FAIL_WINDOW_MS;
  if (!windowActive || count < SEPAY_WEBHOOK_FAIL_LIMIT_1H) {
    return { blocked: false, retryAfterSeconds: 0, windowActive };
  }
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStartMs + SEPAY_WEBHOOK_FAIL_WINDOW_MS - nowMs) / 1000)
  );
  return { blocked: true, retryAfterSeconds, windowActive: true };
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 || b.length === 0) return false;
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    diff |= aBuf[i] ^ bBuf[i];
  }
  return diff === 0;
}

export async function hashSecretSha256(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function maskSecretPrefix(raw: string): string {
  const clean = (raw || '').trim();
  if (!clean) return '';
  if (clean.length <= 10) {
    return `${clean.slice(0, 3)}••••${clean.slice(-2)}`;
  }
  if (clean.startsWith('wcg_shp_whk_')) {
    return `${clean.slice(0, 16)}••••••••••••${clean.slice(-4)}`;
  }
  return `${clean.slice(0, 6)}••••••••${clean.slice(-4)}`;
}

export function generateSellerWebhookKey(): string {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new SellerSepayConfigError('CRYPTO_UNAVAILABLE', 'WebCrypto API is required to generate webhook secret.', 500);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `wcg_shp_whk_${hex}`;
}

async function importFailClosedAesKey(secretKeyStr?: string): Promise<CryptoKey> {
  const cleanKey = (secretKeyStr || '').trim();
  if (cleanKey.length < 16) {
    throw new SellerSepayConfigError(
      'SERVER_MISCONFIGURED',
      'Thiếu biến môi trường MARKETPLACE_CODE_KEY (>= 16 ký tự) để mã hóa bảo mật SePay API Token (Fail-Closed).',
      503
    );
  }
  const rawHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cleanKey));
  return crypto.subtle.importKey('raw', rawHash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSellerSepayToken(plainToken: string, secretKeyStr?: string): Promise<string> {
  const clean = (plainToken || '').trim();
  if (!clean) {
    throw new SellerSepayConfigError('INVALID_TOKEN', 'SePay API Token không được để trống.', 400);
  }
  const key = await importFailClosedAesKey(secretKeyStr);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(clean)
  );
  const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');
  const cipherHex = Array.from(new Uint8Array(encrypted))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `enc_sep_v1:${ivHex}:${cipherHex}`;
}

export async function decryptSellerSepayToken(cipherText: string, secretKeyStr?: string): Promise<string> {
  if (!cipherText || !cipherText.startsWith('enc_sep_v1:')) {
    throw new SellerSepayConfigError('INVALID_CIPHERTEXT', 'Định dạng token mã hóa không hợp lệ.', 400);
  }
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    throw new SellerSepayConfigError('INVALID_CIPHERTEXT', 'Cấu trúc mã hóa enc_sep_v1 không hợp lệ.', 400);
  }
  const ivMatches = parts[1].match(/.{1,2}/g);
  const cipherMatches = parts[2].match(/.{1,2}/g);
  if (!ivMatches || !cipherMatches) {
    throw new SellerSepayConfigError('INVALID_CIPHERTEXT', 'Dữ liệu hex mã hóa bị hỏng.', 400);
  }
  const key = await importFailClosedAesKey(secretKeyStr);
  const iv = new Uint8Array(ivMatches.map((h) => parseInt(h, 16)));
  const cipherBytes = new Uint8Array(cipherMatches.map((h) => parseInt(h, 16)));
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
  return new TextDecoder().decode(plainBuf);
}

export async function ensureSellerSepaySchema(db: D1Database): Promise<void> {
  await ensureMarketplaceSchema(db);
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS seller_sepay_configs (
        seller_id TEXT PRIMARY KEY,
        is_enabled INTEGER NOT NULL DEFAULT 0,
        admin_locked INTEGER NOT NULL DEFAULT 0,
        admin_lock_reason TEXT DEFAULT NULL,
        bank_name TEXT NOT NULL DEFAULT '',
        account_number TEXT NOT NULL DEFAULT '',
        account_holder TEXT NOT NULL DEFAULT '',
        payment_prefix TEXT NOT NULL DEFAULT 'SHP',
        webhook_key_hash TEXT DEFAULT NULL,
        webhook_key_prefix TEXT DEFAULT NULL,
        api_token_encrypted TEXT DEFAULT NULL,
        api_token_prefix TEXT DEFAULT NULL,
        connection_verified INTEGER NOT NULL DEFAULT 0,
        last_verified_at TEXT DEFAULT NULL,
        last_webhook_at TEXT DEFAULT NULL,
        unauth_fail_count_1h INTEGER NOT NULL DEFAULT 0,
        unauth_fail_window_started_at TEXT DEFAULT NULL,
        fee_debt_core REAL NOT NULL DEFAULT 0,
        total_direct_orders INTEGER NOT NULL DEFAULT 0,
        total_direct_volume_vnd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
    .run()
    .catch(() => {});

  await db
    .prepare('ALTER TABLE seller_sepay_configs ADD COLUMN unauth_fail_window_started_at TEXT DEFAULT NULL;')
    .run()
    .catch(() => {});

  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS seller_sepay_transactions (
        id TEXT PRIMARY KEY,
        seller_id TEXT NOT NULL,
        sepay_tx_id TEXT NOT NULL,
        gateway TEXT NOT NULL DEFAULT '',
        account_number TEXT NOT NULL DEFAULT '',
        amount_in REAL NOT NULL DEFAULT 0,
        transaction_content TEXT NOT NULL DEFAULT '',
        matched_parent_order_id TEXT DEFAULT NULL,
        matched_order_id TEXT DEFAULT NULL,
        buyer_member_id TEXT DEFAULT NULL,
        status TEXT NOT NULL DEFAULT 'SUCCESS',
        exception_code TEXT DEFAULT NULL,
        fee_charged_core REAL NOT NULL DEFAULT 0,
        seller_resolution_note TEXT DEFAULT NULL,
        resolved_at TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(seller_id, sepay_tx_id)
      );
    `)
    .run()
    .catch(() => {});
}

export function normalizePaymentPrefix(raw?: string): string {
  const clean = String(raw || 'SHP')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  return clean.length >= 2 ? clean : 'SHP';
}

export function normalizeAccountNumber(raw?: string): string {
  return String(raw || '').replace(/\s+/g, '').trim();
}

export function generateShopQrGroupCode(nowMs = Date.now()): string {
  const bytes = new Uint8Array(3);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Math.floor(Math.random() * 255);
    bytes[1] = Math.floor(Math.random() * 255);
    bytes[2] = Math.floor(Math.random() * 255);
  }
  const suffix = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `SHP-QR-${String(nowMs).slice(-6)}-${suffix}`;
}

export function evaluateSellerQrEligibility(params: {
  sepayConfig?: SellerSepayConfigRow | null;
  marketplaceConfig: MarketplaceConfig;
  isAffiliate?: boolean;
  wholesaleNeededCore?: number;
  sellerOwnerCoreBalance?: number;
}): {
  eligible: boolean;
  reason?: string;
  wholesaleReserveCore: number;
} {
  const { sepayConfig, marketplaceConfig, isAffiliate, wholesaleNeededCore = 0, sellerOwnerCoreBalance = 0 } = params;
  if (!marketplaceConfig.direct_sepay_global_enabled) {
    return { eligible: false, reason: 'GLOBAL_DIRECT_SEPAY_DISABLED', wholesaleReserveCore: 0 };
  }
  if (!sepayConfig || Number(sepayConfig.is_enabled) !== 1) {
    return { eligible: false, reason: 'SELLER_SEPAY_NOT_ENABLED', wholesaleReserveCore: 0 };
  }
  if (Number(sepayConfig.admin_locked) === 1) {
    return { eligible: false, reason: 'SELLER_SEPAY_ADMIN_LOCKED', wholesaleReserveCore: 0 };
  }
  if (!sepayConfig.webhook_key_hash || !String(sepayConfig.bank_name || '').trim() || !String(sepayConfig.account_number || '').trim()) {
    return { eligible: false, reason: 'SELLER_SEPAY_INCOMPLETE_CONFIG', wholesaleReserveCore: 0 };
  }
  const debtLimit = Number(marketplaceConfig.direct_sepay_debt_limit_core || 0);
  const currentDebt = Number(sepayConfig.fee_debt_core || 0);
  if (debtLimit > 0 && currentDebt >= debtLimit) {
    return { eligible: false, reason: 'SELLER_FEE_DEBT_LIMIT_REACHED', wholesaleReserveCore: 0 };
  }
  if (isAffiliate) {
    const needed = Math.max(0, Math.round(Number(wholesaleNeededCore) || 0));
    if (needed > 0 && Number(sellerOwnerCoreBalance || 0) < needed) {
      return { eligible: false, reason: 'AFFILIATE_WHOLESALE_CORE_INSUFFICIENT', wholesaleReserveCore: needed };
    }
    return { eligible: true, wholesaleReserveCore: needed };
  }
  return { eligible: true, wholesaleReserveCore: 0 };
}

export async function fetchSepayBankAccounts(
  apiToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<{
  success: boolean;
  accounts: Array<{
    id: string;
    bank_brand_name: string;
    account_number: string;
    account_holder_name: string;
    label?: string;
  }>;
  error?: string;
  httpStatus?: number;
}> {
  const clean = (apiToken || '').trim();
  if (!clean) {
    return { success: false, accounts: [], error: 'Thiếu SePay API Token.' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetchImpl('https://my.sepay.vn/userapi/bankaccounts/list', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${clean}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      return {
        success: false,
        accounts: [],
        httpStatus: res.status,
        error: `SePay từ chối kết nối (HTTP ${res.status}). Vui lòng kiểm tra lại API Token.`,
      };
    }
    const json: any = await res.json().catch(() => ({}));
    const rawList = Array.isArray(json?.bankaccounts)
      ? json.bankaccounts
      : Array.isArray(json?.data)
        ? json.data
        : [];
    const accounts = rawList.map((a: any) => ({
      id: String(a.id || ''),
      bank_brand_name: String(a.bank_brand_name || a.bank_short_name || a.bank_name || '').trim(),
      account_number: String(a.account_number || '').trim(),
      account_holder_name: String(a.account_holder_name || a.account_name || '').trim(),
      label: String(a.label || '').trim(),
    }));
    return { success: true, accounts, httpStatus: res.status };
  } catch (err: any) {
    return {
      success: false,
      accounts: [],
      error: err?.name === 'AbortError' ? 'Hết thời gian kết nối tới SePay (8 giây).' : (err?.message || 'Lỗi kết nối tới SePay.'),
    };
  }
}

export async function fetchSepayRecentTransactions(
  apiToken: string,
  accountNumber?: string,
  limit = 20,
  fetchImpl: typeof fetch = fetch
): Promise<{
  success: boolean;
  transactions: Array<{
    id: string;
    gateway: string;
    accountNumber: string;
    transferAmount: number;
    transferType: string;
    content: string;
  }>;
  error?: string;
}> {
  const clean = (apiToken || '').trim();
  if (!clean) return { success: false, transactions: [], error: 'Missing API Token' };
  try {
    const qs = new URLSearchParams({ limit: String(Math.min(50, Math.max(1, limit))) });
    if (accountNumber && accountNumber.trim()) {
      qs.set('account_number', accountNumber.trim());
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetchImpl(`https://my.sepay.vn/userapi/transactions/list?${qs.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${clean}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      return { success: false, transactions: [], error: `SePay HTTP ${res.status}` };
    }
    const json: any = await res.json().catch(() => ({}));
    const rawList = Array.isArray(json?.transactions)
      ? json.transactions
      : Array.isArray(json?.data)
        ? json.data
        : [];
    const transactions = rawList.map((tx: any) => ({
      id: String(tx.id || tx.reference_number || '').trim(),
      gateway: String(tx.bank_brand_name || tx.gateway || 'SePay-API').trim(),
      accountNumber: String(tx.account_number || tx.sub_account || '').trim(),
      transferAmount: Math.round(Number(tx.amount_in || tx.transferAmount || 0)),
      transferType: Number(tx.amount_in || 0) > 0 ? 'in' : String(tx.transferType || 'out').toLowerCase(),
      content: String(tx.transaction_content || tx.content || '').trim(),
    }));
    return { success: true, transactions };
  } catch (err: any) {
    return { success: false, transactions: [], error: err?.message || 'SePay fetch failed' };
  }
}

export interface DirectSepayTransferInput {
  sellerId: string;
  sepayTxId: string;
  gateway: string;
  accountNumber: string;
  amount: number;
  content: string;
  source?: 'webhook' | 'api_poll';
}

export interface DirectSepaySettleResult {
  success: boolean;
  status:
    | 'COMPLETED'
    | 'DUPLICATE_IDEMPOTENT'
    | 'DUPLICATE_PAYMENT'
    | 'EXPIRED_PAYMENT'
    | 'UNDERPAID'
    | 'UNMATCHED'
    | 'ACCOUNT_MISMATCH'
    | 'PENDING_MANUAL_CODE';
  message: string;
  sepayTxId: string;
  matchedOrderIds?: string[];
  deliveredCodes?: Array<{ orderId: string; orderCode: string; deliveredCode: string | null; productType: string }>;
  feeChargedCore?: number;
}

/**
 * Shared atomic settlement engine for a Seller's own DIRECT_SEPAY incoming bank transfer.
 * Guarantees:
 * - Zero platform Core minting for the selling shop (payment_channel = 'DIRECT_SEPAY')
 * - Optional postpaid fee recording into seller_sepay_configs.fee_debt_core (default 0%)
 * - Affiliate wholesale transfer to Supplier Shop B backed 100% by pre-reserved real Core from Shop A owner
 * - Full exception recording into seller_sepay_transactions for Seller self-resolution
 */
export async function settleDirectSepayTransfer(
  db: D1Database,
  env: { MARKETPLACE_CODE_KEY?: string; [k: string]: any },
  config: SellerSepayConfigRow,
  input: DirectSepayTransferInput
): Promise<DirectSepaySettleResult> {
  const { sellerId, sepayTxId, gateway, accountNumber, amount, content } = input;
  const nowIso = new Date().toISOString();

  // 1. Idempotency check
  const existingTx = await db
    .prepare('SELECT id, status FROM seller_sepay_transactions WHERE seller_id = ? AND sepay_tx_id = ? LIMIT 1')
    .bind(sellerId, sepayTxId)
    .first<{ id: string; status: string }>();

  if (existingTx && (existingTx.status === 'SUCCESS' || existingTx.status === 'RESOLVED_DELIVERED')) {
    return {
      success: true,
      status: 'DUPLICATE_IDEMPOTENT',
      message: `Giao dịch ${sepayTxId} đã được xử lý trước đó cho gian hàng ${sellerId}.`,
      sepayTxId,
    };
  }

  // 2. Verify incoming bank account matches seller's configured account when provided
  const cfgAccNorm = normalizeAccountNumber(config.account_number).replace(/[^0-9A-Za-z]/g, '');
  const inAccNorm = normalizeAccountNumber(accountNumber).replace(/[^0-9A-Za-z]/g, '');
  if (cfgAccNorm && inAccNorm && cfgAccNorm !== inAccNorm && !inAccNorm.endsWith(cfgAccNorm) && !cfgAccNorm.endsWith(inAccNorm)) {
    const txRowId = existingTx?.id || `ssptx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await db
      .prepare(`
        INSERT OR REPLACE INTO seller_sepay_transactions (
          id, seller_id, sepay_tx_id, gateway, account_number, amount_in, transaction_content,
          status, exception_code, seller_resolution_note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', 'ACCOUNT_MISMATCH', ?, ?)
      `)
      .bind(
        txRowId,
        sellerId,
        sepayTxId,
        gateway,
        accountNumber,
        amount,
        content,
        `STK nhận (${accountNumber}) không khớp STK cấu hình của shop (${config.account_number}).`,
        nowIso
      )
      .run()
      .catch(() => {});

    return {
      success: true,
      status: 'ACCOUNT_MISMATCH',
      message: `Số tài khoản nhận (${accountNumber}) không khớp với tài khoản đã cấu hình của gian hàng.`,
      sepayTxId,
    };
  }

  // 3. Parse Shop Group Code (SHP-QR-...) or individual Child Order Code (ORD-QR-S-...)
  const cleanContent = content.replace(/\u00a0/g, ' ').trim();
  const groupMatch = cleanContent.match(/\b(SHP-QR-[A-Za-z0-9_-]+)\b/i);
  const childMatch = cleanContent.match(/\b(ORD-QR-S-[A-Za-z0-9_-]+)\b/i);

  let matchedOrders: any[] = [];
  if (groupMatch) {
    const groupCode = groupMatch[1].trim().toUpperCase();
    const res = await db
      .prepare(`
        SELECT * FROM seller_orders
        WHERE seller_id = ? AND UPPER(COALESCE(shop_qr_group_code, '')) = ? AND deleted_at IS NULL
        ORDER BY created_at ASC
      `)
      .bind(sellerId, groupCode)
      .all<any>();
    matchedOrders = res?.results || [];
  }

  if (matchedOrders.length === 0 && childMatch) {
    const orderCode = childMatch[1].trim().toUpperCase();
    const res = await db
      .prepare(`
        SELECT * FROM seller_orders
        WHERE seller_id = ? AND UPPER(order_code) = ? AND deleted_at IS NULL
        LIMIT 1
      `)
      .bind(sellerId, orderCode)
      .all<any>();
    matchedOrders = res?.results || [];
  }

  // Fallback for banks stripping dashes/spaces (e.g., "SHPQR123456ABCDEF" or "ORDQRS123456ABC")
  if (matchedOrders.length === 0) {
    const compactContent = cleanContent.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const compactGroup = compactContent.match(/(SHPQR[A-Z0-9]{10,16})/);
    const compactChild = compactContent.match(/(ORDQRS[A-Z0-9]{8,14})/);
    if (compactGroup) {
      const res = await db
        .prepare(`
          SELECT * FROM seller_orders
          WHERE seller_id = ?
            AND REPLACE(REPLACE(UPPER(COALESCE(shop_qr_group_code, '')), '-', ''), ' ', '') = ?
            AND deleted_at IS NULL
          ORDER BY created_at ASC
        `)
        .bind(sellerId, compactGroup[1])
        .all<any>();
      matchedOrders = res?.results || [];
    } else if (compactChild) {
      const res = await db
        .prepare(`
          SELECT * FROM seller_orders
          WHERE seller_id = ?
            AND REPLACE(REPLACE(UPPER(order_code), '-', ''), ' ', '') = ?
            AND deleted_at IS NULL
          LIMIT 1
        `)
        .bind(sellerId, compactChild[1])
        .all<any>();
      matchedOrders = res?.results || [];
    }
  }

  const recordSellerTx = async (p: {
    status: string;
    exceptionCode?: string | null;
    parentOrderId?: string | null;
    orderId?: string | null;
    buyerMemberId?: string | null;
    feeChargedCore?: number;
    note?: string | null;
  }) => {
    const txRowId = existingTx?.id || `ssptx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await db
      .prepare(`
        INSERT OR REPLACE INTO seller_sepay_transactions (
          id, seller_id, sepay_tx_id, gateway, account_number, amount_in, transaction_content,
          matched_parent_order_id, matched_order_id, buyer_member_id,
          status, exception_code, fee_charged_core, seller_resolution_note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        txRowId,
        sellerId,
        sepayTxId,
        gateway,
        accountNumber || config.account_number,
        amount,
        content,
        p.parentOrderId || null,
        p.orderId || null,
        p.buyerMemberId || null,
        p.status,
        p.exceptionCode || null,
        p.feeChargedCore || 0,
        p.note || null,
        nowIso
      )
      .run();
  };

  if (matchedOrders.length === 0) {
    await recordSellerTx({
      status: 'UNMATCHED',
      exceptionCode: 'UNMATCHED',
      note: `Không tìm thấy đơn hàng khớp nội dung "${content}" của gian hàng này.`,
    });
    return {
      success: true,
      status: 'UNMATCHED',
      message: 'Không tìm thấy đơn hàng tương ứng của gian hàng. Đã ghi vào nhật ký SePay gian hàng.',
      sepayTxId,
    };
  }

  const primaryOrder = matchedOrders[0];
  const parentOrderId = primaryOrder.parent_order_id || null;
  const buyerId = primaryOrder.buyer_member_id || null;

  // 4. Duplicate payment check (all orders in group already paid)
  const allAlreadyPaid = matchedOrders.every((o) =>
    ['PAID', 'COMPLETED', 'DELIVERED', 'PROCESSING'].includes(String(o.status || ''))
  );
  if (allAlreadyPaid) {
    await recordSellerTx({
      status: 'DUPLICATE_PAYMENT',
      exceptionCode: 'DUPLICATE_PAYMENT',
      parentOrderId,
      orderId: primaryOrder.id,
      buyerMemberId: buyerId,
      note: `Khách chuyển khoản lặp lại (+${amount.toLocaleString('vi-VN')}đ) cho đơn đã hoàn tất. Chủ shop kiểm tra hoàn tiền ngân hàng cho khách.`,
    });
    return {
      success: true,
      status: 'DUPLICATE_PAYMENT',
      message: 'Đơn hàng đã thanh toán trước đó. Đã ghi nhận giao dịch chuyển trùng để chủ shop xử lý.',
      sepayTxId,
      matchedOrderIds: matchedOrders.map((o) => o.id),
    };
  }

  // 5. Expiry check
  const pendingOrders = matchedOrders.filter((o) => o.status === 'PENDING_PAYMENT');
  const anyExpired =
    pendingOrders.length === 0 ||
    pendingOrders.some(
      (o) => o.expires_at && new Date(o.expires_at).getTime() <= Date.now()
    );
  if (anyExpired) {
    for (const o of matchedOrders) {
      await checkAndExpireSellerOrdersD1(db, o.id).catch(() => {});
    }
    await recordSellerTx({
      status: 'EXPIRED_PAYMENT',
      exceptionCode: 'EXPIRED_PAYMENT',
      parentOrderId,
      orderId: primaryOrder.id,
      buyerMemberId: buyerId,
      note: `Khách chuyển ${amount.toLocaleString('vi-VN')}đ sau khi đơn đã quá hạn 15 phút (mã đã hoàn kho). Chủ shop có thể bấm Giao mã bù hoặc Hoàn ngân hàng.`,
    });
    return {
      success: true,
      status: 'EXPIRED_PAYMENT',
      message: 'Đơn hàng đã hết hạn 15 phút. Đã ghi nhận giao dịch muộn để chủ shop xử lý trên Seller Center.',
      sepayTxId,
      matchedOrderIds: matchedOrders.map((o) => o.id),
    };
  }

  // 6. Underpaid check
  const requiredAmount = pendingOrders.reduce((sum, o) => sum + (Number(o.price_core) || 0), 0);
  if (amount < requiredAmount) {
    await recordSellerTx({
      status: 'UNDERPAID',
      exceptionCode: 'UNDERPAID',
      parentOrderId,
      orderId: primaryOrder.id,
      buyerMemberId: buyerId,
      note: `Chuyển thiếu tiền: nhận ${amount.toLocaleString('vi-VN')}đ / cần ${requiredAmount.toLocaleString('vi-VN')}đ. Chủ shop kiểm tra và xử lý.`,
    });
    return {
      success: true,
      status: 'UNDERPAID',
      message: `Số tiền chuyển (${amount.toLocaleString('vi-VN')}đ) chưa đủ (${requiredAmount.toLocaleString('vi-VN')}đ). Đã ghi nhận ngoại lệ cho chủ shop.`,
      sepayTxId,
      matchedOrderIds: pendingOrders.map((o) => o.id),
    };
  }

  // 7. Exact or overpaid within expiry window -> Atomic settlement (ZERO Platform Core minting!)
  const mConfig = await getMarketplaceConfig(db);
  const feePct = Math.min(50, Math.max(0, Number(mConfig.direct_sepay_fee_pct || 0)));
  const totalFeeCore = feePct > 0 ? Math.round((requiredAmount * feePct) / 100) : 0;
  const isOverpaid = amount > requiredAmount;
  const excessAmount = isOverpaid ? amount - requiredAmount : 0;

  let anyManualCode = false;
  const deliveredCodes: Array<{ orderId: string; orderCode: string; deliveredCode: string | null; productType: string }> = [];

  for (let i = 0; i < pendingOrders.length; i++) {
    const co = pendingOrders[i];
    const isPhysical = String(co.product_type || '').toLowerCase() === 'physical';
    const orderFeeCore =
      feePct > 0
        ? i === pendingOrders.length - 1
          ? Math.max(0, totalFeeCore - Math.round(((requiredAmount - Number(co.price_core || 0)) * feePct) / 100))
          : Math.round(((Number(co.price_core || 0)) * feePct) / 100)
        : 0;

    if (isPhysical) {
      const holdUntil = new Date(Date.now() + 168 * 3600 * 1000).toISOString();
      await db
        .prepare(`
          UPDATE seller_orders
          SET status = 'PROCESSING',
              payment_method = 'QR_SEPAY',
              payment_channel = 'DIRECT_SEPAY',
              sepay_transaction_id = ?,
              direct_fee_core = ?,
              hold_until = ?,
              updated_at = ?
          WHERE id = ? AND status = 'PENDING_PAYMENT'
        `)
        .bind(sepayTxId, orderFeeCore, holdUntil, nowIso, co.id)
        .run();

      deliveredCodes.push({
        orderId: co.id,
        orderCode: co.order_code,
        deliveredCode: null,
        productType: 'physical',
      });
    } else {
      let reservedCode: any = null;
      if (co.code_id) {
        reservedCode = await db.prepare('SELECT * FROM seller_codes WHERE id = ? LIMIT 1').bind(co.code_id).first<any>();
      }
      if (!reservedCode) {
        reservedCode = await db
          .prepare("SELECT * FROM seller_codes WHERE order_id = ? AND status = 'RESERVED' LIMIT 1")
          .bind(co.id)
          .first<any>();
      }

      let plainDeliveredCode = '';
      let keyMissingOrFailed = false;
      if (!env.MARKETPLACE_CODE_KEY || env.MARKETPLACE_CODE_KEY.trim().length < 16) {
        keyMissingOrFailed = true;
      } else if (reservedCode?.code_encrypted) {
        try {
          plainDeliveredCode = await decryptCode(reservedCode.code_encrypted, env.MARKETPLACE_CODE_KEY);
        } catch {
          keyMissingOrFailed = true;
        }
      } else {
        keyMissingOrFailed = true;
      }

      if (keyMissingOrFailed) {
        anyManualCode = true;
        await db
          .prepare(`
            UPDATE seller_orders
            SET sepay_transaction_id = ?,
                payment_method = 'QR_SEPAY',
                payment_channel = 'DIRECT_SEPAY',
                direct_fee_core = ?,
                pending_manual_code = 1,
                updated_at = ?
            WHERE id = ?
          `)
          .bind(sepayTxId, orderFeeCore, nowIso, co.id)
          .run();
      } else {
        const holdHours = Number(co.warranty_hours) || 48;
        const holdUntil = new Date(Date.now() + holdHours * 3600 * 1000).toISOString();
        const stmts: any[] = [
          db
            .prepare(`
              UPDATE seller_orders
              SET status = 'PAID',
                  code_id = ?,
                  delivered_code = ?,
                  sepay_transaction_id = ?,
                  payment_method = 'QR_SEPAY',
                  payment_channel = 'DIRECT_SEPAY',
                  direct_fee_core = ?,
                  hold_until = ?,
                  updated_at = ?
              WHERE id = ? AND status = 'PENDING_PAYMENT'
            `)
            .bind(
              reservedCode?.id || co.code_id,
              plainDeliveredCode,
              sepayTxId,
              orderFeeCore,
              holdUntil,
              nowIso,
              co.id
            ),
        ];
        if (reservedCode?.id) {
          stmts.push(
            db
              .prepare(`
                UPDATE seller_codes
                SET status = 'SOLD', order_id = ?, sold_at = ?, updated_at = ?
                WHERE id = ?
              `)
              .bind(co.id, nowIso, nowIso, reservedCode.id)
          );
        }
        await db.batch(stmts);
        deliveredCodes.push({
          orderId: co.id,
          orderCode: co.order_code,
          deliveredCode: plainDeliveredCode,
          productType: 'digital',
        });
      }
    }

    // 8. Affiliate wholesale payout to Supplier Shop B (backed 100% by Shop A owner's real pre-reserved Core!)
    const isAff = Number(co.is_affiliate_order || 0) === 1 && Boolean(co.supplier_seller_id);
    const reservedWholesale = Math.max(0, Number(co.affiliate_wholesale_reserved_core || 0));
    if (isAff && reservedWholesale > 0 && co.supplier_seller_id) {
      await recordLedgerTransaction(db, {
        sellerId: String(co.supplier_seller_id),
        orderId: co.id,
        type: 'HOLD',
        amountCore: reservedWholesale,
        actor: 'direct_sepay_affiliate',
        reason: `Thanh toán giá sỉ đơn Liên Shop ${co.order_code} (nguồn trích từ Ví Core chủ shop bán lại ${sellerId}, 0% phí Sàn)`,
      }).catch(() => {});

      await dispatchSupplierFulfillmentWebhook(db, env as any, {
        sellerIds: [String(co.supplier_seller_id)],
        orderId: co.id,
        orderCode: co.order_code,
        eventType: 'order.paid',
        payloadData: {
          order_id: co.id,
          order_code: co.order_code,
          reseller_seller_id: sellerId,
          supplier_seller_id: co.supplier_seller_id,
          product_id: co.product_id,
          wholesale_core: reservedWholesale,
          payment_channel: 'DIRECT_SEPAY',
        },
      }).catch(() => {});
    }
  }

  // 9. Update seller_sepay_configs counters & optional postpaid fee debt (default 0)
  await db
    .prepare(`
      UPDATE seller_sepay_configs
      SET fee_debt_core = fee_debt_core + ?,
          total_direct_orders = total_direct_orders + ?,
          total_direct_volume_vnd = total_direct_volume_vnd + ?,
          last_webhook_at = ?,
          updated_at = ?
      WHERE seller_id = ?
    `)
    .bind(totalFeeCore, pendingOrders.length, requiredAmount, nowIso, nowIso, sellerId)
    .run()
    .catch(() => {});

  // 10. Update parent order status if linked
  if (parentOrderId) {
    const siblingsRes = await db
      .prepare('SELECT status FROM seller_orders WHERE parent_order_id = ? AND deleted_at IS NULL')
      .bind(parentOrderId)
      .all<{ status: string }>();
    const siblings = siblingsRes?.results || [];
    const allPaid =
      siblings.length > 0 &&
      siblings.every((s) => ['PAID', 'COMPLETED', 'DELIVERED', 'PROCESSING'].includes(s.status));
    await db
      .prepare('UPDATE seller_parent_orders SET status = ?, updated_at = ? WHERE id = ?')
      .bind(allPaid ? 'PAID' : 'PARTIALLY_PAID', nowIso, parentOrderId)
      .run()
      .catch(() => {});
  }

  const finalNote = anyManualCode
    ? `Đã nhận ${amount.toLocaleString('vi-VN')}đ — chờ giao mã thủ công do chưa nạp MARKETPLACE_CODE_KEY.`
    : isOverpaid
      ? `Thành công (+thừa ${excessAmount.toLocaleString('vi-VN')}đ so với ${requiredAmount.toLocaleString('vi-VN')}đ). Chủ shop chủ động xử lý tiền thừa nếu có.`
      : `Đã nhận đủ ${amount.toLocaleString('vi-VN')}đ qua SePay riêng của gian hàng (${pendingOrders.length} đơn, phí Sàn: ${totalFeeCore} Core).`;

  await recordSellerTx({
    status: anyManualCode ? 'PENDING_MANUAL_CODE' : 'SUCCESS',
    exceptionCode: anyManualCode ? 'PAID_WAITING_MANUAL_CODE' : isOverpaid ? 'OVERPAID' : null,
    parentOrderId,
    orderId: primaryOrder.id,
    buyerMemberId: buyerId,
    feeChargedCore: totalFeeCore,
    note: finalNote,
  });

  return {
    success: true,
    status: anyManualCode ? 'PENDING_MANUAL_CODE' : 'COMPLETED',
    message: finalNote,
    sepayTxId,
    matchedOrderIds: pendingOrders.map((o) => o.id),
    deliveredCodes,
    feeChargedCore: totalFeeCore,
  };
}
