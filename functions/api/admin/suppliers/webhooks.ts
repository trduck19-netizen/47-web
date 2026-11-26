import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyAdminAuth } from '../../../services/mission_service';
import {
  SUPPLIER_WEBHOOK_SAFE_SELECT,
  SupplierConfigError,
  dispatchSupplierFulfillmentWebhook,
  encryptSupplierSecret,
  generateConnectorId,
  generateRandomHmacSecret,
  maskSecretPrefix,
  retrySupplierWebhookDelivery,
  validateOutboundHttpsUrl,
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
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key, X-Admin-Key, X-Sync-Key',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * Dispatcher cho /api/admin/suppliers/webhooks/*
 * - GET    /api/admin/suppliers/webhooks
 * - POST   /api/admin/suppliers/webhooks
 * - PATCH  /api/admin/suppliers/webhooks/:id
 * - DELETE /api/admin/suppliers/webhooks/:id
 * - POST   /api/admin/suppliers/webhooks/:id/test
 * - GET    /api/admin/suppliers/webhooks/deliveries
 * - POST   /api/admin/suppliers/webhooks/deliveries/:deliveryId/retry
 */
export async function handleAdminSupplierWebhooksRequest(
  context: { request: Request; env: Env },
  subPathSegments: string[] = []
): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return onRequestOptions(context as any);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const auth = await verifyAdminAuth(request, env as any, 'SUPPLIER_FULFILLMENT_MANAGE');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền quản trị Webhook NCC.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);

    const seg0 = subPathSegments[0] || '';
    const seg1 = subPathSegments[1] || '';
    const seg2 = subPathSegments[2] || '';

    // 1. GET /api/admin/suppliers/webhooks/deliveries
    if (method === 'GET' && seg0 === 'deliveries') {
      const url = new URL(request.url);
      const webhookId = (url.searchParams.get('webhook_id') || '').trim();
      let sql = `
        SELECT d.*, w.name AS webhook_name, w.webhook_url
        FROM supplier_fulfillment_deliveries d
        LEFT JOIN supplier_fulfillment_webhooks w ON d.webhook_id = w.id
        WHERE 1=1
      `;
      const binds: any[] = [];
      if (webhookId) {
        sql += ' AND d.webhook_id = ?';
        binds.push(webhookId);
      }
      sql += ' ORDER BY d.created_at DESC LIMIT 200';
      const rows = await (binds.length ? env.DB.prepare(sql).bind(...binds) : env.DB.prepare(sql)).all<any>();
      return new Response(
        JSON.stringify({ success: true, deliveries: rows.results || [] }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 2. POST /api/admin/suppliers/webhooks/deliveries/:deliveryId/retry
    if (method === 'POST' && seg0 === 'deliveries' && seg1 && seg2 === 'retry') {
      const retryRes = await retrySupplierWebhookDelivery(env.DB, env, seg1);
      return new Response(JSON.stringify({ success: retryRes.ok, ...retryRes }), {
        status: retryRes.error === 'DELIVERY_NOT_FOUND' ? 404 : 200,
        headers: CORS_HEADERS,
      });
    }

    // 3. GET /api/admin/suppliers/webhooks
    if (method === 'GET' && !seg0) {
      const [hooksRes, deliveriesRes] = await Promise.all([
        env.DB
          .prepare(`SELECT ${SUPPLIER_WEBHOOK_SAFE_SELECT} FROM supplier_fulfillment_webhooks ORDER BY created_at DESC LIMIT 200`)
          .all<any>(),
        env.DB
          .prepare(`
            SELECT d.id, d.webhook_id, d.seller_id, d.order_id, d.order_code, d.event_type,
                   d.http_status, d.response_snippet, d.attempts, d.delivery_status,
                   d.external_fulfillment_ref, d.error_message, d.created_at, d.delivered_at,
                   w.name AS webhook_name
            FROM supplier_fulfillment_deliveries d
            LEFT JOIN supplier_fulfillment_webhooks w ON d.webhook_id = w.id
            ORDER BY d.created_at DESC
            LIMIT 100
          `)
          .all<any>(),
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          webhooks: hooksRes.results || [],
          deliveries: deliveriesRes.results || [],
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 4. POST /api/admin/suppliers/webhooks (Tạo mới webhook HMAC)
    if (method === 'POST' && !seg0) {
      const body = (await request.json().catch(() => ({}))) as any;
      const sellerId = String(body.seller_id || 'official_store').trim();
      const name = String(body.name || '').trim();
      const webhookUrlRaw = String(body.webhook_url || '').trim();
      if (!name || !webhookUrlRaw) {
        return new Response(
          JSON.stringify({ success: false, error: 'Vui lòng nhập tên (name) và URL webhook HTTPS.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const urlCheck = validateOutboundHttpsUrl(webhookUrlRaw);
      if (!urlCheck.ok || !urlCheck.normalizedUrl) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Webhook URL bị chặn SSRF hoặc không phải HTTPS (${urlCheck.reason}).`,
            reason: urlCheck.reason,
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const rawSecret =
        typeof body.hmac_secret === 'string' && body.hmac_secret.trim().length >= 16
          ? body.hmac_secret.trim()
          : generateRandomHmacSecret();
      const encryptedSecret = await encryptSupplierSecret(rawSecret, env);
      const secretPrefix = maskSecretPrefix(rawSecret);

      const events = Array.isArray(body.events) && body.events.length > 0
        ? body.events.map(String)
        : ['order.paid'];
      const timeoutMs = Math.min(Math.max(Number(body.timeout_ms) || 5000, 1000), 10000);
      const retryMax = Math.min(Math.max(Number(body.retry_max) || 2, 0), 5);
      const id = generateConnectorId('whk');
      const nowIso = new Date().toISOString();

      await env.DB
        .prepare(`
          INSERT INTO supplier_fulfillment_webhooks (
            id, seller_id, name, webhook_url, encrypted_hmac_secret, secret_prefix,
            events_json, is_active, timeout_ms, retry_max, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          id,
          sellerId,
          name,
          urlCheck.normalizedUrl,
          encryptedSecret,
          secretPrefix,
          JSON.stringify(events),
          body.is_active === false || body.is_active === 0 ? 0 : 1,
          timeoutMs,
          retryMax,
          nowIso,
          nowIso
        )
        .run();

      const created = await env.DB
        .prepare(`SELECT ${SUPPLIER_WEBHOOK_SAFE_SELECT} FROM supplier_fulfillment_webhooks WHERE id = ? LIMIT 1`)
        .bind(id)
        .first<any>();

      return new Response(
        JSON.stringify({
          success: true,
          webhook: created,
          raw_hmac_secret: rawSecret,
        }),
        { status: 201, headers: CORS_HEADERS }
      );
    }

    // 5. POST /api/admin/suppliers/webhooks/:id/test
    if (method === 'POST' && seg0 && seg1 === 'test') {
      const hook = await env.DB
        .prepare('SELECT id, seller_id, name FROM supplier_fulfillment_webhooks WHERE id = ? LIMIT 1')
        .bind(seg0)
        .first<any>();
      if (!hook) {
        return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy webhook.' }), {
          status: 404,
          headers: CORS_HEADERS,
        });
      }

      const summary = await dispatchSupplierFulfillmentWebhook(env.DB, env, {
        sellerIds: [hook.seller_id],
        orderId: `test_${Date.now()}`,
        orderCode: `PING-${Date.now().toString().slice(-6)}`,
        eventType: 'webhook.test',
        payloadData: {
          message: 'Universal Mall HMAC webhook connectivity test',
          webhook_id: hook.id,
          webhook_name: hook.name,
        },
      });

      return new Response(
        JSON.stringify({ success: summary.delivered > 0, ...summary }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 6. PATCH /api/admin/suppliers/webhooks/:id
    if (method === 'PATCH' && seg0 && !seg1) {
      const existing = await env.DB
        .prepare('SELECT id FROM supplier_fulfillment_webhooks WHERE id = ? LIMIT 1')
        .bind(seg0)
        .first<any>();
      if (!existing) {
        return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy webhook.' }), {
          status: 404,
          headers: CORS_HEADERS,
        });
      }

      const body = (await request.json().catch(() => ({}))) as any;
      const sets: string[] = [];
      const binds: any[] = [];
      let rotatedRawSecret: string | undefined;

      if (body.name !== undefined) {
        sets.push('name = ?');
        binds.push(String(body.name).trim());
      }
      if (body.seller_id !== undefined) {
        sets.push('seller_id = ?');
        binds.push(String(body.seller_id).trim());
      }
      if (body.webhook_url !== undefined) {
        const urlCheck = validateOutboundHttpsUrl(String(body.webhook_url));
        if (!urlCheck.ok || !urlCheck.normalizedUrl) {
          return new Response(
            JSON.stringify({ success: false, error: `URL bị từ chối (${urlCheck.reason}).`, reason: urlCheck.reason }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
        sets.push('webhook_url = ?');
        binds.push(urlCheck.normalizedUrl);
      }
      if (body.events !== undefined) {
        sets.push('events_json = ?');
        binds.push(JSON.stringify(Array.isArray(body.events) ? body.events : ['order.paid']));
      }
      if (body.is_active !== undefined) {
        sets.push('is_active = ?');
        binds.push(body.is_active ? 1 : 0);
      }
      if (body.timeout_ms !== undefined) {
        sets.push('timeout_ms = ?');
        binds.push(Math.min(Math.max(Number(body.timeout_ms) || 5000, 1000), 10000));
      }
      if (body.retry_max !== undefined) {
        sets.push('retry_max = ?');
        binds.push(Math.min(Math.max(Number(body.retry_max) || 2, 0), 5));
      }
      if (body.rotate_secret === true || (typeof body.hmac_secret === 'string' && body.hmac_secret.trim().length >= 16)) {
        const nextSecret =
          typeof body.hmac_secret === 'string' && body.hmac_secret.trim().length >= 16
            ? body.hmac_secret.trim()
            : generateRandomHmacSecret();
        rotatedRawSecret = nextSecret;
        const enc = await encryptSupplierSecret(nextSecret, env);
        sets.push('encrypted_hmac_secret = ?', 'secret_prefix = ?');
        binds.push(enc, maskSecretPrefix(nextSecret));
      }

      if (sets.length > 0) {
        sets.push('updated_at = ?');
        binds.push(new Date().toISOString(), seg0);
        await env.DB
          .prepare(`UPDATE supplier_fulfillment_webhooks SET ${sets.join(', ')} WHERE id = ?`)
          .bind(...binds)
          .run();
      }

      const updated = await env.DB
        .prepare(`SELECT ${SUPPLIER_WEBHOOK_SAFE_SELECT} FROM supplier_fulfillment_webhooks WHERE id = ? LIMIT 1`)
        .bind(seg0)
        .first<any>();

      return new Response(
        JSON.stringify({ success: true, webhook: updated, ...(rotatedRawSecret ? { raw_hmac_secret: rotatedRawSecret } : {}) }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 7. DELETE /api/admin/suppliers/webhooks/:id
    if (method === 'DELETE' && seg0 && !seg1) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM supplier_fulfillment_deliveries WHERE webhook_id = ?').bind(seg0),
        env.DB.prepare('DELETE FROM supplier_fulfillment_webhooks WHERE id = ?').bind(seg0),
      ]);
      return new Response(JSON.stringify({ success: true, deleted_id: seg0 }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Route webhook không tồn tại.' }), {
      status: 404,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    if (err instanceof SupplierConfigError) {
      return new Response(
        JSON.stringify({ success: false, code: err.code, error: err.message }),
        { status: err.status, headers: CORS_HEADERS }
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi xử lý webhook NCC.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export const onRequest: PagesFunction<Env> = async (context) =>
  handleAdminSupplierWebhooksRequest(context as any, []);
