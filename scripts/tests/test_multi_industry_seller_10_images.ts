import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  SELLER_INDUSTRY_OPTIONS,
  MAX_PRODUCT_IMAGES,
} from '../../src/config/sellerIndustries';
import { ensureSchemaUpgrades, ensureMarketplaceSchema } from '../../functions/services/d1_service';
import { onRequestPost as uploadSellerMedia } from '../../functions/api/seller/media/upload';
import { onRequestGet as getProductMedia } from '../../functions/api/product-media/[file]';
import {
  onRequestPost as createSellerProduct,
  onRequestGet as getSellerProducts,
} from '../../functions/api/seller/products/index';
import {
  onRequestPatch as patchSellerProduct,
} from '../../functions/api/seller/products/[id]';
import {
  onRequestPost as createSellerVoucher,
} from '../../functions/api/seller/vouchers/index';
import { onRequestGet as getPublicStore } from '../../functions/api/stores/[slug]/index';
import { onRequestGet as getPublicStoreProducts } from '../../functions/api/stores/[slug]/products';
import { onRequestPost as createBuyerOrder } from '../../functions/api/seller-orders/index';
import { onRequestPost as fulfillSellerOrder } from '../../functions/api/seller/orders/[id]';
import { onRequestGet as getSellerOrders } from '../../functions/api/seller/orders/index';
import { hasScope } from '../../functions/services/mission_service';

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

async function mintEdgeSessionToken(userId: string, jwtSecret: string): Promise<string> {
  const timestamp = Date.now().toString(36);
  const random = 'a1b2c3d4e5f6';
  const payload = `${userId}.${timestamp}.${random}`;
  const data = new TextEncoder().encode(`${payload}:${jwtSecret}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const sig = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16);
  return `pine_edge_tok_${userId}_${timestamp}_${random}_${sig}`;
}

function makeTinyWebpDataUrl(seedByte: number): string {
  const bytes = Buffer.from([
    0x52, 0x49, 0x46, 0x46,
    0x10, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20,
    0x04, 0x00, 0x00, 0x00,
    seedByte & 0xff,
    (seedByte * 7) & 0xff,
    (seedByte * 13) & 0xff,
    0x01,
  ]);
  return `data:image/webp;base64,${bytes.toString('base64')}`;
}

function createRealSqliteD1Adapter() {
  const sqlite = new DatabaseSync(':memory:');

  // Create baseline tables required before ensureSchemaUpgrades / ensureMarketplaceSchema
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT,
      salt TEXT,
      role TEXT DEFAULT 'member',
      status TEXT DEFAULT 'ACTIVE',
      balance INTEGER DEFAULT 0,
      session_token TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE,
      name TEXT,
      icon_url TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS security_audit_logs (
      id TEXT PRIMARY KEY,
      actor_name TEXT,
      actor_email TEXT,
      actor_ip TEXT,
      action TEXT,
      target_id TEXT,
      severity TEXT,
      details TEXT,
      created_at TEXT
    );
  `);

  const wrapStatement = (sql: string, boundArgs: any[] = []) => ({
    bind(...nextArgs: any[]) {
      return wrapStatement(sql, nextArgs.map((a) => (a === undefined ? null : a)));
    },
    async first<T = any>(colName?: string): Promise<T | null> {
      const stmt = sqlite.prepare(sql);
      const row: any = stmt.get(...boundArgs) ?? null;
      if (!row) return null;
      if (colName) return (row[colName] ?? null) as T;
      return row as T;
    },
    async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
      const stmt = sqlite.prepare(sql);
      const rows = stmt.all(...boundArgs) as T[];
      return { results: rows, success: true };
    },
    async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...boundArgs);
      return {
        success: true,
        meta: {
          changes: Number(info.changes || 0),
          last_row_id: Number(info.lastInsertRowid || 0),
        },
      };
    },
  });

  const d1 = {
    prepare(sql: string) {
      return wrapStatement(sql, []);
    },
    async batch(stmts: any[]) {
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) {
          out.push(await s.run());
        }
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(rawSql: string) {
      sqlite.exec(rawSql);
      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;

  return { sqlite, d1 };
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
  const TEST_JWT_SECRET = 'unit_test_jwt_secret_key_32_bytes_ok';
  const TEST_CODE_KEY = 'unit_test_marketplace_code_secret_32b';

  const { sqlite, d1 } = createRealSqliteD1Adapter();
  await ensureMarketplaceSchema(d1);
  await ensureSchemaUpgrades(d1);

  const sellerToken = await mintEdgeSessionToken('usr_seller_owner', TEST_JWT_SECRET);
  const buyerToken = await mintEdgeSessionToken('usr_buyer_01', TEST_JWT_SECRET);
  const nowIso = new Date().toISOString();

  sqlite
    .prepare(
      `INSERT INTO members (id, username, email, role, status, balance, session_token, created_at, updated_at)
       VALUES (?, ?, ?, 'member', 'ACTIVE', ?, ?, ?, ?)`
    )
    .run('usr_seller_owner', 'nova_merchant', 'merchant@example.com', 500, sellerToken, nowIso, nowIso);

  sqlite
    .prepare(
      `INSERT INTO members (id, username, email, role, status, balance, session_token, created_at, updated_at)
       VALUES (?, ?, ?, 'member', 'ACTIVE', ?, ?, ?, ?)`
    )
    .run('usr_buyer_01', 'happy_buyer', 'buyer@example.com', 1000, buyerToken, nowIso, nowIso);

  sqlite
    .prepare(
      `INSERT INTO sellers (
         id, owner_member_id, name, slug, status, is_vacation, reputation_score,
         pending_balance_core, banner_preset, pinned_notice, shop_categories_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'ACTIVE', 0, 100, 0, 'shopee_flame', ?, ?, ?, ?)`
    )
    .run(
      'sel_nova_01',
      'usr_seller_owner',
      'Nova Lifestyle Flagship',
      'nova-lifestyle',
      'Freeship toàn quốc hôm nay',
      JSON.stringify(['Hàng Mới Về', 'Phụ Kiện Công Nghệ']),
      nowIso,
      nowIso
    );

  const env = {
    DB: d1,
    JWT_SECRET: TEST_JWT_SECRET,
    MARKETPLACE_CODE_KEY: TEST_CODE_KEY,
  } as any;

  // 1. Multi-Industry Catalog Config
  check('multi_industry_9_categories_and_max_10_images', SELLER_INDUSTRY_OPTIONS.length === 9 && MAX_PRODUCT_IMAGES === 10, true);

  // 2. Upload 10 distinct WebP images + SHA-256 deduplication + Edge binary serving
  const uploadedUrls: string[] = [];
  const uploadErrors: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const upRes = await uploadSellerMedia({
      request: new Request('https://universal-mall-shop.pages.dev/api/seller/media/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sellerToken}`,
        },
        body: JSON.stringify({ data_url: makeTinyWebpDataUrl(i) }),
      }),
      env,
    } as any);
    const upJson: any = await upRes.json();
    if (upRes.ok && upJson.url) {
      uploadedUrls.push(upJson.url);
    } else {
      uploadErrors.push({ status: upRes.status, upJson });
    }
  }
  check(
    'upload_10_distinct_webp_images_succeeds',
    uploadedUrls.length === 10 && uploadedUrls.every((u) => u.startsWith('/api/product-media/smed_')),
    uploadErrors.length > 0 ? uploadErrors[0] : true
  );

  // Duplicate upload of image #1 returns deduplicated same asset URL
  const dupRes = await uploadSellerMedia({
    request: new Request('https://universal-mall-shop.pages.dev/api/seller/media/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({ data_url: makeTinyWebpDataUrl(1) }),
    }),
    env,
  } as any);
  const dupJson: any = await dupRes.json();
  check('sha256_dedup_reuses_existing_asset_url', dupJson.deduplicated === true && dupJson.url === uploadedUrls[0], true);

  // Serve image binary via GET /api/product-media/[file]
  const firstFile = (uploadedUrls[0] || '').split('/').pop() || 'missing.webp';
  const mediaRes = await getProductMedia({
    request: new Request(`https://universal-mall-shop.pages.dev${uploadedUrls[0]}`),
    env,
    params: { file: firstFile },
    waitUntil() {},
  } as any);
  check(
    'get_product_media_serves_immutable_webp_binary',
    mediaRes.status === 200 &&
      mediaRes.headers.get('Content-Type') === 'image/webp' &&
      (mediaRes.headers.get('Cache-Control') || '').includes('immutable'),
    true
  );

  // 3. Reject 11-image product creation with MAX_10_IMAGES_EXCEEDED
  const elevenImgs = [...uploadedUrls, 'https://universal-mall-shop.pages.dev/extra-11th.webp'];
  const reject11Res = await createSellerProduct({
    request: new Request('https://universal-mall-shop.pages.dev/api/seller/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        name: 'Áo Polo 11 Ảnh Quá Trần',
        industry_id: 'fashion',
        images: elevenImgs,
        price_core: 120,
        fulfillment_mode: 'SHIPPING',
        stock_quantity: 10,
        weight_grams: 350,
        warehouse_address: 'Kho Cầu Giấy, Hà Nội',
      }),
    }),
    env,
    waitUntil() {},
  } as any);
  const reject11Json: any = await reject11Res.json();
  check('reject_11th_image_with_max_10_images_exceeded', reject11Res.status === 400 && reject11Json.code === 'MAX_10_IMAGES_EXCEEDED', true);

  // 4. Create Multi-Industry Fashion Product WITHOUT game_slug (10 images, 2 variants, 2 specs, shop_category)
  const createProdRes = await createSellerProduct({
    request: new Request('https://universal-mall-shop.pages.dev/api/seller/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        name: 'Áo Polo Nam Cotton Pima Flagship',
        industry_id: 'fashion',
        category_name: 'Thời Trang & Phụ Kiện',
        shop_category: 'Hàng Mới Về',
        sku: 'POLO-PIMA-01',
        images: uploadedUrls,
        price_core: 150,
        original_price_core: 220,
        stock_quantity: 25,
        is_featured: true,
        fulfillment_mode: 'SHIPPING',
        weight_grams: 350,
        warehouse_address: 'Kho Cầu Giấy, Hà Nội',
        variants: [
          { id: 'var_m', name: 'Trắng - Size M', price_core: 150, stock_quantity: 12 },
          { id: 'var_l', name: 'Đen - Size L', price_core: 180, stock_quantity: 13 },
        ],
        specs: [
          { label: 'Chất liệu', value: '100% Cotton Pima' },
          { label: 'Xuất xứ', value: 'Việt Nam' },
        ],
        buyer_note_prompt: 'Ghi chú chiều cao/cân nặng để shop tư vấn chuẩn form',
      }),
    }),
    env,
    waitUntil() {},
  } as any);
  const createProdJson: any = await createProdRes.json();
  const createdProductId = createProdJson.product_id || createProdJson.product?.id;
  check(
    'create_game_free_10_image_fashion_product_succeeds',
    createProdRes.ok && createProdJson.success === true && Boolean(createdProductId),
    true
  );

  // Verify Seller Products GET parses images[10], variants[2], specs[2]
  const listSellerProdsRes = await getSellerProducts({
    request: new Request('https://universal-mall-shop.pages.dev/api/seller/products', {
      headers: { Authorization: `Bearer ${sellerToken}` },
    }),
    env,
  } as any);
  const listSellerProdsJson: any = await listSellerProdsRes.json();
  const firstSellerProd = listSellerProdsJson.products?.[0];
  check(
    'seller_products_get_returns_10_images_variants_specs_no_game_required',
    firstSellerProd?.images?.length === 10 &&
      firstSellerProd?.variants?.length === 2 &&
      firstSellerProd?.specs?.length === 2 &&
      firstSellerProd?.shop_category === 'Hàng Mới Về' &&
      firstSellerProd?.industry_id === 'fashion',
    true
  );

  // 5. Pause & Resume 1-click visibility on Public Storefront
  await patchSellerProduct({
    request: new Request(`https://universal-mall-shop.pages.dev/api/seller/products/${createdProductId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({ is_paused: 1 }),
    }),
    env,
    params: { id: createdProductId },
    waitUntil() {},
  } as any);

  const pausedPublicRes = await getPublicStoreProducts({
    request: new Request('https://universal-mall-shop.pages.dev/api/stores/nova-lifestyle/products'),
    env,
    params: { slug: 'nova-lifestyle' },
  } as any);
  const pausedPublicJson: any = await pausedPublicRes.json();
  check('paused_product_hidden_from_public_storefront', pausedPublicJson.products?.length, 0);

  await patchSellerProduct({
    request: new Request(`https://universal-mall-shop.pages.dev/api/seller/products/${createdProductId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({ is_paused: 0 }),
    }),
    env,
    params: { id: createdProductId },
    waitUntil() {},
  } as any);

  const activePublicRes = await getPublicStoreProducts({
    request: new Request('https://universal-mall-shop.pages.dev/api/stores/nova-lifestyle/products'),
    env,
    params: { slug: 'nova-lifestyle' },
  } as any);
  const activePublicJson: any = await activePublicRes.json();
  check(
    'resumed_product_exposes_10_images_variants_specs_on_public_store',
    activePublicJson.products?.length === 1 &&
      activePublicJson.products[0].images.length === 10 &&
      activePublicJson.products[0].variants.length === 2 &&
      activePublicJson.products[0].specs.length === 2,
    true
  );

  // 6. Create Shop Voucher & Redeem on Variant Checkout + Shipping Tracking Fulfillment
  const createVoucherRes = await createSellerVoucher({
    request: new Request('https://universal-mall-shop.pages.dev/api/seller/vouchers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        code: 'SHOP30K',
        title: 'Giảm 30 Core đơn từ 100 Core',
        discount_type: 'FIXED',
        discount_value: 30,
        min_order_core: 100,
        usage_limit: 50,
      }),
    }),
    env,
    waitUntil() {},
  } as any);
  check('create_shop_voucher_succeeds', createVoucherRes.ok, true);

  const pubStoreRes = await getPublicStore({
    request: new Request('https://universal-mall-shop.pages.dev/api/stores/nova-lifestyle'),
    env,
    params: { slug: 'nova-lifestyle' },
  } as any);
  const pubStoreJson: any = await pubStoreRes.json();
  check(
    'public_store_exposes_active_vouchers_and_shop_collections',
    pubStoreJson.store?.vouchers?.length === 1 &&
      pubStoreJson.store?.vouchers[0].code === 'SHOP30K' &&
      pubStoreJson.store?.shop_categories?.includes('Hàng Mới Về'),
    true
  );

  // Buyer purchases Variant 'var_l' ('Đen - Size L', 180 Core) with SHOP30K (-30 Core) => pays 150 Core!
  const buyRes = await createBuyerOrder({
    request: new Request('https://universal-mall-shop.pages.dev/api/seller-orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        product_id: createdProductId,
        variant_id: 'var_l',
        selected_variant: 'Đen - Size L',
        buyer_note: '1m75 - 70kg, giao giờ hành chính',
        voucher_code: 'SHOP30K',
      }),
    }),
    env,
    waitUntil() {},
  } as any);
  const buyJson: any = await buyRes.json();
  const orderId = buyJson.order?.id;
  const buyerRowAfter: any = sqlite.prepare('SELECT balance FROM members WHERE id = ?').get('usr_buyer_01');
  const voucherRowAfter: any = sqlite.prepare('SELECT used_count FROM seller_vouchers WHERE code = ?').get('SHOP30K');
  check(
    'buyer_checkout_applies_variant_price_and_shop_voucher_atomically',
    buyRes.ok &&
      buyJson.order?.price_core === 150 &&
      buyJson.order?.voucher_discount_core === 30 &&
      buyJson.order?.selected_variant === 'Đen - Size L' &&
      Number(buyerRowAfter?.balance) === 850 &&
      Number(voucherRowAfter?.used_count) === 1,
    true
  );

  // Seller updates Shipping Carrier & Tracking Code
  const shipRes = await fulfillSellerOrder({
    request: new Request(`https://universal-mall-shop.pages.dev/api/seller/orders/${orderId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        action: 'SHIPPING',
        carrier: 'GHN',
        tracking_code: 'GHN88990011',
        note: 'Đã bàn giao bưu cục Cầu Giấy',
      }),
    }),
    env,
    params: { id: orderId },
  } as any);
  const sellerOrdersRes = await getSellerOrders({
    request: new Request('https://universal-mall-shop.pages.dev/api/seller/orders', {
      headers: { Authorization: `Bearer ${sellerToken}` },
    }),
    env,
  } as any);
  const sellerOrdersJson: any = await sellerOrdersRes.json();
  const firstSellerOrder = sellerOrdersJson.orders?.[0];
  check(
    'seller_shipping_tracking_and_order_list_enrichment_succeeds',
    shipRes.status === 200 &&
      firstSellerOrder?.status === 'SHIPPING' &&
      firstSellerOrder?.tracking_code === 'GHN88990011' &&
      firstSellerOrder?.selected_variant === 'Đen - Size L' &&
      firstSellerOrder?.voucher_discount_core === 30,
    true
  );

  // 7. Rule 8 API Scopes + UI Streamlining + Modern Web Guidance + Rule 12 Dict Symmetry
  check(
    'rule8_new_scopes_registered_in_mission_service',
    hasScope('SELLER_MEDIA_MANAGE', 'SELLER_MEDIA_MANAGE') &&
      hasScope('SELLER_VOUCHERS_MANAGE', 'SELLER_VOUCHERS_MANAGE') &&
      hasScope('UNIVERSAL_MALL_FULL', 'SELLER_MEDIA_MANAGE'),
    true
  );

  const mallSrc = fs.readFileSync(path.resolve(root, 'src/components/mall/UniversalMallView.tsx'), 'utf8');
  check(
    'streamlining_mall_removes_floating_theme_pill_and_duplicate_modals',
    !mallSrc.includes('<UserProfileModal') &&
      !mallSrc.includes('<SubmitCodeModal') &&
      !mallSrc.includes('<BookmarkDrawer') &&
      !mallSrc.includes('mall.breadcrumb.backToShelf'),
    true
  );

  const editorSrc = fs.readFileSync(path.resolve(root, 'src/components/seller/SellerProductEditorModal.tsx'), 'utf8');
  const pubStoreSrc = fs.readFileSync(path.resolve(root, 'src/components/seller/PublicStoreView.tsx'), 'utf8');
  check(
    'mwg_native_dialog_and_lcp_fetchpriority_high',
    editorSrc.includes('<dialog') &&
      !editorSrc.includes('role="dialog"') &&
      !editorSrc.includes('aria-modal') &&
      pubStoreSrc.includes('<dialog') &&
      !pubStoreSrc.includes('role="dialog"') &&
      pubStoreSrc.includes('fetchPriority="high"'),
    true
  );

  const viDict = JSON.parse(fs.readFileSync(path.resolve(root, 'src/locales/vi.json'), 'utf8'));
  const enDict = JSON.parse(fs.readFileSync(path.resolve(root, 'src/locales/en.json'), 'utf8'));
  const viAll = flattenLeaves(viDict);
  const enAll = flattenLeaves(enDict);
  check(
    'rule12_full_vi_en_dictionary_symmetry',
    viAll.length === enAll.length &&
      JSON.stringify([...viAll].sort()) === JSON.stringify([...enAll].sort()) &&
      Boolean(viDict.sellerProductEditor?.createTitle) &&
      Boolean(enDict.sellerVouchers?.vouchersTitle),
    true
  );

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify(
      {
        suite: 'test_multi_industry_seller_10_images',
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
