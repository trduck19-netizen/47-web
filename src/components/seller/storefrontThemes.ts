/**
 * Storefront Banner Theme Presets (Shared between Seller Storefront Studio & PublicStoreView)
 * High-contrast, Shopee Mall / Official Flagship aesthetics in both Light & Dark modes.
 */

export type StorefrontBannerPresetId =
  | 'shopee_flame'
  | 'aurora_indigo'
  | 'cyber_emerald'
  | 'royal_violet'
  | 'crimson_gaming'
  | 'gold_luxury';

export interface StorefrontBannerPreset {
  id: StorefrontBannerPresetId;
  labelVi: string;
  labelEn: string;
  gradientClass: string;
  meshOverlay: string;
  accentHex: string;
  pillClass: string;
  ringClass: string;
}

export const DEFAULT_STOREFRONT_BANNER_PRESET: StorefrontBannerPresetId = 'aurora_indigo';

export const STOREFRONT_BANNER_PRESETS: StorefrontBannerPreset[] = [
  {
    id: 'aurora_indigo',
    labelVi: 'Aurora Indigo (Chuyên Nghiệp)',
    labelEn: 'Aurora Indigo (Flagship)',
    gradientClass: 'from-slate-900 via-indigo-900 to-blue-800',
    meshOverlay:
      'radial-gradient(circle at 18% 25%, rgba(99,102,241,0.45), transparent 52%), radial-gradient(circle at 82% 75%, rgba(56,189,248,0.35), transparent 50%)',
    accentHex: '#4f46e5',
    pillClass: 'bg-indigo-500/20 text-indigo-100 border-indigo-300/30',
    ringClass: 'ring-indigo-500',
  },
  {
    id: 'shopee_flame',
    labelVi: 'Shopee Mall Cam Rực',
    labelEn: 'Mall Flame Orange',
    gradientClass: 'from-[#d73211] via-[#ee4d2d] to-amber-500',
    meshOverlay:
      'radial-gradient(circle at 15% 20%, rgba(255,237,213,0.28), transparent 48%), radial-gradient(circle at 88% 80%, rgba(251,191,36,0.35), transparent 52%)',
    accentHex: '#ee4d2d',
    pillClass: 'bg-white/20 text-white border-white/30',
    ringClass: 'ring-[#ee4d2d]',
  },
  {
    id: 'cyber_emerald',
    labelVi: 'Fintech Ngọc Lục Bảo',
    labelEn: 'Cyber Emerald Fintech',
    gradientClass: 'from-emerald-950 via-teal-900 to-emerald-700',
    meshOverlay:
      'radial-gradient(circle at 20% 25%, rgba(16,185,129,0.42), transparent 50%), radial-gradient(circle at 85% 70%, rgba(45,212,191,0.32), transparent 52%)',
    accentHex: '#059669',
    pillClass: 'bg-emerald-400/20 text-emerald-100 border-emerald-300/30',
    ringClass: 'ring-emerald-500',
  },
  {
    id: 'royal_violet',
    labelVi: 'Hoàng Gia Tím Sapphire',
    labelEn: 'Royal Violet',
    gradientClass: 'from-[#2e1065] via-purple-900 to-fuchsia-800',
    meshOverlay:
      'radial-gradient(circle at 16% 30%, rgba(192,132,252,0.42), transparent 50%), radial-gradient(circle at 84% 72%, rgba(244,114,182,0.32), transparent 52%)',
    accentHex: '#7c3aed',
    pillClass: 'bg-purple-400/20 text-purple-100 border-purple-300/30',
    ringClass: 'ring-purple-500',
  },
  {
    id: 'crimson_gaming',
    labelVi: 'Esports Đỏ Đen',
    labelEn: 'Esports Crimson',
    gradientClass: 'from-zinc-950 via-rose-950 to-red-800',
    meshOverlay:
      'radial-gradient(circle at 22% 28%, rgba(244,63,94,0.45), transparent 52%), radial-gradient(circle at 85% 75%, rgba(251,146,60,0.3), transparent 50%)',
    accentHex: '#e11d48',
    pillClass: 'bg-rose-500/25 text-rose-100 border-rose-300/30',
    ringClass: 'ring-rose-500',
  },
  {
    id: 'gold_luxury',
    labelVi: 'VIP Vàng Ánh Kim',
    labelEn: 'Luxury Gold VIP',
    gradientClass: 'from-stone-950 via-amber-950 to-yellow-800',
    meshOverlay:
      'radial-gradient(circle at 18% 22%, rgba(251,191,36,0.38), transparent 50%), radial-gradient(circle at 82% 78%, rgba(245,158,11,0.32), transparent 50%)',
    accentHex: '#d97706',
    pillClass: 'bg-amber-400/20 text-amber-100 border-amber-300/30',
    ringClass: 'ring-amber-500',
  },
];

export const VALID_BANNER_PRESET_IDS: StorefrontBannerPresetId[] = STOREFRONT_BANNER_PRESETS.map((p) => p.id);

export function getStorefrontBannerPreset(presetId?: string | null): StorefrontBannerPreset {
  const found = STOREFRONT_BANNER_PRESETS.find((p) => p.id === presetId);
  return found || STOREFRONT_BANNER_PRESETS[0];
}
