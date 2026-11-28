import React from 'react';
import {
  Store,
  QrCode,
  Link2,
  Zap,
  ShieldCheck,
  LogIn,
  ArrowLeft,
  Globe,
  Sun,
  Moon,
  CheckCircle2,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useBrand } from '../../context/BrandContext';
import { type ThemePresetPalette } from './sellerPortalTheme';

interface SellerOnboardingLandingProps {
  currentUser: any;
  palette: ThemePresetPalette;
  highlights: {
    direct_sepay_global_enabled: boolean;
    direct_sepay_fee_pct: number;
    affiliate_enabled: boolean;
    hold_hours: number;
  };
  bannerText?: string;
  isDarkMode: boolean;
  allowDarkMode: boolean;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onOpenLogin: () => void;
  onNavigateMarketplace: () => void;
  registrationSlot?: React.ReactNode;
}

export const SellerOnboardingLanding: React.FC<SellerOnboardingLandingProps> = ({
  currentUser,
  palette,
  highlights,
  bannerText,
  isDarkMode,
  allowDarkMode,
  onToggleTheme,
  onToggleLanguage,
  onOpenLogin,
  onNavigateMarketplace,
  registrationSlot,
}) => {
  const { t, language } = useLanguage();
  const { brand } = useBrand();
  const isEn = language === 'en';

  const benefitCards = [
    {
      id: 'sepay',
      icon: QrCode,
      iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
      title: t('sellerPortal.landing.benefitSepayTitle', { fee: highlights.direct_sepay_fee_pct }),
      desc: t('sellerPortal.landing.benefitSepayDesc'),
    },
    {
      id: 'affiliate',
      icon: Link2,
      iconBg: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
      title: t('sellerPortal.landing.benefitAffiliateTitle'),
      desc: t('sellerPortal.landing.benefitAffiliateDesc'),
    },
    {
      id: 'instant',
      icon: Zap,
      iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      title: t('sellerPortal.landing.benefitInstantTitle'),
      desc: t('sellerPortal.landing.benefitInstantDesc'),
    },
  ];

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Clean standalone portal header */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg ${palette.accentBgClass} text-white flex items-center justify-center shrink-0 shadow-sm overflow-hidden`}>
            {brand.logoUrl && brand.logoUrl !== '/logo.png' && brand.logoUrl !== '/logo.webp' ? (
              <img src={brand.logoUrl} alt={brand.sellerPortalName} className="w-full h-full object-contain p-0.5 bg-white" />
            ) : (
              <Store className="w-4 h-4" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold tracking-tight truncate">
              {t('sellerPortal.brandTitle')}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
              {t('sellerPortal.brandSubtitle')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleLanguage}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isEn ? 'EN' : 'VI'}</span>
          </button>

          {allowDarkMode && (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDarkMode ? t('sellerPortal.topbar.switchToLight') : t('sellerPortal.topbar.switchToDark')}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
            </button>
          )}

          <button
            type="button"
            onClick={onNavigateMarketplace}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('sellerPortal.topbar.backToMall')}</span>
          </button>
        </div>
      </header>

      {/* Optional Admin announcement banner */}
      {bannerText && (
        <div className={`px-4 py-2 text-center text-xs font-semibold text-white ${palette.accentBgClass}`}>
          {bannerText}
        </div>
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        {/* Hero Banner */}
        <section className={`rounded-2xl p-6 sm:p-8 text-white bg-gradient-to-r ${palette.heroGradientClass} shadow-lg`}>
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('sellerPortal.landing.badge')}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
              {t('sellerPortal.landing.heroTitle')}
            </h1>
            <p className="text-sm sm:text-base text-white/90 leading-relaxed">
              {t('sellerPortal.landing.heroDesc')}
            </p>

            {!currentUser && (
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-slate-900 font-extrabold text-sm shadow-md hover:bg-slate-100 transition cursor-pointer"
                >
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  <span>{t('sellerPortal.landing.loginOrRegisterCta')}</span>
                </button>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/90">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>{t('sellerPortal.landing.sharedAccountHint')}</span>
                </span>
              </div>
            )}
          </div>
        </section>

        {/* 3 Core Merchant Benefits */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {benefitCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-2.5"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {card.title}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {card.desc}
                </p>
              </div>
            );
          })}
        </section>

        {/* Registration Form Slot (when logged in with has_seller === false) */}
        {currentUser && registrationSlot && (
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {registrationSlot}
          </section>
        )}
      </main>
    </div>
  );
};
