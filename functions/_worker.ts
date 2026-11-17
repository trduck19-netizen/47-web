interface Env {
  DB: D1Database;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const STATEMENTS = [
  // 1. members
  `CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    balance INTEGER NOT NULL DEFAULT 0,
    email_verified INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_members_email ON members(email)`,

  // 2. categories
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    industry_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_categories_industry ON categories(industry_id)`,

  // 3. products
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    industry_id TEXT NOT NULL,
    category_id TEXT,
    product_type TEXT NOT NULL DEFAULT 'physical',
    original_price INTEGER NOT NULL DEFAULT 0,
    current_price INTEGER NOT NULL DEFAULT 0,
    discount_percent INTEGER NOT NULL DEFAULT 0,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    thumbnail_url TEXT,
    images_json TEXT,
    description TEXT,
    specifications_json TEXT,
    brand_name TEXT,
    rating_avg REAL NOT NULL DEFAULT 5.0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    sold_count INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_products_industry ON products(industry_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug)`,

  // 4. product_variants
  `CREATE TABLE IF NOT EXISTS product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    variant_name TEXT NOT NULL,
    attributes_json TEXT,
    price INTEGER NOT NULL,
    original_price INTEGER,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id)`,

  // 5. orders
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_code TEXT UNIQUE NOT NULL,
    user_id TEXT,
    product_id TEXT NOT NULL,
    variant_id TEXT,
    product_title TEXT NOT NULL,
    product_type TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL,
    subtotal_amount INTEGER NOT NULL,
    shipping_fee INTEGER NOT NULL DEFAULT 0,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    voucher_code TEXT,
    freeship_voucher_code TEXT,
    total_amount INTEGER NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'vietqr',
    payment_status TEXT NOT NULL DEFAULT 'PENDING',
    shipping_status TEXT NOT NULL DEFAULT 'PENDING',
    shipping_carrier TEXT,
    tracking_code TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    shipping_address TEXT,
    shipping_city TEXT,
    shipping_district TEXT,
    shipping_ward TEXT,
    shipping_notes TEXT,
    delivered_codes_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_code)`,

  // 6. vouchers
  `CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    voucher_type TEXT NOT NULL,
    discount_type TEXT NOT NULL,
    discount_value INTEGER NOT NULL,
    min_order_amount INTEGER NOT NULL DEFAULT 0,
    max_discount_amount INTEGER,
    usage_limit INTEGER NOT NULL DEFAULT 1000,
    usage_count INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    start_date TEXT,
    end_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code)`,

  // 7. shipping_orders
  `CREATE TABLE IF NOT EXISTS shipping_orders (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    carrier TEXT NOT NULL,
    tracking_code TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    destination_address TEXT NOT NULL,
    package_weight_grams INTEGER NOT NULL DEFAULT 500,
    shipping_fee INTEGER NOT NULL,
    current_status TEXT NOT NULL DEFAULT 'CREATED',
    timeline_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_shipping_tracking ON shipping_orders(tracking_code)`,

  // 8. platform_leads
  `CREATE TABLE IF NOT EXISTS platform_leads (
    id TEXT PRIMARY KEY,
    lead_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    package_type TEXT NOT NULL,
    domain_requested TEXT,
    industry_focus TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'NEW',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_leads_code ON platform_leads(lead_code)`,

  // 9. translations
  `CREATE TABLE IF NOT EXISTS translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    field TEXT NOT NULL,
    language TEXT NOT NULL,
    content TEXT NOT NULL,
    reviewer TEXT,
    status TEXT NOT NULL DEFAULT 'approved',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(object_type, object_id, field, language)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_translations_lookup ON translations(object_type, object_id, language)`,

  // 10. system_settings
  `CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // Seed settings
  `INSERT OR IGNORE INTO system_settings (key, value) VALUES ('shop_name', 'Universal Mall')`,
  `INSERT OR IGNORE INTO system_settings (key, value) VALUES ('slogan', 'Sàn Thương Mại Điện Tử Đa Ngành • Hàng Chính Hãng • Giao Toàn Quốc')`,
  `INSERT OR IGNORE INTO system_settings (key, value) VALUES ('hotline', '1900.888.999')`,
  `INSERT OR IGNORE INTO system_settings (key, value) VALUES ('primary_color', 'orange')`,
  `INSERT OR IGNORE INTO system_settings (key, value) VALUES ('currency', 'VND')`,

  // Seed vouchers
  `INSERT OR IGNORE INTO vouchers (id, code, voucher_type, discount_type, discount_value, min_order_amount, max_discount_amount) VALUES ('v_free_01', 'FREESHIP30K', 'freeship', 'fixed', 30000, 100000, 30000)`,
  `INSERT OR IGNORE INTO vouchers (id, code, voucher_type, discount_type, discount_value, min_order_amount, max_discount_amount) VALUES ('v_free_02', 'FREESHIPMAX', 'freeship', 'fixed', 50000, 300000, 50000)`,
  `INSERT OR IGNORE INTO vouchers (id, code, voucher_type, discount_type, discount_value, min_order_amount, max_discount_amount) VALUES ('v_disc_01', 'MALL50K', 'discount', 'fixed', 50000, 200000, 50000)`,
  `INSERT OR IGNORE INTO vouchers (id, code, voucher_type, discount_type, discount_value, min_order_amount, max_discount_amount) VALUES ('v_disc_02', 'UNIVERSAL10', 'discount', 'percent', 10, 150000, 100000)`,
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Endpoint Migrate: Tự động khởi tạo schema 10 bảng vào D1
    if (url.pathname === '/api/migrate') {
      if (!env.DB) {
        return new Response(JSON.stringify({ success: false, error: 'Binding DB chưa được kết nối.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        for (const stmt of STATEMENTS) {
          await env.DB.prepare(stmt).run();
        }

        const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
        const tables = results.map((r: any) => r.name);

        return new Response(JSON.stringify({
          success: true,
          message: 'Khởi tạo thành công 100% schema D1 vào cơ sở dữ liệu 47webdanganh!',
          databaseId: 'f1c32d22-9ad3-41a7-93a4-e9025240c6b2',
          totalTables: tables.length,
          tables,
        }, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({
          success: false,
          error: err.message || 'Lỗi thực thi D1'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 2. Endpoint Kiểm tra trạng thái D1
    if (url.pathname === '/api/db-status') {
      if (!env.DB) {
        return new Response(JSON.stringify({ success: false, connected: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      try {
        const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
        const tables = results.map((r: any) => r.name);
        return new Response(JSON.stringify({
          success: true,
          connected: true,
          databaseId: 'f1c32d22-9ad3-41a7-93a4-e9025240c6b2',
          totalTables: tables.length,
          tables,
        }, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Default: Phục vụ frontend assets
    return env.ASSETS.fetch(request);
  }
};
