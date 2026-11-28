import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { GameItem } from '../../types/game';
import { broadcastCrossTabEvent, subscribeCrossTabEvents } from '../../utils/crossTabSync';
import { SellerCenterView, type SellerPortalContextSnapshot } from './SellerCenterView';
import { SellerPortalSidebar } from './SellerPortalSidebar';
import { SellerPortalTopbar, type SellerSepayTopbarSummary } from './SellerPortalTopbar';
import { SellerOnboardingLanding } from './SellerOnboardingLanding';
import {
  DEFAULT_SELLER_PORTAL_CONFIG,
  type SellerPortalConfigData,
  type SellerPortalTabId,
  type SellerSubRole,
  getSellerPortalPalette,
  isSellerTabAllowedForRole,
  normalizeSellerSubRole,
  parseSellerPortalHash,
  formatSellerPortalHash,
} from './sellerPortalTheme';

interface SellerPortalAppProps {
  currentUser: any;
  games: GameItem[];
  onOpenLogin: () => void;
  onOpenWallet: () => void;
  onLogout: () => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

const SIDEBAR_COLLAPSE_KEY = 'wcg_seller_portal_sidebar_collapsed';
const THEME_STORAGE_KEY = 'wcg_shopee_theme';

function syncDocumentColorScheme(isDark: boolean) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (isDark) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
  let meta = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    document.head.appendChild(meta);
  }
  meta.content = isDark ? 'dark' : 'light';
}

export const SellerPortalApp: React.FC<SellerPortalAppProps> = ({
  currentUser,
  games,
  onOpenLogin,
  onOpenWallet,
  onLogout,
  onShowToast,
}) => {
  const { t, language, setLanguage } = useLanguage();
  const isEn = language === 'en';

  const [activeTab, setActiveTab] = useState<SellerPortalTabId>(() => {
    if (typeof window !== 'undefined') {
      return parseSellerPortalHash(window.location.hash);
    }
    return 'dashboard';
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  const [portalConfig, setPortalConfig] = useState<SellerPortalConfigData>(DEFAULT_SELLER_PORTAL_CONFIG);
  const [highlights, setHighlights] = useState({
    direct_sepay_global_enabled: true,
    direct_sepay_fee_pct: 0,
    affiliate_enabled: true,
    hold_hours: 168,
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return false;
    } catch {
      return false;
    }
  });

  const [sellerSnapshot, setSellerSnapshot] = useState<SellerPortalContextSnapshot>({
    loading: Boolean(currentUser),
    hasSeller: false,
    seller: null,
    subRole: 'OWNER',
    stats: null,
    unresolvedDisputeCount: 0,
    sepaySummary: null,
  });

  const effectiveDarkMode = portalConfig.allow_dark_mode ? isDarkMode : false;
  const palette = useMemo(
    () => getSellerPortalPalette(portalConfig.theme_preset),
    [portalConfig.theme_preset]
  );

  // Sync Tailwind dark class & <meta name="color-scheme"> (modern-web-guidance: dark-mode-toggle)
  useEffect(() => {
    syncDocumentColorScheme(effectiveDarkMode);
  }, [effectiveDarkMode]);

  // Listen to cross-tab theme updates via BroadcastChannel & storage
  useEffect(() => {
    return subscribeCrossTabEvents((ev) => {
      if (ev.type === 'THEME_UPDATED' && ev.theme) {
        setIsDarkMode(ev.theme === 'dark');
      }
    });
  }, []);

  // Load public portal theme & highlights even before login
  useEffect(() => {
    let active = true;
    fetch('/api/seller/portal-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.success) return;
        if (data.portal_config) {
          setPortalConfig({
            theme_preset: data.portal_config.theme_preset || 'shopee_orange',
            allow_dark_mode: data.portal_config.allow_dark_mode !== false,
            banner_vi: data.portal_config.banner_vi || '',
            banner_en: data.portal_config.banner_en || '',
          });
        }
        if (data.highlights) {
          setHighlights((prev) => ({ ...prev, ...data.highlights }));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Normalize URL pathname to /seller or /en/seller and preserve #/hash
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const expectedPath = isEn ? '/en/seller' : '/seller';
    const currentHash = window.location.hash || formatSellerPortalHash(activeTab);
    if (window.location.pathname !== expectedPath) {
      window.history.replaceState(null, '', `${expectedPath}${currentHash}`);
    }
    document.title = t('sellerPortal.pageTitle');
  }, [isEn, activeTab, t]);

  // Listen to browser hashchange (back/forward or bookmark)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      const requested = parseSellerPortalHash(window.location.hash);
      const role: SellerSubRole = normalizeSellerSubRole(sellerSnapshot.subRole);
      if (sellerSnapshot.hasSeller && !isSellerTabAllowedForRole(requested, role)) {
        setActiveTab('dashboard');
        window.history.replaceState(null, '', `${window.location.pathname}#/dashboard`);
        onShowToast(
          t('sellerPortal.rbac.deniedTitle'),
          t('sellerPortal.rbac.deniedDesc'),
          'info'
        );
        return;
      }
      setActiveTab(requested);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [sellerSnapshot.hasSeller, sellerSnapshot.subRole, onShowToast, t]);

  // Enforce RBAC if sellerSnapshot loads with a restricted sub_role while on a sensitive hash
  useEffect(() => {
    if (!sellerSnapshot.hasSeller) return;
    const role = normalizeSellerSubRole(sellerSnapshot.subRole);
    if (!isSellerTabAllowedForRole(activeTab, role)) {
      setActiveTab('dashboard');
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `${window.location.pathname}#/dashboard`);
      }
    }
  }, [sellerSnapshot.hasSeller, sellerSnapshot.subRole, activeTab]);

  const handleSelectTab = useCallback(
    (tab: SellerPortalTabId) => {
      const role = normalizeSellerSubRole(sellerSnapshot.subRole);
      if (sellerSnapshot.hasSeller && !isSellerTabAllowedForRole(tab, role)) {
        onShowToast(
          t('sellerPortal.rbac.deniedTitle'),
          t('sellerPortal.rbac.deniedDesc'),
          'info'
        );
        return;
      }
      setActiveTab(tab);
      if (typeof window !== 'undefined') {
        const nextHash = formatSellerPortalHash(tab);
        if (window.location.hash !== nextHash) {
          window.history.pushState(null, '', `${window.location.pathname}${nextHash}`);
        }
      }
    },
    [sellerSnapshot.hasSeller, sellerSnapshot.subRole, onShowToast, t]
  );

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  }, []);

  const handleToggleTheme = useCallback(() => {
    if (!portalConfig.allow_dark_mode) return;
    setIsDarkMode((prev) => {
      const next = !prev;
      const str = next ? 'dark' : 'light';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, str);
      } catch {}
      broadcastCrossTabEvent('THEME_UPDATED', { theme: str });
      return next;
    });
  }, [portalConfig.allow_dark_mode]);

  const handleToggleLanguage = useCallback(() => {
    const nextLang = isEn ? 'vi' : 'en';
    setLanguage(nextLang);
    if (typeof window !== 'undefined') {
      const nextPath = nextLang === 'en' ? '/en/seller' : '/seller';
      const curHash = window.location.hash || formatSellerPortalHash(activeTab);
      window.history.replaceState(null, '', `${nextPath}${curHash}`);
    }
  }, [isEn, setLanguage, activeTab]);

  const handleNavigateMarketplace = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.location.href = isEn ? '/en/' : '/';
  }, [isEn]);

  const handleSellerContextLoaded = useCallback((snapshot: SellerPortalContextSnapshot) => {
    setSellerSnapshot(snapshot);
    if (snapshot.portalConfig) {
      setPortalConfig({
        theme_preset: snapshot.portalConfig.theme_preset || 'shopee_orange',
        allow_dark_mode: snapshot.portalConfig.allow_dark_mode !== false,
        banner_vi: snapshot.portalConfig.banner_vi || '',
        banner_en: snapshot.portalConfig.banner_en || '',
      });
    }
  }, []);

  const activeBanner = isEn
    ? (portalConfig.banner_en || portalConfig.banner_vi || '').trim()
    : (portalConfig.banner_vi || portalConfig.banner_en || '').trim();

  const isApprovedWorkspace =
    Boolean(currentUser) &&
    sellerSnapshot.hasSeller &&
    sellerSnapshot.seller &&
    sellerSnapshot.seller.status !== 'PENDING' &&
    sellerSnapshot.seller.status !== 'REJECTED';

  // 1. Chưa đăng nhập -> Hiển thị Landing Mở Gian Hàng sạch đẹp ngay trong /seller
  if (!currentUser) {
    return (
      <SellerOnboardingLanding
        currentUser={null}
        palette={palette}
        highlights={highlights}
        bannerText={activeBanner}
        isDarkMode={effectiveDarkMode}
        allowDarkMode={portalConfig.allow_dark_mode}
        onToggleTheme={handleToggleTheme}
        onToggleLanguage={handleToggleLanguage}
        onOpenLogin={onOpenLogin}
        onNavigateMarketplace={handleNavigateMarketplace}
      />
    );
  }

  // 2. Đã đăng nhập nhưng chưa mở gian hàng (hoặc đang tải lần đầu / chờ duyệt / bị từ chối)
  if (!isApprovedWorkspace) {
    return (
      <SellerOnboardingLanding
        currentUser={currentUser}
        palette={palette}
        highlights={highlights}
        bannerText={activeBanner}
        isDarkMode={effectiveDarkMode}
        allowDarkMode={portalConfig.allow_dark_mode}
        onToggleTheme={handleToggleTheme}
        onToggleLanguage={handleToggleLanguage}
        onOpenLogin={onOpenLogin}
        onNavigateMarketplace={handleNavigateMarketplace}
        registrationSlot={
          <SellerCenterView
            currentUser={currentUser}
            onOpenLogin={onOpenLogin}
            games={games as any}
            onNavigateHome={handleNavigateMarketplace}
            portalMode
            controlledTab={activeTab}
            onControlledTabChange={handleSelectTab}
            onPortalContextChange={handleSellerContextLoaded}
          />
        }
      />
    );
  }

  // 3. Đã có gian hàng ACTIVE / TRIAL -> Bàn Làm Việc Toàn Màn Hình (Sidebar RBAC + Topbar Shop)
  const subRole = normalizeSellerSubRole(sellerSnapshot.subRole);
  const sepaySummary: SellerSepayTopbarSummary | null = sellerSnapshot.sepaySummary || null;

  return (
    <div
      className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex"
      style={{ ['--seller-accent' as any]: palette.primaryHex }}
    >
      <SellerPortalSidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        subRole={subRole}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        palette={palette}
        storeName={sellerSnapshot.seller?.name}
        badges={{
          lowStockCount: Number(sellerSnapshot.stats?.low_stock_products_count || 0),
          reportedOrdersCount: Number(sellerSnapshot.stats?.reported_orders_count || 0),
          unresolvedDisputesCount: Number(sellerSnapshot.unresolvedDisputeCount || 0),
          sepayOpenExceptions: Number(sepaySummary?.open_exceptions || 0),
          sepayOnline: Boolean(sepaySummary?.is_enabled && !sepaySummary?.admin_locked),
          sepayLocked: Boolean(sepaySummary?.admin_locked),
        }}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <SellerPortalTopbar
          seller={sellerSnapshot.seller}
          currentUser={currentUser}
          subRole={subRole}
          sepaySummary={sepaySummary}
          palette={palette}
          isDarkMode={effectiveDarkMode}
          allowDarkMode={portalConfig.allow_dark_mode}
          onToggleTheme={handleToggleTheme}
          onToggleLanguage={handleToggleLanguage}
          onOpenMobileMenu={() => setMobileSidebarOpen(true)}
          onOpenWallet={onOpenWallet}
          onSelectTab={handleSelectTab}
          onNavigateMarketplace={handleNavigateMarketplace}
          onLogout={onLogout}
        />

        {activeBanner && (
          <div className={`px-4 py-1.5 text-center text-xs font-semibold text-white ${palette.accentBgClass}`}>
            {activeBanner}
          </div>
        )}

        <main className="flex-1 min-w-0 px-3 sm:px-5 py-4 overflow-x-hidden">
          <SellerCenterView
            currentUser={currentUser}
            onOpenLogin={onOpenLogin}
            games={games as any}
            onNavigateHome={handleNavigateMarketplace}
            portalMode
            controlledTab={activeTab}
            onControlledTabChange={handleSelectTab}
            onPortalContextChange={handleSellerContextLoaded}
          />
        </main>
      </div>
    </div>
  );
};

export default SellerPortalApp;
