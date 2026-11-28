/**
 * Frontend Brand Identity Runtime Store (Zero-Dependency Synchronous SSOT)
 *
 * Dùng chung cho:
 *  - BrandContext (React state & cross-tab reactivity)
 *  - LanguageContext (auto-interpolation {brandName}, {shortName}, {sellerPortalName}, {adminPortalName}, {aiBrandName}, {coreUnit})
 *  - textUtils.formatCore() (tự đổi hậu tố đơn vị Ví trên toàn bộ 86 điểm gọi)
 *  - dataService & adminDataService (đồng bộ ngược với wcg_admin_content_v4)
 */

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

export const BRAND_STORAGE_CACHE_KEY = 'pine_brand_identity_cache_v1';
export const BRAND_UPDATED_EVENT = 'wcg_brand_identity_updated';

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
  return val.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
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

export function normalizeBrandIdentityClient(
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
  const shortName =
    explicitShort ||
    (rawBrandName && rawBrandName !== base.brandName
      ? deriveShortName(brandName)
      : base.shortName || deriveShortName(brandName));

  const primaryWord = extractPrimaryBrandWord(shortName || brandName);

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

  const logoUrl =
    typeof src.logoUrl === 'string' && src.logoUrl.trim() && !/^javascript:/i.test(src.logoUrl.trim())
      ? normalizeLegacyLogoPath(src.logoUrl)
      : base.logoUrl || DEFAULT_BRAND_IDENTITY.logoUrl;

  const faviconUrl =
    typeof src.faviconUrl === 'string' && src.faviconUrl.trim() && !/^javascript:/i.test(src.faviconUrl.trim())
      ? normalizeLegacyLogoPath(src.faviconUrl)
      : base.faviconUrl || logoUrl || DEFAULT_BRAND_IDENTITY.faviconUrl;

  const supportHotline = sanitizeText(src.supportHotline, 32) || base.supportHotline || DEFAULT_BRAND_IDENTITY.supportHotline;
  const supportEmail = sanitizeText(src.supportEmail, 80) || base.supportEmail || DEFAULT_BRAND_IDENTITY.supportEmail;
  const telegramUrl =
    typeof src.telegramUrl === 'string'
      ? src.telegramUrl.trim()
      : base.telegramUrl || DEFAULT_BRAND_IDENTITY.telegramUrl;
  const zaloUrl =
    typeof src.zaloUrl === 'string'
      ? src.zaloUrl.trim()
      : base.zaloUrl || DEFAULT_BRAND_IDENTITY.zaloUrl;

  const themeAccent: BrandThemeAccent = VALID_ACCENTS.includes(src.themeAccent as BrandThemeAccent)
    ? (src.themeAccent as BrandThemeAccent)
    : VALID_ACCENTS.includes(base.themeAccent)
    ? base.themeAccent
    : 'orange';

  const currencyMode: BrandCurrencyMode =
    src.currencyMode === 'CORE' || src.currencyMode === 'VND'
      ? src.currencyMode
      : base.currencyMode === 'CORE'
      ? 'CORE'
      : 'VND';

  const syncOfficialStoreName =
    src.syncOfficialStoreName !== undefined
      ? Boolean(src.syncOfficialStoreName)
      : base.syncOfficialStoreName !== false;

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

let cachedBrand: BrandIdentityConfig | null = null;

function readInitialBrand(): BrandIdentityConfig {
  if (typeof window !== 'undefined') {
    const winBrand = (window as any).__WCG_BRAND__;
    if (winBrand && typeof winBrand === 'object' && winBrand.brandName) {
      const norm = normalizeBrandIdentityClient(winBrand, DEFAULT_BRAND_IDENTITY);
      try {
        localStorage.setItem(BRAND_STORAGE_CACHE_KEY, JSON.stringify(norm));
      } catch {}
      return norm;
    }

    try {
      const saved = localStorage.getItem(BRAND_STORAGE_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return normalizeBrandIdentityClient(parsed, DEFAULT_BRAND_IDENTITY);
        }
      }
    } catch {}

    // Fallback từ pine_admin_content_v4 nếu chưa có cache riêng
    try {
      const legacyRaw = localStorage.getItem('pine_admin_content_v4');
      if (legacyRaw) {
        const items = JSON.parse(legacyRaw);
        if (Array.isArray(items)) {
          const branding = items.find((i: any) => i && i.key === 'website_branding');
          const footer = items.find((i: any) => i && i.key === 'footer_support');
          if (branding || footer) {
            const extra = branding?.extraData || {};
            const title = !isLegacyTitle(branding?.title)
              ? branding.title.trim()
              : !isLegacyTitle(footer?.extraData?.brandTitle)
              ? footer.extraData.brandTitle.trim()
              : DEFAULT_BRAND_IDENTITY.brandName;
            return normalizeBrandIdentityClient(
              {
                brandName: title,
                shortName: extra.shortName || (title === DEFAULT_BRAND_IDENTITY.brandName ? DEFAULT_BRAND_IDENTITY.shortName : deriveShortName(title)),
                brandBadge: extra.brandBadge,
                sellerPortalName: extra.sellerPortalName,
                adminPortalName: extra.adminPortalName,
                aiBrandName: extra.aiBrandName,
                coreUnitName: extra.coreUnitName,
                taglineVi:
                  extra.portalSubtitle && !String(extra.portalSubtitle).toLowerCase().includes('cổng tra cứu')
                    ? extra.portalSubtitle
                    : DEFAULT_BRAND_IDENTITY.taglineVi,
                taglineEn: extra.taglineEn,
                copyrightHolder: extra.copyrightHolder,
                logoUrl: extra.logoUrl || footer?.extraData?.brandLogo,
                faviconUrl: extra.avatarUrl || extra.logoUrl,
                supportHotline: extra.hotline || footer?.extraData?.hotline || footer?.extraData?.supportHotline,
                supportEmail: footer?.extraData?.email,
                telegramUrl: footer?.extraData?.telegram,
                zaloUrl: footer?.extraData?.zalo,
                themeAccent: extra.themeAccent,
                currencyMode: extra.currencyMode,
              },
              DEFAULT_BRAND_IDENTITY
            );
          }
        }
      }
    } catch {}
  }

  return { ...DEFAULT_BRAND_IDENTITY };
}

export function getActiveBrandIdentity(): BrandIdentityConfig {
  if (!cachedBrand) {
    cachedBrand = readInitialBrand();
  }
  return cachedBrand;
}

export function reloadBrandFromStorage(): BrandIdentityConfig {
  cachedBrand = readInitialBrand();
  return cachedBrand;
}

export function setActiveBrandIdentity(
  next: Partial<BrandIdentityConfig>,
  options?: { persist?: boolean; emitEvent?: boolean }
): BrandIdentityConfig {
  const normalized = normalizeBrandIdentityClient(next, cachedBrand || DEFAULT_BRAND_IDENTITY);
  const changed = !cachedBrand || JSON.stringify(cachedBrand) !== JSON.stringify(normalized);
  cachedBrand = normalized;

  if (typeof window !== 'undefined') {
    (window as any).__WCG_BRAND__ = normalized;
    if (options?.persist !== false) {
      try {
        localStorage.setItem(BRAND_STORAGE_CACHE_KEY, JSON.stringify(normalized));
      } catch {}
    }
    if (options?.emitEvent !== false && changed) {
      try {
        window.dispatchEvent(new CustomEvent(BRAND_UPDATED_EVENT, { detail: normalized }));
      } catch {}
    }
  }

  return normalized;
}

export function getActiveCoreUnitName(): string {
  return getActiveBrandIdentity().coreUnitName || 'Core';
}

export function getBrandInterpolationParams(brand?: BrandIdentityConfig): Record<string, string> {
  const b = brand || getActiveBrandIdentity();
  return {
    brandName: b.brandName,
    brandNameUpper: b.brandName.toUpperCase(),
    shortName: b.shortName,
    shortNameUpper: b.shortName.toUpperCase(),
    brandBadge: b.brandBadge,
    sellerPortalName: b.sellerPortalName,
    adminPortalName: b.adminPortalName,
    aiBrandName: b.aiBrandName,
    coreUnit: b.coreUnitName,
    copyrightHolder: b.copyrightHolder || b.brandName,
  };
}
