import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyAdminAuth } from '../../../services/mission_service';
import {
  EXTERNAL_SUPPLIER_SAFE_SELECT,
  SupplierConfigError,
  calculateResellPrice,
  encryptSupplierSecret,
  generateConnectorId,
  maskSecretPrefix,
  syncExternalSupplierCatalog,
  validateOutboundHttpsUrl,
  validateOutboundHttpsUrlWithDns,
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
 * Dispatcher cho mọi route con của /api/admin/suppliers/:id/*
 * - GET    /api/admin/suppliers/:id
 * - PATCH  /api/admin/suppliers/:id
 * - DELETE /api/admin/suppliers/:id
 * - POST   /api/admin/suppliers/:id/test
 * - POST   /api/admin/suppliers/:id/sync
 * - GET    /api/admin/suppliers/:id/products      (hỗ trợ :id = 'all')
 * - PATCH  /api/admin/suppliers/:id/products/:pid
 * - GET    /api/admin/suppliers/:id/ledger        (hỗ trợ :id = 'all')
 * - POST   /api/admin/suppliers/:id/settle
 */
export async function handleAdminSupplierByIdRequest(
  context: { request: Request; env: Env; params?: Record<string, string> },
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

    const auth = await verifyAdminAuth(request, env as any, 'SUPPLIER_CONNECTORS_FULL');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền quản trị.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);

    const supplierId = decodeURIComponent(String(context.params?.id || subPathSegments[0] || '')).trim();
    const action = subPathSegments[1] || '';
    const thirdSeg = subPathSegments[2] || '';

    if (!supplierId) {
      return new Response(JSON.stringify({ success: false, error: 'Thiếu mã nhà cung cấp.' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // 1. GET /api/admin/suppliers/:id/products (hỗ trợ 'all')
    if (method === 'GET' && action === 'products') {
      const url = new URL(request.url);
      const pausedOnly = url.searchParams.get('paused') === '1';
      let sql = `
        SELECT esp.*, es.name AS supplier_name, es.code AS supplier_code, es.mode AS supplier_mode
        FROM external_supplier_products esp
        LEFT JOIN external_suppliers es ON esp.supplier_id = es.id
        WHERE 1=1
      `;
      const binds: any[] = [];
      if (supplierId !== 'all') {
        sql += ' AND esp.supplier_id = ?';
        binds.push(supplierId);
      }
      if (pausedOnly) {
        sql += ' AND esp.anti_loss_paused = 1';
      }
      sql += ' ORDER BY esp.updated_at DESC LIMIT 300';
      const rows = await (binds.length ? env.DB.prepare(sql).bind(...binds) : env.DB.prepare(sql)).all<any>();
      return new Response(
        JSON.stringify({ success: true, products: rows.results || [] }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 2. PATCH /api/admin/suppliers/:id/products/:pid (cập nhật giá/mapping/chống lỗ)
    if (method === 'PATCH' && action === 'products' && thirdSeg) {
      const prodRow = await env.DB
        .prepare('SELECT * FROM external_supplier_products WHERE id = ? LIMIT 1')
        .bind(thirdSeg)
        .first<any>();
      if (!prodRow) {
        return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy sản phẩm ánh xạ.' }), {
          status: 404,
          headers: CORS_HEADERS,
        });
      }
      const supRow = await env.DB
        .prepare('SELECT markup_type, markup_value, min_margin_core, auto_pause_enabled FROM external_suppliers WHERE id = ? LIMIT 1')
        .bind(prodRow.supplier_id)
        .first<any>();
      const body = (await request.json().catch(() => ({}))) as any;
      const nextCost =
        body.supplier_cost_core !== undefined ? Number(body.supplier_cost_core) : Number(prodRow.supplier_cost_core);
      const nextStock =
        body.external_stock !== undefined ? Number(body.external_stock) : Number(prodRow.external_stock);
      const overridePrice =
        body.selling_price_core !== undefined ? Number(body.selling_price_core) : Number(prodRow.selling_price_core);
      const calc = calculateResellPrice({
        supplierCostCore: nextCost,
        markupType: supRow?.markup_type === 'FIXED' ? 'FIXED' : 'PERCENT',
        markupValue: Number(supRow?.markup_value ?? 15),
        minMarginCore: Number(supRow?.min_margin_core ?? 0),
        overrideSellingPriceCore: overridePrice,
        externalStock: nextStock,
      });
      const paused = supRow?.auto_pause_enabled === 0 ? 0 : calc.antiLossPaused ? 1 : 0;
      const nextActive =
        paused === 1
          ? 0
          : body.is_active !== undefined
            ? body.is_active ? 1 : 0
            : Number(prodRow.is_active);
      const localProductId =
        body.local_product_id !== undefined ? String(body.local_product_id || '').trim() || null : prodRow.local_product_id;
      const nowIso = new Date().toISOString();

      await env.DB
        .prepare(`
          UPDATE external_supplier_products
          SET local_product_id = ?, supplier_cost_core = ?, selling_price_core = ?,
              profit_core = ?, external_stock = ?, anti_loss_paused = ?, anti_loss_reason = ?,
              is_active = ?, updated_at = ?
          WHERE id = ?
        `)
        .bind(
          localProductId,
          calc.supplierCostCore,
          calc.sellingPriceCore,
          calc.profitCore,
          nextStock,
          paused,
          calc.antiLossReason,
          nextActive,
          nowIso,
          thirdSeg
        )
        .run();

      const updated = await env.DB
        .prepare('SELECT * FROM external_supplier_products WHERE id = ? LIMIT 1')
        .bind(thirdSeg)
        .first<any>();
      return new Response(JSON.stringify({ success: true, product: updated }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // 3. GET /api/admin/suppliers/:id/ledger (hỗ trợ 'all')
    if (method === 'GET' && action === 'ledger') {
      let sql = `
        SELECT esl.*, es.name AS supplier_name, es.code AS supplier_code
        FROM external_supplier_ledger esl
        LEFT JOIN external_suppliers es ON esl.supplier_id = es.id
        WHERE 1=1
      `;
      const binds: any[] = [];
      if (supplierId !== 'all') {
        sql += ' AND esl.supplier_id = ?';
        binds.push(supplierId);
      }
      sql += ' ORDER BY esl.created_at DESC LIMIT 300';
      const rows = await (binds.length ? env.DB.prepare(sql).bind(...binds) : env.DB.prepare(sql)).all<any>();
      return new Response(
        JSON.stringify({ success: true, ledger: rows.results || [] }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // Kiểm tra sự tồn tại của NCC cho các thao tác cụ thể theo :id
    const supplier = await env.DB
      .prepare(`SELECT ${EXTERNAL_SUPPLIER_SAFE_SELECT} FROM external_suppliers WHERE id = ? LIMIT 1`)
      .bind(supplierId)
      .first<any>();

    if (!supplier) {
      return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy nhà cung cấp.' }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    // 4. GET /api/admin/suppliers/:id
    if (method === 'GET' && !action) {
      return new Response(JSON.stringify({ success: true, supplier }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // 5. PATCH /api/admin/suppliers/:id
    if (method === 'PATCH' && !action) {
      const body = (await request.json().catch(() => ({}))) as any;
      const sets: string[] = [];
      const binds: any[] = [];

      if (body.name !== undefined) {
        sets.push('name = ?');
        binds.push(String(body.name).trim());
      }
      if (body.mode !== undefined) {
        const m = String(body.mode).trim().toUpperCase();
        if (!['POSTPAID_CREDIT', 'AFFILIATE_POSTBACK', 'PREPAID_GUARD'].includes(m)) {
          return new Response(JSON.stringify({ success: false, error: 'Chế độ không hợp lệ.' }), {
            status: 400,
            headers: CORS_HEADERS,
          });
        }
        sets.push('mode = ?');
        binds.push(m);
      }
      if (body.base_url !== undefined) {
        const urlCheck = validateOutboundHttpsUrl(String(body.base_url));
        if (!urlCheck.ok || !urlCheck.normalizedUrl) {
          return new Response(
            JSON.stringify({ success: false, error: `URL bị từ chối (${urlCheck.reason}).`, reason: urlCheck.reason }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
        sets.push('base_url = ?');
        binds.push(urlCheck.normalizedUrl.replace(/\/+$/, ''));
      }
      if (body.auth_type !== undefined) {
        sets.push('auth_type = ?');
        binds.push(String(body.auth_type).trim().toUpperCase());
      }
      if (body.auth_header_name !== undefined) {
        sets.push('auth_header_name = ?');
        binds.push(String(body.auth_header_name).trim() || 'Authorization');
      }
      if (typeof body.api_key === 'string' && body.api_key.trim().length > 0) {
        const enc = await encryptSupplierSecret(body.api_key.trim(), env);
        sets.push('encrypted_api_key = ?', 'api_key_prefix = ?');
        binds.push(enc, maskSecretPrefix(body.api_key.trim()));
      }
      if (typeof body.webhook_secret === 'string' && body.webhook_secret.trim().length > 0) {
        const enc = await encryptSupplierSecret(body.webhook_secret.trim(), env);
        sets.push('encrypted_webhook_secret = ?', 'webhook_secret_prefix = ?');
        binds.push(enc, maskSecretPrefix(body.webhook_secret.trim()));
      }

      const simpleFields: Array<[string, (v: any) => any]> = [
        ['catalog_path', (v) => String(v || '').trim()],
        ['order_path', (v) => String(v || '').trim()],
        ['balance_path', (v) => String(v || '').trim()],
        ['field_mapping_json', (v) => (typeof v === 'string' ? v : JSON.stringify(v))],
        ['supports_idempotency', (v) => (v ? 1 : 0)],
        ['markup_type', (v) => (String(v).toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENT')],
        ['markup_value', (v) => Math.max(0, Number(v) || 0)],
        ['min_margin_core', (v) => Math.max(0, Number(v) || 0)],
        ['credit_limit_core', (v) => Math.max(0, Number(v) || 0)],
        ['prepaid_balance_core', (v) => Math.max(0, Number(v) || 0)],
        ['prepaid_min_balance', (v) => Math.max(0, Number(v) || 0)],
        ['auto_pause_enabled', (v) => (v ? 1 : 0)],
        ['is_active', (v) => (v ? 1 : 0)],
      ];
      for (const [col, transform] of simpleFields) {
        if (body[col] !== undefined) {
          sets.push(`${col} = ?`);
          binds.push(transform(body[col]));
        }
      }

      if (sets.length === 0) {
        return new Response(JSON.stringify({ success: true, supplier }), {
          status: 200,
          headers: CORS_HEADERS,
        });
      }

      sets.push('updated_at = ?');
      binds.push(new Date().toISOString(), supplierId);

      await env.DB
        .prepare(`UPDATE external_suppliers SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...binds)
        .run();

      const updated = await env.DB
        .prepare(`SELECT ${EXTERNAL_SUPPLIER_SAFE_SELECT} FROM external_suppliers WHERE id = ? LIMIT 1`)
        .bind(supplierId)
        .first<any>();

      return new Response(JSON.stringify({ success: true, supplier: updated }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // 6. DELETE /api/admin/suppliers/:id
    if (method === 'DELETE' && !action) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM external_supplier_products WHERE supplier_id = ?').bind(supplierId),
        env.DB.prepare('DELETE FROM external_supplier_ledger WHERE supplier_id = ?').bind(supplierId),
        env.DB.prepare('DELETE FROM external_suppliers WHERE id = ?').bind(supplierId),
      ]);
      return new Response(JSON.stringify({ success: true, deleted_id: supplierId }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // 7. POST /api/admin/suppliers/:id/test
    if (method === 'POST' && action === 'test') {
      const targetUrl = `${String(supplier.base_url).replace(/\/+$/, '')}${
        String(supplier.balance_path || supplier.catalog_path || '/').startsWith('/')
          ? String(supplier.balance_path || supplier.catalog_path || '/')
          : '/' + String(supplier.balance_path || supplier.catalog_path || '')
      }`;
      const dnsCheck = await validateOutboundHttpsUrlWithDns(targetUrl);
      const nowIso = new Date().toISOString();
      if (!dnsCheck.ok) {
        await env.DB
          .prepare('UPDATE external_suppliers SET last_health_status = ?, last_error = ?, updated_at = ? WHERE id = ?')
          .bind('BLOCKED', dnsCheck.reason || 'SSRF_BLOCKED', nowIso, supplierId)
          .run();
        return new Response(
          JSON.stringify({ success: false, status: 'BLOCKED', error: dnsCheck.reason || 'SSRF_BLOCKED' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      try {
        const res = await fetch(dnsCheck.normalizedUrl!, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        });
        const health = res.ok ? 'OK' : `HTTP_${res.status}`;
        await env.DB
          .prepare('UPDATE external_suppliers SET last_health_status = ?, last_error = ?, updated_at = ? WHERE id = ?')
          .bind(health, res.ok ? null : `HTTP_${res.status}`, nowIso, supplierId)
          .run();
        return new Response(
          JSON.stringify({ success: res.ok, http_status: res.status, health_status: health }),
          { status: 200, headers: CORS_HEADERS }
        );
      } catch (err: any) {
        const msg = (err?.message || 'CONNECTION_FAILED').slice(0, 300);
        await env.DB
          .prepare('UPDATE external_suppliers SET last_health_status = ?, last_error = ?, updated_at = ? WHERE id = ?')
          .bind('ERROR', msg, nowIso, supplierId)
          .run();
        return new Response(
          JSON.stringify({ success: false, health_status: 'ERROR', error: msg }),
          { status: 200, headers: CORS_HEADERS }
        );
      }
    }

    // 8. POST /api/admin/suppliers/:id/sync
    if (method === 'POST' && action === 'sync') {
      const syncRes = await syncExternalSupplierCatalog(env.DB, env, supplierId);
      return new Response(JSON.stringify({ success: syncRes.ok, ...syncRes }), {
        status: syncRes.ok ? 200 : 400,
        headers: CORS_HEADERS,
      });
    }

    // 9. POST /api/admin/suppliers/:id/settle (Quyết toán công nợ nguyên tử)
    if (method === 'POST' && action === 'settle') {
      const body = (await request.json().catch(() => ({}))) as any;
      const settleAmount = Number(body.amount_core || 0);
      if (!Number.isFinite(settleAmount) || settleAmount <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Số tiền tất toán phải lớn hơn 0.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const nowIso = new Date().toISOString();
      const ledgerId = generateConnectorId('esl_settle');
      const ref = String(body.reference || `SETTLE-${Date.now()}`).trim();
      const note = String(body.note || 'Admin ghi nhận đã tất toán công nợ cho NCC').trim();

      await env.DB.batch([
        env.DB
          .prepare(`
            UPDATE external_suppliers
            SET credit_used_core = CASE WHEN credit_used_core >= ? THEN credit_used_core - ? ELSE 0 END,
                updated_at = ?
            WHERE id = ?
          `)
          .bind(settleAmount, settleAmount, nowIso, supplierId),
        env.DB
          .prepare(`
            INSERT INTO external_supplier_ledger (
              id, supplier_id, order_id, order_code, entry_type,
              cost_core, selling_core, profit_core, balance_due_after,
              external_order_ref, status, actor, note, created_at
            )
            SELECT ?, id, NULL, ?, 'SETTLEMENT_PAID', ?, 0, 0, credit_used_core, ?, 'SETTLED', ?, ?, ?
            FROM external_suppliers WHERE id = ?
          `)
          .bind(
            ledgerId,
            ref,
            -settleAmount,
            ref,
            auth.adminName || auth.adminId || 'admin',
            note,
            nowIso,
            supplierId
          ),
      ]);

      const updated = await env.DB
        .prepare(`SELECT ${EXTERNAL_SUPPLIER_SAFE_SELECT} FROM external_suppliers WHERE id = ? LIMIT 1`)
        .bind(supplierId)
        .first<any>();

      return new Response(
        JSON.stringify({ success: true, ledger_id: ledgerId, supplier: updated }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    return new Response(JSON.stringify({ success: false, error: 'Hành động không được hỗ trợ.' }), {
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
      JSON.stringify({ success: false, error: err?.message || 'Lỗi xử lý nguồn hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export const onRequest: PagesFunction<Env> = async (context) =>
  handleAdminSupplierByIdRequest(context as any, [String((context.params as any)?.id || '')]);
