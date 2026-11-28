/**
 * Automated Regression Suite: Dynamic Platform Renaming, Brand Identity SSOT,
 * AI Brand Label & Customizable Wallet Core Unit ("Core" -> "Xu"/"Point"/...)
 *
 * Chạy trực tiếp: cmd /c npx tsx scripts/tests/test_brand_identity_sync.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

import {
  BRAND_IDENTITY_SETTING_KEY,
  DEFAULT_BRAND_IDENTITY,
  normalizeBrandIdentity,
  extractBrandFromSettingsMap,
  getBrandIdentity,
  saveBrandIdentity,
  buildDynamicManifestJson,
  serializeBrandForInlineScript,
  invalidateBrandIdentityCache,
} from '../../functions/services/brand_service';
import { hasScope } from '../../functions/services/mission_service';
import { shouldBumpCatalogEpoch, CATALOG_EPOCH_SETTING_KEY } from '../../functions/services/cache_service';
import { onRequestGet as brandPublicGet } from '../../functions/api/brand';
import { onRequestGet as adminBrandGet, onRequestPut as adminBrandPut } from '../../functions/api/admin/brand';
import { setActiveBrandIdentity, getBrandInterpolationParams } from '../../src/utils/brandRuntime';
import { formatCore } from '../../src/utils/textUtils';

type TestCase = { name: string; fn: () => Promise<void> | void };
const tests: TestCase[] = [];
function test(name: string, fn: () => Promise<void> | void) {
  tests.push({ name, fn });
}

/**
 * Minimal in-memory D1 mock supporting system_settings, sellers, admin_audit_logs, mission_ai_api_keys
 */
function createMockD1() {
  const settings = new Map<string, string>();
  const sellers = new Map<string, { id: string; slug: string; name: string; description: string; updated_at: string }>();
  sellers.set('seller_universal_mall', {
    id: 'seller_universal_mall',
    slug: 'universal-mall-official',
    name: 'Universal Mall Official Store',
    description: 'Default',
    updated_at: '2026-01-01T00:00:00Z',
  });
  const audits: any[] = [];

  const db: any = {
    _settings: settings,
    _sellers: sellers,
    _audits: audits,
    prepare(sql: string) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      let bindings: any[] = [];
      return {
        bind(...args: any[]) {
          bindings = args;
          return this;
        },
        async first<T = any>(): Promise<T | null> {
          if (/SELECT value FROM system_settings WHERE key = \?/i.test(normalizedSql)) {
            const val = settings.get(String(bindings[0]));
            return (val !== undefined ? { value: val } : null) as any;
          }
          if (/SELECT \* FROM mission_ai_api_keys/i.test(normalizedSql)) {
            return null;
          }
          return null;
        },
        async all() {
          if (/SELECT key, value FROM system_settings/i.test(normalizedSql)) {
            const rows: any[] = [];
            for (const k of bindings) {
              const v = settings.get(String(k));
              if (v !== undefined) rows.push({ key: k, value: v });
            }
            return { results: rows };
          }
          return { results: [] };
        },
        async run() {
          if (/INSERT INTO system_settings/i.test(normalizedSql)) {
            settings.set(String(bindings[0]), String(bindings[1]));
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE sellers SET name = \?/i.test(normalizedSql)) {
            const s = sellers.get('seller_universal_mall');
            if (s) {
              s.name = String(bindings[0]);
              s.description = String(bindings[1]);
              s.updated_at = String(bindings[2]);
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (/INSERT INTO (admin_audit_logs|security_logs)/i.test(normalizedSql)) {
            audits.push({ sql: normalizedSql, bindings });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
    },
    async batch(stmts: any[]) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
  return db;
}

// 1. Normalization & Auto-derivation
test('normalizeBrandIdentity auto-derives shortName, sellerPortalName, adminPortalName, aiBrandName & sanitizes XSS', () => {
  const b = normalizeBrandIdentity({
    brandName: '  <b>Nova Mega Mall</b>  ',
    shortName: '',
    sellerPortalName: '',
    adminPortalName: '',
    aiBrandName: '',
    coreUnitName: '<Xu>',
    brandBadge: 'SHOP',
  });
  assert.equal(b.brandName, 'bNova Mega Mall/b');
  assert.equal(b.coreUnitName, 'Xu');
  assert.equal(b.brandBadge, 'SHOP');

  const clean = normalizeBrandIdentity({
    brandName: 'Nova Mega Mall',
    shortName: '',
    sellerPortalName: '',
    adminPortalName: '',
    aiBrandName: '',
    coreUnitName: 'Xu',
  });
  assert.equal(clean.brandName, 'Nova Mega Mall');
  assert.equal(clean.shortName, 'Nova Mall');
  assert.equal(clean.sellerPortalName, 'Nova Seller Center');
  assert.equal(clean.adminPortalName, 'Nova Mega Mall Admin');
  assert.equal(clean.aiBrandName, 'Nova AI');
  assert.equal(clean.coreUnitName, 'Xu');
  assert.equal(clean.copyrightHolder, 'Nova Mega Mall');
});

// 2. Empty badge explicitly allowed (hide badge)
test('normalizeBrandIdentity allows blank brandBadge to hide header badge', () => {
  const b = normalizeBrandIdentity({ brandName: 'Alpha Shop', brandBadge: '' });
  assert.equal(b.brandBadge, '');
});

// 3. Save Brand SSOT + Mirror wcg_admin_content_v4 + Official Store + CatalogEpoch bump
test('saveBrandIdentity persists wcg_brand_identity_v1, mirrors wcg_admin_content_v4, renames Official Store & bumps CatalogEpoch', async () => {
  invalidateBrandIdentityCache();
  const db = createMockD1();
  const { brand, epoch } = await saveBrandIdentity(db, {
    brandName: 'Orion Market',
    shortName: 'Orion',
    sellerPortalName: 'Orion Seller Hub',
    adminPortalName: 'Orion Admin',
    aiBrandName: 'Orion AI',
    coreUnitName: 'Point',
    syncOfficialStoreName: true,
  });

  assert.equal(brand.brandName, 'Orion Market');
  assert.equal(brand.aiBrandName, 'Orion AI');
  assert.equal(brand.coreUnitName, 'Point');
  assert.ok(epoch && epoch.length > 5);

  const savedRaw = db._settings.get(BRAND_IDENTITY_SETTING_KEY);
  assert.ok(savedRaw, 'wcg_brand_identity_v1 must be saved');
  assert.equal(JSON.parse(savedRaw).coreUnitName, 'Point');

  const mirroredContent = JSON.parse(db._settings.get('wcg_admin_content_v4') || '[]');
  const wb = mirroredContent.find((x: any) => x.key === 'website_branding');
  const ft = mirroredContent.find((x: any) => x.key === 'footer_support');
  assert.equal(wb?.title, 'Orion Market');
  assert.equal(wb?.extraData?.coreUnitName, 'Point');
  assert.equal(wb?.extraData?.aiBrandName, 'Orion AI');
  assert.equal(ft?.extraData?.brandTitle, 'Orion Market');

  assert.equal(db._sellers.get('seller_universal_mall')?.name, 'Orion Market Official Store');
  assert.equal(db._settings.get(CATALOG_EPOCH_SETTING_KEY), epoch);

  const reread = await getBrandIdentity(db);
  assert.equal(reread.brandName, 'Orion Market');
  assert.equal(reread.coreUnitName, 'Point');
});

// 4. Backward compatibility fallback from legacy wcg_admin_content_v4
test('extractBrandFromSettingsMap falls back gracefully to wcg_admin_content_v4 when wcg_brand_identity_v1 absent', () => {
  const b = extractBrandFromSettingsMap({
    wcg_admin_content_v4: [
      {
        key: 'website_branding',
        title: 'Legacy Custom Mall',
        extraData: { hotline: '0900111222', themeAccent: 'blue', currencyMode: 'CORE' },
      },
    ],
  });
  assert.equal(b.brandName, 'Legacy Custom Mall');
  assert.equal(b.shortName, 'Legacy Mall');
  assert.equal(b.supportHotline, '0900111222');
  assert.equal(b.themeAccent, 'blue');
  assert.equal(b.currencyMode, 'CORE');
});

// 5. Dynamic PWA Manifest & Zero-FOUC Inline Script Escaping
test('buildDynamicManifestJson & serializeBrandForInlineScript reflect new brand and escape HTML safely', () => {
  const b = normalizeBrandIdentity({
    brandName: 'Nova Market',
    shortName: 'Nova',
    sellerPortalName: 'Nova Seller Center',
    taglineVi: 'Siêu thị trực tuyến Nova',
  });
  const manifest = buildDynamicManifestJson(b);
  assert.equal(manifest.short_name, 'Nova');
  assert.ok(manifest.name.startsWith('Nova Market'));
  assert.equal(manifest.shortcuts[2].name, 'Nova Seller Center');

  const serialized = serializeBrandForInlineScript({ ...b, taglineVi: 'Test </script> & >' });
  assert.ok(!serialized.includes('</script>'), 'Must escape < to prevent script breakout');
  assert.ok(serialized.includes('\\u003c/script\\u003e'));
});

// 6. RBAC Scope & Cache Epoch Rules (Rule 8)
test('BRAND_MANAGE scope resolves correctly & /api/admin/brand triggers CatalogEpoch bump', () => {
  assert.equal(hasScope('BRAND_MANAGE', 'BRAND_MANAGE'), true);
  assert.equal(hasScope('SYSTEM_SETTINGS_FULL', 'BRAND_MANAGE'), true);
  assert.equal(hasScope('ADMIN_FULL', 'BRAND_MANAGE'), true);
  assert.equal(hasScope('GAMES_MANAGE', 'BRAND_MANAGE'), false);
  assert.equal(shouldBumpCatalogEpoch('/api/admin/brand', 'PUT'), true);
  assert.equal(shouldBumpCatalogEpoch('/api/admin/brand', 'GET'), false);
});

// 7. Public & Admin Brand API Handlers (Auth, Validation, Update & Reset)
test('GET /api/brand & GET/PUT /api/admin/brand enforce auth, validate input, update & reset cleanly', async () => {
  invalidateBrandIdentityCache();
  const db = createMockD1();
  const env: any = { DB: db, ADMIN_API_KEY: 'test_admin_secret_key_for_brand_suite_123456' };

  // Unauthorized PUT -> 401
  const unauthRes = await adminBrandPut({
    request: new Request('https://example.com/api/admin/brand', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandName: 'Hacker Mall' }),
    }),
    env,
  } as any);
  assert.equal(unauthRes.status, 401);

  // Invalid short brandName -> 400
  const badRes = await adminBrandPut({
    request: new Request('https://example.com/api/admin/brand', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': env.ADMIN_API_KEY,
      },
      body: JSON.stringify({ brandName: 'A', coreUnitName: 'Xu' }),
    }),
    env,
  } as any);
  assert.equal(badRes.status, 400);

  // Authorized PUT -> 200
  const okRes = await adminBrandPut({
    request: new Request('https://example.com/api/admin/brand', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': env.ADMIN_API_KEY,
      },
      body: JSON.stringify({
        brandName: 'Galaxy Mall',
        shortName: 'Galaxy',
        aiBrandName: 'Galaxy AI',
        coreUnitName: 'Xu',
      }),
    }),
    env,
  } as any);
  assert.equal(okRes.status, 200);
  const okJson: any = await okRes.json();
  assert.equal(okJson.success, true);
  assert.equal(okJson.brand.brandName, 'Galaxy Mall');
  assert.equal(okJson.brand.coreUnitName, 'Xu');

  // Public GET /api/brand reflects update + ETag 304
  const pubRes = await brandPublicGet({
    request: new Request('https://example.com/api/brand'),
    env,
  } as any);
  assert.equal(pubRes.status, 200);
  const etag = pubRes.headers.get('ETag') || '';
  const pubJson: any = await pubRes.json();
  assert.equal(pubJson.brand.brandName, 'Galaxy Mall');
  assert.equal(pubJson.brand.coreUnitName, 'Xu');

  const notModRes = await brandPublicGet({
    request: new Request('https://example.com/api/brand', { headers: { 'If-None-Match': etag } }),
    env,
  } as any);
  assert.equal(notModRes.status, 304);

  // Authorized GET /api/admin/brand
  const admGetRes = await adminBrandGet({
    request: new Request('https://example.com/api/admin/brand', {
      headers: { 'X-Admin-Key': env.ADMIN_API_KEY },
    }),
    env,
  } as any);
  assert.equal(admGetRes.status, 200);

  // Reset back to default -> 200
  const resetRes = await adminBrandPut({
    request: new Request('https://example.com/api/admin/brand', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': env.ADMIN_API_KEY,
      },
      body: JSON.stringify({ reset: true }),
    }),
    env,
  } as any);
  assert.equal(resetRes.status, 200);
  const resetJson: any = await resetRes.json();
  assert.equal(resetJson.brand.brandName, DEFAULT_BRAND_IDENTITY.brandName);
  assert.equal(resetJson.brand.coreUnitName, 'Core');
});

// 8. Frontend formatCore() & Brand Interpolation Tokens
test('formatCore() dynamically switches unit label ("Core" -> "Xu" -> "Core") in VI & EN', () => {
  setActiveBrandIdentity({ ...DEFAULT_BRAND_IDENTITY, brandName: 'Nova Market', aiBrandName: 'Nova AI', coreUnitName: 'Xu' }, { persist: false, emitEvent: false });
  assert.equal(formatCore(50000, 'vi'), '50.000 Xu');
  assert.equal(formatCore(50000, 'en'), '50,000 Xu');
  const tokens = getBrandInterpolationParams();
  assert.equal(tokens.brandName, 'Nova Market');
  assert.equal(tokens.brandNameUpper, 'NOVA MARKET');
  assert.equal(tokens.aiBrandName, 'Nova AI');
  assert.equal(tokens.coreUnit, 'Xu');

  // Restore default
  setActiveBrandIdentity(DEFAULT_BRAND_IDENTITY, { persist: false, emitEvent: false });
  assert.equal(formatCore(50000, 'vi'), '50.000 Core');
});

// 9. Locale Parity & Protected English Adjective Guard
test('vi.json & en.json have 0 key mismatch, use brand/core/ai tokens, and preserve "6 Core Pillars"', () => {
  const root = process.cwd();
  const vi = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/vi.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/en.json'), 'utf8'));

  const collect = (obj: any, p = '', set = new Set<string>()) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = p ? `${p}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) collect(v, key, set);
      else set.add(key);
    }
    return set;
  };

  const viSet = collect(vi);
  const enSet = collect(en);
  assert.equal(viSet.size, enSet.size, `Leaf key count mismatch VI=${viSet.size} EN=${enSet.size}`);
  for (const k of viSet) assert.ok(enSet.has(k), `Missing in en.json: ${k}`);

  // Protected English adjective must NOT be replaced by {coreUnit}
  assert.equal(en.solutions.pillarsTitle, '6 Core Pillars of Our Architecture');

  // Dynamic tokens present in key UI slots
  assert.ok(vi.sellerPortal.brandTitle.includes('{sellerPortalName}'));
  assert.ok(en.sellerPortal.brandTitle.includes('{sellerPortalName}'));
  assert.ok(vi.apiKeys.filterAi.includes('{aiBrandName}'));
  assert.ok(en.apiKeys.filterAi.includes('{aiBrandName}'));
  assert.ok(vi.mall.footer.walletCore.includes('{coreUnit}'));
  assert.ok(en.mall.footer.walletCore.includes('{coreUnit}'));
  assert.ok(vi.mall.search.placeholder.includes('{brandName}'));
  assert.ok(en.mall.search.placeholder.includes('{brandName}'));
  assert.ok(vi.brandIdentity && en.brandIdentity);
});

// 10. Structural Anti-Regression Guard (CyberLoader, AdminSidebar, CMS Shortcut, Rule 8 Scope)
test('Core UI shells, Admin Sidebar, CMS Tab 9 shortcut & ApiKeysModule BRAND_MANAGE are properly wired', () => {
  const root = process.cwd();
  const cyber = fs.readFileSync(path.join(root, 'src/components/CyberLoader.tsx'), 'utf8');
  assert.ok(cyber.includes('useBrand'), 'CyberLoader must read useBrand()');
  assert.ok(!cyber.includes("resolvedTitle = isEn ? 'PINE MALL' : 'CODE GAME'"), 'CyberLoader must not default to legacy CODE GAME');

  const sidebar = fs.readFileSync(path.join(root, 'src/admin/components/AdminSidebar.tsx'), 'utf8');
  assert.ok(sidebar.includes("'brand-identity'"), 'AdminSidebar must expose dedicated brand-identity menu item');
  assert.ok(sidebar.includes('{brand.brandName}'), 'AdminSidebar must display dynamic brandName');

  const cms = fs.readFileSync(path.join(root, 'src/admin/modules/ContentCMSModule.tsx'), 'utf8');
  assert.ok(cms.includes("brandIdentity.cmsShortcutTitle") && cms.includes("#/brand-identity"), 'Tab 9 CMS must include shortcut to BrandIdentityModule');

  const apiKeys = fs.readFileSync(path.join(root, 'src/admin/modules/ApiKeysModule.tsx'), 'utf8');
  assert.ok(apiKeys.includes("'BRAND_MANAGE'"), 'ApiKeysModule must register BRAND_MANAGE (Rule 8)');

  const worker = fs.readFileSync(path.join(root, 'functions/_worker.ts'), 'utf8');
  assert.ok(worker.includes("pathname === '/manifest.json'"), 'Worker must serve dynamic /manifest.json');
  assert.ok(worker.includes('window.__WCG_BRAND__'), 'Worker must inject Zero-FOUC window.__WCG_BRAND__');
});

(async () => {
  let passed = 0;
  let failed = 0;
  for (const tc of tests) {
    try {
      await tc.fn();
      console.log(`  PASS | ${tc.name}`);
      passed++;
    } catch (err: any) {
      console.error(`  FAIL | ${tc.name}\n   -> ${err?.stack || err}`);
      failed++;
    }
  }
  console.log(`\nBrand Identity Sync Suite: ${passed}/${tests.length} PASSED, ${failed} FAILED`);
  if (failed > 0) process.exit(1);
})();
