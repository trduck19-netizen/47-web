import { ensureSchemaUpgrades } from '../../services/d1_service';
import {
  SupplierConfigError,
  processAffiliatePostback,
} from '../../services/supplier_connector_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  MARKETPLACE_CODE_KEY?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-WCG-Signature, X-WCG-Timestamp, X-WCG-Supplier-Code',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * POST /api/webhooks/affiliate-postback
 * Nhận Postback Webhook từ mạng Affiliate đối tác chính thức (PA1 chế độ AFFILIATE_POSTBACK).
 * Bảo vệ bằng chữ ký HMAC-SHA256 + cửa sổ chống replay ±300s + idempotency (supplier_id, external_order_ref, entry_type).
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

    await ensureSchemaUpgrades(env.DB);

    const url = new URL(request.url);
    const rawBody = await request.text();
    let bodySupplierCode = '';
    try {
      const parsed = JSON.parse(rawBody || '{}');
      if (parsed?.supplier_code) bodySupplierCode = String(parsed.supplier_code);
    } catch {}

    const supplierCode = (
      request.headers.get('X-WCG-Supplier-Code') ||
      url.searchParams.get('supplier_code') ||
      bodySupplierCode ||
      ''
    ).trim();

    const signatureHeader = (
      request.headers.get('X-WCG-Signature') ||
      request.headers.get('X-Signature') ||
      ''
    ).trim();

    const timestampHeader = (
      request.headers.get('X-WCG-Timestamp') ||
      request.headers.get('X-Timestamp') ||
      ''
    ).trim();

    const result = await processAffiliatePostback(env.DB, env, {
      supplierCode,
      rawBody,
      signatureHeader,
      timestampHeader,
    });

    return new Response(
      JSON.stringify({
        success: result.ok,
        duplicate: result.duplicate,
        ledger_id: result.ledgerId,
        error: result.error,
      }),
      { status: result.status, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err instanceof SupplierConfigError) {
      return new Response(
        JSON.stringify({ success: false, code: err.code, error: err.message }),
        { status: err.status, headers: CORS_HEADERS }
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi xử lý affiliate postback.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
