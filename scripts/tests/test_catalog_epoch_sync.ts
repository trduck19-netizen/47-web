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
