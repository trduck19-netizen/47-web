import fs from 'node:fs';
import path from 'node:path';
import { onRequestGet as getPortalConfig } from '../../functions/api/seller/portal-config';
import { onRequestPut as putSellerConfig, onRequestGet as getSellerConfig } from '../../functions/api/admin/seller-config';
import workerDefault from '../../functions/_worker';
import {
  DEFAULT_MARKETPLACE_CONFIG,
  sanitizeSellerPortalThemePreset,
} from '../../functions/services/marketplace_service';
import { shouldBumpCatalogEpoch } from '../../functions/services/cache_service';
import {
  getAllowedSellerPortalTabs,
  isSellerTabAllowedForRole,
  isSellerPortalPathname,
  parseSellerPortalHash,
  formatSellerPortalHash,
  getSellerPortalPalette,
} from '../../src/components/seller/sellerPortalTheme';

interface CheckResult {
  name: string;
  pass: boolean;
  actual: unknown;
  expected: unknown;
}

const results: CheckResult[] = [];
function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, pass, actual, expected });
}

function createMockDb() {
  const settings = new Map<string, string>();
  const makeStmt = (sql: string, args: any[] = []) => {
    const u = sql.trim().replace(/\s+/g, ' ').toUpperCase();
    const execFirst = async () => {
      if (u.includes('FROM SYSTEM_SETTINGS WHERE KEY =')) {
        const keyMatch = sql.match(/KEY\s*=\s*'([^']+)'/i);
        const key = keyMatch ? keyMatch[1] : String(args[0] || '');
        const val = settings.get(key);
        return val !== undefined ? { value: val } : null;
      }
      if (u.includes('FROM SCHEMA_MIGRATIONS')) {
        return { name: '0054_seller_storefront_branding_v1' };
      }
      return null;
    };
    const execAll = async () => {
      if (u.includes('FROM SCHEMA_MIGRATIONS')) {
        return {
          results: [
            { name: 'baseline_unconditional_ddl_v1' },
            { name: 'schema_v5_full_upgrades' },
            { name: 'wcg_virtual_layer_tables_v1' },
            { name: 'deleted_records_history_v1' },
            { name: '0050_external_supplier_connectors_v1' },
            { name: '0051_seller_affiliate_system_v1' },
            { name: '0052_seller_products_stock_quantity_v1' },
            { name: '0053_seller_direct_sepay_gateway_v1' },
            { name: '0054_seller_storefront_branding_v1' },
          ],
        };
      }
      return { results: [] };
    };
    const execRun = async () => {
      if (u.startsWith('INSERT INTO SYSTEM_SETTINGS')) {
        const keyMatch = sql.match(/VALUES\s*\(\s*'([^']+)'/i);
        const key = keyMatch ? keyMatch[1] : String(args[0] || '');
        const value = keyMatch ? String(args[0] || '') : String(args[1] || '');
        if (key) settings.set(key, value);
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 1 } };
    };
    return {
      bind(...nextArgs: any[]) {
        return makeStmt(sql, nextArgs);
      },
      first: execFirst,
      all: execAll,
      run: execRun,
    };
  };

  return {
    settings,
    db: {
      prepare(sql: string) {
        return makeStmt(sql, []);
      },
      async batch(stmts: any[]) {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        return out;
      },
    } as any,
  };
}

function flattenLeaves(obj: Record<string, any>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenLeaves(v, p));
    } else {
      out.push(p);
    }
  }
  return out;
}

async function main() {
  const root = process.cwd();
  const TEST_ADMIN_KEY = 'test_admin_key_seller_portal_32ch';

  // =========================================================================
  // PART 1: Edge Worker 301 Redirects (/ban-hang & /seller-center -> /seller)
  // =========================================================================
  const mockEnv = {
    ASSETS: {
      fetch: async () => new Response('<html>SPA</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    },
  } as any;
  const mockCtx = { waitUntil() {}, passThroughOnException() {} } as any;

  const r1 = await workerDefault.fetch(new Request('https://universal-mall-shop.pages.dev/ban-hang', { method: 'GET' }), mockEnv, mockCtx);
  check('edge_301_ban_hang_to_seller', r1.status === 301 && r1.headers.get('location') === 'https://universal-mall-shop.pages.dev/seller', true);

  const r2 = await workerDefault.fetch(new Request('https://universal-mall-shop.pages.dev/en/ban-hang?ref=top', { method: 'GET' }), mockEnv, mockCtx);
  check('edge_301_en_ban_hang_to_en_seller_preserves_query', r2.status === 301 && r2.headers.get('location') === 'https://universal-mall-shop.pages.dev/en/seller?ref=top', true);

  const r3 = await workerDefault.fetch(new Request('https://universal-mall-shop.pages.dev/seller-center', { method: 'HEAD' }), mockEnv, mockCtx);
  check('edge_301_head_seller_center_to_seller', r3.status === 301 && r3.headers.get('location') === 'https://universal-mall-shop.pages.dev/seller', true);

  const r4 = await workerDefault.fetch(new Request('https://universal-mall-shop.pages.dev/en/seller-center', { method: 'GET' }), mockEnv, mockCtx);
  check('edge_301_en_seller_center_to_en_seller', r4.status === 301 && r4.headers.get('location') === 'https://universal-mall-shop.pages.dev/en/seller', true);

  // =========================================================================
  // PART 2: Pathname & Hash Parsing + Zero Collision with AdminApp Hashes
  // =========================================================================
  check('pathname_matches_seller_vi_en', isSellerPortalPathname('/seller') && isSellerPortalPathname('/en/seller') && !isSellerPortalPathname('/admin') && !isSellerPortalPathname('/store'), true);
  check('hash_parse_all_tabs', parseSellerPortalHash('#/sepay') === 'sepay' && parseSellerPortalHash('#/api-keys') === 'api_keys' && parseSellerPortalHash('#/api_keys') === 'api_keys' && parseSellerPortalHash('#/orders') === 'orders' && parseSellerPortalHash('') === 'dashboard', true);
  check('hash_format_roundtrip', formatSellerPortalHash('api_keys') === '#/api-keys' && formatSellerPortalHash('sepay') === '#/sepay', true);

  const appSrc = fs.readFileSync(path.resolve(root, 'src/App.tsx'), 'utf8');
  const sellerCheckMatches = [...appSrc.matchAll(/isSellerPortalPathname\(/g)].map((m) => m.index || 0);
  const adminHashMatches = [...appSrc.matchAll(/ADMIN_HASH_PREFIXES\.some\(/g)].map((m) => m.index || 0);
  // Every ADMIN_HASH_PREFIXES.some(...) site (init state, parseHash, handlePopState) must have a preceding isSellerPortalPathname check within 500 chars
  const allAdminSitesGuarded =
    adminHashMatches.length >= 3 &&
    adminHashMatches.every((aIdx) =>
      sellerCheckMatches.some((sIdx) => sIdx < aIdx && aIdx - sIdx < 600)
    );
  check('app_guards_all_admin_hash_sites_with_seller_path', allAdminSitesGuarded, true);

  // =========================================================================
  // PART 3: RBAC Sidebar Filtering (OWNER vs MANAGE_STOCK vs VIEW_ORDERS)
  // =========================================================================
  check('rbac_owner_gets_all_10_tabs', getAllowedSellerPortalTabs('OWNER').length, 10);
  check(
    'rbac_manage_stock_hides_sensitive_tabs',
    isSellerTabAllowedForRole('products', 'MANAGE_STOCK') &&
      isSellerTabAllowedForRole('codes', 'MANAGE_STOCK') &&
      !isSellerTabAllowedForRole('sepay', 'MANAGE_STOCK') &&
      !isSellerTabAllowedForRole('finance', 'MANAGE_STOCK') &&
      !isSellerTabAllowedForRole('api_keys', 'MANAGE_STOCK') &&
      !isSellerTabAllowedForRole('settings', 'MANAGE_STOCK'),
    true
  );
  check(
    'rbac_view_orders_only_dashboard_orders_disputes',
    isSellerTabAllowedForRole('orders', 'VIEW_ORDERS') &&
      isSellerTabAllowedForRole('disputes', 'VIEW_ORDERS') &&
      !isSellerTabAllowedForRole('products', 'VIEW_ORDERS') &&
      !isSellerTabAllowedForRole('codes', 'VIEW_ORDERS') &&
      !isSellerTabAllowedForRole('sepay', 'VIEW_ORDERS') &&
      !isSellerTabAllowedForRole('finance', 'VIEW_ORDERS'),
    true
  );

  // =========================================================================
  // PART 4: Admin Seller Portal Theme Customization & Public Portal Config API
  // =========================================================================
  check('default_theme_is_shopee_orange', DEFAULT_MARKETPLACE_CONFIG.seller_portal_theme_preset, 'shopee_orange');
  check('sanitize_invalid_theme_falls_back_shopee_orange', sanitizeSellerPortalThemePreset('hacked_color'), 'shopee_orange');
  check('palette_maps_enterprise_indigo', getSellerPortalPalette('enterprise_indigo').primaryHex, '#2563eb');

  const { db } = createMockDb();
  const putRes = await putSellerConfig({
    request: new Request('https://admin.example.test/api/admin/seller-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': TEST_ADMIN_KEY },
      body: JSON.stringify({
        seller_portal_theme_preset: 'enterprise_indigo',
        seller_portal_allow_dark_mode: false,
        seller_portal_banner_vi: 'Bảo trì đối soát lúc 23:00',
        seller_portal_banner_en: 'Reconciliation maintenance at 23:00',
        direct_sepay_fee_pct: 0,
      }),
    }),
    env: { DB: db, ADMIN_API_KEY: TEST_ADMIN_KEY },
    waitUntil() {},
  } as any);
  const putJson: any = await putRes.json();
  check(
    'admin_put_seller_config_saves_portal_theme_and_banners',
    putRes.status === 200 &&
      putJson.config.seller_portal_theme_preset === 'enterprise_indigo' &&
      putJson.config.seller_portal_allow_dark_mode === false &&
      putJson.config.seller_portal_banner_vi === 'Bảo trì đối soát lúc 23:00' &&
      putJson.config.direct_sepay_global_enabled === true,
    true
  );

  const pubRes = await getPortalConfig({
    request: new Request('https://universal-mall-shop.pages.dev/api/seller/portal-config'),
    env: { DB: db },
  } as any);
  const pubJson: any = await pubRes.json();
  check(
    'public_portal_config_returns_admin_theme_and_highlights',
    pubRes.status === 200 &&
      pubJson.portal_config.theme_preset === 'enterprise_indigo' &&
      pubJson.portal_config.allow_dark_mode === false &&
      pubJson.portal_config.banner_en === 'Reconciliation maintenance at 23:00' &&
      pubJson.highlights.direct_sepay_fee_pct === 0,
    true
  );

  const getAdmRes = await getSellerConfig({
    request: new Request('https://admin.example.test/api/admin/seller-config', {
      headers: { 'X-Admin-Key': TEST_ADMIN_KEY },
    }),
    env: { DB: db, ADMIN_API_KEY: TEST_ADMIN_KEY },
  } as any);
  const getAdmJson: any = await getAdmRes.json();
  check('admin_get_seller_config_reads_back_theme', getAdmRes.status === 200 && getAdmJson.config.seller_portal_theme_preset === 'enterprise_indigo', true);

  // =========================================================================
  // PART 5: Bundle Decoupling (UniversalMallView zero static SellerCenterView import) & New-Tab Links
  // =========================================================================
  const mallSrc = fs.readFileSync(path.resolve(root, 'src/components/mall/UniversalMallView.tsx'), 'utf8');
  check('mall_view_has_no_static_seller_center_import', !mallSrc.includes('SellerCenterView'), true);
  check('mall_topbar_opens_seller_in_new_tab', mallSrc.includes("target=\"_blank\"") && mallSrc.includes("'/en/seller' : '/seller'"), true);
  check('app_lazy_loads_seller_portal_app', appSrc.includes("import('./components/seller/SellerPortalApp')"), true);

  // =========================================================================
  // PART 6: Accessibility (aria-current="page") & Rule 12 Bilingual Symmetry
  // =========================================================================
  const sidebarSrc = fs.readFileSync(path.resolve(root, 'src/components/seller/SellerPortalSidebar.tsx'), 'utf8');
  check('sidebar_uses_semantic_aria_current_page', sidebarSrc.includes("aria-current={isActive ? 'page' : undefined}"), true);

  const viDict = JSON.parse(fs.readFileSync(path.resolve(root, 'src/locales/vi.json'), 'utf8'));
  const enDict = JSON.parse(fs.readFileSync(path.resolve(root, 'src/locales/en.json'), 'utf8'));
  const viLeaves = flattenLeaves(viDict.sellerPortal || {});
  const enLeaves = flattenLeaves(enDict.sellerPortal || {});
  check('rule12_seller_portal_dict_symmetry', viLeaves.length >= 45 && JSON.stringify(viLeaves.sort()) === JSON.stringify(enLeaves.sort()), true);

  // =========================================================================
  // PART 7: Regression Guards for 3 E2E-Discovered Backend Bugs
  // =========================================================================
  check('e2e_fix_patch_seller_vacation_bumps_epoch', shouldBumpCatalogEpoch('/api/seller', 'PATCH') && shouldBumpCatalogEpoch('/api/seller', 'PUT'), true);
  const subSrc = fs.readFileSync(path.resolve(root, 'functions/api/seller/subaccounts/index.ts'), 'utf8');
  check('e2e_fix_subaccount_uses_owner_member_id', subSrc.includes('storeAuth.seller.owner_member_id') && !subSrc.includes('storeAuth.seller.member_id'), true);
  const repSrc = fs.readFileSync(path.resolve(root, 'functions/api/seller-orders/[id]/report.ts'), 'utf8');
  check('e2e_fix_report_allows_paid_and_delivered', repSrc.includes("order.status !== 'DELIVERED' && order.status !== 'PAID'"), true);

  // =========================================================================
  // PART 8: Anti-Freeze Single-Source Bootstrap, Echo Loop Guard & Storefront Upgrade
  // =========================================================================
  const portalAppSrc = fs.readFileSync(path.resolve(root, 'src/components/seller/SellerPortalApp.tsx'), 'utf8');
  check(
    'anti_freeze_portal_single_source_bootstrap',
    portalAppSrc.includes('fetchPortalBootstrap') &&
      portalAppSrc.includes('initialBootstrap={sellerSnapshot}') &&
      portalAppSrc.includes("const currentUserId = currentUser?.id ? String(currentUser.id) : '';") &&
      portalAppSrc.includes('else if (res.status === 404)') &&
      portalAppSrc.includes('AbortController'),
    true
  );
  check(
    'anti_freeze_portal_guards_transient_loading_wipe',
    portalAppSrc.includes('if (snapshot.loading && !snapshot.hasSeller && prev.hasSeller)'),
    true
  );

  const centerSrc = fs.readFileSync(path.resolve(root, 'src/components/seller/SellerCenterView.tsx'), 'utf8');
  check(
    'anti_freeze_center_consumes_initial_bootstrap_and_guards_emit',
    centerSrc.includes('initialBootstrap?:') &&
      centerSrc.includes('bootstrappedRef') &&
      centerSrc.includes("const currentUserId = currentUser?.id ? String(currentUser.id) : '';") &&
      centerSrc.includes('if (loading && !sellerData) return;'),
    true
  );

  check(
    'anti_echo_app_wallet_broadcast_opt_in_only',
    appSrc.includes('options?: { broadcast?: boolean }') &&
      appSrc.includes('if (usr && options?.broadcast === true)') &&
      appSrc.includes('{ broadcast: false }'),
    true
  );

  check(
    'storefront_breadcrumb_eliminates_raw_count_token',
    mallSrc.includes("t('mall.breadcrumb.partnerStore')") && !mallSrc.includes('t.mall?.breadcrumb?.store'),
    true
  );

  const swSrc = fs.readFileSync(path.resolve(root, 'public/sw.js'), 'utf8');
  check(
    'sw_v11_drops_stale_root_and_logo_png_precache',
    swSrc.includes("const CACHE_NAME = 'codegame-pwa-v11'") && !swSrc.includes("'/logo.png'") && !swSrc.includes("'/',"),
    true
  );

  const workerSrc = fs.readFileSync(path.resolve(root, 'functions/_worker.ts'), 'utf8');
  check(
    'worker_ssr_handles_gian_hang_storefront_paths',
    workerSrc.includes("pathname.startsWith('/gian-hang/')") &&
      workerSrc.includes("pathname.startsWith('/en/gian-hang/')") &&
      workerSrc.includes('canonicalStorePath'),
    true
  );

  const d1Src = fs.readFileSync(path.resolve(root, 'functions/services/d1_service.ts'), 'utf8');
  check(
    'd1_migration_0054_storefront_branding_and_cold_guard',
    d1Src.includes('0054_seller_storefront_branding_v1') &&
      d1Src.includes("pragma_table_info('sellers')") &&
      d1Src.includes('banner_preset'),
    true
  );

  const sellerApiSrc = fs.readFileSync(path.resolve(root, 'functions/api/seller/index.ts'), 'utf8');
  const storeApiSrc = fs.readFileSync(path.resolve(root, 'functions/api/stores/[slug]/index.ts'), 'utf8');
  const storeProductsApiSrc = fs.readFileSync(path.resolve(root, 'functions/api/stores/[slug]/products.ts'), 'utf8');
  check(
    'api_seller_put_supports_storefront_branding_fields',
    sellerApiSrc.includes('ALLOWED_BANNER_PRESETS') &&
      sellerApiSrc.includes('sanitizeMediaUrl') &&
      sellerApiSrc.includes('pinned_notice') &&
      sellerApiSrc.includes('bumpCatalogEpoch'),
    true
  );
  check(
    'api_stores_returns_live_metrics_and_branding',
    storeApiSrc.includes('banner_preset') &&
      storeApiSrc.includes('pinned_notice') &&
      storeApiSrc.includes('completed_orders_count') &&
      storeApiSrc.includes('total_products'),
    true
  );
  check(
    'api_store_products_returns_sold_count_and_physical_stock',
    storeProductsApiSrc.includes('sold_count') && storeProductsApiSrc.includes('stock_quantity'),
    true
  );

  const pubStoreSrc = fs.readFileSync(path.resolve(root, 'src/components/seller/PublicStoreView.tsx'), 'utf8');
  const studioSrc = fs.readFileSync(path.resolve(root, 'src/components/seller/SellerStorefrontStudio.tsx'), 'utf8');
  const themesSrc = fs.readFileSync(path.resolve(root, 'src/components/seller/storefrontThemes.ts'), 'utf8');
  check(
    'public_store_view_flagship_mwg_patterns_and_404_fallback',
    pubStoreSrc.includes('role="tablist"') &&
      pubStoreSrc.includes('<article') &&
      pubStoreSrc.includes("contentVisibility: 'auto'") &&
      pubStoreSrc.includes('resolveProductCoverImage') &&
      pubStoreSrc.includes('onError'),
    true
  );
  check(
    'seller_storefront_studio_embeds_6_themes_and_live_preview',
    studioSrc.includes('STOREFRONT_BANNER_PRESETS') &&
      studioSrc.includes('ImageUploadInput') &&
      studioSrc.includes('PUT') &&
      themesSrc.includes('aurora_indigo') &&
      themesSrc.includes('shopee_flame') &&
      themesSrc.includes('gold_luxury'),
    true
  );

  const viPubLeaves = flattenLeaves(viDict.publicStore || {});
  const enPubLeaves = flattenLeaves(enDict.publicStore || {});
  const viStudioLeaves = flattenLeaves(viDict.sellerStoreStudio || {});
  const enStudioLeaves = flattenLeaves(enDict.sellerStoreStudio || {});
  check(
    'rule12_storefront_and_studio_dict_symmetry',
    viPubLeaves.length >= 60 &&
      JSON.stringify(viPubLeaves.sort()) === JSON.stringify(enPubLeaves.sort()) &&
      viStudioLeaves.length >= 30 &&
      JSON.stringify(viStudioLeaves.sort()) === JSON.stringify(enStudioLeaves.sort()) &&
      Boolean(viDict.mall?.breadcrumb?.partnerStore) &&
      Boolean(enDict.mall?.breadcrumb?.partnerStore),
    true
  );

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify(
      {
        suite: 'test_seller_portal_standalone',
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
