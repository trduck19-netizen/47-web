/**
 * Wrangler Pages Dev E2E Integration Suite (HTTP + Cloudflare Edge Worker + Local SQLite D1)
 *
 * Chạy hoàn toàn bằng 1 lệnh: `npm run test:e2e-wrangler`
 * - Tự dựng `npx wrangler pages dev dist --port 8789 --ip 127.0.0.1 --local` với `--persist-to` cô lập trong thư mục tạm.
 * - Duyệt shop test & cấp số dư Core test trực tiếp qua SQLite D1 local (`wrangler d1 execute --local`, không dùng Admin API).
 * - Kiểm tra trọn vẹn luồng: Register -> Login -> Đăng ký Shop -> Duyệt D1 local -> Upload 10 ảnh WebP thật ->
 *   Đọc CDN /api/product-media/*.webp -> Chặn ảnh thứ 11 (MAX_10_IMAGES_EXCEEDED) -> Tạo sản phẩm không cần game_slug ->
 *   Tạo voucher SHOP30K -> Kiểm tra S1 (GET /api/stores/:slug trả total_products khớp) -> Mua biến thể + trừ SHOP30K (180 - 30 = 150 Core).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const PORT = 8789;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ROOT_DIR = process.cwd();

function makeTinyWebpDataUrl(seedByte) {
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

function assert(cond, label, detail) {
  if (!cond) {
    throw new Error(`ASSERTION_FAILED [${label}]: ${JSON.stringify(detail)}`);
  }
  console.log(`PASS | ${label}`);
}

async function waitForServer(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/brand`, { signal: AbortSignal.timeout(2500) });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(`Wrangler Pages Dev server did not become ready at ${url} within ${timeoutMs}ms`);
}

function runLocalD1Sql(persistDir, sqlFilePath) {
  const res = spawnSync(
    process.platform === 'win32' ? 'cmd' : 'npx',
    process.platform === 'win32'
      ? ['/c', 'npx', '-y', 'wrangler', 'd1', 'execute', '47webdanganh', '--local', `-y`, `--persist-to=${persistDir}`, `--file=${sqlFilePath}`]
      : ['-y', 'wrangler', 'd1', 'execute', '47webdanganh', '--local', '-y', `--persist-to=${persistDir}`, `--file=${sqlFilePath}`],
    { cwd: ROOT_DIR, encoding: 'utf8', timeout: 25000 }
  );
  if (res.status !== 0) {
    throw new Error(`wrangler d1 execute --local failed (exit=${res.status}):\n${res.stdout}\n${res.stderr}`);
  }
  return res.stdout;
}

function killProcessTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {}
}

async function main() {
  const workerBundle = path.join(ROOT_DIR, 'dist', '_worker.js');
  if (!fs.existsSync(workerBundle)) {
    throw new Error('Missing dist/_worker.js. Run `npm run build` before `npm run test:e2e-wrangler`.');
  }

  const persistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-e2e-wrangler-'));
  const initSqlPath = path.join(persistDir, 'init_e2e.sql');
  const approveSqlPath = path.join(persistDir, 'approve_shop.sql');
  const startedAt = new Date().toISOString();
  console.log(`[E2E-WRANGLER] Started at ${startedAt} | Base: ${BASE_URL}`);

  // Pre-create minimal core tables in isolated local SQLite D1 so cold isolate requests never fail
  fs.writeFileSync(
    initSqlPath,
    `CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, executed_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  full_name TEXT DEFAULT '',
  email TEXT UNIQUE NOT NULL,
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'MEMBER',
  balance INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  salt TEXT DEFAULT '',
  password_hash TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  session_token TEXT DEFAULT NULL,
  registered_ip TEXT DEFAULT '',
  last_login TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ip_rate_limits (
  ip_address TEXT NOT NULL,
  action_type TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  locked_until INTEGER DEFAULT 0,
  last_attempt INTEGER NOT NULL,
  PRIMARY KEY (ip_address, action_type)
);
CREATE TABLE IF NOT EXISTS security_logs (
  id TEXT PRIMARY KEY,
  actor_name TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  target_user TEXT,
  ip_address TEXT,
  severity TEXT NOT NULL DEFAULT 'INFO',
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
    'utf8'
  );
  runLocalD1Sql(persistDir, initSqlPath);
  console.log('PASS | initialized_isolated_local_sqlite_d1');

  const wranglerArgs = [
    '-y',
    'wrangler',
    'pages',
    'dev',
    'dist',
    '--port',
    String(PORT),
    '--ip',
    '127.0.0.1',
    '--local',
    `--persist-to=${persistDir}`,
    '--binding',
    'JWT_SECRET=local_e2e_jwt_secret_key_32_bytes_ok',
    '--binding',
    'PASSWORD_PEPPER=local_e2e_pepper_2026_test',
    '--binding',
    'MARKETPLACE_CODE_KEY=local_e2e_marketplace_code_secret_32b',
    '--binding',
    'ADMIN_API_KEY=local_e2e_admin_api_key_32_bytes_ok',
  ];

  const wranglerChild = spawn(
    process.platform === 'win32' ? 'cmd' : 'npx',
    process.platform === 'win32' ? ['/c', 'npx', ...wranglerArgs] : wranglerArgs,
    {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    }
  );

  let serverTail = '';
  wranglerChild.stdout?.on('data', (d) => {
    serverTail = (serverTail + d.toString()).slice(-3000);
  });
  wranglerChild.stderr?.on('data', (d) => {
    serverTail = (serverTail + d.toString()).slice(-3000);
  });

  try {
    await waitForServer(BASE_URL);
    console.log('PASS | wrangler_pages_dev_ready_on_127.0.0.1_8789');

    const vouchersHealth = await fetch(`${BASE_URL}/api/vouchers`, { signal: AbortSignal.timeout(5000) });
    assert(vouchersHealth.status === 200, 'get_api_vouchers_returns_200', vouchersHealth.status);

    const ts = Date.now();
    const sellerUser = `e2e_seller_${ts}`;
    const buyerUser = `e2e_buyer_${ts}`;

    // 1. Register Seller & Buyer through real Edge Worker /api/auth/register
    const regSellerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: sellerUser,
        email: `${sellerUser}@example.test`,
        displayName: 'E2E Wrangler Seller',
        password: 'E2eWrangler#2026',
      }),
    });
    const regSellerJson = await regSellerRes.json();
    assert(regSellerRes.status === 201 && Boolean(regSellerJson.token), 'register_e2e_seller_201', regSellerJson);
    const sellerToken = regSellerJson.token;

    const regBuyerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: buyerUser,
        email: `${buyerUser}@example.test`,
        displayName: 'E2E Wrangler Buyer',
        password: 'E2eWrangler#2026',
      }),
    });
    const regBuyerJson = await regBuyerRes.json();
    assert(regBuyerRes.status === 201 && Boolean(regBuyerJson.token), 'register_e2e_buyer_201', regBuyerJson);
    const buyerToken = regBuyerJson.token;

    // 2. Verify /api/auth/me works immediately after auth
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    assert(meRes.status === 200, 'get_api_auth_me_200', meRes.status);

    // 3. Register Seller shop via POST /api/seller
    const createShopRes = await fetch(`${BASE_URL}/api/seller`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        name: 'Shop E2E Wrangler',
        slug: 'shop-e2e-wrangler',
        contact_phone: '0900000099',
        bank_name: 'MB Bank',
        bank_account: '0900000099',
        bank_account_name: 'E2E WRANGLER SHOP',
        description: 'Gian hang kiem thu E2E Wrangler da nganh',
      }),
    });
    const createShopJson = await createShopRes.json();
    assert(createShopRes.ok && createShopJson.success, 'post_api_seller_registers_shop', createShopJson);

    // 4. Approve shop directly in local SQLite D1 (C5: direct D1 local SQL update, not Admin API) & fund buyer wallet
    fs.writeFileSync(
      approveSqlPath,
      `UPDATE sellers SET status = 'ACTIVE', updated_at = datetime('now') WHERE slug = 'shop-e2e-wrangler';
UPDATE members SET balance = 1000 WHERE username = '${buyerUser}';`,
      'utf8'
    );
    runLocalD1Sql(persistDir, approveSqlPath);
    console.log('PASS | approved_local_shop_and_funded_buyer_via_d1_execute_local');

    // 5. Upload 10 distinct WebP photos via POST /api/seller/media/upload
    const uploadedUrls = [];
    for (let i = 1; i <= 10; i++) {
      const upRes = await fetch(`${BASE_URL}/api/seller/media/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sellerToken}`,
        },
        body: JSON.stringify({ data_url: makeTinyWebpDataUrl(i + 20) }),
      });
      const upJson = await upRes.json();
      assert(upRes.ok && upJson.url && upJson.url.startsWith('/api/product-media/'), `upload_photo_${i}_succeeds`, upJson);
      uploadedUrls.push(upJson.url);
    }
    assert(uploadedUrls.length === 10, 'uploaded_exact_10_webp_urls', uploadedUrls.length);

    // Verify serving binary via GET /api/product-media/[file]
    const imgRes = await fetch(`${BASE_URL}${uploadedUrls[0]}`);
    assert(
      imgRes.status === 200 &&
        imgRes.headers.get('content-type') === 'image/webp' &&
        String(imgRes.headers.get('cache-control') || '').includes('immutable'),
      'get_product_media_200_webp_immutable',
      { status: imgRes.status, ct: imgRes.headers.get('content-type'), cc: imgRes.headers.get('cache-control') }
    );

    // 6. Reject 11th photo on product creation
    const reject11Res = await fetch(`${BASE_URL}/api/seller/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        name: 'San Pham Vuot Tran 11 Anh',
        industry_id: 'fashion',
        images: [...uploadedUrls, makeTinyWebpDataUrl(99)],
        price_core: 120,
        fulfillment_mode: 'SHIPPING',
        stock_quantity: 10,
        weight_grams: 300,
        warehouse_address: 'Kho Test E2E Ha Noi',
      }),
    });
    const reject11Json = await reject11Res.json();
    assert(reject11Res.status === 400 && reject11Json.code === 'MAX_10_IMAGES_EXCEEDED', 'reject_11th_image_max_10_exceeded', reject11Json);

    // 7. Create game-free product with 10 images, 2 variants, 2 specs, shop collection
    const createProdRes = await fetch(`${BASE_URL}/api/seller/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        name: 'Áo Polo Nam Cotton Pima Flagship 2026',
        industry_id: 'fashion',
        category_name: 'Thời Trang & Phụ Kiện',
        shop_category: 'Hàng Mới Về',
        sku: 'POLO-PIMA-E2E',
        images: uploadedUrls,
        price_core: 160,
        original_price_core: 220,
        stock_quantity: 40,
        is_featured: true,
        fulfillment_mode: 'SHIPPING',
        weight_grams: 350,
        warehouse_address: 'Kho Cầu Giấy, Hà Nội',
        variants: [
          { id: 'var_m', name: 'Trắng Tinh Khôi - Size M', price_core: 160, stock_quantity: 25 },
          { id: 'var_l', name: 'Đen Tuyền - Size L', price_core: 180, stock_quantity: 15 },
        ],
        specs: [
          { label: 'Chất liệu', value: '100% Cotton Pima Mỹ' },
          { label: 'Bảo hành', value: 'Đổi trả 30 ngày' },
        ],
      }),
    });
    const createProdJson = await createProdRes.json();
    assert(createProdRes.ok && createProdJson.product?.id && createProdJson.product?.images?.length === 10, 'create_game_free_10_photo_product', createProdJson);
    const productId = createProdJson.product.id;

    // 8. Create Shop Voucher SHOP30K via POST /api/seller/vouchers
    const createVoucherRes = await fetch(`${BASE_URL}/api/seller/vouchers`, {
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
    });
    const createVoucherJson = await createVoucherRes.json();
    assert(createVoucherRes.ok && createVoucherJson.voucher?.code === 'SHOP30K', 'create_shop_voucher_SHOP30K', createVoucherJson);

    // 9. Verify S1 fix live on Worker: GET /api/stores/shop-e2e-wrangler returns total_products: 1 + SHOP30K + 10 images
    const pubStoreRes = await fetch(`${BASE_URL}/api/stores/shop-e2e-wrangler`);
    const pubStoreJson = await pubStoreRes.json();
    assert(
      pubStoreRes.status === 200 &&
        pubStoreJson.store?.total_products === 1 &&
        pubStoreJson.store?.vouchers?.length === 1 &&
        pubStoreJson.store?.vouchers[0]?.code === 'SHOP30K',
      'public_store_s1_total_products_equals_1_and_exposes_SHOP30K',
      pubStoreJson.store
    );

    const pubProdsRes = await fetch(`${BASE_URL}/api/stores/shop-e2e-wrangler/products`);
    const pubProdsJson = await pubProdsRes.json();
    assert(
      pubProdsRes.status === 200 &&
        Array.isArray(pubProdsJson.products) &&
        pubProdsJson.products[0]?.images?.length === 10,
      'public_store_products_returns_all_10_images',
      { count: pubProdsJson.products?.length, imgLen: pubProdsJson.products?.[0]?.images?.length }
    );

    // 10. Buyer purchases variant 'var_l' (180 Core) with SHOP30K (-30 Core) => 150 Core
    const buyRes = await fetch(`${BASE_URL}/api/seller-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        product_id: productId,
        variant_id: 'var_l',
        selected_variant: 'Đen Tuyền - Size L',
        buyer_note: 'E2E Wrangler 10-image test order',
        voucher_code: 'SHOP30K',
      }),
    });
    const buyJson = await buyRes.json();
    assert(
      buyRes.ok && buyJson.order?.price_core === 150 && buyJson.order?.voucher_discount_core === 30,
      'checkout_applies_SHOP30K_180_minus_30_equals_150',
      buyJson
    );

    console.log(
      JSON.stringify(
        {
          suite: 'e2e_wrangler_10_images',
          baseUrl: BASE_URL,
          passed: true,
          uploadedImages: uploadedUrls.length,
          voucherCode: 'SHOP30K',
          variantPriceCore: 180,
          voucherDiscountCore: 30,
          finalPriceCore: buyJson.order.price_core,
          totalProductsOnPublicStore: pubStoreJson.store.total_products,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error('[E2E-WRANGLER ERROR]', err);
    if (serverTail) {
      console.error('[WRANGLER TAIL]\n' + serverTail);
    }
    process.exitCode = 1;
  } finally {
    killProcessTree(wranglerChild);
    try {
      fs.rmSync(persistDir, { recursive: true, force: true });
    } catch {}
  }
}

main();
