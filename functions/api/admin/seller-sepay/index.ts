import { verifyAdminAuth } from '../../../services/mission_service';
import { logAdminAudit } from '../../../services/d1_service';
import { getMarketplaceConfig } from '../../../services/marketplace_service';
import { ensureSellerSepaySchema } from '../../../services/seller_sepay_service';
import { invalidateCatalogEdgeCache } from '../../../services/cache_service';

interface Env {
  DB: D1Database;
  ADMIN_API_KEY?: string;
  ADMIN_SYNC_SECRET?: string;
  PINE_API_KEY?: string;
  MUSE_API_KEY?: string;
  JWT_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key, X-Sync-Key, X-Api-Key',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export async function handleAdminSellerSepayRequest(
  context: { request: Request; env: Env; waitUntil?: (p: Promise<any>) => void },
  segments: string[]
): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: 'D1 Database chưa sẵn sàng.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    await ensureSellerSepaySchema(env.DB);
    const auth = await verifyAdminAuth(request, env as any, 'SELLER_SEPAY_MANAGE');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền Quản trị viên (SELLER_SEPAY_MANAGE).' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const adminActor = auth.adminName || (auth as any).member?.username || 'Admin';

    // 1. GET /api/admin/seller-sepay — Tổng quan KPI, chính sách, danh sách cấu hình & nhật ký GD
    if (method === 'GET' && segments.length === 0) {
      const url = new URL(request.url);
      const txLimit = Math.min(100, Math.max(10, Number(url.searchParams.get('limit') || 50)));
      const txFilter = (url.searchParams.get('tx_filter') || 'all').toLowerCase();

      let txWhere = '';
      if (txFilter === 'exceptions') {
        txWhere = "WHERE t.status IN ('UNDERPAID', 'EXPIRED_PAYMENT', 'DUPLICATE_PAYMENT', 'UNMATCHED', 'UNAUTHORIZED', 'PENDING_MANUAL_CODE')";
      } else if (txFilter === 'success') {
        txWhere = "WHERE t.status IN ('SUCCESS', 'RESOLVED_DELIVERED', 'RESOLVED_REFUNDED_BANK')";
      }

      const [mConfig, configsRes, txsRes, kpiRow] = await Promise.all([
        getMarketplaceConfig(env.DB),
        env.DB.prepare(`
          SELECT
            ssc.seller_id, ssc.is_enabled, ssc.admin_locked, ssc.admin_lock_reason,
            ssc.bank_name, ssc.account_number, ssc.account_holder, ssc.payment_prefix,
            ssc.webhook_key_prefix, ssc.api_token_prefix, ssc.connection_verified,
            ssc.last_verified_at, ssc.last_webhook_at, ssc.unauth_fail_count_1h,
            ssc.fee_debt_core, ssc.total_direct_orders, ssc.total_direct_volume_vnd,
            ssc.updated_at,
            s.name as seller_name, s.slug as seller_slug, s.status as seller_status
          FROM seller_sepay_configs ssc
          LEFT JOIN sellers s ON s.id = ssc.seller_id
          ORDER BY ssc.updated_at DESC
          LIMIT 200
        `).all<any>(),
        env.DB.prepare(`
          SELECT t.*, s.name as seller_name, s.slug as seller_slug
          FROM seller_sepay_transactions t
          LEFT JOIN sellers s ON s.id = t.seller_id
          ${txWhere}
          ORDER BY t.created_at DESC
          LIMIT ?
        `)
          .bind(txLimit)
          .all<any>(),
        env.DB.prepare(`
          SELECT
            COUNT(*) as total_configured,
            SUM(CASE WHEN is_enabled = 1 AND admin_locked = 0 THEN 1 ELSE 0 END) as active_gateways,
            SUM(CASE WHEN admin_locked = 1 THEN 1 ELSE 0 END) as locked_gateways,
            COALESCE(SUM(total_direct_orders), 0) as total_direct_orders,
            COALESCE(SUM(total_direct_volume_vnd), 0) as total_direct_volume_vnd,
            COALESCE(SUM(fee_debt_core), 0) as total_fee_debt_core
          FROM seller_sepay_configs
        `).first<any>(),
      ]);

      const openExRow = await env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM seller_sepay_transactions
        WHERE status IN ('UNDERPAID', 'EXPIRED_PAYMENT', 'DUPLICATE_PAYMENT', 'UNMATCHED', 'UNAUTHORIZED', 'PENDING_MANUAL_CODE')
      `).first<{ cnt: number }>();

      return new Response(
        JSON.stringify({
          success: true,
          policy: {
            direct_sepay_global_enabled: Boolean(mConfig.direct_sepay_global_enabled),
            direct_sepay_fee_pct: Number(mConfig.direct_sepay_fee_pct || 0),
            direct_sepay_debt_limit_core: Number(mConfig.direct_sepay_debt_limit_core || 0),
          },
          kpi: {
            total_configured: Number(kpiRow?.total_configured || 0),
            active_gateways: Number(kpiRow?.active_gateways || 0),
            locked_gateways: Number(kpiRow?.locked_gateways || 0),
            total_direct_orders: Number(kpiRow?.total_direct_orders || 0),
            total_direct_volume_vnd: Number(kpiRow?.total_direct_volume_vnd || 0),
            total_fee_debt_core: Number(kpiRow?.total_fee_debt_core || 0),
            open_exceptions: Number(openExRow?.cnt || 0),
          },
          configs: configsRes?.results || [],
          transactions: txsRes?.results || [],
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 2. PUT /api/admin/seller-sepay/policy — Cập nhật % phí (mặc định 0%) & hạn mức công nợ toàn sàn
    if (method === 'PUT' && segments.length === 1 && segments[0] === 'policy') {
      const body = (await request.json().catch(() => ({}))) as any;
      const current = await getMarketplaceConfig(env.DB);
      const nextConfig = {
        ...current,
        direct_sepay_global_enabled:
          typeof body.direct_sepay_global_enabled === 'boolean'
            ? body.direct_sepay_global_enabled
            : current.direct_sepay_global_enabled,
        direct_sepay_fee_pct:
          body.direct_sepay_fee_pct !== undefined && Number.isFinite(Number(body.direct_sepay_fee_pct))
            ? Math.min(50, Math.max(0, Number(body.direct_sepay_fee_pct)))
            : current.direct_sepay_fee_pct,
        direct_sepay_debt_limit_core:
          body.direct_sepay_debt_limit_core !== undefined && Number.isFinite(Number(body.direct_sepay_debt_limit_core))
            ? Math.max(0, Math.round(Number(body.direct_sepay_debt_limit_core)))
            : current.direct_sepay_debt_limit_core,
      };

      await env.DB.prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('wcg_marketplace_config_v1', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `)
        .bind(JSON.stringify(nextConfig))
        .run();

      await invalidateCatalogEdgeCache(context as any, request, env as any).catch(() => {});

      await logAdminAudit(env.DB, {
        actorName: adminActor,
        action: 'ADMIN_SELLER_SEPAY_POLICY_UPDATED',
        targetId: 'wcg_marketplace_config_v1',
        details: {
          direct_sepay_global_enabled: nextConfig.direct_sepay_global_enabled,
          direct_sepay_fee_pct: nextConfig.direct_sepay_fee_pct,
          direct_sepay_debt_limit_core: nextConfig.direct_sepay_debt_limit_core,
        },
      }).catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Đã cập nhật chính sách Cổng SePay riêng gian hàng toàn sàn.',
          policy: {
            direct_sepay_global_enabled: nextConfig.direct_sepay_global_enabled,
            direct_sepay_fee_pct: nextConfig.direct_sepay_fee_pct,
            direct_sepay_debt_limit_core: nextConfig.direct_sepay_debt_limit_core,
          },
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 3. POST /api/admin/seller-sepay/:sellerId/lock — Khóa / Mở khóa khẩn cấp cổng SePay của 1 shop
    if (method === 'POST' && segments.length === 2 && segments[1] === 'lock') {
      const targetSellerId = segments[0];
      const body = (await request.json().catch(() => ({}))) as any;
      const locked = Boolean(body.locked);
      const reason = String(body.reason || '').trim();
      const nowIso = new Date().toISOString();

      const existing = await env.DB.prepare('SELECT seller_id FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
        .bind(targetSellerId)
        .first<{ seller_id: string }>();

      if (!existing) {
        return new Response(
          JSON.stringify({ success: false, error: 'Gian hàng này chưa khởi tạo cấu hình SePay riêng.' }),
          { status: 404, headers: CORS_HEADERS }
        );
      }

      await env.DB.prepare(`
        UPDATE seller_sepay_configs
        SET admin_locked = ?,
            admin_lock_reason = ?,
            is_enabled = CASE WHEN ? = 1 THEN 0 ELSE is_enabled END,
            updated_at = ?
        WHERE seller_id = ?
      `)
        .bind(locked ? 1 : 0, locked ? (reason || 'Khóa khẩn cấp bởi Quản trị viên') : null, locked ? 1 : 0, nowIso, targetSellerId)
        .run();

      await invalidateCatalogEdgeCache(context as any, request, env as any).catch(() => {});

      await logAdminAudit(env.DB, {
        actorName: adminActor,
        action: locked ? 'ADMIN_SELLER_SEPAY_LOCKED' : 'ADMIN_SELLER_SEPAY_UNLOCKED',
        targetId: targetSellerId,
        details: { locked, reason },
      }).catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          message: locked
            ? `Đã khóa khẩn cấp cổng SePay riêng của gian hàng ${targetSellerId}.`
            : `Đã mở khóa cổng SePay riêng cho gian hàng ${targetSellerId}.`,
          seller_id: targetSellerId,
          admin_locked: locked,
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Tuyến quản trị SePay gian hàng không tồn tại.' }),
      { status: 404, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi máy chủ quản trị SePay gian hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
