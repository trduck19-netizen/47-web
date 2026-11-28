import { ensureSchemaUpgrades, logAdminAudit } from '../../services/d1_service';
import { verifyAdminAuth } from '../../services/mission_service';
import {
  DEFAULT_BRAND_IDENTITY,
  getBrandIdentity,
  saveBrandIdentity,
} from '../../services/brand_service';
import { invalidateCatalogEdgeCache } from '../../services/cache_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_API_KEY?: string;
  ADMIN_SYNC_SECRET?: string;
  PINE_API_KEY?: string;
  MUSE_API_KEY?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Admin-Key, X-Api-Key, x-admin-sync-key, X-Requested-With',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/admin/brand
 * Đọc cấu hình thương hiệu & tên sàn hiện tại cho trang Quản trị
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database not available' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const auth = await verifyAdminAuth(request, env as any, 'BRAND_MANAGE');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Unauthorized: Yêu cầu quyền BRAND_MANAGE hoặc ADMIN_FULL.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);
    const brand = await getBrandIdentity(env.DB, { bypassCache: true });

    return new Response(
      JSON.stringify({
        success: true,
        brand,
        defaults: DEFAULT_BRAND_IDENTITY,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: 'Lỗi tải cấu hình thương hiệu: ' + (err?.message || String(err)) }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * PUT /api/admin/brand (hoặc POST để hỗ trợ reset mặc định)
 * Cập nhật tên sàn, tên ngắn, Seller/Admin Portal, nhãn AI, đơn vị ví Core và đồng bộ toàn sàn tức thì
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database not available' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const auth = await verifyAdminAuth(request, env as any, 'BRAND_MANAGE');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Unauthorized: Yêu cầu quyền BRAND_MANAGE hoặc ADMIN_FULL.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Payload JSON không hợp lệ.' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const isReset = body?.reset === true;
    const payload = isReset ? { ...DEFAULT_BRAND_IDENTITY } : body;

    if (!isReset) {
      const candidateName = String(payload?.brandName ?? '').replace(/[<>]/g, '').trim();
      if (!candidateName || candidateName.length < 2 || candidateName.length > 60) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Tên sàn (brandName) phải có độ dài từ 2 đến 60 ký tự.',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      const candidateUnit = String(payload?.coreUnitName ?? 'Core').replace(/[<>]/g, '').trim();
      if (!candidateUnit || candidateUnit.length < 1 || candidateUnit.length > 14) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Tên đơn vị ví (coreUnitName) phải từ 1 đến 14 ký tự.',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
    }

    const previous = await getBrandIdentity(env.DB, { bypassCache: true });
    const { brand, epoch } = await saveBrandIdentity(env.DB, payload);

    await logAdminAudit(env.DB, {
      actorName: auth.adminName || 'Admin',
      action: isReset ? 'RESET_BRAND_IDENTITY' : 'UPDATE_BRAND_IDENTITY',
      targetId: 'wcg_brand_identity_v1',
      details: {
        fromBrandName: previous.brandName,
        toBrandName: brand.brandName,
        fromShortName: previous.shortName,
        toShortName: brand.shortName,
        fromAiBrandName: previous.aiBrandName,
        toAiBrandName: brand.aiBrandName,
        fromCoreUnitName: previous.coreUnitName,
        toCoreUnitName: brand.coreUnitName,
        epoch,
      },
    });

    // Chú ý ISSUE-343: tham số thứ 4 của invalidateCatalogEdgeCache là mảng URL string[]
    try {
      await invalidateCatalogEdgeCache(context as any, request, env, ['/api/brand', '/manifest.json']);
    } catch {}

    return new Response(
      JSON.stringify({
        success: true,
        message: isReset
          ? 'Đã khôi phục toàn bộ nhận diện thương hiệu mặc định thành công.'
          : `Đã đổi tên sàn sang "${brand.brandName}" và đồng bộ toàn hệ thống.`,
        brand,
        catalogEpoch: epoch,
      }),
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'X-Catalog-Epoch': epoch,
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: 'Lỗi cập nhật thương hiệu: ' + (err?.message || String(err)) }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

export const onRequestPost = onRequestPut;
