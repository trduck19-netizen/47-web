import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';
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
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

function mapSafeWebhookRow(row: any) {
  if (!row) return null;
  const { encrypted_hmac_secret: _enc, ...rest } = row;
  let events: string[] = ['order.paid'];
  try {
    const parsed = JSON.parse(rest.events_json || '["order.paid"]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      events = parsed.map(String);
    }
  } catch {}
  return {
    ...rest,
    events,
  };
}

/**
 * Dispatcher cho /api/seller/webhooks/* (cô lập tuyệt đối theo auth.seller.id):
 * - GET    /api/seller/webhooks
 * - POST   /api/seller/webhooks
 * - PATCH  /api/seller/webhooks/:id
 * - DELETE /api/seller/webhooks/:id
 * - POST   /api/seller/webhooks/:id/test
 * - GET    /api/seller/webhooks/deliveries
 * - POST   /api/seller/webhooks/deliveries/:deliveryId/retry
 */
export async function handleSellerWebhooksRequest(
  context: { request: Request; env: Env; fetchImpl?: typeof fetch },
  subPathSegments: string[] = []
): Promise<Response> {
  const { request, env, fetchImpl } = context;
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return onRequestOptions(context as any);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    await ensureSchemaUpgrades(env.DB);

    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!auth.authorized || !auth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu đăng nhập chủ gian hàng để quản lý Webhook.' }),
        { status: auth.status || 401, headers: CORS_HEADERS }
      );
    }

    const mySellerId = auth.seller.id;
    const seg0 = subPathSegments[0] || '';
    const seg1 = subPathSegments[1] || '';
    const seg2 = subPathSegments[2] || '';

    // 1. GET /api/seller/webhooks/deliveries — Chỉ trả nhật ký thuộc gian hàng của mình
    if (method === 'GET' && seg0 === 'deliveries' && !seg1) {
      const url = new URL(request.url);
      const webhookId = (url.searchParams.get('webhook_id') || '').trim();
      let sql = `
        SELECT d.id, d.webhook_id, d.seller_id, d.order_id, d.order_code, d.event_type,
               d.http_status, d.response_snippet, d.attempts, d.delivery_status,
               d.external_fulfillment_ref, d.error_message, d.created_at, d.delivered_at,
               w.name AS webhook_name, w.webhook_url
        FROM supplier_fulfillment_deliveries d
        LEFT JOIN supplier_fulfillment_webhooks w ON d.webhook_id = w.id
        WHERE d.seller_id = ?
      `;
      const binds: any[] = [mySellerId];
      if (webhookId) {
        sql += ' AND d.webhook_id = ?';
        binds.push(webhookId);
      }
      sql += ' ORDER BY d.created_at DESC LIMIT 100';
      const rows = await env.DB.prepare(sql).bind(...binds).all<any>();
      return new Response(
        JSON.stringify({ success: true, deliveries: rows.results || [] }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 2. POST /api/seller/webhooks/deliveries/:deliveryId/retry — Kiểm sở hữu delivery.seller_id === mySellerId TRƯỚC khi retry
    if (method === 'POST' && seg0 === 'deliveries' && seg1 && seg2 === 'retry') {
      const delivery = await env.DB
        .prepare('SELECT id, seller_id FROM supplier_fulfillment_deliveries WHERE id = ? LIMIT 1')
        .bind(seg1)
        .first<{ id: string; seller_id: string }>();

      if (!delivery) {
        return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy bản ghi gửi webhook.' }), {
          status: 404,
          headers: CORS_HEADERS,
        });
      }

      if (delivery.seller_id !== mySellerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Bạn không có quyền gửi lại webhook của gian hàng khác.' }),
          { status: 403, headers: CORS_HEADERS }
        );
      }

      const retryRes = await retrySupplierWebhookDelivery(env.DB, env, seg1, fetchImpl);
      return new Response(JSON.stringify({ success: retryRes.ok, ...retryRes }), {
        status: retryRes.error === 'DELIVERY_NOT_FOUND' ? 404 : 200,
        headers: CORS_HEADERS,
      });
    }

    // 3. GET /api/seller/webhooks — Danh sách webhook & deliveries của riêng gian hàng
    if (method === 'GET' && !seg0) {
      const [hooksRes, deliveriesRes] = await Promise.all([
        env.DB
          .prepare(`SELECT ${SUPPLIER_WEBHOOK_SAFE_SELECT} FROM supplier_fulfillment_webhooks WHERE seller_id = ? ORDER BY created_at DESC LIMIT 100`)
          .bind(mySellerId)
          .all<any>(),
        env.DB
          .prepare(`
            SELECT d.id, d.webhook_id, d.seller_id, d.order_id, d.order_code, d.event_type,
                   d.http_status, d.response_snippet, d.attempts, d.delivery_status,
                   d.external_fulfillment_ref, d.error_message, d.created_at, d.delivered_at,
                   w.name AS webhook_name
            FROM supplier_fulfillment_deliveries d
            LEFT JOIN supplier_fulfillment_webhooks w ON d.webhook_id = w.id
            WHERE d.seller_id = ?
            ORDER BY d.created_at DESC
            LIMIT 50
          `)
          .bind(mySellerId)
          .all<any>(),
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          seller_id: mySellerId,
          webhooks: (hooksRes.results || []).map(mapSafeWebhookRow),
          deliveries: deliveriesRes.results || [],
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 4. POST /api/seller/webhooks — Tạo webhook HMAC mới cho chính gian hàng mình (bỏ qua body.seller_id)
    if (method === 'POST' && !seg0) {
      const body = (await request.json().catch(() => ({}))) as any;
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

      const events =
        Array.isArray(body.events) && body.events.length > 0
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
          mySellerId, // Bắt buộc dùng auth.seller.id, tuyệt đối bỏ qua body.seller_id
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
        .prepare(`SELECT ${SUPPLIER_WEBHOOK_SAFE_SELECT} FROM supplier_fulfillment_webhooks WHERE id = ? AND seller_id = ? LIMIT 1`)
        .bind(id, mySellerId)
        .first<any>();

      return new Response(
        JSON.stringify({
          success: true,
          webhook: mapSafeWebhookRow(created),
          raw_hmac_secret: rawSecret,
        }),
        { status: 201, headers: CORS_HEADERS }
      );
    }

    // 5. POST /api/seller/webhooks/:id/test — Ping test đúng webhook của chính gian hàng mình
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

      if (hook.seller_id !== mySellerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Bạn không có quyền gửi ping test cho webhook của gian hàng khác.' }),
          { status: 403, headers: CORS_HEADERS }
        );
      }

      const summary = await dispatchSupplierFulfillmentWebhook(env.DB, env, {
        sellerIds: [mySellerId],
        webhookId: hook.id,
        orderId: `test_${Date.now()}`,
        orderCode: `PING-${Date.now().toString().slice(-6)}`,
        eventType: 'webhook.test',
        payloadData: {
          message: 'Universal Mall Seller HMAC webhook connectivity test',
          webhook_id: hook.id,
          webhook_name: hook.name,
          seller_id: mySellerId,
        },
        fetchImpl,
      });

      return new Response(
        JSON.stringify({ success: summary.delivered > 0, ...summary }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 6. PATCH /api/seller/webhooks/:id — Cập nhật webhook của chính gian hàng mình
    if (method === 'PATCH' && seg0 && !seg1) {
      const existing = await env.DB
        .prepare('SELECT id, seller_id FROM supplier_fulfillment_webhooks WHERE id = ? LIMIT 1')
        .bind(seg0)
        .first<{ id: string; seller_id: string }>();

      if (!existing) {
        return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy webhook.' }), {
          status: 404,
          headers: CORS_HEADERS,
        });
      }

      if (existing.seller_id !== mySellerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Bạn không có quyền chỉnh sửa webhook của gian hàng khác.' }),
          { status: 403, headers: CORS_HEADERS }
        );
      }

      const body = (await request.json().catch(() => ({}))) as any;
      const sets: string[] = [];
      const binds: any[] = [];
      let rotatedRawSecret: string | undefined;

      if (body.name !== undefined) {
        sets.push('name = ?');
        binds.push(String(body.name).trim());
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
        binds.push(JSON.stringify(Array.isArray(body.events) && body.events.length > 0 ? body.events.map(String) : ['order.paid']));
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
        binds.push(new Date().toISOString(), seg0, mySellerId);
        await env.DB
          .prepare(`UPDATE supplier_fulfillment_webhooks SET ${sets.join(', ')} WHERE id = ? AND seller_id = ?`)
          .bind(...binds)
          .run();
      }

      const updated = await env.DB
        .prepare(`SELECT ${SUPPLIER_WEBHOOK_SAFE_SELECT} FROM supplier_fulfillment_webhooks WHERE id = ? AND seller_id = ? LIMIT 1`)
        .bind(seg0, mySellerId)
        .first<any>();

      return new Response(
        JSON.stringify({
          success: true,
          webhook: mapSafeWebhookRow(updated),
          ...(rotatedRawSecret ? { raw_hmac_secret: rotatedRawSecret } : {}),
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 7. DELETE /api/seller/webhooks/:id — Xóa webhook của chính gian hàng mình
    if (method === 'DELETE' && seg0 && !seg1) {
      const existing = await env.DB
        .prepare('SELECT id, seller_id FROM supplier_fulfillment_webhooks WHERE id = ? LIMIT 1')
        .bind(seg0)
        .first<{ id: string; seller_id: string }>();

      if (!existing) {
        return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy webhook.' }), {
          status: 404,
          headers: CORS_HEADERS,
        });
      }

      if (existing.seller_id !== mySellerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Bạn không có quyền xóa webhook của gian hàng khác.' }),
          { status: 403, headers: CORS_HEADERS }
        );
      }

      await env.DB.batch([
        env.DB.prepare('DELETE FROM supplier_fulfillment_deliveries WHERE webhook_id = ? AND seller_id = ?').bind(seg0, mySellerId),
        env.DB.prepare('DELETE FROM supplier_fulfillment_webhooks WHERE id = ? AND seller_id = ?').bind(seg0, mySellerId),
      ]);

      return new Response(JSON.stringify({ success: true, deleted_id: seg0 }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Route webhook gian hàng không tồn tại.' }), {
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
      JSON.stringify({ success: false, error: err?.message || 'Lỗi xử lý webhook gian hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export const onRequest: PagesFunction<Env> = async (context) =>
  handleSellerWebhooksRequest(context as any, []);
