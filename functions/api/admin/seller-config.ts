import { verifyAdminAuth } from '../../services/mission_service';
import { ensureMarketplaceSchema, logAdminAudit } from '../../services/d1_service';
import { getMarketplaceConfig, sanitizeSellerPortalThemePreset } from '../../services/marketplace_service';
import { invalidateCatalogEdgeCache } from '../../services/cache_service';

interface Env {
  DB: D1Database;
  ADMIN_SYNC_SECRET?: string;
  PINE_API_KEY?: string;
  MUSE_API_KEY?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Admin-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Lấy cấu hình sàn TMĐT
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const auth = await verifyAdminAuth(request, env as any, 'MARKETPLACE_MANAGE');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền Quản trị viên (MARKETPLACE_MANAGE).' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const config = await getMarketplaceConfig(env.DB);

    return new Response(
      JSON.stringify({ success: true, config }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

// PUT: Cập nhật cấu hình sàn TMĐT
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const auth = await verifyAdminAuth(request, env as any, 'MARKETPLACE_MANAGE');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền Quản trị viên (MARKETPLACE_MANAGE).' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const currentConfig = await getMarketplaceConfig(env.DB);
    let testIds: string[];
    if (Array.isArray(body.test_seller_ids)) {
      testIds = body.test_seller_ids.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof body.test_seller_ids === 'string') {
      testIds = body.test_seller_ids.split(',').map((s: string) => s.trim()).filter(Boolean);
    } else if (typeof body.test_seller_ids !== 'undefined') {
      testIds = [];
    } else {
      testIds = currentConfig.test_seller_ids || [];
    }

    const newConfig = {
      default_trial_product_limit: typeof body.default_trial_product_limit !== 'undefined'
        ? Math.max(1, parseInt(body.default_trial_product_limit, 10))
        : currentConfig.default_trial_product_limit,
      default_trial_order_max: typeof body.default_trial_order_max !== 'undefined'
        ? Math.max(10, parseInt(body.default_trial_order_max, 10))
        : currentConfig.default_trial_order_max,
      batch_freeze_error_rate: typeof body.batch_freeze_error_rate !== 'undefined'
        ? Math.min(1, Math.max(0.05, parseFloat(body.batch_freeze_error_rate)))
        : currentConfig.batch_freeze_error_rate,
      min_batch_size_for_freeze: typeof body.min_batch_size_for_freeze !== 'undefined'
        ? Math.max(2, parseInt(body.min_batch_size_for_freeze, 10))
        : currentConfig.min_batch_size_for_freeze,
      hold_hours: typeof body.hold_hours !== 'undefined'
        ? Math.max(0, parseInt(body.hold_hours, 10))
        : currentConfig.hold_hours,
      fee_rate: typeof body.fee_rate !== 'undefined'
        ? Math.min(1, Math.max(0, parseFloat(body.fee_rate)))
        : currentConfig.fee_rate,
      withdraw_approval_threshold_core: typeof body.withdraw_approval_threshold_core !== 'undefined'
        ? Math.max(0, parseInt(body.withdraw_approval_threshold_core, 10))
        : currentConfig.withdraw_approval_threshold_core,
      test_seller_ids: testIds,
      max_rejected_disputes_30d: typeof body.max_rejected_disputes_30d !== 'undefined'
        ? Math.max(1, parseInt(body.max_rejected_disputes_30d, 10))
        : (currentConfig.max_rejected_disputes_30d || 3),
      affiliate_enabled: typeof body.affiliate_enabled === 'boolean'
        ? body.affiliate_enabled
        : currentConfig.affiliate_enabled,
      affiliate_digital_fee_pct: typeof body.affiliate_digital_fee_pct !== 'undefined' && Number.isFinite(Number(body.affiliate_digital_fee_pct))
        ? Math.min(50, Math.max(0, Number(body.affiliate_digital_fee_pct)))
        : currentConfig.affiliate_digital_fee_pct,
      affiliate_physical_fee_pct: typeof body.affiliate_physical_fee_pct !== 'undefined' && Number.isFinite(Number(body.affiliate_physical_fee_pct))
        ? Math.min(50, Math.max(0, Number(body.affiliate_physical_fee_pct)))
        : currentConfig.affiliate_physical_fee_pct,
      affiliate_auto_pause_on_loss: typeof body.affiliate_auto_pause_on_loss === 'boolean'
        ? body.affiliate_auto_pause_on_loss
        : currentConfig.affiliate_auto_pause_on_loss,
      affiliate_require_admin_approval: typeof body.affiliate_require_admin_approval === 'boolean'
        ? body.affiliate_require_admin_approval
        : currentConfig.affiliate_require_admin_approval,
      affiliate_max_markup_pct: typeof body.affiliate_max_markup_pct !== 'undefined' && Number.isFinite(Number(body.affiliate_max_markup_pct))
        ? Math.min(2000, Math.max(0, Number(body.affiliate_max_markup_pct)))
        : currentConfig.affiliate_max_markup_pct,
      affiliate_rate_limit_rpm: typeof body.affiliate_rate_limit_rpm !== 'undefined' && Number.isFinite(Number(body.affiliate_rate_limit_rpm))
        ? Math.min(6000, Math.max(10, Math.round(Number(body.affiliate_rate_limit_rpm))))
        : currentConfig.affiliate_rate_limit_rpm,
      direct_sepay_global_enabled: typeof body.direct_sepay_global_enabled === 'boolean'
        ? body.direct_sepay_global_enabled
        : currentConfig.direct_sepay_global_enabled,
      direct_sepay_fee_pct: typeof body.direct_sepay_fee_pct !== 'undefined' && Number.isFinite(Number(body.direct_sepay_fee_pct))
        ? Math.min(20, Math.max(0, Number(body.direct_sepay_fee_pct)))
        : currentConfig.direct_sepay_fee_pct,
      direct_sepay_debt_limit_core: typeof body.direct_sepay_debt_limit_core !== 'undefined' && Number.isFinite(Number(body.direct_sepay_debt_limit_core))
        ? Math.min(50000000, Math.max(0, Math.round(Number(body.direct_sepay_debt_limit_core))))
        : currentConfig.direct_sepay_debt_limit_core,
      seller_portal_theme_preset: typeof body.seller_portal_theme_preset !== 'undefined'
        ? sanitizeSellerPortalThemePreset(body.seller_portal_theme_preset)
        : currentConfig.seller_portal_theme_preset,
      seller_portal_allow_dark_mode: typeof body.seller_portal_allow_dark_mode === 'boolean'
        ? body.seller_portal_allow_dark_mode
        : currentConfig.seller_portal_allow_dark_mode,
      seller_portal_banner_vi: typeof body.seller_portal_banner_vi === 'string'
        ? body.seller_portal_banner_vi.trim().slice(0, 300)
        : currentConfig.seller_portal_banner_vi,
      seller_portal_banner_en: typeof body.seller_portal_banner_en === 'string'
        ? body.seller_portal_banner_en.trim().slice(0, 300)
        : currentConfig.seller_portal_banner_en,
    };

    const nowIso = new Date().toISOString();
    await env.DB
      .prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('wcg_marketplace_config_v1', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `)
      .bind(JSON.stringify(newConfig), nowIso)
      .run();

    await invalidateCatalogEdgeCache(context as any, request, env as any, [
      new URL('/api/seller/portal-config', request.url).toString(),
      'https://universal-mall-shop.pages.dev/api/seller/portal-config',
    ]).catch(() => {});

    await logAdminAudit(env.DB, {
      actorName: auth.adminName || 'Admin',
      action: 'ADMIN_UPDATE_MARKETPLACE_CONFIG',
      targetId: 'wcg_marketplace_config_v1',
      details: newConfig,
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Đã cập nhật cấu hình sàn TMĐT thành công.', config: newConfig }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
