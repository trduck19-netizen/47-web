/**
 * Global Edge Cache, Shared D1 Catalog Epoch & Purge Management Service
 * Provides:
 * 1. Shared D1 Catalog Epoch (`wcg_catalog_epoch_v1` in `system_settings`) so writes on
 *    `admin-universal-mall.pages.dev` immediately invalidate `universal-mall-shop.pages.dev`
 *    across all isolates and all 300+ Cloudflare PoPs with 1 single PK row read.
 * 2. RFC 7232 ETag / `If-None-Match` matcher for zero-byte `304 Not Modified` responses.
 * 3. Centralized route write classifier (`shouldBumpCatalogEpoch`).
 * 4. Local PoP Edge Cache Invalidation (`caches.default.delete`) & optional Global Zone Purge.
 */

export const CATALOG_EPOCH_SETTING_KEY = 'wcg_catalog_epoch_v1';

const bumpedRequests = new WeakSet<Request>();

export interface PurgeResult {
  success: boolean;
  message: string;
  purgedUrls: string[];
  zonePurged?: boolean;
  localPurged?: boolean;
  details?: any;
}

export function wasEpochBumpedForRequest(request: Request): boolean {
  return bumpedRequests.has(request);
}

/**
 * Đọc mã phiên bản Catalog Epoch chung từ SQL D1 (1 row PK lookup duy nhất).
 */
export async function getCatalogEpoch(db?: D1Database | null): Promise<string> {
  if (!db) return '0';
  try {
    const row = await db
      .prepare('SELECT value FROM system_settings WHERE key = ? LIMIT 1')
      .bind(CATALOG_EPOCH_SETTING_KEY)
      .first<{ value?: string }>();
    const val = String(row?.value || '').trim();
    return val || '0';
  } catch {
    return '0';
  }
}

/**
 * Tăng Catalog Epoch trong SQL D1 ngay lập tức sau mỗi thao tác ghi danh mục/sản phẩm/banner/tồn kho.
 * Đồng thời xóa RAM cache cục bộ của isolate hiện tại.
 */
export async function bumpCatalogEpoch(
  db?: D1Database | null,
  _reason?: string
): Promise<string> {
  const rand = Math.random().toString(36).slice(2, 6);
  const newEpoch = `${Date.now()}_${rand}`;

  const gScope = globalThis as any;
  gScope.__wcg_metrics_snapshot = null;
  gScope.__wcg_public_sync_cache = null;
  gScope.__wcg_sync_lite_cache = null;
  gScope.__wcg_brand_identity_cache = null;
  gScope.__wcg_hub = null;
  gScope.__wcg_hub_loaded_at = 0;
  gScope.__wcg_sitemap_xml = null;
  gScope.__wcg_sitemap_time = 0;
  gScope.__wcg_catalog_epoch = newEpoch;

  if (!db) return newEpoch;

  try {
    await db
      .prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .bind(CATALOG_EPOCH_SETTING_KEY, newEpoch)
      .run();
  } catch (err: any) {
    console.warn('[CatalogEpoch] Failed to persist epoch in D1:', err?.message || err);
  }

  return newEpoch;
}

/**
 * So khớp header If-None-Match với ETag hiện tại theo RFC 7232 (weak comparison).
 */
export function matchesIfNoneMatch(ifNoneMatchHeader: string | null | undefined, currentEtag: string): boolean {
  if (!ifNoneMatchHeader || !currentEtag) return false;
  const raw = ifNoneMatchHeader.trim();
  if (!raw) return false;
  if (raw === '*') return true;

  const normalize = (tag: string): string => {
    let t = tag.trim();
    if (t.startsWith('W/') || t.startsWith('w/')) {
      t = t.slice(2).trim();
    }
    return t;
  };

  const target = normalize(currentEtag);
  if (!target) return false;

  const candidates = raw.split(',');
  for (const cand of candidates) {
    if (normalize(cand) === target) {
      return true;
    }
  }
  return false;
}

/**
 * Phân loại các tuyến ghi (POST/PUT/PATCH/DELETE) làm thay đổi dữ liệu hiển thị trên trang khách
 * để tự động tăng Catalog Epoch trong D1.
 */
export function shouldBumpCatalogEpoch(pathname: string, method: string): boolean {
  const m = String(method || '').toUpperCase();
  if (m !== 'POST' && m !== 'PUT' && m !== 'PATCH' && m !== 'DELETE') {
    return false;
  }

  const p = (pathname || '').replace(/\/+$/, '') || '/';

  // Loại trừ các tuyến không ảnh hưởng danh mục công khai (auth, wishlist, logs, telemetry, tracking)
  if (
    p.startsWith('/api/auth/') ||
    p.startsWith('/api/user/') ||
    p.startsWith('/api/admin/members') ||
    p.startsWith('/api/admin/audit-log') ||
    p.startsWith('/api/admin/security') ||
    p.startsWith('/api/admin/automation') ||
    p.startsWith('/api/admin/suppliers/webhooks') ||
    p.startsWith('/api/seller/webhooks') ||
    p.startsWith('/api/webhooks/') ||
    p.startsWith('/api/telegram/')
  ) {
    return false;
  }

  const prefixes = [
    '/api/sync',
    '/api/store/manage',
    '/api/store',
    '/api/products',
    '/api/categories',
    '/api/seller/products',
    '/api/seller/media',
    '/api/seller/vouchers',
    '/api/seller/sepay',
    '/api/admin/seller-products',
    '/api/admin/sellers',
    '/api/admin/seller-sepay',
    '/api/admin/affiliate',
    '/api/seller/affiliate/inventory-push',
    '/api/seller/affiliate/listings',
    '/api/admin/homepage-sections',
    '/api/homepage-sections',
    '/api/admin/content',
    '/api/admin/brand',
    '/api/admin/growth',
    '/api/admin/marketing/config',
    '/api/admin/utilities',
    '/api/admin/store/products',
    '/api/admin/escalating',
    '/api/orders/create',
    '/api/seller-orders',
    '/api/vouchers',
    '/api/admin/vouchers',
    '/api/admin/first-purchase',
    '/api/admin/store/first-purchase',
    '/api/games',
    '/api/news',
    '/api/events',
    '/api/event-scheduler',
    '/api/crawler/ingest-codes',
    '/api/crawler/ingest-upcoming-games',
    '/api/admin/crawler/sources',
    '/api/giveaways',
  ];

  if (p === '/api/seller' && (m === 'POST' || m === 'PUT' || m === 'PATCH')) {
    return true;
  }

  // PA1 Nhóm 4: 4 tuyến ghi còn sót làm thay đổi dữ liệu công khai trên kệ
  if (
    (m === 'POST' && /^\/api\/seller\/orders\/[^/]+\/resolve-report$/.test(p)) ||
    (m === 'POST' && /^\/api\/admin\/orders\/[^/]+\/refund$/.test(p)) ||
    (m === 'DELETE' && /^\/api\/seller\/codes\/[^/]+$/.test(p)) ||
    (m === 'DELETE' && /^\/api\/seller\/affiliate\/partners\/[^/]+$/.test(p))
  ) {
    return true;
  }

  return prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/**
 * Gọi Cloudflare Purge Cache REST API để xóa cache trên toàn bộ 300+ Edge PoP của Cloudflare
 */
export async function purgeCloudflareGlobalCache(
  urls: string[],
  env: any
): Promise<PurgeResult> {
  const zoneId = (env?.CLOUDFLARE_ZONE_ID || env?.CF_ZONE_ID || '').trim();
  const apiToken = (env?.CLOUDFLARE_API_TOKEN || env?.CF_API_TOKEN || '').trim();

  if (!zoneId || !apiToken) {
    return {
      success: true,
      zonePurged: false,
      message: 'CLOUDFLARE_ZONE_ID hoặc API_TOKEN chưa được cấu hình. Đã hoàn tất tăng Catalog Epoch D1 và xóa PoP cục bộ.',
      purgedUrls: urls,
    };
  }

  try {
    const purgeUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;
    const resp = await fetch(purgeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: urls }),
    });

    const data: any = await resp.json().catch(() => ({}));
    if (resp.ok && data?.success) {
      return {
        success: true,
        zonePurged: true,
        message: 'Cloudflare Global Cache Purge API đã xóa thành công trên toàn bộ CDN Edge.',
        purgedUrls: urls,
        details: data,
      };
    } else {
      return {
        success: false,
        zonePurged: false,
        message: 'Lỗi phản hồi từ Cloudflare Purge API: ' + (data?.errors?.[0]?.message || resp.statusText),
        purgedUrls: urls,
        details: data,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      zonePurged: false,
      message: 'Ngoại lệ khi gọi Cloudflare Purge API: ' + (err?.message || String(err)),
      purgedUrls: urls,
    };
  }
}

/**
 * Xóa cache đồng bộ: Tăng Catalog Epoch trên D1 chung + Xóa RAM isolate + Xóa PoP cục bộ + Global Purge API
 */
export async function invalidateCatalogEdgeCache(
  ctx: ExecutionContext,
  request: Request,
  env: any,
  extraUrls: string[] = []
): Promise<string> {
  bumpedRequests.add(request);

  const url = new URL(request.url);
  url.search = '';
  const cleanUrl = url.toString();

  // 0. Tăng Catalog Epoch chung trong SQL D1 & xóa toàn bộ RAM cache isolate hiện tại
  const newEpoch = await bumpCatalogEpoch(env?.DB, url.pathname);

  // 1. Xóa PoP cục bộ (Local Edge Datacenter)
  const canonicalUrls = Array.from(
    new Set([
      cleanUrl,
      new URL('/sitemap.xml', request.url).toString(),
      new URL('/api/sync', request.url).toString(),
      new URL('/api/sync-lite', request.url).toString(),
      new URL('/api/homepage-sections', request.url).toString(),
      new URL('/api/news', request.url).toString(),
      new URL('/api/events', request.url).toString(),
      new URL('/api/games', request.url).toString(),
      new URL('/api/metrics/synced', request.url).toString(),
      new URL('/api/stats', request.url).toString(),
      new URL('/api/realtime-events', request.url).toString(),
      'https://universal-mall-shop.pages.dev/sitemap.xml',
      'https://universal-mall-shop.pages.dev/api/games',
      'https://universal-mall-shop.pages.dev/api/sync',
      'https://universal-mall-shop.pages.dev/api/sync-lite',
      'https://universal-mall-shop.pages.dev/api/homepage-sections',
      'https://universal-mall-shop.pages.dev/api/news',
      'https://universal-mall-shop.pages.dev/api/events',
      'https://universal-mall-shop.pages.dev/api/metrics/synced',
      'https://universal-mall-shop.pages.dev/api/stats',
      'https://universal-mall-shop.pages.dev/api/realtime-events',
      'https://admin-universal-mall.pages.dev/api/sync',
      'https://admin-universal-mall.pages.dev/api/sync-lite',
      'https://admin-universal-mall.pages.dev/api/homepage-sections',
      'https://admin-universal-mall.pages.dev/api/news',
      'https://admin-universal-mall.pages.dev/api/events',
      'https://admin-universal-mall.pages.dev/api/metrics/synced',
      'https://admin-universal-mall.pages.dev/api/stats',
      'https://admin-universal-mall.pages.dev/api/realtime-events',
      ...extraUrls,
    ])
  );

  if (typeof caches !== 'undefined' && (caches as any).default) {
    const cache = (caches as any).default;
    for (const u of canonicalUrls) {
      try {
        ctx.waitUntil(cache.delete(new Request(u, { method: 'GET' })));
      } catch {}
    }
  }

  // 2. Kích hoạt Cloudflare Global Purge REST API không đồng bộ (nếu có cấu hình Zone ID)
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(purgeCloudflareGlobalCache(canonicalUrls, env));
  }

  return newEpoch;
}
