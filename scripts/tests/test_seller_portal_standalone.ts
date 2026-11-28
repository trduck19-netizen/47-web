import fs from 'node:fs';
import path from 'node:path';
import { onRequestGet as getPortalConfig } from '../../functions/api/seller/portal-config';
import { onRequestPut as putSellerConfig, onRequestGet as getSellerConfig } from '../../functions/api/admin/seller-config';
import workerDefault from '../../functions/_worker';
import {
  DEFAULT_MARKETPLACE_CONFIG,
  sanitizeSellerPortalThemePreset,
} from '../../functions/services/marketplace_service';
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
        return { name: '0053_seller_direct_sepay_gateway_v1' };
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
  const idxSellerPathCheck = appSrc.indexOf('isSellerPortalPathname(path)');
  const idxAdminHashCheck = appSrc.indexOf('ADMIN_HASH_PREFIXES.some');
  check('app_checks_seller_path_before_admin_hash', idxSellerPathCheck > 0 && idxAdminHashCheck > idxSellerPathCheck, true);

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
