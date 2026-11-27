import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { resolveProductCoverImage, safeGameIconUrl } from './utils/safeImageUrl';
import { CyberLoader } from './components/CyberLoader';
import { ToastContainer, type ToastMessage } from './components/Toast';
import { LanguageSeoHead } from './components/seo/LanguageSeoHead';
import { useLanguage } from './context/LanguageContext';
import { homepageSectionsService } from './services/homepageSectionsService';
import type { MallSubView } from './components/mall/UniversalMallView';

// P4: Code Splitting & Lazy Loaded Views / Modals with auto-recovery on stale deployment chunks
const FloatingAnnouncement = lazyWithRetry(() => import('./components/FloatingAnnouncement').then((m) => ({ default: m.FloatingAnnouncement })));
const MarketingNotificationToast = lazyWithRetry(() => import('./components/MarketingNotificationToast').then((m) => ({ default: m.MarketingNotificationToast })));
const AdminApp = lazyWithRetry(() => import('./admin/AdminApp'));
const UniversalMallView = lazyWithRetry(() => import('./components/mall/UniversalMallView').then((m) => ({ default: m.UniversalMallView })));
const SubmitCodeModal = lazyWithRetry(() => import('./components/SubmitCodeModal').then((m) => ({ default: m.SubmitCodeModal })));
const BookmarkDrawer = lazyWithRetry(() => import('./components/BookmarkDrawer').then((m) => ({ default: m.BookmarkDrawer })));
const AllUpcomingGamesModal = lazyWithRetry(() => import('./components/AllUpcomingGamesModal').then((m) => ({ default: m.AllUpcomingGamesModal })));
const CodePlaygroundModal = lazyWithRetry(() => import('./components/CodePlaygroundModal').then((m) => ({ default: m.CodePlaygroundModal })));
const GrowthCenterModal = lazyWithRetry(() => import('./components/GrowthCenterModal').then((m) => ({ default: m.GrowthCenterModal })));
const ShareModal = lazyWithRetry(() => import('./components/ShareModal').then((m) => ({ default: m.ShareModal })));
const ProductDetailModal = lazyWithRetry(() => import('./components/ProductDetailModal').then((m) => ({ default: m.ProductDetailModal })));
const ProductCheckoutModal = lazyWithRetry(() => import('./components/ProductCheckoutModal').then((m) => ({ default: m.ProductCheckoutModal })));
const AuthModal = lazyWithRetry(() => import('./components/AuthModal').then((m) => ({ default: m.AuthModal })));
const UserWalletModal = lazyWithRetry(() => import('./components/UserWalletModal').then((m) => ({ default: m.UserWalletModal })));
const MyReceivedCodesModal = lazyWithRetry(() => import('./components/MyReceivedCodesModal').then((m) => ({ default: m.MyReceivedCodesModal })));
const UserProfileModal = lazyWithRetry(() => import('./components/UserProfileModal').then((m) => ({ default: m.UserProfileModal })));
const DownloadAppModal = lazyWithRetry(() => import('./components/DownloadAppModal').then((m) => ({ default: m.DownloadAppModal })));
const EmailSubscriptionModal = lazyWithRetry(() => import('./components/notification/EmailSubscriptionModal').then((m) => ({ default: m.EmailSubscriptionModal })));
const CartDrawerModal = lazyWithRetry(() => import('./components/cart/CartDrawerModal').then((m) => ({ default: m.CartDrawerModal })));
const WishlistDrawerModal = lazyWithRetry(() => import('./components/wishlist/WishlistDrawerModal').then((m) => ({ default: m.WishlistDrawerModal })));
import { dataService } from './services/dataService';
import { authService } from './services/authService';
import type { GameItem, StoreProduct, UserProfile, GiveawayCampaign, UtilityProduct, ProductPackageVariant, UpcomingGame } from './types/game';
import { groupStoreProductsByGame, getProductPackages } from './utils/productPackageUtils';

export interface SharePayload {
  title: string;
  subtitle?: string;
  shareUrl: string;
  itemType: 'game' | 'giveaway' | 'product' | 'utility';
  imageUrl?: string;
  badge?: string;
}

const ADMIN_HASH_PREFIXES = [
  '#/admin',
  '#/dashboard',
  '#/games',
  '#/news',
  '#/free-codes',
  '#/giftcodes',
  '#/crawler',
  '#/marketing',
  '#/floating-notification',
  '#/growth',
  '#/members',
  '#/wallet',
  '#/private-codes',
  '#/code-inventory',
  '#/utilities',
  '#/orders',
  '#/sepay',
  '#/content',
  '#/security-logs',
  '#/profile',
];

const resolveRouteToMallSubView = (pathnameInput: string, hashInput: string): MallSubView => {
  const path = pathnameInput.toLowerCase();
  const hash = hashInput.toLowerCase();

  if (
    hash.includes('giai-phap-san') || hash.includes('ban-web') || hash.includes('cho-thue-web') || hash.includes('platform-solutions') ||
    path === '/giai-phap-san' || path.startsWith('/giai-phap-san/') ||
    path === '/ban-web' || path.startsWith('/ban-web/') ||
    path === '/cho-thue-web' || path.startsWith('/cho-thue-web/')
  ) return 'platform-solutions';

  if (hash.includes('ban-hang') || path === '/ban-hang' || path.startsWith('/ban-hang/') || path === '/en/ban-hang' || path.startsWith('/en/ban-hang/')) return 'seller';
  if (hash.includes('gian-hang') || path.startsWith('/gian-hang/')) return 'store-detail';
  if (hash.includes('ma-hom-nay') || hash.includes('today') || path === '/ma-hom-nay' || path.startsWith('/ma-hom-nay/')) return 'today-codes';
  if (hash.includes('su-kien') || hash.includes('events') || path === '/su-kien' || path.startsWith('/su-kien/') || path === '/events' || path.startsWith('/events/')) return 'events';
  if (hash.includes('news') || hash.includes('tintuc') || path === '/news' || path.startsWith('/news/')) return 'news';
  if (hash.includes('giveaways') || hash.includes('gw=') || hash.includes('giveaway=') || path === '/giveaways' || path.startsWith('/giveaways/') || path === '/giveaway' || path.startsWith('/giveaway/')) return 'giveaways';
  if (hash.includes('store') || hash.includes('product=') || hash.includes('prod=') || path === '/store' || path.startsWith('/store/') || path === '/en/store' || path.startsWith('/en/store/')) return 'store';
  if (hash.includes('utilities') || hash.includes('utility=') || hash.includes('ut=') || path === '/utilities' || path.startsWith('/utilities/')) return 'utilities';
  if (hash.includes('missions') || hash.includes('nhiem-vu') || path === '/missions' || path.startsWith('/missions/') || path === '/nhiem-vu' || path.startsWith('/nhiem-vu/')) return 'missions';
  if (hash.includes('telegram') || path === '/telegram' || path.startsWith('/telegram/')) return 'telegram';

  return 'home';
};

export const App: React.FC = () => {
  const { language, t } = useLanguage();
  const isEn = language === 'en' || (typeof window !== 'undefined' && (window.location.pathname.startsWith('/en') || localStorage.getItem('pine_language') === 'en'));

  // Navigation Tab State (Unified Admin vs Single Universal Mall Client Shell)
  const [currentTab, setCurrentTab] = useState<'admin' | 'mall'>(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      const path = window.location.pathname.toLowerCase();

      const isAdminDomain = host.includes('admin-universal-mall') || host.includes('admin-code-game-shop') || host.includes('admin-test-code-game-shop') || host.startsWith('admin.');
      const isAdminHash = ADMIN_HASH_PREFIXES.some((p) => hash.startsWith(p));
      const isAdminPath = path.startsWith('/admin') || path.startsWith('/en/admin');
      if (isAdminDomain || isAdminPath || isAdminHash) {
        return 'admin';
      }
      return 'mall';
    }
    return 'mall';
  });

  const [mallSubView, setMallSubView] = useState<MallSubView>(() => {
    if (typeof window !== 'undefined') {
      return resolveRouteToMallSubView(window.location.pathname, window.location.hash);
    }
    return 'home';
  });

  const [storeCategoryFilter, setStoreCategoryFilter] = useState<string>('all');

  const [currentStoreSlug, setCurrentStoreSlug] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (path.startsWith('/gian-hang/')) {
        return path.replace(/^\/gian-hang\//i, '').replace(/\/$/, '').trim();
      }
    }
    return '';
  });

  const [initialNewsSlug, setInitialNewsSlug] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const hash = window.location.hash;
      const matchPath = path.match(/^\/news\/([^/?#]+)/i);
      if (matchPath) return decodeURIComponent(matchPath[1]);
      const matchHash = hash.match(/(?:#\/news\/|#news\/|news=)([^/?#&]+)/i);
      if (matchHash) return decodeURIComponent(matchHash[1]);
    }
    return null;
  });
  const [initialGiveawayId, setInitialGiveawayId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const hash = window.location.hash;
      const urlParams = new URLSearchParams(window.location.search);
      const gwParam = urlParams.get('gw') || urlParams.get('giveaway');
      if (gwParam) return decodeURIComponent(gwParam);
      const matchPath = path.match(/^\/(?:giveaways|giveaway)\/([^/?#]+)/i);
      if (matchPath) return decodeURIComponent(matchPath[1]);
      const matchHash = hash.match(/(?:#\/giveaways\/|#giveaways\/|gw=)([^/?#&]+)/i);
      if (matchHash) return decodeURIComponent(matchHash[1]);
    }
    return null;
  });
  const [initialMissionId, setInitialMissionId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const hash = window.location.hash;
      const matchPath = path.match(/\/(?:nhiem-vu|missions)\/([^/?#]+)/);
      if (matchPath) return decodeURIComponent(matchPath[1]);
      const matchHash = hash.match(/(?:#\/nhiem-vu\/|#\/missions\/|ms=)([^/?#&]+)/);
      if (matchHash) return decodeURIComponent(matchHash[1]);
    }
    return null;
  });

  // Games list & CMS branding synced from dataService
  const [allGamesList, setAllGamesList] = useState<GameItem[]>([]);
  const [branding, setBranding] = useState(() => dataService.getWebsiteBranding());

  // Homepage sections state for floating notifications
  const [isFloatingEnabled, setIsFloatingEnabled] = useState(() =>
    homepageSectionsService.isSectionEnabled('floating_notification')
  );

  useEffect(() => {
    const unsub = homepageSectionsService.subscribe(() => {
      setIsFloatingEnabled(homepageSectionsService.isSectionEnabled('floating_notification'));
    });
    return unsub;
  }, []);
  // User State & Bookmarks
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => dataService.getCurrentUser());
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [bookmarkedGamesList, setBookmarkedGamesList] = useState<GameItem[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<UpcomingGame[]>(() => dataService.getUpcomingGamesSync());
  const [isAllUpcomingModalOpen, setIsAllUpcomingModalOpen] = useState(false);
  const [selectedUpcomingSlug, setSelectedUpcomingSlug] = useState<string | null>(null);

  // Modals & Drawers
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [selectedPackageIdParam, setSelectedPackageIdParam] = useState<string | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<StoreProduct | null>(null);
  const [checkoutPackage, setCheckoutPackage] = useState<ProductPackageVariant | null>(null);
  const [checkoutQuantity, setCheckoutQuantity] = useState<number>(1);
  const [selectedUtilityId, setSelectedUtilityId] = useState<string | null>(null);

  const [isBookmarkDrawerOpen, setIsBookmarkDrawerOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isPlaygroundModalOpen, setIsPlaygroundModalOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
  const [isGrowthCenterOpen, setIsGrowthCenterOpen] = useState(false);
  const [growthInitialTab, setGrowthInitialTab] = useState<'wheel' | 'welcome' | 'referral' | 'checkin' | 'leaderboard'>('wheel');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isReceivedCodesOpen, setIsReceivedCodesOpen] = useState(false);
  const [receivedCodesInitialTab, setReceivedCodesInitialTab] = useState<'giveaways' | 'orders' | 'privates' | 'missions' | 'marketplace'>('giveaways');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileInitialTab] = useState<'profile' | 'security' | 'telegram' | 'missions'>('profile');
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      return path === '/gio-hang' || path === '/cart' || hash === '#cart' || hash === '#gio-hang';
    }
    return false;
  });

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  const handleOpenReceivedCodes = (tab: 'giveaways' | 'orders' | 'privates' | 'missions' | 'marketplace' = 'giveaways') => {
    setReceivedCodesInitialTab(tab);
    setIsReceivedCodesOpen(true);
  };

  // Capture referral tracking parameters (?ref=... or ?invite=...) on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref') || params.get('invite');
      if (ref) {
        localStorage.setItem('pine_referrer_id', ref);
      }
    }
  }, []);

  // Theme & Toasts
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Initialize Theme (Unified Universal Mall Light default via wcg_shopee_theme)
  useEffect(() => {
    const saved =
      localStorage.getItem('wcg_shopee_theme') ||
      localStorage.getItem('pine_shopee_theme');
    const isDark = saved === 'dark';
    setIsDarkMode(isDark);
    const metaCs = document.querySelector('meta[name="color-scheme"]');
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
      if (metaCs) metaCs.setAttribute('content', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
      if (metaCs) metaCs.setAttribute('content', 'light');
    }
  }, []);

  const handleToggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      const metaCs = document.querySelector('meta[name="color-scheme"]');
      if (next) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.documentElement.style.colorScheme = 'dark';
        if (metaCs) metaCs.setAttribute('content', 'dark');
        localStorage.setItem('wcg_shopee_theme', 'dark');
        localStorage.setItem('pine_shopee_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.documentElement.style.colorScheme = 'light';
        if (metaCs) metaCs.setAttribute('content', 'light');
        localStorage.setItem('wcg_shopee_theme', 'light');
        localStorage.setItem('pine_shopee_theme', 'light');
      }
      return next;
    });
  };

  // Toast Helper
  const showToast = useCallback(
    (title: string, message?: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, title, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    },
    []
  );

  const handleUpdateUser = useCallback((usr: UserProfile) => {
    setCurrentUser((prev) => {
      if (!prev && !usr) return null;
      if (!prev && usr) return usr;
      if (prev && !usr) return null;
      if (prev && usr) {
        if (
          prev.wallet_balance !== usr.wallet_balance ||
          prev.id !== usr.id ||
          prev.role !== usr.role ||
          prev.displayName !== usr.displayName ||
          prev.avatar_url !== usr.avatar_url
        ) {
          return usr;
        }
        return prev;
      }
      return usr;
    });
  }, []);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Real-time listener for user state updates across components, tabs and storage events
  useEffect(() => {
    const handleUserUpdate = (e: any) => {
      const u = e?.detail !== undefined ? e.detail : dataService.getCurrentUser();
      if (u) {
        handleUpdateUser(u);
      } else {
        setCurrentUser(null);
      }
    };
    window.addEventListener('pine_user_updated', handleUserUpdate);
    return () => window.removeEventListener('pine_user_updated', handleUserUpdate);
  }, [handleUpdateUser]);

  // Global listener for floating toast events (from components/cards)
  useEffect(() => {
    const handleCustomToast = (e: any) => {
      const { title, message, type } = e.detail || {};
      if (title) {
        showToast(title, message, type || 'success');
      }
    };
    window.addEventListener('pine_show_toast', handleCustomToast);
    return () => window.removeEventListener('pine_show_toast', handleCustomToast);
  }, [showToast]);

  // Persistent Screen-Covering Splash Preloader Dismissal
  useEffect(() => {
    const dismissPreloader = () => {
      const preloader = document.getElementById('app-preloader');
      if (preloader) {
        preloader.style.opacity = '0';
        preloader.style.pointerEvents = 'none';
        setTimeout(() => {
          if (preloader.parentNode) {
            preloader.parentNode.removeChild(preloader);
          }
        }, 360);
      }
    };

    dismissPreloader();
    const rafId = requestAnimationFrame(dismissPreloader);
    const timeoutId = setTimeout(dismissPreloader, 150);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, []);

  // Initial Load & Deep Link Router
  useEffect(() => {
    const loadInitialData = async () => {
      // Check Hash / Search Params for Deep Linking (/g/:slug, /giveaways, /store, /admin, /#product=id, /#gw=id)
      const parseHash = async () => {
        const hash = window.location.hash;
        const hashLower = hash.toLowerCase();
        const host = window.location.hostname;
        const urlParams = new URLSearchParams(window.location.search);

        // 1. If on dedicated admin domain -> ALWAYS remain in admin app
        if (host.includes('admin-universal-mall') || host.includes('admin-code-game-shop') || host.includes('admin-test-code-game-shop') || host.startsWith('admin.')) {
          setCurrentTab('admin');
          return;
        }

        // 2. Admin routes on client domain or localhost
        const isAdminHash = ADMIN_HASH_PREFIXES.some((p) => hashLower.startsWith(p));
        const currentPath = window.location.pathname.toLowerCase();
        if (isAdminHash || currentPath.startsWith('/admin') || currentPath.startsWith('/en/admin')) {
          setCurrentTab('admin');
          return;
        }

        // 3. Deep link hashes / query params
        const pkgIdParam =
          urlParams.get('pkg') ||
          urlParams.get('package') ||
          urlParams.get('product') ||
          urlParams.get('prod') ||
          (hashLower.includes('pkg=') ? hash.split(/pkg=/i)[1]?.split('&')[0] : null) ||
          (hashLower.includes('package=') ? hash.split(/package=/i)[1]?.split('&')[0] : null) ||
          (hashLower.includes('product=') ? hash.split(/product=/i)[1]?.split('&')[0] : null) ||
          (hashLower.includes('prod=') ? hash.split(/prod=/i)[1]?.split('&')[0] : null);

        const gwId =
          urlParams.get('gw') ||
          urlParams.get('giveaway') ||
          (hashLower.includes('gw=') ? hash.split(/gw=/i)[1]?.split('&')[0] : null) ||
          (hashLower.includes('giveaway=') ? hash.split(/giveaway=/i)[1]?.split('&')[0] : null);

        const utilityId =
          urlParams.get('utility') ||
          urlParams.get('ut') ||
          (hashLower.includes('utility=') ? hash.split(/utility=/i)[1]?.split('&')[0] : null) ||
          (hashLower.includes('ut=') ? hash.split(/ut=/i)[1]?.split('&')[0] : null);

        if (pkgIdParam) {
          setCurrentTab('mall');
          setMallSubView('store');
          const storeProducts = dataService.getStoreProducts();
          const grouped = groupStoreProductsByGame(storeProducts);
          const found =
            grouped.find(
              (p) =>
                p.id === pkgIdParam ||
                p.id.toLowerCase() === pkgIdParam.toLowerCase() ||
                (p.packages && p.packages.some((pkg) => pkg.id.toLowerCase() === pkgIdParam.toLowerCase()))
            ) ||
            storeProducts.find((p) => p.id === pkgIdParam || p.id.toLowerCase() === pkgIdParam.toLowerCase());
          if (found) {
            setSelectedProduct(found);
            const allPkgs = getProductPackages(found);
            const pkgExists = allPkgs.some((pkg) => pkg.id.toLowerCase() === pkgIdParam.toLowerCase());
            if (pkgExists) {
              setSelectedPackageIdParam(pkgIdParam);
            } else {
              setSelectedPackageIdParam(null);
              showToast('Thông báo', 'Gói này không còn nữa hoặc đã ngừng bán.', 'info');
            }
            return;
          } else {
            showToast('Thông báo', 'Không tìm thấy gói hoặc sản phẩm được yêu cầu.', 'info');
            return;
          }
        } else if (utilityId) {
          setCurrentTab('mall');
          setMallSubView('utilities');
          setSelectedUtilityId(utilityId);
          return;
        } else if (gwId) {
          setCurrentTab('mall');
          setMallSubView('giveaways');
          setInitialGiveawayId(gwId);
          return;
        } else if (urlParams.get('g') || urlParams.get('game') || hashLower.includes('game=') || hashLower.includes('g=')) {
          window.history.replaceState(null, '', isEn ? '/en/' : '/');
          setCurrentTab('mall');
          setMallSubView('home');
          return;
        }

        // 4. Pathname & Hash Routes unified via resolveRouteToMallSubView
        const pathname = window.location.pathname.toLowerCase();
        const resolvedSub = resolveRouteToMallSubView(pathname, hashLower);
        const isRootOrLang = pathname === '/' || pathname === '' || pathname === '/en' || pathname === '/en/' || pathname === '/vi' || pathname === '/vi/' || pathname === '/gio-hang' || pathname === '/cart';
        if (
          pathname.startsWith('/game/') ||
          pathname.startsWith('/g/') ||
          hashLower === '#catalog' ||
          hashLower.startsWith('#catalog') ||
          (resolvedSub === 'home' && !isRootOrLang)
        ) {
          window.history.replaceState(null, '', isEn ? '/en/' : '/');
          setCurrentTab('mall');
          setMallSubView('home');
          return;
        }

        setCurrentTab('mall');
        setMallSubView(resolvedSub);

        if (resolvedSub === 'news') {
          const nSlug = pathname.startsWith('/news/')
            ? window.location.pathname.replace(/^\/news\//i, '').replace(/\/$/, '').trim()
            : hash.includes('news/')
            ? hash.split(/news\//i)[1]?.split('&')[0]
            : null;
          if (nSlug) setInitialNewsSlug(nSlug);
        } else if (resolvedSub === 'giveaways') {
          const pGwId = pathname.startsWith('/giveaway')
            ? window.location.pathname.replace(/^\/(?:giveaways|giveaway)\/?/i, '').split('/')[0].trim()
            : hash.includes('gw=')
            ? hash.split(/gw=/i)[1]?.split('&')[0]
            : null;
          if (pGwId) setInitialGiveawayId(pGwId);
        } else if (resolvedSub === 'missions') {
          const mId = window.location.pathname.replace(/^\/(?:nhiem-vu|missions)\/?/i, '').split('/')[0].trim();
          if (mId) setInitialMissionId(mId);
        } else if (resolvedSub === 'store-detail' && pathname.startsWith('/gian-hang/')) {
          const sSlug = window.location.pathname.replace(/^\/gian-hang\//i, '').replace(/\/$/, '').trim();
          setCurrentStoreSlug(sSlug);
        }
      };

      await parseHash();
      setIsInitialLoadDone(true);

      const bmarks = dataService.getBookmarks();
      setBookmarks(bmarks);
      dataService.getBookmarkedGames(bmarks).then((bList) => setBookmarkedGamesList(bList));
      dataService.getUpcomingGames().then((uList) => {
        if (uList && uList.length > 0) setUpcomingGames(uList);
      });
      dataService.syncBrandingAndContentOnly().then(() => {
        setBranding(dataService.getWebsiteBranding());
      });

      const pCfg = dataService.getPaginationConfig();
      const res = await dataService.queryGames(
        { search: '', category: 'all', tag: 'all', sortBy: 'release_date', sortOrder: 'desc' },
        1,
        Math.max(pCfg.pageSize || 24, 100),
        bmarks
      );
      setAllGamesList(res.items);
    };
    loadInitialData();

    // Listen to cross-origin snapshot messages from admin panel (strictly origin-checked)
    const ALLOWED_ADMIN_ORIGINS = [
      window.location.origin,
      'https://admin-universal-mall.pages.dev',
      'https://admin-universal-mall.pages.dev',
      'https://admin-universal-mall.pages.dev',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:8788',
      'http://127.0.0.1:5173',
    ];

    const handleCrossMessage = (event: MessageEvent) => {
      if (!ALLOWED_ADMIN_ORIGINS.includes(event.origin)) {
        return;
      }
      if (event.data?.type === 'WCG_TRANSFER_FULL_STATE' && event.data.payload) {
        dataService.applyFullStateSnapshot(event.data.payload);
        showToast('Đã đồng bộ tức thì toàn bộ dữ liệu từ Admin!', undefined, 'success');
      }
    };
    window.addEventListener('message', handleCrossMessage);

    return () => {
      window.removeEventListener('message', handleCrossMessage);
    };
  }, []);

  // Unified Single-Click Mall SubView Switcher (History pushState routing)
  const getPathForMallSubView = useCallback((sub: MallSubView, storeSlugOverride?: string): string => {
    const isEnMode = language === 'en' || (typeof window !== 'undefined' && window.location.pathname.startsWith('/en'));
    switch (sub) {
      case 'home':
        return isEnMode ? '/en/' : '/';
      case 'store':
        return isEnMode ? '/en/store' : '/store';
      case 'seller':
        return isEnMode ? '/en/ban-hang' : '/ban-hang';
      case 'store-detail':
        return `/gian-hang/${storeSlugOverride || currentStoreSlug}`;
      case 'missions':
        return '/nhiem-vu';
      case 'today-codes':
        return '/ma-hom-nay';
      case 'events':
        return '/su-kien';
      case 'platform-solutions':
        return '/giai-phap-san';
      case 'news':
      case 'giveaways':
      case 'utilities':
      case 'telegram':
        return `/${sub}`;
      default:
        return isEnMode ? '/en/' : '/';
    }
  }, [currentStoreSlug, language]);

  const handleSelectMallView = useCallback((
    sub: MallSubView,
    extra?: { storeSlug?: string; newsSlug?: string | null; utilityId?: string | null; giveawayId?: string | null; missionId?: string | null }
  ) => {
    setSelectedProduct(null);
    if (extra?.storeSlug !== undefined) setCurrentStoreSlug(extra.storeSlug);
    if (extra?.newsSlug !== undefined) setInitialNewsSlug(extra.newsSlug);
    if (extra?.utilityId !== undefined) setSelectedUtilityId(extra.utilityId);
    else setSelectedUtilityId(null);
    if (extra?.giveawayId !== undefined) setInitialGiveawayId(extra.giveawayId);
    if (extra?.missionId !== undefined) setInitialMissionId(extra.missionId);

    setCurrentTab('mall');
    setMallSubView(sub);

    const targetPath = getPathForMallSubView(sub, extra?.storeSlug);
    if (window.location.pathname !== targetPath || window.location.hash) {
      window.history.pushState(null, '', targetPath);
    }
  }, [getPathForMallSubView]);

  const handleFilterStoreByGame = useCallback((slug: string) => {
    setStoreCategoryFilter(slug || 'all');
    setCurrentTab('mall');
    setMallSubView('store');
    const isEnMode = language === 'en' || (typeof window !== 'undefined' && window.location.pathname.startsWith('/en'));
    const targetPath = isEnMode ? '/en/store' : '/store';
    if (window.location.pathname !== targetPath || window.location.hash) {
      window.history.pushState(null, '', targetPath);
    }
  }, [language]);

  const mapLegacyTabToMallSubView = (tab: string): MallSubView => {
    switch (tab) {
      case 'seller-center':
        return 'seller';
      case 'catalog':
      case 'shopee-test':
      case 'home':
        return 'home';
      case 'news':
      case 'events':
      case 'today-codes':
      case 'store':
      case 'store-detail':
      case 'giveaways':
      case 'utilities':
      case 'missions':
      case 'telegram':
      case 'platform-solutions':
        return tab;
      default:
        return 'home';
    }
  };

  // Sync Dynamic Document Title & Clean URL bar
  useEffect(() => {
    if (currentTab === 'admin') return;
    if (!isInitialLoadDone) return;

    const isEnMode = language === 'en' || (typeof window !== 'undefined' && window.location.pathname.startsWith('/en'));

    if (mallSubView === 'news' || mallSubView === 'events' || mallSubView === 'today-codes') {
      const path = window.location.pathname.toLowerCase();
      if (window.location.pathname.startsWith('/news/') && window.location.pathname.length > 6) {
        // Preserve /news/<slug> in address bar
      } else if (mallSubView === 'today-codes') {
        document.title = 'Giftcode Hôm Nay - Tổng Hợp Mã Code Game Có Hạn Trong Ngày 2026 | Pine Universal Mall';
        if (path !== '/ma-hom-nay') {
          window.history.replaceState(null, '', '/ma-hom-nay');
        }
      } else if (mallSubView === 'events') {
        document.title = 'Sự Kiện Game & Lịch Khởi Tranh Mới Nhất 2026 | Pine Universal Mall';
        if (path !== '/su-kien' && path !== '/events') {
          window.history.replaceState(null, '', '/su-kien');
        }
      } else {
        document.title = 'Tin Tức Game & Sự Kiện Giftcode Mới Nhất 2026 | Pine Universal Mall';
        if (window.location.pathname !== '/news' || window.location.hash) {
          window.history.replaceState(null, '', '/news');
        }
      }
    } else if (mallSubView === 'giveaways') {
      document.title = 'Sự Kiện Giveaway Game Miễn Phí 2026 | Pine Universal Mall';
      if (!window.location.pathname.startsWith('/giveaways') || window.location.hash) {
        window.history.replaceState(null, '', '/giveaways');
      }
    } else if (mallSubView === 'store') {
      document.title = isEnMode
        ? 'Multi-Industry Store & Digital Deals | Universal Mall'
        : 'Cửa Hàng Đa Ngành & Tiện Ích Số | Universal Mall';
      const expectedStorePath = isEnMode ? '/en/store' : '/store';
      if (window.location.pathname !== expectedStorePath || window.location.hash) {
        window.history.replaceState(null, '', expectedStorePath);
      }
    } else if (mallSubView === 'utilities') {
      document.title = 'Tiện Ích Nạp Game & Key Bản Quyền | Pine Universal Mall';
      if (window.location.pathname !== '/utilities' || window.location.hash) {
        window.history.replaceState(null, '', '/utilities');
      }
    } else if (mallSubView === 'missions') {
      document.title = 'Nhiệm Vụ Nhận Quà & Tiền Ví Miễn Phí | Pine Universal Mall';
      const normPath = window.location.pathname.replace(/\/$/, '');
      if (normPath !== '/nhiem-vu' || window.location.hash || window.location.pathname.endsWith('/')) {
        window.history.replaceState(null, '', '/nhiem-vu');
      }
    } else if (mallSubView === 'telegram') {
      document.title = 'Cộng Đồng Telegram & Nhận Thông Báo Tự Động | Pine Universal Mall';
      if (window.location.pathname !== '/telegram' || window.location.hash) {
        window.history.replaceState(null, '', '/telegram');
      }
    } else if (mallSubView === 'seller') {
      document.title = isEnMode
        ? 'Seller Center & Store Management | Pine Universal Mall'
        : 'Kênh Người Bán & Quản Lý Gian Hàng | Pine Universal Mall';
      const expectedSellerPath = isEnMode ? '/en/ban-hang' : '/ban-hang';
      if (window.location.pathname !== expectedSellerPath || window.location.hash) {
        window.history.replaceState(null, '', expectedSellerPath);
      }
    } else if (mallSubView === 'store-detail') {
      document.title = 'Gian Hàng Chính Hãng | Pine Universal Mall';
      if (currentStoreSlug && (window.location.pathname !== `/gian-hang/${currentStoreSlug}` || window.location.hash)) {
        window.history.replaceState(null, '', `/gian-hang/${currentStoreSlug}`);
      }
    } else if (mallSubView === 'platform-solutions') {
      document.title = isEnMode
        ? 'E-Commerce Platform & Turnkey Solutions | Universal Mall'
        : 'Giải Pháp Sàn Thương Mại & Mở Gian Hàng | Universal Mall';
    } else {
      document.title = isEnMode
        ? 'Universal Mall - Official Multi-Industry E-Commerce Marketplace'
        : 'Universal Mall - Sàn Thương Mại Điện Tử Đa Ngành Chính Hãng';
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute(
          'content',
          isEnMode
            ? 'Universal Mall - Official Multi-Industry E-Commerce Marketplace: Fashion, Beauty, Digital Tech, Services & Gaming. Nationwide courier and 0s instant code delivery.'
            : 'Sàn thương mại điện tử đa ngành chính hãng Universal Mall: Thời trang, Làm đẹp, Thiết bị số, Dịch vụ số & Gaming. Giao hàng toàn quốc và mã 0s.'
        );
      }
      const expectedHome = isEnMode ? '/en/' : '/';
      const pathLower = window.location.pathname.toLowerCase();
      const isLangPath = pathLower === '/en' || pathLower === '/en/' || pathLower === '/vi' || pathLower === '/vi/' || pathLower === '/';
      if (mallSubView === 'home' && ((isLangPath && window.location.pathname !== expectedHome) || (!isLangPath && window.location.pathname !== '/') || window.location.hash)) {
        window.history.replaceState(null, '', expectedHome);
      }
    }
  }, [currentTab, mallSubView, currentStoreSlug, isInitialLoadDone, language]);

  // Handle browser popstate and hashchange navigation (Back / Forward buttons & anchors)
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      const host = window.location.hostname.toLowerCase();

      // 0. Dedicated Admin domain or Admin route/hash -> Always stay in Admin!
      const isAdminDomain = host.includes('admin-universal-mall') || host.includes('admin-code-game-shop') || host.includes('admin-test-code-game-shop') || host.startsWith('admin.');
      const isAdminHash = ADMIN_HASH_PREFIXES.some((p) => hash.startsWith(p));
      const isAdminPath = path.startsWith('/admin') || path.startsWith('/en/admin');
      if (isAdminDomain || isAdminPath || isAdminHash) {
        setCurrentTab('admin');
        return;
      }

      // Redirect legacy /game/, /g/, #catalog, and unknown legacy paths to Universal Mall home
      const resolvedSub = resolveRouteToMallSubView(path, hash);
      const isRootOrLang = path === '/' || path === '' || path === '/en' || path === '/en/' || path === '/vi' || path === '/vi/' || path === '/gio-hang' || path === '/cart';
      if (
        path.startsWith('/game/') ||
        path.startsWith('/g/') ||
        hash === '#catalog' ||
        hash.startsWith('#catalog') ||
        (resolvedSub === 'home' && !isRootOrLang)
      ) {
        window.history.replaceState(null, '', isEn ? '/en/' : '/');
        setCurrentTab('mall');
        setMallSubView('home');
        return;
      }

      if (hash === '#cart' || hash === '#gio-hang' || path === '/gio-hang' || path === '/cart') {
        setIsCartOpen(true);
      }

      setCurrentTab('mall');
      setMallSubView(resolvedSub);

      if (resolvedSub === 'news') {
        const nSlug = path.startsWith('/news/') ? path.replace(/^\/news\//i, '').replace(/\/$/, '').trim() : null;
        setInitialNewsSlug(nSlug || null);
      } else if (resolvedSub === 'giveaways') {
        const popGwId = hash.includes('gw=')
          ? hash.split(/gw=/i)[1]?.split('&')[0]
          : hash.includes('giveaway=')
          ? hash.split(/giveaway=/i)[1]?.split('&')[0]
          : path.startsWith('/giveaway')
          ? window.location.pathname.replace(/^\/(?:giveaways|giveaway)\/?/i, '').split('/')[0].trim()
          : null;
        if (popGwId) setInitialGiveawayId(popGwId);
      } else if (resolvedSub === 'store') {
        const popParams = new URLSearchParams(window.location.search);
        const popGame = popParams.get('game') || popParams.get('g');
        const popPkg = popParams.get('pkg') || popParams.get('package') || popParams.get('product') || popParams.get('prod');
        if (popGame || popPkg) {
          const storeProducts = dataService.getStoreProducts();
          const grouped = groupStoreProductsByGame(storeProducts);
          let found = null;
          if (popGame) {
            const cleanSlug = popGame.toLowerCase().trim();
            found = grouped.find(
              (p) =>
                (p.game_slug && p.game_slug.toLowerCase() === cleanSlug) ||
                (p.game_name && p.game_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') === cleanSlug)
            );
          }
          if (!found && popPkg) {
            found =
              grouped.find(
                (p) =>
                  p.id === popPkg ||
                  p.id.toLowerCase() === popPkg.toLowerCase() ||
                  (p.packages && p.packages.some((pkg) => pkg.id.toLowerCase() === popPkg.toLowerCase()))
              ) || storeProducts.find((p) => p.id === popPkg || p.id.toLowerCase() === popPkg.toLowerCase());
          }
          if (found) {
            setSelectedProduct(found);
            if (popPkg) {
              const allPkgs = getProductPackages(found);
              const pkgExists = allPkgs.some((pkg) => pkg.id.toLowerCase() === popPkg.toLowerCase());
              if (pkgExists) {
                setSelectedPackageIdParam(popPkg);
              } else {
                setSelectedPackageIdParam(null);
                showToast('Thông báo', 'Gói này không còn nữa hoặc đã ngừng bán.', 'info');
              }
            } else {
              setSelectedPackageIdParam(null);
            }
          }
        }
      } else if (resolvedSub === 'store-detail' && path.startsWith('/gian-hang/')) {
        const sSlug = window.location.pathname.replace(/^\/gian-hang\//i, '').replace(/\/$/, '').trim();
        setCurrentStoreSlug(sSlug);
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // Immediate search trigger from MarketingNotificationToast
  const handleExploreOrSubmitSearch = () => {
    handleSelectMallView('home');
    setTimeout(() => {
      const target = document.getElementById('shopee-products-grid');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Keep bookmarkedGamesList synced with bookmarks
  useEffect(() => {
    if (bookmarks.length === 0) {
      setBookmarkedGamesList([]);
      return;
    }
    dataService.getBookmarkedGames(bookmarks).then((list) => {
      setBookmarkedGamesList(list);
    });
  }, [bookmarks]);

  // Real-time Data Sync Subscription (Reflect Admin updates instantly without CPU loops)
  useEffect(() => {
    const unsubscribe = dataService.subscribe(async () => {
      const newBranding = dataService.getWebsiteBranding();
      setBranding((prev) => {
        if (
          prev.logoUrl === newBranding.logoUrl &&
          prev.avatarUrl === newBranding.avatarUrl &&
          prev.siteTitle === newBranding.siteTitle &&
          prev.backgroundUrl === newBranding.backgroundUrl
        ) {
          return prev;
        }
        return newBranding;
      });

      const syncedGames = dataService.getGames();
      if (syncedGames && syncedGames.length > 0) {
        setAllGamesList(syncedGames);
      }

      const u = dataService.getCurrentUser();
      setCurrentUser((prev) => {
        if (!prev && !u) return null;
        if (!prev && u) return u;
        if (prev && !u) return null;
        if (prev && u) {
          if (
            prev.wallet_balance !== u.wallet_balance ||
            prev.id !== u.id ||
            prev.role !== u.role ||
            prev.displayName !== u.displayName
          ) {
            return u;
          }
          return prev;
        }
        return prev;
      });
    });
    return () => unsubscribe();
  }, []);

  // Gentle Event-Driven User Balance Refresh
  useEffect(() => {
    const syncUser = () => {
      if (document.visibilityState !== 'visible') return;
      dataService.refreshCurrentUserBalance().then(() => {
        const u = dataService.getCurrentUser();
        setCurrentUser((prev) => {
          if (!prev && !u) return null;
          if (!prev && u) return u;
          if (prev && !u) return null;
          if (prev && u) {
            if (prev.wallet_balance !== u.wallet_balance || prev.id !== u.id || prev.role !== u.role) {
              return u;
            }
            return prev;
          }
          return prev;
        });
      });
    };

    // 1. Initial refresh on mount
    syncUser();

    // 1.1. Quick 2s check to immediately reconcile any async local storage on load
    const quickTimer = setTimeout(syncUser, 2000);

    // 2. Gentle polling every 30 seconds ONLY when tab is visible
    const interval = setInterval(syncUser, 30000);

    // 3. Sync on tab focus / visibility
    window.addEventListener('focus', syncUser);
    document.addEventListener('visibilitychange', syncUser);

    return () => {
      clearTimeout(quickTimer);
      clearInterval(interval);
      window.removeEventListener('focus', syncUser);
      document.removeEventListener('visibilitychange', syncUser);
    };
  }, []);

  // Dynamically update favicon & browser tab title from branding
  useEffect(() => {
    if (branding.avatarUrl) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'shortcut icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = branding.avatarUrl;
    }
    const rawTitle = branding.siteTitle?.trim();
    const cleanTitle =
      rawTitle && rawTitle.toUpperCase() !== 'WEB CODE GAME' && rawTitle.toUpperCase() !== 'WEB CODE'
        ? rawTitle
        : 'Universal Mall';
    document.title = language === 'en'
      ? `${cleanTitle} - Official Multi-Industry E-Commerce Marketplace`
      : `${cleanTitle} - Sàn Thương Mại Điện Tử Đa Ngành Chính Hãng`;
  }, [branding.avatarUrl, branding.siteTitle, language, currentTab]);

  // Real-time listener for CMS content changes (Events, Storage & BroadcastChannel)
  useEffect(() => {
    const handleContentUpdate = () => {
      setBranding(dataService.getWebsiteBranding());
    };
    window.addEventListener('pine_admin_content_updated', handleContentUpdate);
    window.addEventListener('pine_admin_data_updated', handleContentUpdate);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('pine_admin_content')) {
        handleContentUpdate();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('pine_data_sync');
        bc.onmessage = (event) => {
          const type = event.data?.type || event.data?.key || '';
          if (!type || (typeof type === 'string' && (type.includes('content') || type.includes('branding')))) {
            handleContentUpdate();
          }
        };
      } catch {}
    }

    return () => {
      window.removeEventListener('pine_admin_content_updated', handleContentUpdate);
      window.removeEventListener('pine_admin_data_updated', handleContentUpdate);
      window.removeEventListener('storage', handleStorageChange);
      if (bc) bc.close();
    };
  }, []);

  // Bookmarking Handlers
  const handleToggleBookmark = (gameId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const res = dataService.toggleBookmark(gameId);
    setBookmarks(res.bookmarks);
    showToast(
      res.isBookmarked ? 'Đã lưu vào tủ game!' : 'Đã bỏ lưu game',
      undefined,
      res.isBookmarked ? 'success' : 'info'
    );
  };

  const handleClearAllBookmarks = () => {
    localStorage.removeItem('pine_bookmarks');
    setBookmarks([]);
    showToast('Đã làm trống tủ game', undefined, 'info');
  };

  const handleSelectProductById = (productId: string) => {
    const prods = dataService.getStoreProducts();
    const grouped = groupStoreProductsByGame(prods);
    const found = grouped.find(
      (p) => p.id === productId || p.id.toLowerCase() === productId.toLowerCase() || (p.packages && p.packages.some((pkg) => pkg.id.toLowerCase() === productId.toLowerCase()))
    ) || prods.find((p) => p.id === productId || p.id.toLowerCase() === productId.toLowerCase());
    if (found) {
      setSelectedProduct(found);
    }
  };

  // Share Handlers for Universal Share Modal
  // Share Handlers for Universal Share Modal
  const getShareOrigin = () => {
    if (typeof window === 'undefined') return 'https://universal-mall-shop.pages.dev';
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return window.location.origin;
    }
    return 'https://universal-mall-shop.pages.dev';
  };

  const handleOpenShareGiveaway = (campaign: GiveawayCampaign, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const origin = getShareOrigin();
    let rawIcon = campaign.cover_image_url || campaign.game_icon_url || '';
    if (!rawIcon && campaign.game_slug) {
      const g = allGamesList.find((x) => x && (x.slug?.toLowerCase() === campaign.game_slug?.toLowerCase() || x.id?.toLowerCase() === campaign.game_slug?.toLowerCase()));
      if (g?.icon_url) rawIcon = g.icon_url;
      else rawIcon = safeGameIconUrl(campaign.game_slug, '/og-image.jpg');
    }
    const fullIcon = (rawIcon || '/og-image.jpg').startsWith('http') ? (rawIcon || '/og-image.jpg') : `${origin}${(rawIcon || '/og-image.jpg').startsWith('/') ? (rawIcon || '/og-image.jpg') : `/${rawIcon || '/og-image.jpg'}`}`;

    setSharePayload({
      title: campaign.title,
      subtitle: `Sự kiện săn mã ${campaign.game_name}`,
      shareUrl: `${origin}/giveaways/${campaign.id}`,
      itemType: 'giveaway',
      imageUrl: fullIcon,
      badge: campaign.game_name,
    });
  };

  const handleOpenShareProduct = (product: StoreProduct, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const origin = getShareOrigin();
    let rawIcon = resolveProductCoverImage(product, '');
    if (!rawIcon && product.game_slug) {
      const g = allGamesList.find((x) => x && (x.slug?.toLowerCase() === product.game_slug?.toLowerCase() || x.id?.toLowerCase() === product.game_slug?.toLowerCase()));
      if (g?.icon_url) rawIcon = g.icon_url;
      else rawIcon = safeGameIconUrl(product.game_slug, '/og-image.jpg');
    }
    const fullIcon = (rawIcon || '/og-image.jpg').startsWith('http') ? (rawIcon || '/og-image.jpg') : `${origin}${(rawIcon || '/og-image.jpg').startsWith('/') ? (rawIcon || '/og-image.jpg') : `/${rawIcon || '/og-image.jpg'}`}`;

    setSharePayload({
      title: product.title,
      subtitle: `${product.game_name} • Giảm ${product.discount_percent}%`,
      shareUrl: `${origin}/store#product=${product.id}`,
      itemType: 'product',
      imageUrl: fullIcon,
      badge: `${product.game_name} -${product.discount_percent}%`,
    });
  };

  const handleOpenShareUtility = (utility: UtilityProduct, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const origin = getShareOrigin();
    const rawIcon = utility.image_url || utility.icon || '/og-image.jpg';
    const fullIcon = rawIcon.startsWith('http') ? rawIcon : `${origin}${rawIcon.startsWith('/') ? rawIcon : `/${rawIcon}`}`;

    setSharePayload({
      title: utility.title,
      subtitle: `${utility.category_label || utility.category} • Giảm ${utility.discount_percent}%`,
      shareUrl: `${origin}/utilities#utility=${utility.id}`,
      itemType: 'utility',
      imageUrl: fullIcon,
      badge: `${utility.category_label || utility.category}`,
    });
  };

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    showToast('Đã đăng xuất tài khoản an toàn', undefined, 'info');
  };

  if (currentTab === 'admin') {
    return (
      <React.Suspense
        fallback={
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3 text-white">
            <div className="w-10 h-10 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
            <p className="text-sm font-medium">{isEn ? (t?.common?.loadingAdminPanel || 'Loading Admin Panel...') : (t?.common?.loadingAdminPanel || 'Đang tải Admin Panel...')}</p>
          </div>
        }
      >
        <AdminApp
          onBackToClient={() => {
            const isEn = language === 'en' || (typeof window !== 'undefined' && window.location.pathname.startsWith('/en'));
            const host = typeof window !== 'undefined' ? window.location.hostname : '';
            if (host.includes('admin-universal-mall')) {
              const target = isEn ? 'https://universal-mall-shop.pages.dev/en/' : 'https://universal-mall-shop.pages.dev/';
              const newWin = window.open(target, '_blank');
              if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
                window.location.href = target;
              }
              return;
            }
            if (host.includes('admin-test-code-game-shop')) {
              const target = isEn ? 'https://universal-mall-shop.pages.dev/en/' : 'https://universal-mall-shop.pages.dev/';
              const newWin = window.open(target, '_blank');
              if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
                window.location.href = target;
              }
              return;
            }
            const isDedicatedAdmin = host.includes('admin-code-game-shop');
            if (isDedicatedAdmin) {
              const target = isEn ? 'https://universal-mall-shop.pages.dev/en/' : 'https://universal-mall-shop.pages.dev/';
              const newWin = window.open(target, '_blank');
              if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
                window.location.href = target;
              }
            } else {
              const targetPath = isEn ? '/en/' : '/';
              if (window.location.pathname.toLowerCase().startsWith('/admin') || window.location.pathname.toLowerCase().startsWith('/en/admin')) {
                window.location.href = targetPath;
              } else {
                handleSelectMallView('store');
              }
            }
          }}
        />
      </React.Suspense>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative text-foreground selection:bg-primary selection:text-white overflow-x-clip w-full max-w-full box-border">
      {/* Dynamic Background Wallpaper Container (Layered between base and content) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Base dark/light background */}
        <div className="absolute inset-0 bg-background" />

        {/* Dynamic Wallpaper Image Layer (Chỉ hiển thị ở chế độ Tối, ẩn hoàn toàn ở chế độ Sáng để đảm bảo nền trắng tinh khiết) */}
        {isDarkMode && branding.backgroundUrl && (
          <div
            className={`wallpaper-layer absolute inset-0 transition-opacity duration-700 dark:block hidden ${
              branding.backgroundStyle === 'ambient'
                ? 'bg-cover bg-center blur-xl scale-105'
                : branding.backgroundStyle === 'cover'
                ? 'bg-cover bg-center'
                : branding.backgroundStyle === 'pattern'
                ? 'bg-repeat'
                : 'bg-cover bg-top'
            }`}
            style={{
              backgroundImage: `url(${branding.backgroundUrl})`,
              opacity: branding.backgroundOpacity ?? 0.35,
            }}
          />
        )}

        {/* Ambient Top Glow Effect (Chỉ hiển thị ở chế độ Tối) */}
        {isDarkMode && (
          <div className="wallpaper-glow absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-primary/15 rounded-full blur-3xl pointer-events-none dark:block hidden" />
        )}
      </div>

      {/* Main App Content (relative z-10) */}
      <div className="relative z-10 flex-1 flex flex-col w-full max-w-full">
        {/* Dynamic SEO hreflang, canonical & Meta Title / Description */}
        <LanguageSeoHead />

        {/* Unified Universal Mall Client Shell */}
        <main className="flex-1">
          <Suspense fallback={<div className="py-20 flex justify-center"><CyberLoader title={isEn ? (t?.common?.loadingInterface || 'LOADING INTERFACE...') : (t?.common?.loadingInterface || 'ĐANG TẢI GIAO DIỆN...')} subText={isEn ? (t?.common?.loadingData || 'Loading data...') : (t?.common?.loadingData || 'Đang nạp dữ liệu...')} /></div>}>
            <UniversalMallView
              allGames={dataService.getGames().length > 0 ? dataService.getGames() : allGamesList}
              storeProducts={dataService.getStoreProducts()}
              upcomingGames={dataService.getAllUpcomingGamesRawSync ? dataService.getAllUpcomingGamesRawSync() : upcomingGames}
              controlledSubView={mallSubView}
              controlledStoreCategory={storeCategoryFilter}
              currentStoreSlug={currentStoreSlug}
              initialNewsSlug={initialNewsSlug}
              initialGiveawayId={initialGiveawayId}
              selectedUtilityId={selectedUtilityId}
              initialMissionId={initialMissionId}
              onSubViewChange={handleSelectMallView}
              onClearInitialGiveawayId={() => setInitialGiveawayId(null)}
              onClearSelectedUtility={() => setSelectedUtilityId(null)}
              onSelectProduct={(prod) => {
                setSelectedProduct(prod);
                setSelectedPackageIdParam(null);
              }}
              onDirectCheckout={(prod, pkg) => {
                setSelectedProduct(null);
                setSelectedPackageIdParam(null);
                if (!currentUser) {
                  setIsAuthModalOpen(true);
                  showToast('Cần đăng nhập', 'Vui lòng đăng nhập để thanh toán.', 'info');
                } else {
                  setCheckoutProduct(prod);
                  setCheckoutPackage(pkg || null);
                  setCheckoutQuantity(1);
                }
              }}
              onOpenShareProduct={handleOpenShareProduct}
              onOpenShareGiveaway={handleOpenShareGiveaway}
              onOpenShareUtility={handleOpenShareUtility}
              onOpenAuth={() => setIsAuthModalOpen(true)}
              onOpenWallet={() => setIsWalletModalOpen(true)}
              onOpenCart={() => setIsCartOpen(true)}
              onOpenWishlist={() => setIsWishlistOpen(true)}
              onOpenGrowth={() => {
                setGrowthInitialTab('wheel');
                setIsGrowthCenterOpen(true);
              }}
              onOpenUpcoming={() => setIsAllUpcomingModalOpen(true)}
              onOpenDownloadApp={() => setIsDownloadModalOpen(true)}
              onOpenEmailModal={() => setIsEmailModalOpen(true)}
              onOpenReceivedCodes={(initialTab = 'marketplace') => handleOpenReceivedCodes(initialTab as any)}
              onOpenProfile={() => setIsProfileModalOpen(true)}
              currentUser={currentUser}
              onShowToast={showToast}
              onLogout={handleLogout}
              onUpdateUser={handleUpdateUser}
            />
          </Suspense>
        </main>
      </div>
      {/* Modals & Drawers (P4: Lazy loaded via Suspense to keep main bundle tiny) */}
      <Suspense fallback={null}>
        <ShareModal
          isOpen={Boolean(sharePayload)}
          onClose={() => setSharePayload(null)}
          title={sharePayload?.title || ''}
          subtitle={sharePayload?.subtitle}
          shareUrl={sharePayload?.shareUrl || ''}
          itemType={sharePayload?.itemType || 'game'}
          imageUrl={sharePayload?.imageUrl}
          badge={sharePayload?.badge}
          onShowToast={showToast}
        />

        {selectedProduct && (
          <ProductDetailModal
            product={selectedProduct}
            initialPackageId={selectedPackageIdParam || undefined}
            currentUser={currentUser}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onOpenShare={handleOpenShareProduct}
            onClose={() => {
              setSelectedProduct(null);
              setSelectedPackageIdParam(null);
            }}
            onShowToast={showToast}
            onBuyNow={(prod, pkg, qty) => {
              setSelectedProduct(null);
              setSelectedPackageIdParam(null);
              if (!currentUser) {
                setIsAuthModalOpen(true);
              } else {
                setCheckoutProduct(prod);
                setCheckoutPackage(pkg || null);
                setCheckoutQuantity(qty || 1);
              }
            }}
          />
        )}

        {checkoutProduct && (
          <ProductCheckoutModal
            product={checkoutProduct}
            selectedPackage={checkoutPackage}
            initialQuantity={checkoutQuantity}
            currentUser={currentUser}
            onUpdateUser={handleUpdateUser}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onOpenWallet={() => setIsWalletModalOpen(true)}
            onClose={() => {
              setCheckoutProduct(null);
              setCheckoutPackage(null);
            }}
            onShowToast={showToast}
          />
        )}

        <SubmitCodeModal
          isOpen={isSubmitModalOpen}
          onClose={() => setIsSubmitModalOpen(false)}
          games={allGamesList}
          onSuccess={(_slug, code) => {
            showToast('Đóng góp mã code thành công!', `Mã ${code} đã được nạp vào hệ thống.`, 'success');
            const freshGames = dataService.getGames();
            if (freshGames && freshGames.length > 0) setAllGamesList(freshGames);
          }}
        />

        <BookmarkDrawer
          isOpen={isBookmarkDrawerOpen}
          onClose={() => setIsBookmarkDrawerOpen(false)}
          bookmarkedGames={bookmarkedGamesList}
          onRemoveBookmark={(id) => handleToggleBookmark(id)}
          onSelectGame={(game) => {
            setIsBookmarkDrawerOpen(false);
            handleFilterStoreByGame(game.slug || game.id);
          }}
          onClearAll={handleClearAllBookmarks}
        />

        <AllUpcomingGamesModal
          isOpen={isAllUpcomingModalOpen}
          onClose={() => {
            setIsAllUpcomingModalOpen(false);
            setSelectedUpcomingSlug(null);
          }}
          upcomingGames={upcomingGames}
          bookmarkedSlugs={bookmarks}
          onToggleBookmark={handleToggleBookmark}
          onShowToast={showToast}
          initialSelectedSlug={selectedUpcomingSlug}
        />

        <CodePlaygroundModal
          isOpen={isPlaygroundModalOpen}
          onClose={() => setIsPlaygroundModalOpen(false)}
          games={allGamesList}
          onSelectGame={(game) => {
            setIsPlaygroundModalOpen(false);
            handleFilterStoreByGame(game.slug || game.id);
          }}
          onShowToast={showToast}
        />

        <GrowthCenterModal
          isOpen={isGrowthCenterOpen}
          onClose={() => setIsGrowthCenterOpen(false)}
          currentUser={currentUser}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onOpenWallet={() => setIsWalletModalOpen(true)}
          onShowToast={showToast}
          initialTab={growthInitialTab}
        />

        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={handleUpdateUser}
          onShowToast={showToast}
        />

        <UserWalletModal
          isOpen={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
          user={currentUser}
          onUpdateUser={handleUpdateUser}
          onShowToast={showToast}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />

        <MyReceivedCodesModal
          isOpen={isReceivedCodesOpen}
          initialTab={receivedCodesInitialTab}
          onClose={() => setIsReceivedCodesOpen(false)}
          onShowToast={showToast}
          onNavigateToMissions={() => {
            setIsReceivedCodesOpen(false);
            handleSelectMallView('missions');
          }}
          onOpenAuth={() => {
            setIsReceivedCodesOpen(false);
            setIsAuthModalOpen(true);
          }}
        />

        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          initialTab={profileInitialTab}
          onOpenAuth={() => {
            setIsProfileModalOpen(false);
            setIsAuthModalOpen(true);
          }}
          currentUser={currentUser}
          onUpdateUser={handleUpdateUser}
          onOpenWallet={() => setIsWalletModalOpen(true)}
          onOpenReceivedCodes={handleOpenReceivedCodes}
          onNavigateToSellerCenter={() => {
            setIsProfileModalOpen(false);
            handleSelectMallView('seller');
          }}
          onLogout={handleLogout}
          onShowToast={showToast}
          isDarkMode={isDarkMode}
          onToggleTheme={handleToggleTheme}
        />

        {isCartOpen && (
          <CartDrawerModal
            isOpen={isCartOpen}
            onClose={() => {
              setIsCartOpen(false);
              const path = window.location.pathname.toLowerCase();
              if (path === '/gio-hang' || path === '/cart') {
                window.history.pushState(null, '', '/');
              }
            }}
            currentUser={currentUser}
            onOpenLogin={() => {
              setIsCartOpen(false);
              setIsAuthModalOpen(true);
            }}
            onOpenWallet={() => {
              setIsCartOpen(false);
              setIsWalletModalOpen(true);
            }}
            onOpenReceivedCodes={(initialTab) => {
              setIsCartOpen(false);
              handleOpenReceivedCodes(initialTab);
            }}
            onNavigateStore={(slug) => {
              setIsCartOpen(false);
              handleSelectMallView('store-detail', { storeSlug: slug });
            }}
          />
        )}

        {isWishlistOpen && (
          <WishlistDrawerModal
            isOpen={isWishlistOpen}
            onClose={() => setIsWishlistOpen(false)}
            currentUser={currentUser}
            onOpenLogin={() => {
              setIsWishlistOpen(false);
              setIsAuthModalOpen(true);
            }}
            onOpenCart={() => {
              setIsWishlistOpen(false);
              setIsCartOpen(true);
            }}
            onNavigateDetail={(id, type) => {
              setIsWishlistOpen(false);
              if (type === 'game') {
                const game = allGamesList.find((g) => g.id === id || g.slug === id);
                if (game) handleFilterStoreByGame(game.slug || game.id);
              } else {
                handleSelectProductById(id);
              }
            }}
          />
        )}

        <DownloadAppModal
          isOpen={isDownloadModalOpen}
          onClose={() => setIsDownloadModalOpen(false)}
        />

        {/* Email Subscription & Notification Preferences Modal (2 Cột: Bảng 1 Code Mới & Chia Sẻ, Bảng 2 Đăng Ký) */}
        {isEmailModalOpen && (
          <EmailSubscriptionModal
            isOpen={isEmailModalOpen}
            onClose={() => setIsEmailModalOpen(false)}
            currentUser={currentUser}
            bookmarks={bookmarks}
            bookmarkedGames={bookmarkedGamesList}
            upcomingGames={upcomingGames}
            onToggleBookmark={(slug) => handleToggleBookmark(slug)}
            onSelectGame={(game) => {
              setIsEmailModalOpen(false);
              handleFilterStoreByGame(game.slug || game.id);
            }}
            onShowToast={showToast}
          />
        )}
      </Suspense>

      {/* Social Proof Marketing Notifications Toast (Customer Web tabs) */}
      {isFloatingEnabled && (
        <Suspense fallback={null}>
          <MarketingNotificationToast
            onSelectGameSlug={(slug) => handleFilterStoreByGame(slug)}
            onSelectProduct={handleSelectProductById}
            onSelectUtility={(utilityId) => {
              handleSelectMallView('utilities', { utilityId });
              window.location.hash = `#utility=${utilityId}`;
            }}
            onSelectGiveaway={(giveawayId) => {
              handleSelectMallView('giveaways', { giveawayId });
              window.location.hash = `#gw=${giveawayId}`;
            }}
            onOpenWallet={() => setIsWalletModalOpen(true)}
            onExploreClick={handleExploreOrSubmitSearch}
          />

          {/* Floating Announcement (Configured via Admin) */}
          {currentTab === 'mall' && mallSubView !== 'home' && (
            <FloatingAnnouncement onNavigateTab={(tab) => handleSelectMallView(mapLegacyTabToMallSubView(tab))} />
          )}
        </Suspense>
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} maxVisible={3} />
    </div>
  );
};
