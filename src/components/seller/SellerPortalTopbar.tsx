import React from 'react';
import {
  Menu,
  Wallet,
  PlusCircle,
  ExternalLink,
  Sun,
  Moon,
  Globe,
  ArrowLeft,
  QrCode,
  ShieldCheck,
  UserCog,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatCore } from '../../utils/textUtils';
import {
  type SellerSubRole,
  type ThemePresetPalette,
  type SellerPortalTabId,
} from './sellerPortalTheme';

export interface SellerSepayTopbarSummary {
  configured: boolean;
  is_enabled: boolean;
  admin_locked: boolean;
  fee_debt_core: number;
  open_exceptions: number;
}

interface SellerPortalTopbarProps {
  seller: any;
  currentUser: any;
  subRole: SellerSubRole;
  sepaySummary: SellerSepayTopbarSummary | null;
  palette: ThemePresetPalette;
  isDarkMode: boolean;
  allowDarkMode: boolean;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onOpenMobileMenu: () => void;
  onOpenWallet: () => void;
  onSelectTab: (tab: SellerPortalTabId) => void;
  onNavigateMarketplace: () => void;
  onLogout: () => void;
}

export const SellerPortalTopbar: React.FC<SellerPortalTopbarProps> = ({
  seller,
  currentUser,
  subRole,
  sepaySummary,
  palette,
  isDarkMode,
  allowDarkMode,
  onToggleTheme,
  onToggleLanguage,
  onOpenMobileMenu,
  onOpenWallet,
  onSelectTab,
  onNavigateMarketplace,
  onLogout,
}) => {
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  const statusTone =
    seller?.status === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
      : seller?.status === 'TRIAL'
      ? 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30'
      : seller?.status === 'SUSPENDED' || seller?.status === 'REJECTED'
      ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30'
      : 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30';

  const roleBadgeLabel =
    subRole === 'OWNER'
      ? t('sellerPortal.roles.owner')
      : subRole === 'MANAGE_STOCK'
      ? t('sellerPortal.roles.manageStock')
      : t('sellerPortal.roles.viewOrders');

  const publicStoreHref = seller?.slug
    ? `${isEn ? '/en' : ''}/gian-hang/${encodeURIComponent(seller.slug)}`
    : null;

  const sepayBadge = sepaySummary?.admin_locked
    ? {
        label: t('sellerPortal.topbar.sepayLocked'),
        cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
        dot: 'bg-rose-500',
      }
    : sepaySummary?.is_enabled
    ? {
        label: t('sellerPortal.topbar.sepayOnline'),
        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
        dot: 'bg-emerald-500',
      }
    : {
        label: t('sellerPortal.topbar.sepayCoreOnly'),
        cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        dot: 'bg-slate-400',
      };

  return (
    <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-3 sm:px-5 flex items-center justify-between gap-2 min-w-0">
      {/* Left: Mobile menu + Store identity + Status + Role */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label={t('sellerPortal.sidebar.openMenu')}
          className="lg:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[140px] sm:max-w-[220px]" title={seller?.name || ''}>
            {seller?.name || t('sellerPortal.brandTitle')}
          </span>
          {seller?.status && (
            <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${statusTone}`}>
              {seller.status}
            </span>
          )}
          <span
            className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0"
            title={roleBadgeLabel}
          >
            {subRole === 'OWNER' ? (
              <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <UserCog className="w-3 h-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            )}
            <span>{roleBadgeLabel}</span>
          </span>
        </div>
      </div>

      {/* Right: SePay pill + Core Wallet + Quick Topup + Public Store + Lang + Theme + Marketplace */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* SePay Status Pill (Owner clickable to #/sepay) */}
        {subRole === 'OWNER' && (
          <button
            type="button"
            onClick={() => onSelectTab('sepay')}
            title={t('sellerPortal.topbar.sepayTooltip')}
            className={`hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer transition-opacity hover:opacity-90 ${sepayBadge.cls}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${sepayBadge.dot}`} aria-hidden="true" />
            <QrCode className="w-3 h-3" aria-hidden="true" />
            <span>{sepayBadge.label}</span>
            {(sepaySummary?.open_exceptions || 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 ml-0.5 text-rose-600 dark:text-rose-300">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                {sepaySummary?.open_exceptions}
              </span>
            )}
          </button>
        )}

        {/* Core Wallet Balance + Quick Topup */}
        <div className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <Wallet className={`w-3.5 h-3.5 shrink-0 ${palette.accentTextClass}`} aria-hidden="true" />
          <span className="text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
            {formatCore(Number(currentUser?.balance || 0))}
          </span>
          <button
            type="button"
            onClick={onOpenWallet}
            title={t('sellerPortal.topbar.topupWallet')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white cursor-pointer ${palette.accentBgClass} ${palette.accentBgHoverClass}`}
          >
            <PlusCircle className="w-3 h-3" aria-hidden="true" />
            <span className="hidden sm:inline">{t('sellerPortal.topbar.topupBtn')}</span>
          </button>
        </div>

        {/* Public Storefront link */}
        {publicStoreHref && (
          <a
            href={publicStoreHref}
            target="_blank"
            rel="noopener noreferrer"
            title={t('sellerPortal.topbar.viewPublicStore')}
            className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('sellerPortal.topbar.viewPublicStore')}</span>
          </a>
        )}

        {/* Language Toggle VI <-> EN */}
        <button
          type="button"
          onClick={onToggleLanguage}
          title={t('sellerPortal.topbar.switchLang')}
          aria-label={t('sellerPortal.topbar.switchLang')}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isEn ? 'EN' : 'VI'}</span>
        </button>

        {/* Theme Toggle (when allowed by Admin) */}
        {allowDarkMode && (
          <button
            type="button"
            onClick={onToggleTheme}
            title={isDarkMode ? t('sellerPortal.topbar.switchToLight') : t('sellerPortal.topbar.switchToDark')}
            aria-label={isDarkMode ? t('sellerPortal.topbar.switchToLight') : t('sellerPortal.topbar.switchToDark')}
            className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
          </button>
        )}

        {/* Back to Marketplace */}
        <button
          type="button"
          onClick={onNavigateMarketplace}
          title={t('sellerPortal.topbar.backToMall')}
          className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden xl:inline">{t('sellerPortal.topbar.backToMall')}</span>
        </button>

        {/* Logout */}
        <button
          type="button"
          onClick={onLogout}
          title={t('sellerPortal.topbar.logout')}
          aria-label={t('sellerPortal.topbar.logout')}
          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};
