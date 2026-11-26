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
