import {
  CATALOG_EPOCH_SETTING_KEY,
  getCatalogEpoch,
  bumpCatalogEpoch,
  matchesIfNoneMatch,
  shouldBumpCatalogEpoch,
  invalidateCatalogEdgeCache,
  wasEpochBumpedForRequest,
} from '../../functions/services/cache_service';
import { onRequestGet as syncLiteGet } from '../../functions/api/sync-lite';
import { onRequestGet as homepageSectionsGet } from '../../functions/api/homepage-sections';
import { onRequestGet as gameIconFileGet } from '../../functions/game_icons/[file]';
import { onRequestGet as productsGet } from '../../functions/api/products/index';
import { onRequestGet as orderStatusGet } from '../../functions/api/orders/status';
import { handleAdminAffiliateRequest } from '../../functions/api/admin/affiliate/index';
import worker from '../../functions/_worker';

interface TestResult {
  name: string;
  pass: boolean;
  actual: unknown;
  expected: unknown;
}

async function main() {
  const results: TestResult[] = [];
  const check = (name: string, actual: unknown, expected: unknown) => {
    results.push({ name, pass: actual === expected, actual, expected });
  };

  // Stateful mock D1 storing system_settings + store_products
  const settingsMap = new Map<string, string>();
  let storeProductsRows: any[] = [
    {
      id: 'prd_initial_1',
      title: 'Initial Product',
      current_price: 50000,
      is_active: 1,
      product_type: 'digital',
    },
  ];
  let heavyQueryCount = 0;

  const mockDb = {
    prepare(sql: string) {
      let bound: any[] = [];
      const s = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...args: any[]) {
          bound = args;
          return this;
        },
        async first() {
          if (s.includes('FROM system_settings WHERE key = ?')) {
            const val = settingsMap.get(String(bound[0]));
            return val !== undefined ? { value: val } : null;
          }
          if (s.includes("WHERE key = 'homepage_sections'")) {
            heavyQueryCount++;
            const val = settingsMap.get('homepage_sections');
            return val !== undefined ? { value: val, updated_at: '2026-11-26T11:30:00Z' } : null;
          }
          return null;
        },
        async all() {
          if (s.includes('FROM system_settings WHERE key IN')) {
            heavyQueryCount++;
            return { results: [] };
          }
          if (s.includes('FROM deleted_records_history')) {
            return { results: [] };
          }
          if (s.includes('FROM store_products')) {
            heavyQueryCount++;
            return { results: storeProductsRows };
          }
          if (s.includes('FROM seller_products')) {
            return { results: [] };
          }
          if (s.includes('FROM schema_migrations')) {
            return { results: [] };
          }
          return { results: [] };
        },
        async run() {
          if (s.includes('INSERT INTO system_settings') && bound[0] === CATALOG_EPOCH_SETTING_KEY) {
            settingsMap.set(CATALOG_EPOCH_SETTING_KEY, String(bound[1]));
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  } as any;

  // =========================================================================
  // PART 1: getCatalogEpoch & bumpCatalogEpoch
  // =========================================================================
  check('epoch_default_zero_when_unset', await getCatalogEpoch(mockDb), '0');

  const ep1 = await bumpCatalogEpoch(mockDb, '/api/products');
  check('epoch_bump_persists_in_d1', await getCatalogEpoch(mockDb), ep1);
  check('epoch_bump_non_zero', ep1 !== '0' && ep1.length > 5, true);

  const ep2 = await bumpCatalogEpoch(mockDb, '/api/admin/seller-products/1/approve');
  check('epoch_bump_distinct_consecutive', ep2 !== ep1 && (await getCatalogEpoch(mockDb)) === ep2, true);

  // =========================================================================
  // PART 2: matchesIfNoneMatch (RFC 7232 weak/strong/list/wildcard)
  // =========================================================================
  check('etag_match_exact_weak', matchesIfNoneMatch('W/"sync-lite-123"', 'W/"sync-lite-123"'), true);
  check('etag_match_strong_against_weak', matchesIfNoneMatch('"sync-lite-123"', 'W/"sync-lite-123"'), true);
  check('etag_match_comma_list', matchesIfNoneMatch('"old", W/"sync-lite-123", "other"', 'W/"sync-lite-123"'), true);
  check('etag_match_wildcard', matchesIfNoneMatch('*', 'W/"sync-lite-123"'), true);
  check('etag_reject_mismatch', matchesIfNoneMatch('W/"sync-lite-999"', 'W/"sync-lite-123"'), false);
  check('etag_reject_empty', matchesIfNoneMatch(null, 'W/"sync-lite-123"'), false);

  // =========================================================================
  // PART 3: GET /api/sync-lite -> 200 -> 304 (0 heavy D1 queries) -> bump -> 200 fresh!
  // =========================================================================
  (globalThis as any).__wcg_sync_lite_cache = null;
  heavyQueryCount = 0;

  const res1 = await syncLiteGet({
    request: new Request('https://universal-mall-shop.pages.dev/api/sync-lite'),
    env: { DB: mockDb },
    waitUntil: () => {},
  } as any);
  const etag1 = res1.headers.get('ETag') || '';
  const epochHeader1 = res1.headers.get('X-Catalog-Epoch') || '';
  const cc1 = res1.headers.get('Cache-Control') || '';
  const cdnCc1 = res1.headers.get('CDN-Cache-Control') || '';
  const json1: any = await res1.json();

  check('sync_lite_initial_200', res1.status, 200);
  check('sync_lite_etag_matches_epoch', etag1, `W/"sync-lite-${ep2}"`);
  check('sync_lite_x_catalog_epoch', epochHeader1, ep2);
  check('sync_lite_cc_max_age_0_revalidate', cc1, 'public, max-age=0, must-revalidate');
  check('sync_lite_cdn_cc_no_store', cdnCc1, 'no-store');
  check('sync_lite_json_catalogEpoch', json1.catalogEpoch, ep2);
  check('sync_lite_initial_product_count', Array.isArray(json1.storeProducts) ? json1.storeProducts.length : -1, 1);

  // Second request with matching If-None-Match -> 304 Not Modified, ZERO heavy queries!
  const queriesBefore304 = heavyQueryCount;
  const res304 = await syncLiteGet({
    request: new Request('https://universal-mall-shop.pages.dev/api/sync-lite', {
      headers: { 'If-None-Match': etag1 },
    }),
    env: { DB: mockDb },
    waitUntil: () => {},
  } as any);
  const body304 = await res304.text();
  check('sync_lite_304_status', res304.status, 304);
  check('sync_lite_304_empty_body', body304, '');
  check('sync_lite_304_cache_status', res304.headers.get('X-Cache-Status'), 'NOT-MODIFIED');
  check('sync_lite_304_zero_heavy_queries', heavyQueryCount, queriesBefore304);

  // Browser F5 / undici sends Cache-Control: no-cache WITH If-None-Match -> MUST still return 304!
  const res304WithNoCacheHeader = await syncLiteGet({
    request: new Request('https://universal-mall-shop.pages.dev/api/sync-lite', {
      headers: { 'If-None-Match': etag1, 'Cache-Control': 'no-cache' },
    }),
    env: { DB: mockDb },
    waitUntil: () => {},
  } as any);
  check('sync_lite_304_with_cc_no_cache_and_inm', res304WithNoCacheHeader.status, 304);

  // Explicit ?nocache=1 with If-None-Match MUST still bypass and return 200 BYPASS
  const resExplicitBypass = await syncLiteGet({
    request: new Request('https://universal-mall-shop.pages.dev/api/sync-lite?nocache=1', {
      headers: { 'If-None-Match': etag1 },
    }),
    env: { DB: mockDb },
    waitUntil: () => {},
  } as any);
  check(
    'sync_lite_explicit_nocache_param_bypasses_304',
    resExplicitBypass.status === 200 && resExplicitBypass.headers.get('X-Cache-Status') === 'BYPASS',
    true
  );

  // Same epoch without If-None-Match hits isolate RAM cache (0 heavy queries)
  const queriesBeforeRamHit = heavyQueryCount;
  const resRamHit = await syncLiteGet({
    request: new Request('https://universal-mall-shop.pages.dev/api/sync-lite'),
    env: { DB: mockDb },
    waitUntil: () => {},
  } as any);
  check('sync_lite_same_epoch_hits_isolate', resRamHit.headers.get('X-Cache-Status'), 'HIT-ISOLATE');
  check('sync_lite_isolate_hit_zero_heavy_queries', heavyQueryCount, queriesBeforeRamHit);

  // Now simulate Admin on ANOTHER domain/isolate adding a new product & bumping D1 epoch ONLY
  // (Notice we DO NOT clear globalThis.__wcg_sync_lite_cache manually -> proves cross-domain instant invalidation!)
  storeProductsRows = [
    ...storeProductsRows,
    {
      id: 'prd_new_live_2',
      title: 'Instant Sync Product',
      current_price: 99000,
      is_active: 1,
      product_type: 'physical',
    },
  ];
  const ep3 = `${Date.now() + 5}_adm9`;
  settingsMap.set(CATALOG_EPOCH_SETTING_KEY, ep3);

  const resFresh = await syncLiteGet({
    request: new Request('https://universal-mall-shop.pages.dev/api/sync-lite', {
      headers: { 'If-None-Match': etag1 }, // Browser sends OLD ETag!
    }),
    env: { DB: mockDb },
    waitUntil: () => {},
  } as any);
  const jsonFresh: any = await resFresh.json();
  check('sync_lite_after_cross_domain_bump_returns_200', resFresh.status, 200);
  check('sync_lite_after_bump_new_epoch_header', resFresh.headers.get('X-Catalog-Epoch'), ep3);
  check('sync_lite_after_bump_new_etag', resFresh.headers.get('ETag'), `W/"sync-lite-${ep3}"`);
  check(
    'sync_lite_after_bump_contains_new_product',
    Array.isArray(jsonFresh.storeProducts) && jsonFresh.storeProducts.some((p: any) => p.id === 'prd_new_live_2'),
    true
  );

  // =========================================================================
  // PART 4: GET /api/homepage-sections ETag & 304
  // =========================================================================
  const secRes1 = await homepageSectionsGet({
    request: new Request('https://universal-mall-shop.pages.dev/api/homepage-sections'),
    env: { DB: mockDb },
    waitUntil: () => {},
  } as any);
  const secEtag1 = secRes1.headers.get('ETag') || '';
  check('sections_200_with_etag', secRes1.status === 200 && secEtag1 === `W/"sections-${ep3}"`, true);
  check('sections_cc_max_age_0', secRes1.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');

  const secRes304 = await homepageSectionsGet({
    request: new Request('https://universal-mall-shop.pages.dev/api/homepage-sections', {
      headers: { 'If-None-Match': secEtag1 },
    }),
    env: { DB: mockDb },
    waitUntil: () => {},
  } as any);
  check('sections_304_on_matching_etag', secRes304.status, 304);

  // =========================================================================
  // PART 5: shouldBumpCatalogEpoch & invalidateCatalogEdgeCache dedup
  // =========================================================================
  const writeMustBump: Array<[string, string]> = [
    ['/api/sync', 'POST'],
    ['/api/products', 'POST'],
    ['/api/products/prd_1', 'PUT'],
    ['/api/products/prd_1', 'DELETE'],
    ['/api/store/manage', 'POST'],
    ['/api/seller/products', 'POST'],
    ['/api/seller/products/sp_1/codes', 'POST'],
    ['/api/admin/seller-products/sp_1/approve', 'POST'],
    ['/api/admin/seller-products/sp_1/reject', 'POST'],
    ['/api/seller/affiliate/inventory-push', 'POST'],
    ['/api/admin/homepage-sections', 'PUT'],
    ['/api/orders/create', 'POST'],
    ['/api/seller-orders', 'POST'],
    ['/api/games', 'POST'],
    ['/api/news', 'POST'],
    ['/api/events', 'POST'],
    ['/api/vouchers', 'POST'],
    // 10+ tuyến ghi dữ liệu công khai bổ sung (Nhóm 1 sửa nốt PA1)
    ['/api/admin/content/hero_title', 'PUT'],
    ['/api/admin/growth', 'PUT'],
    ['/api/admin/marketing/config', 'PUT'],
    ['/api/admin/utilities', 'POST'],
    ['/api/admin/store/products/sp_1/codes', 'POST'],
    ['/api/admin/escalating/reset', 'POST'],
    ['/api/event-scheduler', 'POST'],
    ['/api/crawler/ingest-codes', 'POST'],
    ['/api/crawler/ingest-upcoming-games', 'POST'],
    ['/api/admin/crawler/sources', 'POST'],
    ['/api/admin/sellers/sel_1/approve', 'POST'],
    ['/api/admin/affiliate/partnerships/sap_1', 'PATCH'],
  ];
  for (const [p, m] of writeMustBump) {
    check(`bump_true_${m}_${p}`, shouldBumpCatalogEpoch(p, m), true);
  }

  const mustNotBump: Array<[string, string]> = [
    ['/api/sync-lite', 'GET'],
    ['/api/products', 'GET'],
    ['/api/auth/login', 'POST'],
    ['/api/user/wishlist/toggle', 'POST'],
    ['/api/admin/audit-log', 'POST'],
    ['/api/seller/webhooks', 'POST'],
    ['/api/webhooks/affiliate-postback', 'POST'],
  ];
  for (const [p, m] of mustNotBump) {
    check(`bump_false_${m}_${p}`, shouldBumpCatalogEpoch(p, m), false);
  }

  const mockWriteReq = new Request('https://admin-universal-mall.pages.dev/api/products', { method: 'POST' });
  check('dedup_not_bumped_initially', wasEpochBumpedForRequest(mockWriteReq), false);
  const epAfterInvalidate = await invalidateCatalogEdgeCache(
    { waitUntil: () => {} } as any,
    mockWriteReq,
    { DB: mockDb }
  );
  check('dedup_marked_after_invalidate', wasEpochBumpedForRequest(mockWriteReq), true);
  check('invalidate_persists_new_epoch', (await getCatalogEpoch(mockDb)) === epAfterInvalidate && epAfterInvalidate !== ep3, true);

  // =========================================================================
  // PART 6: Regression Checks for #16, #33-d1, #35, #45, #46, #47, #48, #50
  // =========================================================================
  // #16: Server-Timing on sync-lite reports settings;dur=
  check(
    'reg16_sync_lite_server_timing_settings',
    (resExplicitBypass.headers.get('Server-Timing') || '').includes('settings;dur='),
    true
  );

  // #33-d1: D1 game icon with non-image content_type falls back to image/webp + nosniff in both [file].ts & _worker.ts
  const d1IconMockDb = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return {
            content_type: 'text/html; charset=utf-8',
            image_base64: Buffer.from([82, 73, 70, 70]).toString('base64'),
            size_bytes: 4,
          };
        },
      };
    },
  } as any;
  const d1IconFileRes = await gameIconFileGet({
    request: new Request('https://example.test/game_icons/custom-icon.png?nocache=1'),
    env: { DB: d1IconMockDb },
    params: { file: 'custom-icon.png' },
    waitUntil: () => {},
  });
  check('reg33d1_file_sanitizes_content_type', d1IconFileRes.headers.get('Content-Type'), 'image/webp');
  check('reg33d1_file_sets_nosniff', d1IconFileRes.headers.get('X-Content-Type-Options'), 'nosniff');

  const d1IconWorkerRes = await worker.fetch(
    new Request('https://example.test/game_icons/custom-icon.png?nocache=1'),
    { DB: d1IconMockDb, ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any
  );
  check('reg33d1_worker_sanitizes_content_type', d1IconWorkerRes.headers.get('Content-Type'), 'image/webp');
  check('reg33d1_worker_sets_nosniff', d1IconWorkerRes.headers.get('X-Content-Type-Options'), 'nosniff');

  // #35: /api/products physical fallback cover uses /game_icons/physical-default.webp?v=2
  const phyProdRes = await productsGet({
    request: new Request('https://example.test/api/products?limit=5'),
    env: {
      DB: {
        prepare(sql: string) {
          const u = sql.toUpperCase();
          return {
            bind() {
              return this;
            },
            async first() {
              if (u.includes('SELECT COUNT(*)')) return { total: 1 };
              return null;
            },
            async all() {
              if (u.includes('FROM PRODUCTS')) {
                return {
                  results: [
                    {
                      id: 'prd_phy_no_thumb',
                      title: 'Physical Box',
                      slug: 'physical-box',
                      industry_id: 'tech',
                      category_id: 'tech',
                      product_type: 'physical',
                      thumbnail_url: null,
                      images_json: '[]',
                      specifications_json: '{}',
                      is_active: 1,
                    },
                  ],
                };
              }
              return { results: [] };
            },
            async run() {
              return { success: true };
            },
          };
        },
        async batch() {
          return [];
        },
      } as any,
    },
  } as any);
  const phyProdJson: any = await phyProdRes.json();
  check(
    'reg35_products_physical_cover_v2',
    phyProdJson.data?.[0]?.cover_image_url,
    '/game_icons/physical-default.webp?v=2'
  );

  // #45 & #48: /api/sync vs /api/sync?nocache=1 headers (ETag + X-Catalog-Epoch + no-store) & consistent upcomingGames icon metadata
  settingsMap.set(
    'wcg_admin_upcoming_games_v1',
    JSON.stringify([
      { id: 'ug_1', slug: 'azur-promilia', name: 'Azur Promilia', status: 'UPCOMING', icon_verified: true, icon_source: 'store chính thức' },
      { id: 'ug_2', slug: 'monster-hunter-outlanders', name: 'MH Outlanders', status: 'UPCOMING' },
    ])
  );
  const syncMockDb = {
    prepare(sql: string) {
      let bound: any[] = [];
      const s = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...args: any[]) {
          bound = args;
          return this;
        },
        async first() {
          if (s.includes('FROM system_settings WHERE key = ?')) {
            const val = settingsMap.get(String(bound[0]));
            return val !== undefined ? { value: val } : null;
          }
          return null;
        },
        async all() {
          if (s.includes('FROM system_settings WHERE key IN')) {
            const out: any[] = [];
            for (const k of bound) {
              const val = settingsMap.get(String(k));
              if (val !== undefined) out.push({ key: String(k), value: val });
            }
            return { results: out };
          }
          return { results: [] };
        },
        async run() {
          if (s.includes('INSERT INTO system_settings') && bound[0] === CATALOG_EPOCH_SETTING_KEY) {
            settingsMap.set(CATALOG_EPOCH_SETTING_KEY, String(bound[1]));
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
    async batch() {
      return [];
    },
  } as any;

  const noopCtx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;
  const syncNormalRes = await worker.fetch(
    new Request('https://universal-mall-shop.pages.dev/api/sync'),
    { DB: syncMockDb, ASSETS: { fetch: async () => new Response('', { status: 404 }) } } as any,
    noopCtx
  );
  const syncNoCacheRes = await worker.fetch(
    new Request('https://universal-mall-shop.pages.dev/api/sync?nocache=1'),
    { DB: syncMockDb, ASSETS: { fetch: async () => new Response('', { status: 404 }) } } as any,
    noopCtx
  );
  check(
    'reg45_sync_nocache_has_etag_and_epoch',
    syncNoCacheRes.headers.get('ETag') === `W/"sync-${epAfterInvalidate}"` &&
      syncNoCacheRes.headers.get('X-Catalog-Epoch') === epAfterInvalidate &&
      (syncNoCacheRes.headers.get('Cache-Control') || '').includes('no-store'),
    true
  );
  const syncNormalJson: any = await syncNormalRes.json();
  const syncNoCacheJson: any = await syncNoCacheRes.json();
  check(
    'reg48_sync_upcoming_icon_metadata_consistent',
    JSON.stringify(syncNormalJson.upcomingGames) === JSON.stringify(syncNoCacheJson.upcomingGames) &&
      syncNoCacheJson.upcomingGames?.[0]?.icon_verified === false &&
      syncNoCacheJson.upcomingGames?.[0]?.icon_source === 'icon mẫu (chờ xác minh)' &&
      syncNoCacheJson.upcomingGames?.[1]?.icon_verified === false &&
      syncNoCacheJson.upcomingGames?.[1]?.icon_source === 'chưa xác minh',
    true
  );

  // #46: POST /api/giveaways/simulate 4xx/5xx & 0-simulated must NOT bump epoch; >0 simulated bumps strictly once
  let epochWriteCount = 0;
  const simGiveawayState = [
    {
      id: 'gw_sim_1',
      title: 'Test Giveaway Sim',
      is_active: true,
      status: 'ACTIVE',
      codes_pool: ['CODE1', 'CODE2'],
      remaining_codes: 2,
      global_cooldown_seconds: 60,
      enable_auto_simulation: true,
      last_real_claim_at: '2026-01-01T00:00:00Z',
    },
  ];
  const simMockDb = {
    prepare(sql: string) {
      let bound: any[] = [];
      const s = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...args: any[]) {
          bound = args;
          return this;
        },
        async first() {
          if (s.includes('FROM system_settings WHERE key = ?')) {
            if (bound[0] === 'wcg_admin_giveaways_v4') {
              return { value: JSON.stringify(simGiveawayState) };
            }
            const val = settingsMap.get(String(bound[0]));
            return val !== undefined ? { value: val } : null;
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          if (s.includes('INSERT INTO system_settings') && bound[0] === CATALOG_EPOCH_SETTING_KEY) {
            epochWriteCount++;
            settingsMap.set(CATALOG_EPOCH_SETTING_KEY, String(bound[1]));
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  } as any;

  const sim400Res = await worker.fetch(
    new Request('https://universal-mall-shop.pages.dev/api/giveaways/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid_json',
    }),
    { DB: simMockDb, ASSETS: { fetch: async () => new Response('', { status: 404 }) } } as any,
    noopCtx
  );
  check('reg46_simulate_400_zero_epoch_bumps', sim400Res.status === 400 && epochWriteCount === 0, true);

  const sim401Res = await worker.fetch(
    new Request('https://universal-mall-shop.pages.dev/api/giveaways/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bypassCooldown: true }),
    }),
    { DB: simMockDb, ADMIN_API_KEY: 'admin_secret_key_for_sim_test_32ch', ASSETS: { fetch: async () => new Response('', { status: 404 }) } } as any,
    noopCtx
  );
  check('reg46_simulate_401_zero_epoch_bumps', sim401Res.status === 401 && epochWriteCount === 0, true);

  const sim200Res = await worker.fetch(
    new Request('https://universal-mall-shop.pages.dev/api/giveaways/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
    { DB: simMockDb, ASSETS: { fetch: async () => new Response('', { status: 404 }) } } as any,
    noopCtx
  );
  check('reg46_simulate_200_single_epoch_bump_no_double', sim200Res.status === 200 && epochWriteCount === 1, true);

  // #47: GET /api/orders/status bumps epoch when overdue VietQR order expires and restores stock
  let expiredOrderStatus = 'PENDING';
  let statusEpochBumps = 0;
  const expMockDb = {
    prepare(sql: string) {
      let bound: any[] = [];
      const s = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...args: any[]) {
          bound = args;
          return this;
        },
        async first() {
          if (s.startsWith('SELECT * FROM orders WHERE id = ?')) {
            return {
              id: 'ord_qr_exp_1',
              member_id: 'mem_1',
              status: expiredOrderStatus === 'PENDING' ? 'PENDING' : 'CANCELLED',
              payment_status: expiredOrderStatus === 'PENDING' ? 'PENDING_PAYMENT' : 'EXPIRED',
              expires_at: '2026-01-01T00:00:00Z',
            };
          }
          return null;
        },
        async all() {
          if (s.includes("FROM orders WHERE payment_method = 'vietqr'")) {
            return {
              results:
                expiredOrderStatus === 'PENDING'
                  ? [{ id: 'ord_qr_exp_1', product_id: 'prd_1', quantity: 1, expires_at: '2026-01-01T00:00:00Z' }]
                  : [],
            };
          }
          return { results: [] };
        },
        async run() {
          if (s.includes('INSERT INTO system_settings') && bound[0] === CATALOG_EPOCH_SETTING_KEY) {
            statusEpochBumps++;
          }
          return { success: true, meta: { changes: 1 } };
        },
        _sql: s,
      };
    },
    async batch(stmts: any[]) {
      if (stmts[0]?._sql?.includes("SET status = 'CANCELLED'")) {
        expiredOrderStatus = 'CANCELLED';
        return stmts.map(() => ({ success: true, meta: { changes: 1 } }));
      }
      return [];
    },
  } as any;

  await orderStatusGet({
    request: new Request('https://universal-mall-shop.pages.dev/api/orders/status?order_id=ord_qr_exp_1'),
    env: { DB: expMockDb, ADMIN_SYNC_SECRET: '' },
    waitUntil: () => {},
  } as any);
  check('reg47_order_expiry_bumps_catalog_epoch_once', statusEpochBumps, 1);

  // #50: Admin affiliate SUSPEND keeps revoked_at NULL, REVOKE sets revoked_at
  const pRow: any = {
    id: 'sap_reg50',
    supplier_seller_id: 'sel_a',
    reseller_seller_id: 'sel_b',
    status: 'APPROVED',
    api_key_hash: 'f'.repeat(64),
    api_key_prefix: 'wcg_shop_ffff••••1111',
    revoked_at: null,
  };
  const affMockDb = {
    prepare(sql: string) {
      let bound: any[] = [];
      const s = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...args: any[]) {
          bound = args;
          return this;
        },
        async first() {
          if (s.includes('FROM seller_affiliate_partnerships WHERE id = ?')) return { ...pRow };
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return { success: true, meta: { changes: 1 } };
        },
        _s: s,
        _b: () => bound,
      };
    },
    async batch(stmts: any[]) {
      for (const st of stmts) {
        const b = st._b();
        if (st._s.includes("SET status = 'SUSPENDED'")) {
          pRow.status = 'SUSPENDED';
          pRow.revoked_at = pRow.revoked_at ?? b[0];
        } else if (st._s.includes("SET status = 'REVOKED'")) {
          pRow.status = 'REVOKED';
          pRow.revoked_at = b[0];
        }
      }
      return stmts.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  } as any;
  const affAdminKey = 'admin_master_key_reg50_test_32chars';
  await handleAdminAffiliateRequest(
    {
      request: new Request('https://admin.example.test/api/admin/affiliate/partnerships/sap_reg50', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': affAdminKey },
        body: JSON.stringify({ status: 'SUSPENDED' }),
      }),
      env: { DB: affMockDb, ADMIN_API_KEY: affAdminKey },
    },
    ['partnerships', 'sap_reg50']
  );
  check('reg50_suspend_keeps_revoked_at_null', pRow.status === 'SUSPENDED' && pRow.revoked_at === null, true);

  await handleAdminAffiliateRequest(
    {
      request: new Request('https://admin.example.test/api/admin/affiliate/partnerships/sap_reg50', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': affAdminKey },
        body: JSON.stringify({ status: 'REVOKED' }),
      }),
      env: { DB: affMockDb, ADMIN_API_KEY: affAdminKey },
    },
    ['partnerships', 'sap_reg50']
  );
  check('reg50_revoke_sets_revoked_at_timestamp', pRow.status === 'REVOKED' && typeof pRow.revoked_at === 'string' && pRow.revoked_at.length > 10, true);

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify(
      {
        suite: 'test_catalog_epoch_sync',
        total: results.length,
        passed,
        failedCount: failed.length,
        failed,
      },
      null,
      2
    )
  );
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
