export interface SellerIndustryOption {
  id: string;
  labelVi: string;
  labelEn: string;
  icon: string;
  defaultProductType: 'physical' | 'digital';
  suggestedSpecsVi: Array<{ label: string; placeholder: string }>;
  suggestedSpecsEn: Array<{ label: string; placeholder: string }>;
}

export const SELLER_INDUSTRY_OPTIONS: readonly SellerIndustryOption[] = [
  {
    id: 'fashion',
    labelVi: 'Thời Trang & Phụ Kiện',
    labelEn: 'Fashion & Accessories',
    icon: '👕',
    defaultProductType: 'physical',
    suggestedSpecsVi: [
      { label: 'Thương hiệu', placeholder: 'VD: Local Brand / Uniqlo' },
      { label: 'Chất liệu', placeholder: 'VD: Cotton 100% co giãn 4 chiều' },
      { label: 'Xuất xứ', placeholder: 'VD: Việt Nam' },
      { label: 'Hướng dẫn bảo quản', placeholder: 'VD: Giặt lạnh, lộn trái khi phơi' },
    ],
    suggestedSpecsEn: [
      { label: 'Brand', placeholder: 'e.g. Local Brand / Uniqlo' },
      { label: 'Material', placeholder: 'e.g. 100% Combed Cotton' },
      { label: 'Origin', placeholder: 'e.g. Vietnam' },
      { label: 'Care Instructions', placeholder: 'e.g. Machine wash cold' },
    ],
  },
  {
    id: 'beauty',
    labelVi: 'Mỹ Phẩm & Chăm Sóc Cá Nhân',
    labelEn: 'Beauty & Personal Care',
    icon: '💄',
    defaultProductType: 'physical',
    suggestedSpecsVi: [
      { label: 'Thương hiệu', placeholder: 'VD: La Roche-Posay' },
      { label: 'Dung tích / Trọng lượng', placeholder: 'VD: 50ml' },
      { label: 'Loại da phù hợp', placeholder: 'VD: Mọi loại da, da nhạy cảm' },
      { label: 'Hạn sử dụng', placeholder: 'VD: 36 tháng từ NSX' },
    ],
    suggestedSpecsEn: [
      { label: 'Brand', placeholder: 'e.g. La Roche-Posay' },
      { label: 'Volume / Weight', placeholder: 'e.g. 50ml' },
      { label: 'Skin Type', placeholder: 'e.g. All skin types' },
      { label: 'Shelf Life', placeholder: 'e.g. 36 months' },
    ],
  },
  {
    id: 'tech',
    labelVi: 'Thiết Bị Số, Điện Tử & Phụ Kiện',
    labelEn: 'Electronics & Tech Accessories',
    icon: '🎧',
    defaultProductType: 'physical',
    suggestedSpecsVi: [
      { label: 'Thương hiệu', placeholder: 'VD: Anker / Baseus / Sony' },
      { label: 'Model', placeholder: 'VD: GaN Prime 65W' },
      { label: 'Kết nối / Chuẩn cắm', placeholder: 'VD: USB-C PD 3.0 / Bluetooth 5.3' },
      { label: 'Bảo hành', placeholder: 'VD: 12 tháng chính hãng 1 đổi 1' },
    ],
    suggestedSpecsEn: [
      { label: 'Brand', placeholder: 'e.g. Anker / Baseus / Sony' },
      { label: 'Model', placeholder: 'e.g. GaN Prime 65W' },
      { label: 'Connectivity', placeholder: 'e.g. USB-C PD 3.0 / Bluetooth 5.3' },
      { label: 'Warranty', placeholder: 'e.g. 12 months official warranty' },
    ],
  },
  {
    id: 'home_living',
    labelVi: 'Nhà Cửa, Đời Sống & Gia Dụng',
    labelEn: 'Home, Living & Appliances',
    icon: '🏠',
    defaultProductType: 'physical',
    suggestedSpecsVi: [
      { label: 'Chất liệu', placeholder: 'VD: Inox 304 / Gỗ sồi tự nhiên' },
      { label: 'Kích thước', placeholder: 'VD: 40 x 30 x 15 cm' },
      { label: 'Công suất / Điện áp', placeholder: 'VD: 220V - 1200W' },
      { label: 'Xuất xứ', placeholder: 'VD: Nhật Bản / Việt Nam' },
    ],
    suggestedSpecsEn: [
      { label: 'Material', placeholder: 'e.g. 304 Stainless Steel / Oak' },
      { label: 'Dimensions', placeholder: 'e.g. 40 x 30 x 15 cm' },
      { label: 'Power / Voltage', placeholder: 'e.g. 220V - 1200W' },
      { label: 'Origin', placeholder: 'e.g. Japan / Vietnam' },
    ],
  },
  {
    id: 'food_grocery',
    labelVi: 'Thực Phẩm, Đồ Uống & Đặc Sản',
    labelEn: 'Food, Beverage & Specialties',
    icon: '🍵',
    defaultProductType: 'physical',
    suggestedSpecsVi: [
      { label: 'Khối lượng tịnh', placeholder: 'VD: 500g' },
      { label: 'Thành phần chính', placeholder: 'VD: 100% hạt điều rang củi' },
      { label: 'Xuất xứ / Vùng nguyên liệu', placeholder: 'VD: Bình Phước / Đà Lạt' },
      { label: 'Hạn sử dụng', placeholder: 'VD: 12 tháng' },
    ],
    suggestedSpecsEn: [
      { label: 'Net Weight', placeholder: 'e.g. 500g' },
      { label: 'Ingredients', placeholder: 'e.g. 100% Wood-roasted Cashews' },
      { label: 'Origin', placeholder: 'e.g. Da Lat, Vietnam' },
      { label: 'Expiry', placeholder: 'e.g. 12 months' },
    ],
  },
  {
    id: 'digital_service',
    labelVi: 'Phần Mềm, Khóa Học & Dịch Vụ Online',
    labelEn: 'Software, Courses & Online Services',
    icon: '💻',
    defaultProductType: 'digital',
    suggestedSpecsVi: [
      { label: 'Hình thức kích hoạt', placeholder: 'VD: Nâng cấp qua Email / Mã bản quyền' },
      { label: 'Thời hạn sử dụng', placeholder: 'VD: 12 tháng / Vĩnh viễn' },
      { label: 'Thiết bị hỗ trợ', placeholder: 'VD: Windows, macOS, iOS, Android' },
      { label: 'Cam kết bảo hành', placeholder: 'VD: Bảo hành trọn thời gian gói' },
    ],
    suggestedSpecsEn: [
      { label: 'Activation Method', placeholder: 'e.g. Email upgrade / License key' },
      { label: 'Duration', placeholder: 'e.g. 12 Months / Lifetime' },
      { label: 'Supported Devices', placeholder: 'e.g. Windows, macOS, iOS, Android' },
      { label: 'Warranty', placeholder: 'e.g. Full subscription period warranty' },
    ],
  },
  {
    id: 'voucher_ticket',
    labelVi: 'E-Voucher, Vé Sự Kiện & Thẻ Quà Tặng',
    labelEn: 'E-Vouchers, Tickets & Gift Cards',
    icon: '🎟️',
    defaultProductType: 'digital',
    suggestedSpecsVi: [
      { label: 'Đơn vị phát hành', placeholder: 'VD: CGV / Grab / ShopeePay' },
      { label: 'Phạm vi áp dụng', placeholder: 'VD: Toàn quốc (Online & Cửa hàng)' },
      { label: 'Hạn sử dụng mã', placeholder: 'VD: 6 tháng kể từ ngày nhận' },
    ],
    suggestedSpecsEn: [
      { label: 'Issuer', placeholder: 'e.g. CGV / Grab' },
      { label: 'Redemption Scope', placeholder: 'e.g. Nationwide' },
      { label: 'Validity', placeholder: 'e.g. 6 months from delivery' },
    ],
  },
  {
    id: 'entertainment',
    labelVi: 'Giải Trí Số & Thẻ Nạp Đa Năng',
    labelEn: 'Digital Entertainment & Top-Up Cards',
    icon: '⚡',
    defaultProductType: 'digital',
    suggestedSpecsVi: [
      { label: 'Loại sản phẩm', placeholder: 'VD: Thẻ nạp / Mã kích hoạt số' },
      { label: 'Khu vực hỗ trợ', placeholder: 'VD: Việt Nam / Quốc tế' },
      { label: 'Tốc độ giao', placeholder: 'VD: Tự động 0 giây 24/7' },
    ],
    suggestedSpecsEn: [
      { label: 'Item Type', placeholder: 'e.g. Digital Top-Up / Activation Key' },
      { label: 'Region', placeholder: 'e.g. Vietnam / Global' },
      { label: 'Delivery Speed', placeholder: 'e.g. Instant 0s 24/7' },
    ],
  },
  {
    id: 'other',
    labelVi: 'Ngành Hàng Đa Dạng Khác',
    labelEn: 'Other Multi-Category Goods',
    icon: '📦',
    defaultProductType: 'physical',
    suggestedSpecsVi: [
      { label: 'Thương hiệu / Nguồn gốc', placeholder: 'VD: Chính hãng' },
      { label: 'Tình trạng', placeholder: 'VD: Mới 100%' },
      { label: 'Bảo hành / Đổi trả', placeholder: 'VD: Đổi trả trong 7 ngày' },
    ],
    suggestedSpecsEn: [
      { label: 'Brand / Origin', placeholder: 'e.g. Official' },
      { label: 'Condition', placeholder: 'e.g. 100% Brand New' },
      { label: 'Return Policy', placeholder: 'e.g. 7-day return' },
    ],
  },
];

export const MAX_PRODUCT_IMAGES = 10;

export function getSellerIndustryById(id?: string | null): SellerIndustryOption {
  const clean = String(id || '').trim().toLowerCase();
  return SELLER_INDUSTRY_OPTIONS.find((item) => item.id === clean) || SELLER_INDUSTRY_OPTIONS[0];
}

export function isSafeMediaItemUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text')) {
    return null;
  }
  if (
    trimmed.startsWith('/api/product-media/') ||
    trimmed.startsWith('/api/homepage-images/') ||
    trimmed.startsWith('/images/') ||
    trimmed.startsWith('/game_icons/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    lower.startsWith('data:image/')
  ) {
    return trimmed;
  }
  return null;
}

export function sanitizeProductImagesList(
  rawImages: unknown,
  fallbackCoverUrl?: string | null
): { ok: boolean; images: string[]; error?: string; code?: string } {
  let arr: unknown[] = [];
  if (Array.isArray(rawImages)) {
    arr = rawImages;
  } else if (typeof rawImages === 'string' && rawImages.trim()) {
    try {
      const parsed = JSON.parse(rawImages);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = [rawImages];
    }
  }

  if (arr.length > MAX_PRODUCT_IMAGES) {
    return {
      ok: false,
      images: [],
      error: `Mỗi sản phẩm chỉ được đăng tối đa ${MAX_PRODUCT_IMAGES} ảnh (hiện gửi ${arr.length} ảnh).`,
      code: 'MAX_10_IMAGES_EXCEEDED',
    };
  }

  const dedup: string[] = [];
  for (const item of arr) {
    const clean = isSafeMediaItemUrl(item);
    if (clean && !dedup.includes(clean)) {
      dedup.push(clean);
    }
  }

  if (dedup.length === 0 && fallbackCoverUrl) {
    const fb = isSafeMediaItemUrl(fallbackCoverUrl);
    if (fb) dedup.push(fb);
  }

  return { ok: true, images: dedup.slice(0, MAX_PRODUCT_IMAGES) };
}

export interface ProductSpecItem {
  label: string;
  value: string;
}

export interface ProductVariantItem {
  id: string;
  name: string;
  price_core: number;
  original_price_core?: number | null;
  stock_quantity?: number;
  sku?: string;
}

export function parseSafeJsonArray<T = any>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {}
  }
  return [];
}

export function sanitizeProductSpecs(raw: unknown): ProductSpecItem[] {
  const arr = parseSafeJsonArray<any>(raw);
  const out: ProductSpecItem[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const label = String(item.label || item.key || '').trim().slice(0, 60);
    const value = String(item.value || '').trim().slice(0, 200);
    if (label && value) {
      out.push({ label, value });
    }
    if (out.length >= 15) break;
  }
  return out;
}

export function sanitizeProductVariants(raw: unknown, defaultPriceCore: number): ProductVariantItem[] {
  if (typeof raw === 'string' && raw.trim() && !raw.trim().startsWith('[')) {
    // Tương thích chuỗi cách nhau dấu phẩy cũ (VD: "Đen, Trắng")
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((name, idx) => ({
        id: `var_${idx + 1}`,
        name: name.slice(0, 60),
        price_core: Math.max(1, Math.round(defaultPriceCore)),
        stock_quantity: 10,
      }));
  }

  const arr = parseSafeJsonArray<any>(raw);
  const out: ProductVariantItem[] = [];
  for (let i = 0; i < arr.length && out.length < 20; i++) {
    const item = arr[i];
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || item.title || '').trim().slice(0, 60);
    if (!name) continue;
    const price = parseInt(item.price_core ?? item.price ?? defaultPriceCore, 10);
    const origPrice = item.original_price_core ? parseInt(item.original_price_core, 10) : null;
    const stock = item.stock_quantity !== undefined ? Math.max(0, parseInt(item.stock_quantity, 10) || 0) : undefined;
    const sku = item.sku ? String(item.sku).trim().slice(0, 40) : undefined;
    out.push({
      id: String(item.id || `var_${i + 1}`).slice(0, 40),
      name,
      price_core: Number.isFinite(price) && price > 0 ? price : Math.max(1, Math.round(defaultPriceCore)),
      ...(origPrice && origPrice > 0 ? { original_price_core: origPrice } : {}),
      ...(stock !== undefined ? { stock_quantity: stock } : {}),
      ...(sku ? { sku } : {}),
    });
  }
  return out;
}
