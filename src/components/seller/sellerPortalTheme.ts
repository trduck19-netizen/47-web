/**
 * Seller Portal Theme Presets, URL Hash Mapping & RBAC Tab Policy
 * Dùng chung giữa SellerPortalApp, SellerPortalSidebar, SellerPortalTopbar,
 * SellerModerationModule (Admin) và bộ test hồi quy.
 */

export type SellerPortalThemePreset = 'shopee_orange' | 'enterprise_indigo' | 'emerald_fintech' | 'royal_violet';

export type SellerPortalTabId =
  | 'dashboard'
  | 'products'
  | 'vouchers'
  | 'codes'
  | 'orders'
  | 'disputes'
  | 'finance'
  | 'sepay'
  | 'affiliate'
  | 'api_keys'
  | 'settings';

export type SellerSubRole = 'OWNER' | 'MANAGE_STOCK' | 'VIEW_ORDERS';

export interface SellerPortalConfigData {
  theme_preset: SellerPortalThemePreset;
  allow_dark_mode: boolean;
  banner_vi: string;
  banner_en: string;
}

export const DEFAULT_SELLER_PORTAL_CONFIG: SellerPortalConfigData = {
  theme_preset: 'shopee_orange',
  allow_dark_mode: true,
  banner_vi: '',
  banner_en: '',
};

export interface ThemePresetPalette {
  id: SellerPortalThemePreset;
  primaryHex: string;
  primaryHoverHex: string;
  accentBgClass: string;
  accentBgHoverClass: string;
  accentSoftBgClass: string;
  accentTextClass: string;
  accentBorderClass: string;
  accentBarClass: string;
  heroGradientClass: string;
  swatchHex: string;
}

export const SELLER_PORTAL_THEME_PALETTES: Record<SellerPortalThemePreset, ThemePresetPalette> = {
  shopee_orange: {
    id: 'shopee_orange',
    primaryHex: '#ee4d2d',
    primaryHoverHex: '#d73211',
    accentBgClass: 'bg-[#ee4d2d]',
    accentBgHoverClass: 'hover:bg-[#d73211]',
    accentSoftBgClass: 'bg-orange-50 dark:bg-orange-500/15',
    accentTextClass: 'text-[#ee4d2d] dark:text-orange-400',
    accentBorderClass: 'border-orange-200 dark:border-orange-500/30',
    accentBarClass: 'bg-[#ee4d2d]',
    heroGradientClass: 'from-[#ee4d2d] via-[#f05d40] to-amber-500',
    swatchHex: '#ee4d2d',
  },
  enterprise_indigo: {
    id: 'enterprise_indigo',
    primaryHex: '#2563eb',
    primaryHoverHex: '#1d4ed8',
    accentBgClass: 'bg-blue-600',
    accentBgHoverClass: 'hover:bg-blue-700',
    accentSoftBgClass: 'bg-blue-50 dark:bg-blue-500/15',
    accentTextClass: 'text-blue-600 dark:text-blue-400',
    accentBorderClass: 'border-blue-200 dark:border-blue-500/30',
    accentBarClass: 'bg-blue-600',
    heroGradientClass: 'from-blue-700 via-indigo-600 to-sky-500',
    swatchHex: '#2563eb',
  },
  emerald_fintech: {
    id: 'emerald_fintech',
    primaryHex: '#059669',
    primaryHoverHex: '#047857',
    accentBgClass: 'bg-emerald-600',
    accentBgHoverClass: 'hover:bg-emerald-700',
    accentSoftBgClass: 'bg-emerald-50 dark:bg-emerald-500/15',
    accentTextClass: 'text-emerald-700 dark:text-emerald-400',
    accentBorderClass: 'border-emerald-200 dark:border-emerald-500/30',
    accentBarClass: 'bg-emerald-600',
    heroGradientClass: 'from-emerald-700 via-emerald-600 to-teal-500',
    swatchHex: '#059669',
  },
  royal_violet: {
    id: 'royal_violet',
    primaryHex: '#7c3aed',
    primaryHoverHex: '#6d28d9',
    accentBgClass: 'bg-violet-600',
    accentBgHoverClass: 'hover:bg-violet-700',
    accentSoftBgClass: 'bg-violet-50 dark:bg-violet-500/15',
    accentTextClass: 'text-violet-700 dark:text-violet-400',
    accentBorderClass: 'border-violet-200 dark:border-violet-500/30',
    accentBarClass: 'bg-violet-600',
    heroGradientClass: 'from-violet-700 via-purple-600 to-fuchsia-500',
    swatchHex: '#7c3aed',
  },
};

export function getSellerPortalPalette(preset?: string | null): ThemePresetPalette {
  if (preset && preset in SELLER_PORTAL_THEME_PALETTES) {
    return SELLER_PORTAL_THEME_PALETTES[preset as SellerPortalThemePreset];
  }
  return SELLER_PORTAL_THEME_PALETTES.shopee_orange;
}

export const ALL_SELLER_TABS: SellerPortalTabId[] = [
  'dashboard',
  'products',
  'vouchers',
  'codes',
  'orders',
  'disputes',
  'finance',
  'sepay',
  'affiliate',
  'api_keys',
  'settings',
];

const RBAC_ALLOWED_TABS: Record<SellerSubRole, SellerPortalTabId[]> = {
  OWNER: ALL_SELLER_TABS,
  MANAGE_STOCK: ['dashboard', 'products', 'vouchers', 'codes', 'orders'],
  VIEW_ORDERS: ['dashboard', 'orders', 'disputes'],
};

export function normalizeSellerSubRole(rawRole?: string | null): SellerSubRole {
  const upper = String(rawRole || 'OWNER').trim().toUpperCase();
  if (upper === 'MANAGE_STOCK') return 'MANAGE_STOCK';
  if (upper === 'VIEW_ORDERS') return 'VIEW_ORDERS';
  return 'OWNER';
}

export function getAllowedSellerPortalTabs(role?: string | null): SellerPortalTabId[] {
  const normalized = normalizeSellerSubRole(role);
  return RBAC_ALLOWED_TABS[normalized] || ALL_SELLER_TABS;
}

export function isSellerTabAllowedForRole(tab: SellerPortalTabId, role?: string | null): boolean {
  return getAllowedSellerPortalTabs(role).includes(tab);
}

const HASH_TO_TAB: Record<string, SellerPortalTabId> = {
  dashboard: 'dashboard',
  products: 'products',
  vouchers: 'vouchers',
  codes: 'codes',
  orders: 'orders',
  disputes: 'disputes',
  finance: 'finance',
  sepay: 'sepay',
  affiliate: 'affiliate',
  'api-keys': 'api_keys',
  api_keys: 'api_keys',
  settings: 'settings',
};

const TAB_TO_HASH: Record<SellerPortalTabId, string> = {
  dashboard: '#/dashboard',
  products: '#/products',
  vouchers: '#/vouchers',
  codes: '#/codes',
  orders: '#/orders',
  disputes: '#/disputes',
  finance: '#/finance',
  sepay: '#/sepay',
  affiliate: '#/affiliate',
  api_keys: '#/api-keys',
  settings: '#/settings',
};

export function parseSellerPortalHash(hashInput?: string | null): SellerPortalTabId {
  const cleaned = String(hashInput || '')
    .replace(/^#\/?/, '')
    .split(/[?/]/)[0]
    .trim()
    .toLowerCase();
  return HASH_TO_TAB[cleaned] || 'dashboard';
}

export function formatSellerPortalHash(tab: SellerPortalTabId): string {
  return TAB_TO_HASH[tab] || '#/dashboard';
}

export function isSellerPortalPathname(pathnameInput?: string | null): boolean {
  const p = String(pathnameInput || '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '') || '/';
  return (
    p === '/seller' ||
    p.startsWith('/seller/') ||
    p === '/en/seller' ||
    p.startsWith('/en/seller/') ||
    p === '/vi/seller' ||
    p.startsWith('/vi/seller/') ||
    p === '/ban-hang' ||
    p.startsWith('/ban-hang/') ||
    p === '/en/ban-hang' ||
    p.startsWith('/en/ban-hang/') ||
    p === '/seller-center' ||
    p.startsWith('/seller-center/') ||
    p === '/en/seller-center' ||
    p.startsWith('/en/seller-center/')
  );
}
