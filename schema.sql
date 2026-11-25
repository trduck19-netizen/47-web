-- Universal Commerce Platform Database Schema (Cloudflare D1 SQLite)
-- Pure Multi-Industry Architecture (No legacy game codes clutter)

-- 1. Bảng thành viên & tài khoản
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer', -- 'customer' | 'seller' | 'admin'
  balance INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);

-- 2. Bảng ngành hàng & danh mục sản phẩm
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  industry_id TEXT NOT NULL, -- 'fashion' | 'beauty' | 'tech' | 'services' | 'lifestyle'
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_categories_industry ON categories(industry_id);

-- 3. Bảng sản phẩm chuẩn Universal (Physical vs Digital)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  industry_id TEXT NOT NULL,
  category_id TEXT,
  product_type TEXT NOT NULL DEFAULT 'physical', -- 'physical' (cần ship) | 'digital' (giao mã 0s)
  original_price INTEGER NOT NULL DEFAULT 0,
  current_price INTEGER NOT NULL DEFAULT 0,
  discount_percent INTEGER NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  thumbnail_url TEXT,
  images_json TEXT, -- Mảng URL ảnh JSON
  description TEXT,
  specifications_json TEXT, -- Thông số kỹ thuật / chất liệu / bảo hành
  brand_name TEXT,
  rating_avg REAL NOT NULL DEFAULT 5.0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  sold_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_industry ON products(industry_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);

-- 4. Bảng biến thể sản phẩm (Size, Màu sắc, SKU tồn kho riêng)
CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  variant_name TEXT NOT NULL, -- vd: "Đen / Size L"
  attributes_json TEXT, -- {"color": "Đen", "size": "L"}
  price INTEGER NOT NULL,
  original_price INTEGER,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- 5. Bảng đơn hàng đa kênh (Vật lý & Số)
CREATE TABLE IF NOT EXISTS orders (
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
  payment_method TEXT NOT NULL DEFAULT 'vietqr', -- 'vietqr' | 'wallet' | 'cod'
  payment_status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
  shipping_status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'PICKING' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED'
  shipping_carrier TEXT, -- 'GHTK' | 'GHN' | 'VIETTEL_POST'
  tracking_code TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  shipping_address TEXT,
  shipping_city TEXT,
  shipping_district TEXT,
  shipping_ward TEXT,
  shipping_notes TEXT,
  delivered_codes_json TEXT, -- Dành cho sản phẩm số
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_code);

-- 6. Bảng Voucher / Mã giảm giá đa tầng Shopee Style
CREATE TABLE IF NOT EXISTS vouchers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  voucher_type TEXT NOT NULL, -- 'freeship' | 'discount'
  discount_type TEXT NOT NULL, -- 'fixed' (giảm thẳng VNĐ) | 'percent' (giảm theo %)
  discount_value INTEGER NOT NULL,
  min_order_amount INTEGER NOT NULL DEFAULT 0,
  max_discount_amount INTEGER,
  usage_limit INTEGER NOT NULL DEFAULT 1000,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);

-- 7. Bảng quản lý vận đơn và timeline giao hàng 5 bước
CREATE TABLE IF NOT EXISTS shipping_orders (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  carrier TEXT NOT NULL,
  tracking_code TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  package_weight_grams INTEGER NOT NULL DEFAULT 500,
  shipping_fee INTEGER NOT NULL,
  current_status TEXT NOT NULL DEFAULT 'CREATED', -- 'CREATED' | 'PICKED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED'
  timeline_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shipping_tracking ON shipping_orders(tracking_code);

-- 8. Bảng khách hàng quan tâm mua / thuê sàn (Tenant Leads)
CREATE TABLE IF NOT EXISTS platform_leads (
  id TEXT PRIMARY KEY,
  lead_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  package_type TEXT NOT NULL, -- 'startup' (390k/th) | 'pro' (790k/th) | 'buyout' (15tr)
  domain_requested TEXT,
  industry_focus TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'NEW', -- 'NEW' | 'CONTACTED' | 'DEPLOYED' | 'CANCELLED'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_code ON platform_leads(lead_code);

-- 9. Bảng đa ngôn ngữ động (Translations)
CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_type TEXT NOT NULL, -- 'product' | 'category' | 'industry' | 'page'
  object_id TEXT NOT NULL,
  field TEXT NOT NULL,
  language TEXT NOT NULL, -- 'en' | 'th' | 'zh'
  content TEXT NOT NULL,
  reviewer TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(object_type, object_id, field, language)
);
CREATE INDEX IF NOT EXISTS idx_translations_lookup ON translations(object_type, object_id, language);

-- 10. Bảng cấu hình White-Label & Nhận diện thương hiệu
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- NẠP DỮ LIỆU BAN ĐẦU (SEED DATA - MẪU ĐA NGÀNH CHUẨN)
INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('shop_name', 'Universal Mall'),
  ('slogan', 'Sàn Thương Mại Điện Tử Đa Ngành • Hàng Chính Hãng • Giao Toàn Quốc'),
  ('hotline', '1900.888.999'),
  ('primary_color', 'orange'),
  ('currency', 'VND');

-- Nạp Voucher mẫu ban đầu
INSERT OR IGNORE INTO vouchers (id, code, voucher_type, discount_type, discount_value, min_order_amount, max_discount_amount) VALUES
  ('v_free_01', 'FREESHIP30K', 'freeship', 'fixed', 30000, 100000, 30000),
  ('v_free_02', 'FREESHIPMAX', 'freeship', 'fixed', 50000, 300000, 50000),
  ('v_disc_01', 'MALL50K', 'discount', 'fixed', 50000, 200000, 50000),
  ('v_disc_02', 'UNIVERSAL10', 'discount', 'percent', 10, 150000, 100000);


-- Migration 0034: Cart Items & User Addresses
CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  price_core REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  variant_id TEXT,
  variant_name TEXT,
  attributes_json TEXT,
  product_type TEXT DEFAULT 'digital',
  weight_grams INTEGER DEFAULT 0,
  cover_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id, variant_id)
);

CREATE TABLE IF NOT EXISTS user_addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  province_city TEXT NOT NULL,
  district TEXT NOT NULL,
  ward TEXT NOT NULL,
  detail_address TEXT NOT NULL,
  full_address TEXT NOT NULL,
  address_type TEXT DEFAULT 'HOME',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);


-- Migration 0035: Google OAuth2 & Wishlist
ALTER TABLE members ADD COLUMN auth_provider TEXT DEFAULT 'local';
ALTER TABLE members ADD COLUMN google_id TEXT;
CREATE INDEX IF NOT EXISTS idx_members_google_id ON members(google_id);

CREATE TABLE IF NOT EXISTS user_wishlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'game',
  item_id TEXT NOT NULL,
  item_title TEXT,
  item_image TEXT,
  price_core REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, item_type, item_id)
);
