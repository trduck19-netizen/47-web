/**
 * functions/services/supplier_connector_service.ts
 *
 * Lõi bảo mật & định giá cho hệ thống External Supplier Connector (PA1)
 * và Supplier Webhook Fulfillment (PA2):
 * 1. Mã hóa AES-256-GCM Fail-Closed hoàn toàn mới (cấm fallback khóa mặc định,
 *    tách biệt hoàn toàn khỏi luồng mã hóa kho mã cũ).
 * 2. Chống SSRF bắt buộc HTTPS-only (chặn http://, IP nội bộ, loopback, metadata,
 *    IPv4 octal/hex/dword, IPv6 private/mapped, kèm tùy chọn kiểm DNS DoH).
 * 3. Ký & xác thực HMAC-SHA256 dùng Web Crypto API + so sánh hằng thời gian
 *    + chống phát lại (anti-replay window ±300s).
 * 4. Bộ tính giá bán & khóa chống bán lỗ (Anti-Loss Guard).
 */

import {
  parseIpv4ToNumber,
  isPrivateIpv4,
  isPrivateIpv6,
  resolveAndValidateHostDns,
} from './ssrf_service';

export type SupplierMode = 'POSTPAID_CREDIT' | 'AFFILIATE_POSTBACK' | 'PREPAID_GUARD';
export type SupplierAuthType = 'BEARER' | 'API_KEY_HEADER' | 'BASIC' | 'NONE';
export type MarkupType = 'PERCENT' | 'FIXED';
export type SupplierLedgerEntryType =
  | 'ORDER_DEBIT'
  | 'SETTLEMENT_PAID'
  | 'REFUND_CREDIT'
  | 'AFFILIATE_COMMISSION';

export interface SupplierCryptoEnv {
  MARKETPLACE_CODE_KEY?: string;
  JWT_SECRET?: string;
}

export class SupplierConfigError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code = 'SERVER_MISCONFIGURED', status = 500) {
    super(message);
    this.name = 'SupplierConfigError';
    this.code = code;
    this.status = status;
  }
}

export const SUPPLIER_MIN_ENCRYPTION_KEY_LENGTH = 16;
export const SUPPLIER_ENCRYPTED_PREFIX = 'enc_v1:';
export const SUPPLIER_HMAC_DEFAULT_TOLERANCE_SEC = 300;
export const ALLOWED_OUTBOUND_HTTPS_PORTS = new Set(['', '443', '8443']);

const BLOCKED_EXACT_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  '::1',
  '0:0:0:0:0:0:0:1',
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'instance-data',
]);

const BLOCKED_HOST_SUFFIXES = [
  '.local',
  '.internal',
  '.localhost',
  '.localdomain',
  '.arpa',
  '.home.arpa',
];

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase();
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) {
    return null;
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * 1. MÃ HÓA AES-256-GCM FAIL-CLOSED (VIẾT MỚI HOÀN TOÀN)
 * Yêu cầu MARKETPLACE_CODE_KEY hoặc JWT_SECRET >= 16 ký tự.
 * Tuyệt đối không fallback về chuỗi mặc định.
 */
export function resolveSupplierMasterSecret(env?: SupplierCryptoEnv | null): string {
  const candidate = (env?.MARKETPLACE_CODE_KEY || env?.JWT_SECRET || '').trim();
  if (!candidate || candidate.length < SUPPLIER_MIN_ENCRYPTION_KEY_LENGTH) {
    throw new SupplierConfigError(
      'Missing or unsafe encryption key (MARKETPLACE_CODE_KEY or JWT_SECRET must be at least 16 characters).',
      'SERVER_MISCONFIGURED',
      500
    );
  }
  return candidate;
}

async function deriveAesGcmKey(env?: SupplierCryptoEnv | null): Promise<CryptoKey> {
  const masterSecret = resolveSupplierMasterSecret(env);
  const encoder = new TextEncoder();
  const material = encoder.encode(`universal-mall:supplier-secret:v1:${masterSecret}`);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSupplierSecret(
  plaintext: string,
  env?: SupplierCryptoEnv | null
): Promise<string> {
  if (typeof plaintext !== 'string' || plaintext.trim().length === 0) {
    throw new Error('Secret plaintext must be a non-empty string.');
  }

  const key = await deriveAesGcmKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoded
  );
  const cipherBytes = new Uint8Array(cipherBuffer);
  return `${SUPPLIER_ENCRYPTED_PREFIX}${bytesToBase64(iv)}.${bytesToBase64(cipherBytes)}`;
}

export async function decryptSupplierSecret(
  encryptedValue: string,
  env?: SupplierCryptoEnv | null
): Promise<string> {
  if (typeof encryptedValue !== 'string' || !encryptedValue.startsWith(SUPPLIER_ENCRYPTED_PREFIX)) {
    throw new Error('Invalid encrypted supplier secret format.');
  }

  const body = encryptedValue.slice(SUPPLIER_ENCRYPTED_PREFIX.length);
  const parts = body.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Malformed encrypted supplier secret payload.');
  }

  const iv = base64ToBytes(parts[0]);
  if (iv.length !== 12) {
    throw new Error('Invalid AES-GCM IV length.');
  }
  const cipherBytes = base64ToBytes(parts[1]);
  if (cipherBytes.length < 17) {
    throw new Error('Invalid AES-GCM ciphertext length.');
  }

  const key = await deriveAesGcmKey(env);
  try {
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      cipherBytes
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    throw new Error('Failed to decrypt supplier secret (wrong key or tampered ciphertext).');
  }
}

export function maskSecretPrefix(rawSecret: string): string {
  const s = (rawSecret || '').trim();
  if (!s) return '';
  if (s.length <= 8) return `${s.slice(0, 2)}••••••`;
  return `${s.slice(0, 4)}••••••••${s.slice(-4)}`;
}

/**
 * 2. CHỐNG SSRF OUTBOUND CHỈ CHẤP NHẬN HTTPS (CHẶT HƠN CHECK HTTP/HTTPS CŨ)
 * - Bắt buộc protocol === 'https:' (chặn http://, file://, ftp://, ...).
 * - Chặn userinfo (user:pass@host) và cổng ngoài 443/8443.
 * - Chặn localhost, metadata cloud, tên miền nội bộ, single-label host,
 *   mọi dải IPv4 riêng/loopback/link-local/CGNAT (kể cả octal/hex/dword/2-part/3-part),
 *   và mọi dải IPv6 nội bộ/loopback/ULA/IPv4-mapped.
 */
export interface OutboundUrlValidationResult {
  ok: boolean;
  normalizedUrl?: string;
  hostname?: string;
  reason?: string;
}

export function validateOutboundHttpsUrl(urlStr: string): OutboundUrlValidationResult {
  if (typeof urlStr !== 'string' || !urlStr.trim()) {
    return { ok: false, reason: 'EMPTY_URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    return { ok: false, reason: 'INVALID_URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'HTTPS_REQUIRED' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'CREDENTIALS_IN_URL_FORBIDDEN' };
  }

  if (!ALLOWED_OUTBOUND_HTTPS_PORTS.has(parsed.port)) {
    return { ok: false, reason: 'UNALLOWED_PORT' };
  }

  let host = parsed.hostname.toLowerCase().trim();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  // Loại bỏ dấu chấm FQDN cuối cùng (ví dụ: localhost., 127.0.0.1.)
  const cleanHost = host.replace(/\.+$/, '');
  if (!cleanHost) {
    return { ok: false, reason: 'EMPTY_HOST' };
  }

  if (BLOCKED_EXACT_HOSTS.has(cleanHost)) {
    return { ok: false, reason: 'BLOCKED_INTERNAL_HOST' };
  }

  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (cleanHost.endsWith(suffix)) {
      return { ok: false, reason: 'BLOCKED_INTERNAL_SUFFIX' };
    }
  }

  // Kiểm tra IPv6
  if (cleanHost.includes(':')) {
    if (isPrivateIpv6(cleanHost)) {
      return { ok: false, reason: 'BLOCKED_PRIVATE_IPV6' };
    }
    return { ok: true, normalizedUrl: parsed.toString(), hostname: cleanHost };
  }

  // Kiểm tra IPv4 ở mọi biến thể (decimal, octal, hex, dword, 2-part, 3-part)
  const ipv4Num = parseIpv4ToNumber(cleanHost);
  if (ipv4Num !== null) {
    if (isPrivateIpv4(ipv4Num)) {
      return { ok: false, reason: 'BLOCKED_PRIVATE_IPV4' };
    }
    return { ok: true, normalizedUrl: parsed.toString(), hostname: cleanHost };
  }

  // Tên miền công cộng bắt buộc phải có ít nhất 1 dấu chấm (chặn tên nội bộ như https://redis)
  if (!cleanHost.includes('.')) {
    return { ok: false, reason: 'SINGLE_LABEL_HOST_FORBIDDEN' };
  }

  return { ok: true, normalizedUrl: parsed.toString(), hostname: cleanHost };
}

export async function validateOutboundHttpsUrlWithDns(
  urlStr: string
): Promise<OutboundUrlValidationResult> {
  const staticCheck = validateOutboundHttpsUrl(urlStr);
  if (!staticCheck.ok || !staticCheck.hostname) {
    return staticCheck;
  }

  const dnsCheck = await resolveAndValidateHostDns(staticCheck.hostname);
  if (!dnsCheck.ok) {
    return {
      ok: false,
      hostname: staticCheck.hostname,
      reason: dnsCheck.error || 'DNS_REBINDING_BLOCKED',
    };
  }

  return staticCheck;
}

/**
 * 3. KÝ & XÁC THỰC HMAC-SHA256 + CHỐNG REPLAY (±300s)
 * Chuỗi ký chuẩn: `${timestampSec}.${payload}`
 */
export function timingSafeEqualHex(hexA: string, hexB: string): boolean {
  const bytesA = hexToBytes(hexA);
  const bytesB = hexToBytes(hexB);
  if (!bytesA || !bytesB || bytesA.length !== bytesB.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0;
}

async function computeHmacSha256Hex(message: string, secret: string): Promise<string> {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('HMAC secret must be a non-empty string.');
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return bytesToHex(new Uint8Array(sigBuffer));
}

export interface SignedHmacResult {
  signature: string;
  timestamp: number;
  headerValue: string;
}

export async function signHmacPayload(
  payload: string,
  secret: string,
  timestampSec?: number
): Promise<SignedHmacResult> {
  const ts =
    typeof timestampSec === 'number' && Number.isFinite(timestampSec)
      ? Math.floor(timestampSec)
      : Math.floor(Date.now() / 1000);
  const canonical = `${ts}.${payload}`;
  const signature = await computeHmacSha256Hex(canonical, secret);
  return {
    signature,
    timestamp: ts,
    headerValue: `t=${ts},v1=${signature}`,
  };
}

export function parseHmacSignatureHeader(
  headerValue: string
): { timestamp?: number; signature?: string } {
  const raw = (headerValue || '').trim();
  if (!raw) return {};

  // Hỗ trợ dạng `t=1700000000,v1=<hex>`
  if (raw.includes('v1=')) {
    const tokens = raw.split(',');
    let timestamp: number | undefined;
    let signature: string | undefined;
    for (const token of tokens) {
      const idx = token.indexOf('=');
      if (idx === -1) continue;
      const k = token.slice(0, idx).trim();
      const v = token.slice(idx + 1).trim();
      if (k === 't' && /^\d+$/.test(v)) {
        timestamp = Number(v);
      } else if (k === 'v1') {
        signature = v;
      }
    }
    return { timestamp, signature };
  }

  // Hỗ trợ dạng `sha256=<hex>` hoặc `<hex>` thuần
  const stripped = raw.startsWith('sha256=') ? raw.slice('sha256='.length).trim() : raw;
  return { signature: stripped };
}

export interface VerifyHmacParams {
  payload: string;
  secret: string;
  signature: string;
  timestamp: number | string;
  nowSec?: number;
  toleranceSec?: number;
}

export interface VerifyHmacResult {
  ok: boolean;
  reason?: string;
}

export async function verifyHmacSignature(params: VerifyHmacParams): Promise<VerifyHmacResult> {
  const { payload, secret, signature, timestamp } = params;
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    return { ok: false, reason: 'MISSING_SECRET' };
  }

  const parsedHeader = parseHmacSignatureHeader(signature);
  const cleanSig = (parsedHeader.signature || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanSig)) {
    return { ok: false, reason: 'MALFORMED_SIGNATURE' };
  }

  const rawTs =
    typeof timestamp === 'number'
      ? timestamp
      : typeof timestamp === 'string' && /^\d+$/.test(timestamp.trim())
        ? Number(timestamp.trim())
        : parsedHeader.timestamp ?? NaN;

  if (!Number.isFinite(rawTs) || !Number.isInteger(rawTs) || rawTs <= 0) {
    return { ok: false, reason: 'INVALID_TIMESTAMP' };
  }

  const nowSec =
    typeof params.nowSec === 'number' && Number.isFinite(params.nowSec)
      ? Math.floor(params.nowSec)
      : Math.floor(Date.now() / 1000);
  const toleranceSec =
    typeof params.toleranceSec === 'number' && params.toleranceSec >= 0
      ? params.toleranceSec
      : SUPPLIER_HMAC_DEFAULT_TOLERANCE_SEC;

  if (Math.abs(nowSec - rawTs) > toleranceSec) {
    return { ok: false, reason: 'TIMESTAMP_OUT_OF_WINDOW' };
  }

  const expected = await computeHmacSha256Hex(`${rawTs}.${payload}`, secret);
  if (!timingSafeEqualHex(expected, cleanSig)) {
    return { ok: false, reason: 'INVALID_SIGNATURE' };
  }

  return { ok: true };
}

/**
 * 4. TÍNH GIÁ BÁN & KHÓA CHỐNG BÁN LỖ (ANTI-LOSS GUARD)
 */
export interface ResellPriceInput {
  supplierCostCore: number;
  markupType: MarkupType;
  markupValue: number;
  minMarginCore?: number;
  overrideSellingPriceCore?: number | null;
  feeRatePercent?: number;
  externalStock?: number;
}

export interface ResellPriceResult {
  supplierCostCore: number;
  sellingPriceCore: number;
  feeCore: number;
  profitCore: number;
  effectiveMinMarginCore: number;
  antiLossPaused: boolean;
  antiLossReason: string | null;
}

export function calculateResellPrice(input: ResellPriceInput): ResellPriceResult {
  const supplierCostCore = Number(input.supplierCostCore);
  const markupValue = Number(input.markupValue);
  const effectiveMinMarginCore = Math.max(0, Number(input.minMarginCore || 0));
  const feeRatePercent = Math.max(0, Number(input.feeRatePercent || 0));

  if (!Number.isFinite(supplierCostCore) || supplierCostCore <= 0) {
    return {
      supplierCostCore: Number.isFinite(supplierCostCore) ? supplierCostCore : 0,
      sellingPriceCore: 0,
      feeCore: 0,
      profitCore: 0,
      effectiveMinMarginCore,
      antiLossPaused: true,
      antiLossReason: 'INVALID_SUPPLIER_COST',
    };
  }

  if (!Number.isFinite(markupValue) || markupValue < 0) {
    return {
      supplierCostCore,
      sellingPriceCore: 0,
      feeCore: 0,
      profitCore: 0,
      effectiveMinMarginCore,
      antiLossPaused: true,
      antiLossReason: 'INVALID_MARKUP',
    };
  }

  let suggestedPrice: number;
  if (input.markupType === 'FIXED') {
    suggestedPrice = Math.ceil(supplierCostCore + markupValue);
  } else {
    suggestedPrice = Math.ceil(supplierCostCore * (1 + markupValue / 100));
  }

  const hasOverride =
    input.overrideSellingPriceCore !== undefined &&
    input.overrideSellingPriceCore !== null &&
    Number.isFinite(Number(input.overrideSellingPriceCore));

  const sellingPriceCore = hasOverride
    ? Math.round(Number(input.overrideSellingPriceCore))
    : suggestedPrice;

  if (!Number.isFinite(sellingPriceCore) || sellingPriceCore <= 0) {
    return {
      supplierCostCore,
      sellingPriceCore: 0,
      feeCore: 0,
      profitCore: -supplierCostCore,
      effectiveMinMarginCore,
      antiLossPaused: true,
      antiLossReason: 'INVALID_SELLING_PRICE',
    };
  }

  const feeCore = feeRatePercent > 0 ? Math.ceil((sellingPriceCore * feeRatePercent) / 100) : 0;
  const profitCore = sellingPriceCore - supplierCostCore - feeCore;

  if (profitCore < 0) {
    return {
      supplierCostCore,
      sellingPriceCore,
      feeCore,
      profitCore,
      effectiveMinMarginCore,
      antiLossPaused: true,
      antiLossReason: 'BELOW_COST',
    };
  }

  if (profitCore < effectiveMinMarginCore) {
    return {
      supplierCostCore,
      sellingPriceCore,
      feeCore,
      profitCore,
      effectiveMinMarginCore,
      antiLossPaused: true,
      antiLossReason: 'BELOW_MIN_MARGIN',
    };
  }

  if (input.externalStock !== undefined && Number(input.externalStock) <= 0) {
    return {
      supplierCostCore,
      sellingPriceCore,
      feeCore,
      profitCore,
      effectiveMinMarginCore,
      antiLossPaused: true,
      antiLossReason: 'OUT_OF_STOCK',
    };
  }

  return {
    supplierCostCore,
    sellingPriceCore,
    feeCore,
    profitCore,
    effectiveMinMarginCore,
    antiLossPaused: false,
    antiLossReason: null,
  };
}

/**
 * 5. SELECTIVE PROJECTION HELPERS (ZERO ENCRYPTED COLUMNS IN RESPONSES)
 */
export const EXTERNAL_SUPPLIER_SAFE_SELECT = `
  id, name, code, mode, base_url, auth_type, auth_header_name,
  api_key_prefix, webhook_secret_prefix,
  CASE WHEN encrypted_api_key IS NOT NULL AND encrypted_api_key != '' THEN 1 ELSE 0 END AS has_api_key,
  CASE WHEN encrypted_webhook_secret IS NOT NULL AND encrypted_webhook_secret != '' THEN 1 ELSE 0 END AS has_webhook_secret,
  catalog_path, order_path, balance_path, field_mapping_json,
  supports_idempotency, markup_type, markup_value, min_margin_core,
  credit_limit_core, credit_used_core, prepaid_balance_core, prepaid_min_balance,
  auto_pause_enabled, is_active, last_sync_at, last_health_status, last_error,
  created_at, updated_at
`;

export const SUPPLIER_WEBHOOK_SAFE_SELECT = `
  id, seller_id, name, webhook_url, secret_prefix, events_json,
  is_active, timeout_ms, retry_max, last_status_code, last_error,
  last_triggered_at, created_at, updated_at
`;

export function generateConnectorId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const rand = bytesToHex(bytes);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function generateRandomHmacSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `whsec_${bytesToHex(bytes)}`;
}

/**
 * 6. PA2: DISPATCH & RETRY SUPPLIER FULFILLMENT WEBHOOK (HMAC-SHA256, NON-BLOCKING)
 */
export interface DispatchWebhookParams {
  sellerIds: string[];
  orderId: string;
  orderCode: string;
  eventType: string;
  payloadData: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}

export interface WebhookDispatchSummary {
  totalMatched: number;
  delivered: number;
  failed: number;
  deliveryIds: string[];
}

export async function dispatchSupplierFulfillmentWebhook(
  db: D1Database,
  env: SupplierCryptoEnv,
  params: DispatchWebhookParams
): Promise<WebhookDispatchSummary> {
  const uniqueSellerIds = Array.from(new Set(params.sellerIds.map((s) => String(s || '').trim()).filter(Boolean)));
  if (uniqueSellerIds.length === 0) {
    return { totalMatched: 0, delivered: 0, failed: 0, deliveryIds: [] };
  }

  const placeholders = uniqueSellerIds.map(() => '?').join(', ');
  const hooksRes = await db
    .prepare(`
      SELECT id, seller_id, name, webhook_url, encrypted_hmac_secret, events_json, timeout_ms, retry_max
      FROM supplier_fulfillment_webhooks
      WHERE seller_id IN (${placeholders}) AND is_active = 1
    `)
    .bind(...uniqueSellerIds)
    .all<any>();

  const hooks = hooksRes.results || [];
  const fetchFn = params.fetchImpl || fetch;
  let totalMatched = 0;
  let delivered = 0;
  let failed = 0;
  const deliveryIds: string[] = [];

  for (const hook of hooks) {
    let events: string[] = ['order.paid'];
    try {
      const parsed = JSON.parse(hook.events_json || '["order.paid"]');
      if (Array.isArray(parsed)) events = parsed.map(String);
    } catch {}

    if (params.eventType !== 'webhook.test' && !events.includes(params.eventType) && !events.includes('*')) {
      continue;
    }

    totalMatched++;
    const deliveryId = generateConnectorId('whd');
    deliveryIds.push(deliveryId);
    const nowIso = new Date().toISOString();
    const payloadObj = {
      event: params.eventType,
      delivery_id: deliveryId,
      order_id: params.orderId,
      order_code: params.orderCode,
      seller_id: hook.seller_id,
      timestamp: nowIso,
      data: params.payloadData,
    };
    const payloadJson = JSON.stringify(payloadObj);

    const urlCheck = validateOutboundHttpsUrl(hook.webhook_url);
    if (!urlCheck.ok) {
      failed++;
      await db
        .prepare(`
          INSERT INTO supplier_fulfillment_deliveries (
            id, webhook_id, seller_id, order_id, order_code, event_type,
            request_payload_json, http_status, response_snippet, attempts,
            delivery_status, error_message, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, 'FAILED', ?, ?)
        `)
        .bind(
          deliveryId,
          hook.id,
          hook.seller_id,
          params.orderId,
          params.orderCode,
          params.eventType,
          payloadJson,
          `SSRF_BLOCKED:${urlCheck.reason || 'INVALID_URL'}`,
          nowIso
        )
        .run();
      await db
        .prepare(`
          UPDATE supplier_fulfillment_webhooks
          SET last_status_code = 0, last_error = ?, last_triggered_at = ?, updated_at = ?
          WHERE id = ?
        `)
        .bind(`SSRF_BLOCKED:${urlCheck.reason || 'INVALID_URL'}`, nowIso, nowIso, hook.id)
        .run();
      continue;
    }

    let rawSecret: string;
    try {
      rawSecret = await decryptSupplierSecret(hook.encrypted_hmac_secret, env);
    } catch (err: any) {
      failed++;
      const msg = err?.message || 'DECRYPT_FAILED';
      await db
        .prepare(`
          INSERT INTO supplier_fulfillment_deliveries (
            id, webhook_id, seller_id, order_id, order_code, event_type,
            request_payload_json, http_status, response_snippet, attempts,
            delivery_status, error_message, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, 'FAILED', ?, ?)
        `)
        .bind(
          deliveryId,
          hook.id,
          hook.seller_id,
          params.orderId,
          params.orderCode,
          params.eventType,
          payloadJson,
          msg,
          nowIso
        )
        .run();
      continue;
    }

    const signed = await signHmacPayload(payloadJson, rawSecret);
    const timeoutMs = Math.min(Math.max(Number(hook.timeout_ms) || 5000, 1000), 10000);

    let httpStatus: number | null = null;
    let snippet = '';
    let errMsg: string | null = null;
    let isOk = false;
    let externalRef: string | null = null;

    try {
      const res = await fetchFn(urlCheck.normalizedUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WCG-Signature': signed.headerValue,
          'X-WCG-Timestamp': String(signed.timestamp),
          'X-WCG-Event': params.eventType,
          'X-WCG-Delivery-Id': deliveryId,
        },
        body: payloadJson,
        signal: AbortSignal.timeout(timeoutMs),
      });
      httpStatus = res.status;
      const text = await res.text().catch(() => '');
      snippet = text.slice(0, 500);
      isOk = res.ok;
      if (isOk) {
        try {
          const parsedBody = JSON.parse(text);
          if (parsedBody?.fulfillment_ref || parsedBody?.ref || parsedBody?.id) {
            externalRef = String(parsedBody.fulfillment_ref || parsedBody.ref || parsedBody.id).slice(0, 128);
          }
        } catch {}
      } else {
        errMsg = `HTTP_${res.status}`;
      }
    } catch (err: any) {
      errMsg = (err?.message || 'NETWORK_ERROR').slice(0, 300);
    }

    const doneIso = new Date().toISOString();
    const status = isOk ? 'DELIVERED' : 'FAILED';
    if (isOk) delivered++;
    else failed++;

    await db
      .prepare(`
        INSERT INTO supplier_fulfillment_deliveries (
          id, webhook_id, seller_id, order_id, order_code, event_type,
          request_payload_json, http_status, response_snippet, attempts,
          delivery_status, external_fulfillment_ref, error_message, created_at, delivered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      `)
      .bind(
        deliveryId,
        hook.id,
        hook.seller_id,
        params.orderId,
        params.orderCode,
        params.eventType,
        payloadJson,
        httpStatus,
        snippet,
        status,
        externalRef,
        errMsg,
        nowIso,
        isOk ? doneIso : null
      )
      .run();

    await db
      .prepare(`
        UPDATE supplier_fulfillment_webhooks
        SET last_status_code = ?, last_error = ?, last_triggered_at = ?, updated_at = ?
        WHERE id = ?
      `)
      .bind(httpStatus, errMsg, doneIso, doneIso, hook.id)
      .run();
  }

  return { totalMatched, delivered, failed, deliveryIds };
}

export async function retrySupplierWebhookDelivery(
  db: D1Database,
  env: SupplierCryptoEnv,
  deliveryId: string,
  fetchImpl?: typeof fetch
): Promise<{ ok: boolean; status?: string; httpStatus?: number | null; error?: string }> {
  const delivery = await db
    .prepare('SELECT * FROM supplier_fulfillment_deliveries WHERE id = ? LIMIT 1')
    .bind(deliveryId)
    .first<any>();

  if (!delivery) {
    return { ok: false, error: 'DELIVERY_NOT_FOUND' };
  }

  const hook = await db
    .prepare('SELECT * FROM supplier_fulfillment_webhooks WHERE id = ? LIMIT 1')
    .bind(delivery.webhook_id)
    .first<any>();

  if (!hook) {
    return { ok: false, error: 'WEBHOOK_NOT_FOUND' };
  }

  const urlCheck = validateOutboundHttpsUrl(hook.webhook_url);
  if (!urlCheck.ok) {
    return { ok: false, error: `SSRF_BLOCKED:${urlCheck.reason}` };
  }

  const rawSecret = await decryptSupplierSecret(hook.encrypted_hmac_secret, env);
  const payloadJson = String(delivery.request_payload_json || '{}');
  const signed = await signHmacPayload(payloadJson, rawSecret);
  const fetchFn = fetchImpl || fetch;
  const timeoutMs = Math.min(Math.max(Number(hook.timeout_ms) || 5000, 1000), 10000);

  let httpStatus: number | null = null;
  let snippet = '';
  let errMsg: string | null = null;
  let isOk = false;

  try {
    const res = await fetchFn(urlCheck.normalizedUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WCG-Signature': signed.headerValue,
        'X-WCG-Timestamp': String(signed.timestamp),
        'X-WCG-Event': String(delivery.event_type || 'order.paid'),
        'X-WCG-Delivery-Id': delivery.id,
        'X-WCG-Retry': '1',
      },
      body: payloadJson,
      signal: AbortSignal.timeout(timeoutMs),
    });
    httpStatus = res.status;
    snippet = (await res.text().catch(() => '')).slice(0, 500);
    isOk = res.ok;
    if (!isOk) errMsg = `HTTP_${res.status}`;
  } catch (err: any) {
    errMsg = (err?.message || 'NETWORK_ERROR').slice(0, 300);
  }

  const nowIso = new Date().toISOString();
  const nextStatus = isOk ? 'DELIVERED' : 'FAILED';
  await db
    .prepare(`
      UPDATE supplier_fulfillment_deliveries
      SET http_status = ?, response_snippet = ?, attempts = attempts + 1,
          delivery_status = ?, error_message = ?, delivered_at = ?
      WHERE id = ?
    `)
    .bind(httpStatus, snippet, nextStatus, errMsg, isOk ? nowIso : delivery.delivered_at, delivery.id)
    .run();

  await db
    .prepare(`
      UPDATE supplier_fulfillment_webhooks
      SET last_status_code = ?, last_error = ?, last_triggered_at = ?, updated_at = ?
      WHERE id = ?
    `)
    .bind(httpStatus, errMsg, nowIso, nowIso, hook.id)
    .run();

  return { ok: isOk, status: nextStatus, httpStatus, error: errMsg || undefined };
}

/**
 * 7. PA1: ĐỒNG BỘ DANH MỤC NCC NGOÀI + ANTI-LOSS GUARD
 */
export interface CatalogSyncResult {
  ok: boolean;
  synced: number;
  pausedByAntiLoss: number;
  error?: string;
}

function buildSupplierAuthHeaders(
  supplier: any,
  decryptedApiKey: string | null
): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const authType = String(supplier.auth_type || 'BEARER').toUpperCase();
  if (!decryptedApiKey || authType === 'NONE') return headers;

  const headerName = String(supplier.auth_header_name || 'Authorization').trim() || 'Authorization';
  if (authType === 'BEARER') {
    headers[headerName] = `Bearer ${decryptedApiKey}`;
  } else if (authType === 'BASIC') {
    headers[headerName] = `Basic ${btoa(decryptedApiKey)}`;
  } else {
    headers[headerName] = decryptedApiKey;
  }
  return headers;
}

export async function syncExternalSupplierCatalog(
  db: D1Database,
  env: SupplierCryptoEnv,
  supplierId: string,
  options?: { fetchImpl?: typeof fetch; skipDnsCheck?: boolean }
): Promise<CatalogSyncResult> {
  const supplier = await db
    .prepare('SELECT * FROM external_suppliers WHERE id = ? LIMIT 1')
    .bind(supplierId)
    .first<any>();

  if (!supplier) {
    return { ok: false, synced: 0, pausedByAntiLoss: 0, error: 'SUPPLIER_NOT_FOUND' };
  }

  const baseUrl = String(supplier.base_url || '').replace(/\/+$/, '');
  const catalogPath = String(supplier.catalog_path || '/catalog').trim();
  const targetUrl = catalogPath.startsWith('https://')
    ? catalogPath
    : `${baseUrl}${catalogPath.startsWith('/') ? '' : '/'}${catalogPath}`;

  const urlCheck = options?.skipDnsCheck
    ? validateOutboundHttpsUrl(targetUrl)
    : await validateOutboundHttpsUrlWithDns(targetUrl);

  const nowIso = new Date().toISOString();
  if (!urlCheck.ok) {
    const err = `SSRF_BLOCKED:${urlCheck.reason || 'INVALID_URL'}`;
    await db
      .prepare('UPDATE external_suppliers SET last_health_status = ?, last_error = ?, updated_at = ? WHERE id = ?')
      .bind('ERROR', err, nowIso, supplierId)
      .run();
    return { ok: false, synced: 0, pausedByAntiLoss: 0, error: err };
  }

  let decryptedKey: string | null = null;
  if (supplier.encrypted_api_key && String(supplier.auth_type || 'BEARER') !== 'NONE') {
    decryptedKey = await decryptSupplierSecret(supplier.encrypted_api_key, env);
  }

  const fetchFn = options?.fetchImpl || fetch;
  let items: any[] = [];
  try {
    const res = await fetchFn(urlCheck.normalizedUrl!, {
      method: 'GET',
      headers: buildSupplierAuthHeaders(supplier, decryptedKey),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const err = `HTTP_${res.status}`;
      await db
        .prepare('UPDATE external_suppliers SET last_health_status = ?, last_error = ?, updated_at = ? WHERE id = ?')
        .bind('ERROR', err, nowIso, supplierId)
        .run();
      return { ok: false, synced: 0, pausedByAntiLoss: 0, error: err };
    }
    const body: any = await res.json();
    if (Array.isArray(body)) items = body;
    else if (Array.isArray(body?.items)) items = body.items;
    else if (Array.isArray(body?.products)) items = body.products;
    else if (Array.isArray(body?.data)) items = body.data;
    else items = [];
  } catch (err: any) {
    const msg = (err?.message || 'FETCH_ERROR').slice(0, 300);
    await db
      .prepare('UPDATE external_suppliers SET last_health_status = ?, last_error = ?, updated_at = ? WHERE id = ?')
      .bind('ERROR', msg, nowIso, supplierId)
      .run();
    return { ok: false, synced: 0, pausedByAntiLoss: 0, error: msg };
  }

  let mapping: Record<string, string> = {};
  try {
    mapping = JSON.parse(supplier.field_mapping_json || '{}') || {};
  } catch {}

  const skuField = mapping.sku_field || 'sku';
  const nameField = mapping.name_field || 'name';
  const costField = mapping.cost_field || 'price';
  const stockField = mapping.stock_field || 'stock';
  const affUrlField = mapping.affiliate_url_field || 'affiliate_url';

  let synced = 0;
  let pausedByAntiLoss = 0;

  for (const item of items.slice(0, 500)) {
    const externalSku = String(item?.[skuField] ?? item?.id ?? '').trim();
    const externalName = String(item?.[nameField] ?? item?.title ?? externalSku).trim();
    if (!externalSku) continue;

    const supplierCost = Number(item?.[costField] ?? item?.cost ?? 0);
    const externalStock = Number(item?.[stockField] ?? item?.quantity ?? 0);
    const affiliateTargetUrl = item?.[affUrlField] ? String(item[affUrlField]).trim() : null;

    const existing = await db
      .prepare('SELECT id, selling_price_core FROM external_supplier_products WHERE supplier_id = ? AND external_sku = ? LIMIT 1')
      .bind(supplierId, externalSku)
      .first<any>();

    const calc = calculateResellPrice({
      supplierCostCore: supplierCost,
      markupType: String(supplier.markup_type || 'PERCENT').toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENT',
      markupValue: Number(supplier.markup_value ?? 15),
      minMarginCore: Number(supplier.min_margin_core ?? 0),
      externalStock,
    });

    const shouldPause = supplier.auto_pause_enabled ? (calc.antiLossPaused ? 1 : 0) : 0;
    if (shouldPause === 1) pausedByAntiLoss++;

    const prodId = existing?.id || generateConnectorId('esp');
    await db
      .prepare(`
        INSERT INTO external_supplier_products (
          id, supplier_id, external_sku, external_name, supplier_cost_core,
          selling_price_core, profit_core, external_stock, affiliate_target_url,
          anti_loss_paused, anti_loss_reason, is_active, last_synced_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(supplier_id, external_sku) DO UPDATE SET
          external_name = excluded.external_name,
          supplier_cost_core = excluded.supplier_cost_core,
          selling_price_core = excluded.selling_price_core,
          profit_core = excluded.profit_core,
          external_stock = excluded.external_stock,
          affiliate_target_url = excluded.affiliate_target_url,
          anti_loss_paused = excluded.anti_loss_paused,
          anti_loss_reason = excluded.anti_loss_reason,
          is_active = CASE WHEN excluded.anti_loss_paused = 1 THEN 0 ELSE is_active END,
          last_synced_at = excluded.last_synced_at,
          updated_at = excluded.updated_at
      `)
      .bind(
        prodId,
        supplierId,
        externalSku,
        externalName,
        calc.supplierCostCore,
        calc.sellingPriceCore,
        calc.profitCore,
        Number.isFinite(externalStock) ? Math.max(0, Math.floor(externalStock)) : 0,
        affiliateTargetUrl,
        shouldPause,
        calc.antiLossReason,
        shouldPause ? 0 : 1,
        nowIso,
        nowIso,
        nowIso
      )
      .run();

    synced++;
  }

  await db
    .prepare(`
      UPDATE external_suppliers
      SET last_sync_at = ?, last_health_status = 'OK', last_error = NULL, updated_at = ?
      WHERE id = ?
    `)
    .bind(nowIso, nowIso, supplierId)
    .run();

  return { ok: true, synced, pausedByAntiLoss };
}

/**
 * 8. PA1: GIỮ HẠN MỨC CÔNG NỢ NGUYÊN TỬ (ATOMIC db.batch CHỐNG ĐUA HẠN MỨC)
 */
export interface ReserveCreditParams {
  supplierId: string;
  orderId: string;
  orderCode: string;
  externalOrderRef: string;
  costCore: number;
  sellingCore: number;
  actor?: string;
  note?: string;
}

export interface ReserveCreditResult {
  ok: boolean;
  alreadyReserved?: boolean;
  reason?: string;
  ledgerId?: string;
}

export async function reserveSupplierCreditAtomic(
  db: D1Database,
  params: ReserveCreditParams
): Promise<ReserveCreditResult> {
  const cost = Number(params.costCore);
  const selling = Number(params.sellingCore);
  const externalOrderRef = String(params.externalOrderRef || '').trim();
  if (!Number.isFinite(cost) || cost <= 0) {
    return { ok: false, reason: 'INVALID_COST' };
  }
  if (!externalOrderRef) {
    return { ok: false, reason: 'MISSING_EXTERNAL_ORDER_REF' };
  }
  const profit = selling - cost;
  const nowIso = new Date().toISOString();
  const ledgerId = generateConnectorId('esl');

  // Giao dịch nguyên tử 2 bước trong 1 db.batch:
  // Bước 0: INSERT OR IGNORE dòng ORDER_DEBIT có khóa UNIQUE(supplier_id, external_order_ref, entry_type)
  //         kèm điều kiện credit_used_core + cost <= credit_limit_core.
  //         Nếu ref đã tồn tại HOẶC vượt hạn mức -> 0 dòng được chèn -> ledgerId này không tồn tại.
  // Bước 1: Chỉ cộng credit_used_core khi EXISTS chính ledgerId vừa chèn ở Bước 0
  //         -> đảm bảo gọi 2 lần cùng đơn tuyệt đối không trừ hạn mức 2 lần và không sinh dòng ma.
  const results = await db.batch([
    db
      .prepare(`
        INSERT OR IGNORE INTO external_supplier_ledger (
          id, supplier_id, order_id, order_code, entry_type,
          cost_core, selling_core, profit_core, balance_due_after,
          external_order_ref, status, actor, note, created_at
        )
        SELECT
          ?, id, ?, ?, 'ORDER_DEBIT',
          ?, ?, ?, credit_used_core + ?,
          ?, 'RECORDED', ?, ?, ?
        FROM external_suppliers
        WHERE id = ?
          AND is_active = 1
          AND mode = 'POSTPAID_CREDIT'
          AND (credit_used_core + ? <= credit_limit_core)
      `)
      .bind(
        ledgerId,
        params.orderId,
        params.orderCode,
        cost,
        selling,
        profit,
        cost,
        externalOrderRef,
        params.actor || 'system',
        params.note || `Ghi nợ công nợ đơn ${params.orderCode}`,
        nowIso,
        params.supplierId,
        cost
      ),
    db
      .prepare(`
        UPDATE external_suppliers
        SET credit_used_core = credit_used_core + ?, updated_at = ?
        WHERE id = ?
          AND EXISTS (
            SELECT 1 FROM external_supplier_ledger
            WHERE id = ? AND supplier_id = ? AND entry_type = 'ORDER_DEBIT'
          )
      `)
      .bind(cost, nowIso, params.supplierId, ledgerId, params.supplierId),
  ]);

  const ledgerInsertChanges = Number((results[0] as any)?.meta?.changes ?? 0);
  const creditUpdateChanges = Number((results[1] as any)?.meta?.changes ?? 0);

  if (ledgerInsertChanges > 0 && creditUpdateChanges > 0) {
    return { ok: true, alreadyReserved: false, ledgerId };
  }

  // Phân biệt: đã giữ hạn mức trước đó (idempotent) hay thực sự vượt hạn mức
  const existingDebit = await db
    .prepare(`
      SELECT id FROM external_supplier_ledger
      WHERE supplier_id = ? AND external_order_ref = ? AND entry_type = 'ORDER_DEBIT'
      LIMIT 1
    `)
    .bind(params.supplierId, externalOrderRef)
    .first<{ id: string }>();

  if (existingDebit?.id) {
    return {
      ok: true,
      alreadyReserved: true,
      reason: 'ALREADY_RESERVED',
      ledgerId: existingDebit.id,
    };
  }

  return { ok: false, reason: 'CREDIT_LIMIT_EXCEEDED' };
}

/**
 * 9. PA1: HOÀN TIỀN NGUYÊN TỬ VIẾT MỚI HOÀN TOÀN (db.batch + STATE-GUARD REFUNDED_SUPPLIER_ERROR)
 * Tái dùng mẫu state-guard & sổ cái hoàn tiền của resolveAdminDispute nhưng bọc toàn bộ
 * trong 1 db.batch duy nhất để chống hoàn trùng 2 lần và chống lệch ví/sổ cái.
 */
export interface RefundSupplierOrderParams {
  orderTable: 'orders' | 'seller_orders';
  orderId: string;
  orderCode: string;
  buyerMemberId: string;
  refundAmountCore: number;
  reason: string;
  actor?: string;
  supplierId?: string | null;
  externalOrderRef?: string | null;
  supplierCostCore?: number;
}

export interface RefundSupplierOrderResult {
  ok: boolean;
  alreadyRefunded?: boolean;
  reason?: string;
  refundStatus?: 'REFUNDED_SUPPLIER_ERROR';
  walletTxId?: string;
  supplierLedgerId?: string;
}

export async function refundSupplierOrder(
  db: D1Database,
  params: RefundSupplierOrderParams
): Promise<RefundSupplierOrderResult> {
  const amount = Number(params.refundAmountCore);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'INVALID_REFUND_AMOUNT' };
  }
  const tableName = params.orderTable === 'seller_orders' ? 'seller_orders' : 'orders';
  const nowIso = new Date().toISOString();
  const txId = generateConnectorId('txref');
  const supplierLedgerId = generateConnectorId('eslref');
  const guardExistsSql = `EXISTS (SELECT 1 FROM ${tableName} WHERE id = ? AND status NOT IN ('REFUNDED_SUPPLIER_ERROR', 'REFUNDED', 'COMPLETED'))`;

  const statements: D1PreparedStatement[] = [
    // 0. Hoàn số dư vào ví Core người mua (chỉ chạy khi đơn chưa REFUNDED/COMPLETED)
    db
      .prepare(`
        UPDATE members
        SET balance = balance + ?, updated_at = ?
        WHERE id = ? AND ${guardExistsSql}
      `)
      .bind(amount, nowIso, params.buyerMemberId, params.orderId),

    // 1. Ghi nhật ký giao dịch ví REFUND
    db
      .prepare(`
        INSERT INTO wallet_transactions (
          id, member_id, member_email, type, amount, balance_before, balance_after,
          description, status, order_id, created_at
        )
        SELECT ?, id, email, 'REFUND', ?, balance - ?, balance, ?, 'COMPLETED', ?, ?
        FROM members
        WHERE id = ? AND ${guardExistsSql}
      `)
      .bind(
        txId,
        amount,
        amount,
        `Hoàn tiền tự động do lỗi NCC (${params.orderCode}): ${params.reason}`,
        params.orderId,
        nowIso,
        params.buyerMemberId,
        params.orderId
      ),
  ];

  const hasSupplierRollback = Boolean(params.supplierId && params.externalOrderRef);
  const supplierCost = Math.max(0, Number(params.supplierCostCore || 0));

  if (hasSupplierRollback) {
    if (supplierCost > 0) {
      statements.push(
        db
          .prepare(`
            UPDATE external_suppliers
            SET credit_used_core = CASE WHEN credit_used_core >= ? THEN credit_used_core - ? ELSE 0 END,
                updated_at = ?
            WHERE id = ? AND ${guardExistsSql}
          `)
          .bind(supplierCost, supplierCost, nowIso, params.supplierId, params.orderId)
      );
    }

    // Dòng REFUND_CREDIT dùng cùng external_order_ref với ORDER_DEBIT gốc -> hợp lệ nhờ UNIQUE(supplier_id, external_order_ref, entry_type)
    statements.push(
      db
        .prepare(`
          INSERT OR IGNORE INTO external_supplier_ledger (
            id, supplier_id, order_id, order_code, entry_type,
            cost_core, selling_core, profit_core, balance_due_after,
            external_order_ref, status, actor, note, created_at
          )
          SELECT
            ?, id, ?, ?, 'REFUND_CREDIT',
            ?, ?, 0, credit_used_core,
            ?, 'REVERSED', ?, ?, ?
          FROM external_suppliers
          WHERE id = ? AND ${guardExistsSql}
        `)
        .bind(
          supplierLedgerId,
          params.orderId,
          params.orderCode,
          -supplierCost,
          -amount,
          params.externalOrderRef,
          params.actor || 'system_auto_refund',
          `Hoàn công nợ do lỗi NCC (${params.reason})`,
          nowIso,
          params.supplierId,
          params.orderId
        )
    );
  }

  // Cuối batch: khóa trạng thái đơn sang REFUNDED_SUPPLIER_ERROR (chỉ khớp 1 lần duy nhất)
  const orderUpdateIdx = statements.length;
  if (tableName === 'orders') {
    statements.push(
      db
        .prepare(`
          UPDATE orders
          SET status = 'REFUNDED_SUPPLIER_ERROR',
              escrow_status = 'REFUNDED',
              updated_at = ?
          WHERE id = ?
            AND status NOT IN ('REFUNDED_SUPPLIER_ERROR', 'REFUNDED', 'COMPLETED')
        `)
        .bind(nowIso, params.orderId)
    );
  } else {
    statements.push(
      db
        .prepare(`
          UPDATE seller_orders
          SET status = 'REFUNDED_SUPPLIER_ERROR',
              updated_at = ?
          WHERE id = ?
            AND status NOT IN ('REFUNDED_SUPPLIER_ERROR', 'REFUNDED', 'COMPLETED')
        `)
        .bind(nowIso, params.orderId)
    );
  }

  const batchRes = await db.batch(statements);
  const orderChanges = Number((batchRes[orderUpdateIdx] as any)?.meta?.changes ?? 0);

  if (orderChanges === 0) {
    return { ok: false, alreadyRefunded: true, reason: 'ORDER_ALREADY_REFUNDED_OR_COMPLETED' };
  }

  return {
    ok: true,
    refundStatus: 'REFUNDED_SUPPLIER_ERROR',
    walletTxId: txId,
    supplierLedgerId: hasSupplierRollback ? supplierLedgerId : undefined,
  };
}

/**
 * 10. PA1: XỬ LÝ AFFILIATE POSTBACK WEBHOOK (HMAC + ANTI-REPLAY + IDEMPOTENCY)
 */
export interface AffiliatePostbackInput {
  supplierCode: string;
  rawBody: string;
  signatureHeader: string;
  timestampHeader: string;
  nowSec?: number;
}

export interface AffiliatePostbackResult {
  ok: boolean;
  status: number;
  duplicate?: boolean;
  ledgerId?: string;
  error?: string;
}

export async function processAffiliatePostback(
  db: D1Database,
  env: SupplierCryptoEnv,
  input: AffiliatePostbackInput
): Promise<AffiliatePostbackResult> {
  const code = String(input.supplierCode || '').trim();
  if (!code) {
    return { ok: false, status: 400, error: 'MISSING_SUPPLIER_CODE' };
  }
  if (!input.signatureHeader) {
    return { ok: false, status: 400, error: 'MISSING_SIGNATURE' };
  }

  const supplier = await db
    .prepare('SELECT * FROM external_suppliers WHERE code = ? AND is_active = 1 LIMIT 1')
    .bind(code)
    .first<any>();

  if (!supplier) {
    return { ok: false, status: 404, error: 'SUPPLIER_NOT_FOUND' };
  }
  if (supplier.mode !== 'AFFILIATE_POSTBACK') {
    return { ok: false, status: 400, error: 'SUPPLIER_NOT_AFFILIATE_MODE' };
  }
  if (!supplier.encrypted_webhook_secret) {
    return { ok: false, status: 500, error: 'WEBHOOK_SECRET_NOT_CONFIGURED' };
  }

  const secret = await decryptSupplierSecret(supplier.encrypted_webhook_secret, env);
  const verify = await verifyHmacSignature({
    payload: input.rawBody,
    secret,
    signature: input.signatureHeader,
    timestamp: input.timestampHeader,
    nowSec: input.nowSec,
  });

  if (!verify.ok) {
    return { ok: false, status: 401, error: verify.reason || 'INVALID_SIGNATURE' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(input.rawBody || '{}');
  } catch {
    return { ok: false, status: 400, error: 'INVALID_JSON' };
  }

  const externalOrderRef = String(parsed.external_order_ref || parsed.order_ref || parsed.transaction_id || '').trim();
  if (!externalOrderRef) {
    return { ok: false, status: 400, error: 'MISSING_EXTERNAL_ORDER_REF' };
  }

  const commissionCore = Number(parsed.commission_core ?? parsed.commission ?? 0);
  const orderAmountCore = Number(parsed.order_amount_core ?? parsed.amount ?? 0);
  if (!Number.isFinite(commissionCore) || commissionCore < 0) {
    return { ok: false, status: 400, error: 'INVALID_COMMISSION_AMOUNT' };
  }

  const ledgerId = generateConnectorId('esl_aff');
  const nowIso = new Date().toISOString();
  const subId = parsed.sub_id ? String(parsed.sub_id).slice(0, 128) : null;

  const insertRes = await db
    .prepare(`
      INSERT OR IGNORE INTO external_supplier_ledger (
        id, supplier_id, order_id, order_code, entry_type,
        cost_core, selling_core, profit_core, balance_due_after,
        external_order_ref, status, actor, note, created_at
      ) VALUES (?, ?, ?, ?, 'AFFILIATE_COMMISSION', 0, ?, ?, 0, ?, 'RECORDED', 'affiliate_postback', ?, ?)
    `)
    .bind(
      ledgerId,
      supplier.id,
      subId,
      externalOrderRef,
      Number.isFinite(orderAmountCore) ? orderAmountCore : 0,
      commissionCore,
      externalOrderRef,
      `Affiliate Postback${subId ? ` (sub_id=${subId})` : ''}`,
      nowIso
    )
    .run();

  const changes = Number((insertRes as any)?.meta?.changes ?? 0);
  if (changes === 0) {
    return { ok: true, status: 200, duplicate: true };
  }

  return { ok: true, status: 200, duplicate: false, ledgerId };
}

