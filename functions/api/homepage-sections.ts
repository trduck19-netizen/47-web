import { verifyAdminAuth } from '../services/mission_service';
import { ensureSchemaUpgrades, logAdminAudit } from '../services/d1_service';
import { getCatalogEpoch, matchesIfNoneMatch } from '../services/cache_service';
import {
  HOMEPAGE_SECTIONS_REGISTRY,
  mergeHomepageSectionsConfig,
  validateHomepageSectionsPayload,
} from '../../src/config/homepageSections';

interface Env {
  DB: D1Database;
  ADMIN_SYNC_SECRET?: string;
  PINE_API_KEY?: string;
  MUSE_API_KEY?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Admin-Key, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, X-Catalog-Epoch, X-Cache-Status, X-Build-Id',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Cấu hình hiển thị trang chủ công khai cho Web Khách
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, waitUntil } = context;

  // 1. Đồng bộ tức thì qua Catalog Epoch + ETag / 304 + Edge Cache theo khóa epoch
  const urlObj = new URL(request.url);
  const hasIfNoneMatch = Boolean(request.headers.get('If-None-Match'));
  const explicitBypass = urlObj.searchParams.has('fresh') || urlObj.searchParams.has('nocache');
  const bypassCache = explicitBypass ||
                      (!hasIfNoneMatch && Boolean(request.headers.get('Cache-Control')?.includes('no-cache')));
  const currentEpoch = env.DB ? await getCatalogEpoch(env.DB) : '0';
  const etag = `W/"sections-${currentEpoch}"`;

  if (!bypassCache && matchesIfNoneMatch(request.headers.get('If-None-Match'), etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'ETag': etag,
        'X-Catalog-Epoch': currentEpoch,
        'X-Cache-Status': 'NOT-MODIFIED',
      },
    });
  }

  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
  const cacheKey = cache
    ? new Request(`${urlObj.origin}${urlObj.pathname}?_epoch=${encodeURIComponent(currentEpoch)}`, { method: 'GET' })
    : null;

  if (cache && cacheKey && !bypassCache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const outHeaders = new Headers(cached.headers);
        outHeaders.set('Cache-Control', 'public, max-age=0, must-revalidate');
        outHeaders.set('CDN-Cache-Control', 'no-store');
        outHeaders.set('ETag', etag);
        outHeaders.set('X-Catalog-Epoch', currentEpoch);
        outHeaders.set('X-Cache-Status', 'HIT-EDGE');
        return new Response(cached.body, { status: cached.status, headers: outHeaders });
      }
    } catch {}
  }

  try {
    // KHÔNG gọi ensureSchemaUpgrades trên route GET công khai (nguyên nhân gây nghẽn 10-16s do chạy 40+ migration)
    const row = await env.DB
      .prepare("SELECT value, updated_at FROM system_settings WHERE key = 'homepage_sections' LIMIT 1")
      .first<any>();

    let rawSections: any = null;
    if (row && row.value) {
      try {
        rawSections = JSON.parse(row.value);
      } catch {}
    }

    const sections = mergeHomepageSectionsConfig(rawSections);
    const bodyStr = JSON.stringify({
      success: true,
      catalogEpoch: currentEpoch,
      sections,
      updated_at: row?.updated_at || null,
    });

    const response = new Response(bodyStr, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': bypassCache ? 'no-cache, no-store, must-revalidate' : 'public, max-age=0, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'ETag': etag,
        'X-Catalog-Epoch': currentEpoch,
        'X-Cache-Status': bypassCache ? 'BYPASS' : 'DYNAMIC',
      },
    });

    if (cache && cacheKey && !bypassCache && typeof waitUntil === 'function') {
      try {
        const edgeHeaders = new Headers(response.headers);
        edgeHeaders.set('Cache-Control', 'public, max-age=300');
        edgeHeaders.delete('CDN-Cache-Control');
        waitUntil(cache.put(cacheKey, new Response(bodyStr, { status: 200, headers: edgeHeaders })));
      } catch {}
    }

    return response;
  } catch (err: any) {
    // Fallback an toàn tuyệt đối khi lỗi: Trả về cấu hình mặc định (100% mục đều bật)
    return new Response(
      JSON.stringify({
        success: true,
        sections: mergeHomepageSectionsConfig(null),
        fallback: true,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  }
};

// PUT: Cập nhật cấu hình (Chỉ Quản Trị Viên, từ chối 401/403 đối với tài khoản thường)
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSchemaUpgrades(env.DB);
    const auth = await verifyAdminAuth(request, env as any, 'SYSTEM_SETTINGS_UPDATE');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Từ chối truy cập: Chỉ Quản Trị Viên mới có quyền thay đổi cấu hình trang chủ.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = validateHomepageSectionsPayload(body);

    if (!validation.valid || !validation.sanitized) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error || 'Dữ liệu cấu hình không hợp lệ.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const sanitizedSections = validation.sanitized;
    const jsonValue = JSON.stringify(sanitizedSections);
    const nowIso = new Date().toISOString();

    await env.DB
      .prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('homepage_sections', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .bind(jsonValue, nowIso)
      .run();

    const details = JSON.stringify({
      total_sections: sanitizedSections.length,
      disabled_count: sanitizedSections.filter((s) => !s.enabled).length,
      disabled_ids: sanitizedSections.filter((s) => !s.enabled).map((s) => s.id),
      order_sequence: sanitizedSections.map((s) => s.id),
      actor: auth.adminName || 'Admin',
    });

    await logAdminAudit(
      env.DB,
      auth.adminId || 'usr_admin',
      auth.adminName || 'Admin',
      'UPDATE_HOMEPAGE_SECTIONS',
      'system_settings',
      'homepage_sections',
      details,
      request.headers.get('cf-connecting-ip') || '127.0.0.1'
    ).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đã lưu cấu hình hiển thị trang chủ thành công.',
        sections: sanitizedSections,
        updated_at: nowIso,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống khi lưu cấu hình.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
