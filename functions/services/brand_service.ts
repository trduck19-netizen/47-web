/**
 * Platform Brand Identity Single Source of Truth (SSOT) Service
 *
 * Lưu cấu hình thương hiệu thống nhất tại D1 `system_settings` khóa `wcg_brand_identity_v1`,
 * đồng bộ hai chiều với `wcg_admin_content_v4` (`website_branding` & `footer_support`),
 * đồng bộ tên Gian Hàng Chính Hãng (`seller_universal_mall`) khi bật, và liên kết trực tiếp
 * với `CatalogEpoch` để phản ánh tức thì (< 500ms) trên toàn bộ:
 *   - Web Khách (`/`, `/en/`), Seller Portal (`/seller`, `/en/seller`), Admin Portal (`/admin`)
 *   - SSR HTML SEO (`<title>`, `<meta>`, JSON-LD, `window.__WCG_BRAND__` Zero-FOUC)
 *   - PWA `/manifest.json` động
 *   - Email OTP / Thông báo / Hủy đăng ký & Bot Telegram
 *   - Nhãn AI (`aiBrandName`) & tên đơn vị Ví/Điểm nội bộ (`coreUnitName`)
 */

import { getSettingD1, setSettingD1 } from './d1_service';
import { bumpCatalogEpoch, getCatalogEpoch } from './cache_service';

export const BRAND_IDENTITY_SETTING_KEY = 'wcg_brand_identity_v1';

export type BrandThemeAccent = 'orange' | 'blue' | 'red' | 'green' | 'purple';
export type BrandCurrencyMode = 'VND' | 'CORE';

export interface BrandIdentityConfig {
  brandName: string;
  shortName: string;
  brandBadge: string;
  sellerPortalName: string;
  adminPortalName: string;
  aiBrandName: string;
  coreUnitName: string;
  taglineVi: string;
  taglineEn: string;
  copyrightHolder: string;
  logoUrl: string;
  faviconUrl: string;
  supportHotline: string;
  supportEmail: string;
  telegramUrl: string;
  zaloUrl: string;
  themeAccent: BrandThemeAccent;
  currencyMode: BrandCurrencyMode;
  syncOfficialStoreName: boolean;
  updatedAt?: string;
}

export const DEFAULT_BRAND_IDENTITY: BrandIdentityConfig = {
  brandName: 'Pine Universal Mall',
  shortName: 'Pine Mall',
  brandBadge: 'MALL',
  sellerPortalName: 'Pine Seller Center',
  adminPortalName: 'Pine Universal Mall Admin',
  aiBrandName: 'Pine AI',
  coreUnitName: 'Core',
  taglineVi: 'Sàn Thương Mại Điện Tử Đa Ngành Chính Hãng',
  taglineEn: 'Official Multi-Industry E-Commerce Marketplace',
  copyrightHolder: 'Pine Universal Mall',
  logoUrl: '/logo.webp',
  faviconUrl: '/logo.webp',
  supportHotline: '0987.654.321',
  supportEmail: 'hotro@webcodegame.vn',
  telegramUrl: 'https://t.me/webcodegame_vn',
  zaloUrl: 'https://zalo.me/0386767888',
  themeAccent: 'orange',
  currencyMode: 'VND',
  syncOfficialStoreName: true,
};

const VALID_ACCENTS: BrandThemeAccent[] = ['orange', 'blue', 'red', 'green', 'purple'];

function sanitizeText(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function sanitizeAssetUrl(val: unknown, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  if (/^(javascript|vbscript):/i.test(trimmed)) return fallback;
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/')
  ) {
    return trimmed.slice(0, 65000);
  }
  return fallback;
}

function sanitizeLinkUrl(val: unknown, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, 300);
  return fallback;
}

function isLegacyTitle(title?: string | null): boolean {
  if (!title) return true;
  const u = title.trim().toUpperCase();
  return (
    !u ||
    u === 'WEB CODE GAME' ||
    u === 'WEB CODE' ||
    u === 'WEB CODE GAME 2026' ||
    u === 'CODEGAME.SHOP' ||
    u === 'CODEGAME' ||
    u === 'CODEGAME MALL' ||
    u === 'SHOP CODE GAME' ||
    u === 'WEBCODEGAME' ||
    u === 'WEBCODEGAME.VN'
  );
}

function normalizeLegacyLogoPath(url?: string | null): string {
  if (typeof url !== 'string') return DEFAULT_BRAND_IDENTITY.logoUrl;
  const trimmed = url.trim();
  if (!trimmed || trimmed === '/logo.png' || trimmed === '/favicon.png') {
    return DEFAULT_BRAND_IDENTITY.logoUrl;
  }
  return trimmed;
}

export function extractPrimaryBrandWord(name: string): string {
  const words = sanitizeText(name, 60).split(/\s+/).filter(Boolean);
  return words[0] || 'Pine';
}

export function deriveShortName(brandName: string): string {
  const words = sanitizeText(brandName, 60).split(/\s+/).filter(Boolean);
  if (words.length === 0) return DEFAULT_BRAND_IDENTITY.shortName;
  if (words.length <= 2) return words.join(' ').slice(0, 24);
  if (words.length >= 3 && words[words.length - 1].toLowerCase() === 'mall') {
    return `${words[0]} Mall`.slice(0, 24);
  }
  return words.slice(0, 2).join(' ').slice(0, 24);
}

/**
 * Chuẩn hóa & tự động suy diễn các trường dẫn xuất khi Admin để trống.
 */
export function normalizeBrandIdentity(
  raw?: Partial<BrandIdentityConfig> | null,
  base: BrandIdentityConfig = DEFAULT_BRAND_IDENTITY
): BrandIdentityConfig {
  const src = raw && typeof raw === 'object' ? raw : {};

  const rawBrandName = sanitizeText(src.brandName, 60);
  const brandName = !isLegacyTitle(rawBrandName)
    ? rawBrandName
    : !isLegacyTitle(base.brandName)
    ? base.brandName
    : DEFAULT_BRAND_IDENTITY.brandName;

  const explicitShort = sanitizeText(src.shortName, 28);
  const shortName = explicitShort || (rawBrandName && rawBrandName !== base.brandName ? deriveShortName(brandName) : base.shortName || deriveShortName(brandName));

  const primaryWord = extractPrimaryBrandWord(shortName || brandName);

  // brandBadge cho phép rỗng có chủ đích (để ẩn huy hiệu cạnh logo)
  const brandBadge =
    src.brandBadge !== undefined
      ? sanitizeText(src.brandBadge, 14)
      : base.brandBadge ?? DEFAULT_BRAND_IDENTITY.brandBadge;

  const explicitSellerPortal = sanitizeText(src.sellerPortalName, 48);
  const sellerPortalName = explicitSellerPortal || `${primaryWord} Seller Center`;

  const explicitAdminPortal = sanitizeText(src.adminPortalName, 56);
  const adminPortalName = explicitAdminPortal || `${brandName} Admin`;

  const explicitAiBrand = sanitizeText(src.aiBrandName, 32);
  const aiBrandName = explicitAiBrand || `${primaryWord} AI`;

  const explicitCoreUnit = sanitizeText(src.coreUnitName, 14);
  const coreUnitName = explicitCoreUnit || base.coreUnitName || DEFAULT_BRAND_IDENTITY.coreUnitName;

  const taglineVi = sanitizeText(src.taglineVi, 140) || base.taglineVi || DEFAULT_BRAND_IDENTITY.taglineVi;
  const taglineEn = sanitizeText(src.taglineEn, 140) || base.taglineEn || DEFAULT_BRAND_IDENTITY.taglineEn;

  const copyrightHolder = sanitizeText(src.copyrightHolder, 80) || brandName;

  const logoUrl = sanitizeAssetUrl(src.logoUrl, base.logoUrl || DEFAULT_BRAND_IDENTITY.logoUrl);
  const faviconUrl = sanitizeAssetUrl(src.faviconUrl, base.faviconUrl || logoUrl || DEFAULT_BRAND_IDENTITY.faviconUrl);

  const supportHotline = sanitizeText(src.supportHotline, 32) || base.supportHotline || DEFAULT_BRAND_IDENTITY.supportHotline;
  const supportEmail = sanitizeText(src.supportEmail, 80) || base.supportEmail || DEFAULT_BRAND_IDENTITY.supportEmail;
  const telegramUrl = src.telegramUrl !== undefined
    ? sanitizeLinkUrl(src.telegramUrl, base.telegramUrl)
    : (base.telegramUrl || DEFAULT_BRAND_IDENTITY.telegramUrl);
  const zaloUrl = src.zaloUrl !== undefined
    ? sanitizeLinkUrl(src.zaloUrl, base.zaloUrl)
    : (base.zaloUrl || DEFAULT_BRAND_IDENTITY.zaloUrl);

  const themeAccent: BrandThemeAccent = VALID_ACCENTS.includes(src.themeAccent as BrandThemeAccent)
    ? (src.themeAccent as BrandThemeAccent)
    : (VALID_ACCENTS.includes(base.themeAccent) ? base.themeAccent : 'orange');

  const currencyMode: BrandCurrencyMode =
    src.currencyMode === 'CORE' || src.currencyMode === 'VND'
      ? src.currencyMode
      : (base.currencyMode === 'CORE' ? 'CORE' : 'VND');

  const syncOfficialStoreName =
    src.syncOfficialStoreName !== undefined
      ? Boolean(src.syncOfficialStoreName)
      : (base.syncOfficialStoreName !== false);

  return {
    brandName,
    shortName,
    brandBadge,
    sellerPortalName,
    adminPortalName,
    aiBrandName,
    coreUnitName,
    taglineVi,
    taglineEn,
    copyrightHolder,
    logoUrl,
    faviconUrl,
    supportHotline,
    supportEmail,
    telegramUrl,
    zaloUrl,
    themeAccent,
    currencyMode,
    syncOfficialStoreName,
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : base.updatedAt,
  };
}

/**
 * Suy xuất đồng bộ BrandIdentityConfig từ tập setting đã đọc sẵn (0 query D1 thêm cho /api/sync-lite)
 */
export function extractBrandFromSettingsMap(
  d1Settings: Record<string, any> | null | undefined
): BrandIdentityConfig {
  const map = d1Settings && typeof d1Settings === 'object' ? d1Settings : {};
  const explicitBrand = map[BRAND_IDENTITY_SETTING_KEY];
  if (explicitBrand && typeof explicitBrand === 'object' && !Array.isArray(explicitBrand)) {
    return normalizeBrandIdentity(explicitBrand, DEFAULT_BRAND_IDENTITY);
  }

  // Fallback ngược sang wcg_admin_content_v4 nếu chưa có wcg_brand_identity_v1
  const contentItems = Array.isArray(map['wcg_admin_content_v4']) ? map['wcg_admin_content_v4'] : [];
  if (contentItems.length > 0) {
    const brandingItem = contentItems.find((i: any) => i && i.key === 'website_branding');
    const footerItem = contentItems.find((i: any) => i && i.key === 'footer_support');
    const rawTitle = !isLegacyTitle(brandingItem?.title)
      ? String(brandingItem.title).trim()
      : !isLegacyTitle(footerItem?.extraData?.brandTitle)
      ? String(footerItem.extraData.brandTitle).trim()
      : DEFAULT_BRAND_IDENTITY.brandName;

    const legacyLogo = normalizeLegacyLogoPath(brandingItem?.extraData?.logoUrl || footerItem?.extraData?.brandLogo);
    const legacyFavicon = normalizeLegacyLogoPath(brandingItem?.extraData?.avatarUrl || legacyLogo);
    const rawSubtitle = brandingItem?.extraData?.portalSubtitle;
    const cleanSubtitleVi =
      rawSubtitle && !String(rawSubtitle).toLowerCase().includes('cổng tra cứu')
        ? String(rawSubtitle).trim()
        : DEFAULT_BRAND_IDENTITY.taglineVi;

    return normalizeBrandIdentity(
      {
        brandName: rawTitle,
        shortName: rawTitle === DEFAULT_BRAND_IDENTITY.brandName ? DEFAULT_BRAND_IDENTITY.shortName : deriveShortName(rawTitle),
        taglineVi: cleanSubtitleVi,
        logoUrl: legacyLogo,
        faviconUrl: legacyFavicon,
        supportHotline: brandingItem?.extraData?.hotline || footerItem?.extraData?.hotline || DEFAULT_BRAND_IDENTITY.supportHotline,
        supportEmail: footerItem?.extraData?.email || DEFAULT_BRAND_IDENTITY.supportEmail,
        telegramUrl: footerItem?.extraData?.telegram || DEFAULT_BRAND_IDENTITY.telegramUrl,
        zaloUrl: footerItem?.extraData?.zalo || DEFAULT_BRAND_IDENTITY.zaloUrl,
        themeAccent: brandingItem?.extraData?.themeAccent || DEFAULT_BRAND_IDENTITY.themeAccent,
        currencyMode: brandingItem?.extraData?.currencyMode || DEFAULT_BRAND_IDENTITY.currencyMode,
      },
      DEFAULT_BRAND_IDENTITY
    );
  }

  return { ...DEFAULT_BRAND_IDENTITY };
}

export function invalidateBrandIdentityCache(): void {
  const gScope = globalThis as any;
  gScope.__wcg_brand_identity_cache = null;
}

/**
 * Đọc BrandIdentityConfig từ Cloudflare D1 với RAM cache gắn chặt CatalogEpoch
 */
export async function getBrandIdentity(
  db?: D1Database | null,
  options?: { bypassCache?: boolean }
): Promise<BrandIdentityConfig> {
  if (!db) return { ...DEFAULT_BRAND_IDENTITY };

  const gScope = globalThis as any;
  const bypass = Boolean(options?.bypassCache);

  try {
    const epoch = await getCatalogEpoch(db);
    const cached = gScope.__wcg_brand_identity_cache;
    if (!bypass && cached && cached.epoch === epoch && cached.data && Date.now() - cached.loadedAt < 30000) {
      return { ...cached.data };
    }

    const explicit = await getSettingD1<any>(db, BRAND_IDENTITY_SETTING_KEY).catch(() => null);
    let resolved: BrandIdentityConfig;
    if (explicit && typeof explicit === 'object' && !Array.isArray(explicit)) {
      resolved = normalizeBrandIdentity(explicit, DEFAULT_BRAND_IDENTITY);
    } else {
      const legacyContent = await getSettingD1<any[]>(db, 'wcg_admin_content_v4').catch(() => []);
      resolved = extractBrandFromSettingsMap({ wcg_admin_content_v4: legacyContent });
    }

    gScope.__wcg_brand_identity_cache = {
      epoch,
      data: resolved,
      loadedAt: Date.now(),
    };
    return { ...resolved };
  } catch {
    return { ...DEFAULT_BRAND_IDENTITY };
  }
}

/**
 * Lưu BrandIdentityConfig vào D1 (`wcg_brand_identity_v1`), tự động đồng bộ hai chiều sang
 * `wcg_admin_content_v4` (`website_branding` + `footer_support`), cập nhật Official Store nếu bật,
 * và tăng `CatalogEpoch` để toàn sàn cập nhật tức thì.
 */
export async function saveBrandIdentity(
  db: D1Database,
  input: Partial<BrandIdentityConfig>
): Promise<{ brand: BrandIdentityConfig; epoch: string }> {
  const current = await getBrandIdentity(db, { bypassCache: true });
  const nowIso = new Date().toISOString();

  const normalized = normalizeBrandIdentity(
    {
      ...input,
      updatedAt: nowIso,
    },
    current
  );

  // 1. Lưu nguồn chuẩn duy nhất wcg_brand_identity_v1
  await setSettingD1(db, BRAND_IDENTITY_SETTING_KEY, normalized);

  // 2. Đồng bộ hai chiều sang wcg_admin_content_v4 để ContentCMSModule & legacy readers khớp 100%
  try {
    const rawContent = await getSettingD1<any[]>(db, 'wcg_admin_content_v4').catch(() => []);
    const list: any[] = Array.isArray(rawContent) ? [...rawContent] : [];

    const wbIdx = list.findIndex((i) => i && i.key === 'website_branding');
    const prevWb = wbIdx >= 0 ? list[wbIdx] : null;
    const nextWb = {
      ...(prevWb || { id: `cnt_brand_${Date.now()}`, key: 'website_branding', type: 'BRANDING', isActive: true }),
      title: normalized.brandName,
      content: prevWb?.content || 'Thiết lập nhận diện thương hiệu, tên sàn, nhãn AI và đơn vị ví.',
      isActive: true,
      updatedAt: nowIso,
      extraData: {
        ...(prevWb?.extraData || {}),
        logoUrl: normalized.logoUrl,
        avatarUrl: normalized.faviconUrl,
        portalSubtitle: normalized.taglineVi,
        taglineEn: normalized.taglineEn,
        shortName: normalized.shortName,
        brandBadge: normalized.brandBadge,
        sellerPortalName: normalized.sellerPortalName,
        adminPortalName: normalized.adminPortalName,
        aiBrandName: normalized.aiBrandName,
        coreUnitName: normalized.coreUnitName,
        copyrightHolder: normalized.copyrightHolder,
        hotline: normalized.supportHotline,
        currencyMode: normalized.currencyMode,
        themeAccent: normalized.themeAccent,
      },
    };
    if (wbIdx >= 0) list[wbIdx] = nextWb;
    else list.unshift(nextWb);

    const ftIdx = list.findIndex((i) => i && i.key === 'footer_support');
    const prevFt = ftIdx >= 0 ? list[ftIdx] : null;
    const nextFt = {
      ...(prevFt || { id: `cnt_footer_${Date.now()}`, key: 'footer_support', type: 'FOOTER', isActive: true }),
      title: prevFt?.title || 'Chân Trang & Hỗ Trợ',
      content: prevFt?.content || `${normalized.brandName} — ${normalized.taglineVi}.`,
      isActive: true,
      updatedAt: nowIso,
      extraData: {
        ...(prevFt?.extraData || {}),
        brandTitle: normalized.brandName,
        brandLogo: normalized.logoUrl,
        hotline: normalized.supportHotline,
        supportHotline: normalized.supportHotline,
        email: normalized.supportEmail,
        telegram: normalized.telegramUrl,
        zalo: normalized.zaloUrl,
      },
    };
    if (ftIdx >= 0) list[ftIdx] = nextFt;
    else list.push(nextFt);

    await setSettingD1(db, 'wcg_admin_content_v4', list);
  } catch (err: any) {
    console.warn('[BrandService] Mirror to wcg_admin_content_v4 failed:', err?.message || err);
  }

  // 3. Tùy chọn đồng bộ tên Gian Hàng Chính Hãng của sàn trong bảng sellers
  if (normalized.syncOfficialStoreName) {
    try {
      await db
        .prepare(
          `UPDATE sellers
           SET name = ?,
               description = ?,
               updated_at = ?
           WHERE id = 'seller_universal_mall' OR slug = 'universal-mall-official'`
        )
        .bind(
          `${normalized.brandName} Official Store`,
          `Gian hàng chính hãng sàn ${normalized.brandName} - Bảo chứng giữ tiền đa tầng (24h - 168h)`,
          nowIso
        )
        .run();
    } catch {
      // Bảng sellers có thể chưa khởi tạo ở môi trường unit test tối giản
    }
  }

  // 4. Xóa RAM cache & tăng CatalogEpoch ngay lập tức
  invalidateBrandIdentityCache();
  const epoch = await bumpCatalogEpoch(db, 'brand_identity_update');

  return { brand: normalized, epoch };
}

/**
 * Tạo payload công khai gọn nhẹ để nhúng vào window.__WCG_BRAND__ (0ms Zero-FOUC)
 */
export function serializeBrandForInlineScript(brand: BrandIdentityConfig): string {
  const safePayload = {
    brandName: brand.brandName,
    shortName: brand.shortName,
    brandBadge: brand.brandBadge,
    sellerPortalName: brand.sellerPortalName,
    adminPortalName: brand.adminPortalName,
    aiBrandName: brand.aiBrandName,
    coreUnitName: brand.coreUnitName,
    taglineVi: brand.taglineVi,
    taglineEn: brand.taglineEn,
    copyrightHolder: brand.copyrightHolder,
    logoUrl: brand.logoUrl,
    faviconUrl: brand.faviconUrl,
    supportHotline: brand.supportHotline,
    supportEmail: brand.supportEmail,
    telegramUrl: brand.telegramUrl,
    zaloUrl: brand.zaloUrl,
    themeAccent: brand.themeAccent,
    currencyMode: brand.currencyMode,
    updatedAt: brand.updatedAt || '',
  };
  return JSON.stringify(safePayload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Sinh nội dung /manifest.json động cho PWA theo cấu hình thương hiệu D1
 */
export function buildDynamicManifestJson(brand: BrandIdentityConfig): Record<string, any> {
  const icon192 = brand.faviconUrl && !brand.faviconUrl.startsWith('data:') ? brand.faviconUrl : '/logo.png';
  const iconType = icon192.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/png';
  return {
    id: '/',
    name: `${brand.brandName} - ${brand.taglineVi}`,
    short_name: brand.shortName || brand.brandName,
    description: `${brand.brandName} — ${brand.taglineVi}.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0B0D19',
    theme_color: '#0B0D19',
    categories: ['shopping', 'games', 'utilities'],
    icons: [
      { src: '/favicon.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any maskable' },
      { src: icon192, sizes: '192x192', type: iconType, purpose: 'any maskable' },
      { src: icon192, sizes: '512x512', type: iconType, purpose: 'any maskable' },
    ],
    shortcuts: [
      {
        name: `Trang Chủ ${brand.shortName}`,
        short_name: brand.shortName,
        description: brand.taglineVi,
        url: '/',
        icons: [{ src: icon192, sizes: '192x192' }],
      },
      {
        name: 'Cửa Hàng Đa Ngành',
        short_name: 'Cửa Hàng',
        description: `Mua sắm & Tiện ích số tại ${brand.brandName}`,
        url: '/store',
        icons: [{ src: icon192, sizes: '192x192' }],
      },
      {
        name: brand.sellerPortalName,
        short_name: 'Người Bán',
        description: `Quản lý gian hàng trên ${brand.brandName}`,
        url: '/seller',
        icons: [{ src: icon192, sizes: '192x192' }],
      },
    ],
    prefer_related_applications: false,
  };
}
