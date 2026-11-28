import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, AlertCircle, Store } from 'lucide-react';
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

function getAuthTokenSafe(): string {
  try {
    return localStorage.getItem('pine_auth_token') || sessionStorage.getItem('pine_auth_token') || '';
  } catch {
    return '';
  }
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
  const currentUserId = currentUser?.id ? String(currentUser.id) : '';

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
    loading: Boolean(currentUserId),
    hasSeller: false,
    seller: null,
    subRole: 'OWNER',
    stats: null,
    unresolvedDisputeCount: 0,
    sepaySummary: null,
  });
  const [bootstrapError, setBootstrapError] = useState<string>('');
  const [bootstrapVersion, setBootstrapVersion] = useState<number>(0);
  const bootstrapAbortRef = useRef<AbortController | null>(null);

  const effectiveDarkMode = portalConfig.allow_dark_mode ? isDarkMode : false;
  const palette = useMemo(
    () => getSellerPortalPalette(portalConfig.theme_preset),
    [portalConfig.theme_preset]
  );

  // Sync Tailwind dark class & <meta name="color-scheme">
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

  // Single-Source Bootstrap: Gọi duy nhất 1 lần GET /api/seller theo currentUserId
  // Triệt tiêu 100% vòng lặp Mount-Unmount giữa SellerOnboardingLanding và Workspace!
  const fetchPortalBootstrap = useCallback(async (silent = false) => {
    if (!currentUserId) {
      setSellerSnapshot({
        loading: false,
        hasSeller: false,
        seller: null,
        subRole: 'OWNER',
        stats: null,
        unresolvedDisputeCount: 0,
        sepaySummary: null,
      });
      setBootstrapError('');
      return;
    }

    if (bootstrapAbortRef.current) {
      bootstrapAbortRef.current.abort();
    }
    const ctrl = new AbortController();
    bootstrapAbortRef.current = ctrl;
    const timeoutId = setTimeout(() => ctrl.abort(), 10000);

    if (!silent) {
      setSellerSnapshot((prev) => ({ ...prev, loading: true }));
    }
    setBootstrapError('');

    try {
      const token = getAuthTokenSafe();
      const res = await fetch('/api/seller', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: ctrl.signal,
      });
      const data: any = await res.json().catch(() => ({}));
      if (ctrl.signal.aborted) return;

      if (res.ok && data?.success) {
        const nextPortalCfg: SellerPortalConfigData | undefined = data.portal_config
          ? {
              theme_preset: data.portal_config.theme_preset || 'shopee_orange',
              allow_dark_mode: data.portal_config.allow_dark_mode !== false,
              banner_vi: data.portal_config.banner_vi || '',
              banner_en: data.portal_config.banner_en || '',
            }
          : undefined;
        if (nextPortalCfg) {
          setPortalConfig(nextPortalCfg);
        }

        if (data.has_seller && data.seller) {
          const resolvedRole = normalizeSellerSubRole(data.sub_role || 'OWNER');
          setSellerSnapshot((prev) => ({
            loading: false,
            hasSeller: true,
            seller: data.seller,
            subRole: resolvedRole,
            stats: data.stats || null,
            unresolvedDisputeCount: prev.unresolvedDisputeCount,
            sepaySummary: data.sepay_summary || null,
            portalConfig: nextPortalCfg,
          }));
        } else {
          setSellerSnapshot({
            loading: false,
            hasSeller: false,
            seller: null,
            subRole: 'OWNER',
            stats: null,
            unresolvedDisputeCount: 0,
            sepaySummary: null,
            portalConfig: nextPortalCfg,
          });
        }
      } else if (res.status === 404) {
        // Thành viên đã đăng nhập nhưng chưa mở gian hàng -> hiển thị trang đăng ký mở gian hàng
        setSellerSnapshot({
          loading: false,
          hasSeller: false,
          seller: null,
          subRole: 'OWNER',
          stats: null,
          unresolvedDisputeCount: 0,
          sepaySummary: null,
        });
      } else if (res.status === 401) {
        setSellerSnapshot({
          loading: false,
          hasSeller: false,
          seller: null,
          subRole: 'OWNER',
          stats: null,
          unresolvedDisputeCount: 0,
          sepaySummary: null,
        });
        setBootstrapError(
          isEn
            ? 'Your login session has expired. Please sign in again.'
            : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
        );
      } else {
        setSellerSnapshot((prev) => ({ ...prev, loading: false }));
        setBootstrapError(
          data?.error ||
            (isEn ? 'Unable to load store information. Please retry.' : 'Không thể tải thông tin gian hàng. Vui lòng thử lại.')
        );
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setSellerSnapshot((prev) => ({ ...prev, loading: false }));
      setBootstrapError(
        isEn ? 'Network timeout while loading Seller Portal.' : 'Kết nối quá thời gian khi tải Kênh Người Bán.'
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }, [currentUserId, isEn]);

  useEffect(() => {
    fetchPortalBootstrap(false);
    return () => {
      if (bootstrapAbortRef.current) {
        bootstrapAbortRef.current.abort();
      }
    };
  }, [currentUserId, bootstrapVersion]);

  const handleRequestBootstrapRefresh = useCallback(() => {
    setBootstrapVersion((v) => v + 1);
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

  // Chỉ nhận cập nhật hợp lệ từ SellerCenterView, TUYỆT ĐỐI không cho phép xóa hasSeller khi đang loading
  const handleSellerContextLoaded = useCallback((snapshot: SellerPortalContextSnapshot) => {
    setSellerSnapshot((prev) => {
      if (snapshot.loading && !snapshot.hasSeller && prev.hasSeller) {
        return prev;
      }
      return {
        ...prev,
        ...snapshot,
        loading: false,
      };
    });
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
    Boolean(currentUserId) &&
    !sellerSnapshot.loading &&
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

  // 2. Đang khởi tạo trạng thái gian hàng (Single-Source Bootstrap) -> Skeleton Bàn Làm Việc gọn nhẹ, KHÔNG mount trùng SellerCenterView
  if (sellerSnapshot.loading) {
    return (
      <div
        className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex"
        style={{ ['--seller-accent' as any]: palette.primaryHex }}
      >
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex-col gap-4 animate-pulse">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl ${palette.accentBgClass} text-white flex items-center justify-center`}>
              <Store className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-2.5 w-20 bg-slate-100 dark:bg-slate-800/70 rounded" />
            </div>
          </div>
          <div className="space-y-2 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-9 w-full bg-slate-100 dark:bg-slate-800/70 rounded-xl" />
            ))}
          </div>
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between animate-pulse">
            <div className="h-5 w-44 bg-slate-200 dark:bg-slate-800 rounded-lg" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-800 rounded-lg" />
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-5 animate-pulse">
            <div className="h-12 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-7 w-32 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                </div>
              ))}
            </div>
            <div className="h-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
          </main>
        </div>
      </div>
    );
  }

  // 2.5. Lỗi kết nối hoặc hết phiên khi tải /api/seller -> Hiển thị nút Thử lại / Đăng nhập lại rõ ràng
  if (bootstrapError && !sellerSnapshot.hasSeller) {
    return (
      <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center shadow-lg space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-extrabold">{t('sellerPortal.brandTitle')}</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{bootstrapError}</p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleRequestBootstrapRefresh}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white ${palette.accentBgClass} hover:opacity-95 cursor-pointer`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isEn ? 'Retry' : 'Thử Lại'}</span>
            </button>
            <button
              type="button"
              onClick={onOpenLogin}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {isEn ? 'Sign In' : 'Đăng Nhập Lại'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Đã đăng nhập nhưng chưa mở gian hàng (hoặc chờ duyệt / bị từ chối)
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
            initialBootstrap={sellerSnapshot}
            controlledTab={activeTab}
            onControlledTabChange={handleSelectTab}
            onPortalContextChange={handleSellerContextLoaded}
          />
        }
      />
    );
  }

  // 4. Đã có gian hàng ACTIVE / TRIAL -> Bàn Làm Việc Toàn Màn Hình (Mount 1 lần duy nhất, 0 remount)
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

        <main className="flex-1 min-w-0 px-3 sm:px-5 py-4 overflow-x-clip">
          <SellerCenterView
            currentUser={currentUser}
            onOpenLogin={onOpenLogin}
            games={games as any}
            onNavigateHome={handleNavigateMarketplace}
            portalMode
            initialBootstrap={sellerSnapshot}
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
