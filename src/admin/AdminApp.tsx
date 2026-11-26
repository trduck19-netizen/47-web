import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { AdminLayout } from './components/AdminLayout';
import { AdminModuleTab } from './components/AdminSidebar';
import { AdminLoginGuard } from './components/AdminLoginGuard';
import { ToastContainer, type ToastMessage } from '../components/Toast';
import { adminDataService } from './services/adminDataService';
import { AdminUser } from './types/adminTypes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AdminModuleSkeleton } from './components/AdminModuleSkeleton';

// Lazy load all 30 admin modules for optimal performance & code-splitting
const DashboardModule = React.lazy(() => import('./modules/DashboardModule').then((m) => ({ default: m.DashboardModule })));
const GamesModule = React.lazy(() => import('./modules/GamesModule').then((m) => ({ default: m.GamesModule })));
const NewsModule = React.lazy(() => import('./modules/NewsModule').then((m) => ({ default: m.NewsModule })));
const FreeCodesModule = React.lazy(() => import('./modules/FreeCodesModule').then((m) => ({ default: m.FreeCodesModule })));
const GiftcodesModerationModule = React.lazy(() => import('./modules/GiftcodesModerationModule').then((m) => ({ default: m.GiftcodesModerationModule })));
const MembersModule = React.lazy(() => import('./modules/MembersModule').then((m) => ({ default: m.MembersModule })));
const WalletModule = React.lazy(() => import('./modules/WalletModule').then((m) => ({ default: m.WalletModule })));
const PrivateCodesModule = React.lazy(() => import('./modules/PrivateCodesModule').then((m) => ({ default: m.PrivateCodesModule })));
const CodeInventoryModule = React.lazy(() => import('./modules/CodeInventoryModule').then((m) => ({ default: m.CodeInventoryModule })));
const UtilitiesModule = React.lazy(() => import('./modules/UtilitiesModule').then((m) => ({ default: m.UtilitiesModule })));
const OrdersModule = React.lazy(() => import('./modules/OrdersModule').then((m) => ({ default: m.OrdersModule })));
const FirstPurchaseModule = React.lazy(() => import('./modules/FirstPurchaseModule').then((m) => ({ default: m.FirstPurchaseModule })));
const SePayModule = React.lazy(() => import('./modules/SePayModule').then((m) => ({ default: m.SePayModule })));
const ContentCMSModule = React.lazy(() => import('./modules/ContentCMSModule').then((m) => ({ default: m.ContentCMSModule })));
const SecurityLogsModule = React.lazy(() => import('./modules/SecurityLogsModule').then((m) => ({ default: m.SecurityLogsModule })));
const ProfileModule = React.lazy(() => import('./modules/ProfileModule').then((m) => ({ default: m.ProfileModule })));
const MarketingModule = React.lazy(() => import('./modules/MarketingModule').then((m) => ({ default: m.MarketingModule })));
const FloatingNotificationModule = React.lazy(() => import('./modules/FloatingNotificationModule').then((m) => ({ default: m.FloatingNotificationModule })));
const GrowthModule = React.lazy(() => import('./modules/GrowthModule').then((m) => ({ default: m.GrowthModule })));
const MissionsModule = React.lazy(() => import('./modules/MissionsModule').then((m) => ({ default: m.MissionsModule })));
const CrawlerModule = React.lazy(() => import('./modules/CrawlerModule').then((m) => ({ default: m.CrawlerModule })));
const EventSchedulerModule = React.lazy(() => import('./modules/EventSchedulerModule').then((m) => ({ default: m.EventSchedulerModule })));
const EmailNotificationModule = React.lazy(() => import('./modules/EmailNotificationModule').then((m) => ({ default: m.EmailNotificationModule })));
const ApiKeysModule = React.lazy(() => import('./modules/ApiKeysModule').then((m) => ({ default: m.ApiKeysModule })));
const TelegramModule = React.lazy(() => import('./modules/TelegramModule').then((m) => ({ default: m.TelegramModule })));
const SellerModerationModule = React.lazy(() => import('./modules/SellerModerationModule').then((m) => ({ default: m.SellerModerationModule })));
const PlatformLeadsModule = React.lazy(() => import('./modules/PlatformLeadsModule').then((m) => ({ default: m.PlatformLeadsModule })));
const TranslationsModule = React.lazy(() => import('./modules/TranslationsModule').then((m) => ({ default: m.TranslationsModule })));
const VouchersModule = React.lazy(() => import('./modules/VouchersModule').then((m) => ({ default: m.VouchersModule })));
const HomepageSectionsModule = React.lazy(() => import('./modules/HomepageSectionsModule').then((m) => ({ default: m.HomepageSectionsModule })));
const AutomationCenterModule = React.lazy(() => import('./modules/AutomationCenterModule').then((m) => ({ default: m.AutomationCenterModule })));
const SupplierConnectorsModule = React.lazy(() => import('./modules/SupplierConnectorsModule').then((m) => ({ default: m.SupplierConnectorsModule })));
import { MarketingNotificationToast } from '../components/MarketingNotificationToast';
import { LanguageProvider, useLanguage } from '../context/LanguageContext';

interface AdminAppProps {
  onBackToClient?: () => void;
}

const tabTitlesVi: Record<AdminModuleTab, string> = {
  dashboard: 'Bảng Điều Khiển Tổng Quan',
  games: 'Quản Lý Danh Mục Game',
  news: 'Quản Lý Tin Tức & Bài Viết',
  'free-codes': 'Quản Lý Code Miễn Phí',
  giftcodes: 'Kiểm Duyệt Giftcode',
  crawler: 'Crawler & Auto Sync',
  marketing: 'Cấu Hình Marketing & FOMO',
  'floating-notification': 'Cài Đặt Thông Báo Nổi',
  'homepage-sections': 'Tùy Chỉnh Hiển Thị Trang Chủ',
  growth: 'Tăng Trưởng & Viral',
  'email-notifications': 'Thông Báo Email & Khách',
  telegram: 'Tích Hợp Telegram',
  members: 'Quản Lý Thành Viên & Phân Quyền',
  wallet: 'Sổ Cái & Quản Lý Ví',
  'private-codes': 'Cấp Phát Code VIP & Giveaway',
  'code-inventory': 'Kho Code Bán & Gói Cửa Hàng',
  utilities: 'Kho Tiện Ích & Gói Dịch Vụ',
  missions: 'Quản Lý Nhiệm Vụ & Duyệt Bài',
  'event-scheduler': 'Lịch Sự Kiện Đếm Ngược',
  orders: 'Quản Lý Đơn Hàng & Vận Chuyển',
  marketplace: 'Sàn TMĐT & Gian Hàng Người Bán',
  'platform-leads': 'Khách Thuê / Mua Sàn',
  translations: 'Quản Lý Bản Dịch (i18n)',
  vouchers: 'Quản Lý Voucher & Freeship',
  'first-purchase': 'Ưu Đãi Mua Lần Đầu',
  sepay: 'Cổng Thanh Toán Tự Động SePay',
  content: 'Quản Trị Nội Dung & CMS',
  'api-keys': 'Quản Lý Khóa API & Phân Quyền',
  'automation-center': 'Trung Tâm Tự Động Hóa & Tích Hợp API',
  'supplier-connectors': 'Nguồn Hàng API Ngoài & Webhook NCC',
  'security-logs': 'Nhật Ký Bảo Mật & Audit Log',
  profile: 'Tài Khoản & Bảo Mật Admin',
};

const tabTitlesEn: Record<AdminModuleTab, string> = {
  dashboard: 'Dashboard Overview',
  games: 'Game Directory Management',
  news: 'News & Articles Management',
  'free-codes': 'Free Codes Management',
  giftcodes: 'Giftcode Moderation',
  crawler: 'Crawler & Auto Sync',
  marketing: 'Marketing & FOMO Engine',
  'floating-notification': 'Floating Notification Widget',
  'homepage-sections': 'Homepage Layout & Sections',
  growth: 'Growth & Referral Center',
  'email-notifications': 'Email & Customer Notifications',
  telegram: 'Telegram Bot Integration',
  members: 'Members & Roles Management',
  wallet: 'Wallet Ledger & Transactions',
  'private-codes': 'VIP Codes & Giveaways',
  'code-inventory': 'Code Inventory & Store Bundles',
  utilities: 'Utilities & External Services',
  missions: 'Missions & Task Moderation',
  'event-scheduler': 'Event Countdown Scheduler',
  orders: 'Orders & Fulfillment',
  marketplace: 'E-Commerce Marketplace',
  'platform-leads': 'Platform SaaS Leads',
  translations: 'Translations & i18n Management',
  vouchers: 'Vouchers & Shipping Discounts',
  'first-purchase': 'First Purchase Offers',
  sepay: 'SePay Automated Gateway',
  content: 'Website Content CMS',
  'api-keys': 'API Keys & Scopes',
  'automation-center': 'Automation Center & Integrations',
  'supplier-connectors': 'External API Suppliers & Webhooks',
  'security-logs': 'Security Audit Logs',
  profile: 'Admin Account & Security',
};

const AdminAppInner: React.FC<AdminAppProps> = ({ onBackToClient }) => {
  const { language, t } = useLanguage();
  const isEn = language === 'en';

  // Navigation State
  const [currentTab, setCurrentTab] = useState<AdminModuleTab>(() => {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const hash = raw.split('?')[0].split('/')[0];
      if (hash === 'events' || hash === 'su-kien') return 'news';
    const validTabs: AdminModuleTab[] = [
      'dashboard',
      'games',
      'news',
      'free-codes',
      'giftcodes',
      'crawler',
      'marketing',
      'floating-notification',
      'homepage-sections',
      'growth',
      'email-notifications',
      'telegram',
      'members',
      'wallet',
      'private-codes',
      'code-inventory',
      'utilities',
      'missions',
      'event-scheduler',
      'orders',
      'marketplace',
      'platform-leads',
      'translations',
      'vouchers',
      'first-purchase',
      'sepay',
      'content',
      'api-keys',
      'automation-center',
      'supplier-connectors',
      'security-logs',
      'profile',
    ];
    return validTabs.includes(hash as AdminModuleTab) ? (hash as AdminModuleTab) : 'dashboard';
  });

  // Dynamic Browser Tab Title based on active language and current tab
  useEffect(() => {
    const isEn = language === 'en';
    const tabName = isEn ? (tabTitlesEn[currentTab] || 'Dashboard') : (tabTitlesVi[currentTab] || 'Bảng Điều Khiển');
    document.title = isEn
      ? `${tabName} - Admin Console | Universal Mall`
      : `${tabName} - Trang Quản Trị Admin | Universal Mall`;
  }, [language, currentTab]);

  // Selected game for code deep-linking
  const [filteredGameSlug, setFilteredGameSlug] = useState<string | undefined>(undefined);

  // Authentication Guard State
  // SECURITY: never trust the client-side 'pine_admin_authenticated' flag.
  // isAuthenticated only becomes true after /api/auth/me confirms role === 'admin'.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(() => {
    const hasToken = Boolean(localStorage.getItem('pine_auth_token') || sessionStorage.getItem('pine_auth_token'));
    // Flag only narrows (respects logout); it never grants access without server verification.
    const hasAdminFlag =
      localStorage.getItem('pine_admin_authenticated') === 'true' ||
      sessionStorage.getItem('pine_admin_authenticated') === 'true';
    return hasToken && hasAdminFlag;
  });

  // Admin User & Theme State
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() =>
    adminDataService.getCurrentAdminUser()
  );
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Pending counts
  const [pendingGiftcodesCount, setPendingGiftcodesCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string>('');

  const clearAdminFlags = () => {
    localStorage.removeItem('pine_admin_authenticated');
    sessionStorage.removeItem('pine_admin_authenticated');
    localStorage.removeItem('pine_auth_token');
    sessionStorage.removeItem('pine_auth_token');
    localStorage.removeItem('pine_auth_user');
    sessionStorage.removeItem('pine_auth_user');
  };

  /**
   * Safe fetch with timeout to prevent hung requests
   */
  const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 3500): Promise<Response> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  };

  /**
   * Server-side admin verification. This is the ONLY place that may set isAuthenticated = true.
   * Fail-closed: any error (no token, 401/403/5xx, non-admin role, network failure) => not authenticated.
   */
  const verifyAdminSession = async (): Promise<boolean> => {
    const token =
      localStorage.getItem('pine_auth_token') ||
      sessionStorage.getItem('pine_auth_token') ||
      '';

    if (!token) {
      clearAdminFlags();
      setIsAuthenticated(false);
      return false;
    }

    try {
      const res = await fetchWithTimeout('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }, 3500);

      if (res.status === 401 || res.status === 403) {
        // Token is rejected or session expired on server - fail fast
        clearAdminFlags();
        setIsAuthenticated(false);
        setSessionExpiredNotice(
          isEn
            ? 'Session has expired, please log in again.'
            : 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'
        );
        return false;
      }

      if (res.ok) {
        const data: any = await res.json();
        const roleUpper = String(data?.user?.role || '').toUpperCase();
        if (data?.success && data?.user && (roleUpper === 'ADMIN' || roleUpper === 'SUPER_ADMIN')) {
          if (data?.syncKey) {
            localStorage.setItem('pine_admin_sync_key', data.syncKey);
            sessionStorage.setItem('pine_admin_sync_key', data.syncKey);
          }
          if (data.user) {
            const adminUser: AdminUser = {
              id: data.user.id || 'usr_admin',
              displayName: data.user.displayName || data.user.username || 'Admin',
              email: data.user.email || '',
              role: 'SUPER_ADMIN',
              avatar: data.user.avatar_url || '/logo.png',
              permissions: [
                'ALL_PERMISSIONS',
                'GAMES_MANAGE',
                'FINANCE_LEDGER',
                'SEPAY_WEBHOOK',
                'SECURITY_AUDIT',
              ],
              createdAt: data.user.created_at || '2026-08-01T00:00:00Z',
            };
            setCurrentUser(adminUser);
            adminDataService.updateCurrentAdminUser(adminUser);
          }
          setIsAuthenticated(true);
          return true;
        }
      }
    } catch (netErr) {
      console.warn('[Admin Verification Network Error]', netErr);
    }

    // Fail-closed: Never allow admin session without verified server response
    clearAdminFlags();
    setIsAuthenticated(false);
    setSessionExpiredNotice(
      isEn
        ? 'Session has expired or server connection failed, please log in again.'
        : 'Phiên đăng nhập đã hết hạn hoặc không kết nối được máy chủ, vui lòng đăng nhập lại.'
    );
    return false;
  };

  // Verify any existing session with the server on mount with guaranteed safety timeout
  useEffect(() => {
    let isMounted = true;

    // Safety watchdog: under NO circumstance should isVerifying stay true for > 3.5s
    const watchdogTimer = setTimeout(() => {
      if (isMounted) {
        setIsVerifying(false);
      }
    }, 3500);

    if (isVerifying) {
      verifyAdminSession().finally(() => {
        if (isMounted) {
          setIsVerifying(false);
        }
        clearTimeout(watchdogTimer);
      });
    }

    return () => {
      isMounted = false;
      clearTimeout(watchdogTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Initialize Theme
    const savedTheme = localStorage.getItem('pine_theme');
    const metaCs = document.querySelector('meta[name="color-scheme"]');
    if (savedTheme === 'light') {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
      if (metaCs) metaCs.setAttribute('content', 'light');
    } else {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
      if (metaCs) metaCs.setAttribute('content', 'dark');
    }

    if (!isAuthenticated) return;

    // 1. Initial fetch from Cloudflare KV
    adminDataService.fetchFromCloudflareKV().then(() => {
      refreshPendingCounts();
    });

    // 2. BroadcastChannel for instant cross-tab sync
    let channel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      channel = new BroadcastChannel('pine_data_sync');
      channel.onmessage = (e) => {
        if (e.data?.type === 'MEMBER_REGISTERED') {
          const m = e.data.payload || e.data.user;
          showToast(
            'Khách hàng mới tạo tài khoản!',
            `${m?.displayName || m?.username || 'Khách hàng'} (${m?.email || 'Mới'}) vừa đăng ký thành công trên web.`,
            'success'
          );
          adminDataService.fetchFromCloudflareKV().then(() => {
            refreshPendingCounts();
          });
        }
      };
    }

    // 3. Same-window custom event
    const handleUserRegistered = (e: any) => {
      const m = e?.detail?.member || e?.detail?.user;
      showToast(
        'Khách hàng mới tạo tài khoản!',
        `${m?.displayName || m?.username || 'Khách hàng'} (${m?.email || 'Mới'}) vừa đăng ký thành công trên web.`,
        'success'
      );
      refreshPendingCounts();
    };
    window.addEventListener('pine_user_registered', handleUserRegistered);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('pine_user_registered', handleUserRegistered);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    // Sync URL hash
    const currentBase = window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0];
    if (currentBase !== currentTab) {
      window.location.hash = `#/${currentTab}`;
    }
    refreshPendingCounts();
  }, [currentTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const raw = window.location.hash.replace(/^#\/?/, '');
    const hash = raw.split('?')[0].split('/')[0];
    if (hash === 'events' || hash === 'su-kien') { setCurrentTab('news'); return; }
      const validTabs: AdminModuleTab[] = [
        'dashboard',
        'games',
        'news',
        'free-codes',
        'giftcodes',
        'crawler',
        'marketing',
        'floating-notification',
        'homepage-sections',
        'growth',
        'email-notifications',
      'telegram',
        'members',
        'wallet',
        'private-codes',
        'code-inventory',
        'utilities',
      'missions',
        'event-scheduler',
        'orders',
      'marketplace',
      'platform-leads',
      'translations',
      'vouchers',
      'first-purchase',
        'sepay',
        'content',
        'api-keys',
      'automation-center',
      'supplier-connectors',
      'security-logs',
        'profile',
      ];
      if (validTabs.includes(hash as AdminModuleTab)) {
        setCurrentTab(hash as AdminModuleTab);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const refreshPendingCounts = () => {
    const subs = adminDataService.getSubmissions({ status: 'PENDING' });
    setPendingGiftcodesCount(subs.length);

    const orders = adminDataService.getOrders({ status: 'PROCESSING' });
    setPendingOrdersCount(orders.length);
  };

  const handleToggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      const metaCs = document.querySelector('meta[name="color-scheme"]');
      if (next) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.documentElement.style.colorScheme = 'dark';
        if (metaCs) metaCs.setAttribute('content', 'dark');
        localStorage.setItem('pine_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.documentElement.style.colorScheme = 'light';
        if (metaCs) metaCs.setAttribute('content', 'light');
        localStorage.setItem('pine_theme', 'light');
      }
      return next;
    });
  };

  const showToast = useCallback((
    title: string,
    message?: string,
    type: 'success' | 'error' | 'info' = 'success',
    duration?: number
  ) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    const toastDuration = duration ?? (type === 'error' ? 3500 : 2500);

    // Limit active toasts to at most 2 previous (total max 3 visible) to prevent screen clutter
    setToasts((prev) => [...prev.slice(-2), { id, title, message: message || '', type, duration: toastDuration }]);

    // Auto-dismiss safety timer
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, toastDuration + 100);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'add-game':
        setCurrentTab('games');
        break;
      case 'add-free-code':
        setCurrentTab('free-codes');
        break;
      case 'issue-private-code':
        setCurrentTab('private-codes');
        break;
      case 'adjust-wallet':
        setCurrentTab('wallet');
        break;
      default:
        break;
    }
  };

  const handleGoToClientSite = () => {
    const isEn = language === 'en' || (typeof window !== 'undefined' && window.location.pathname.startsWith('/en'));
    if (onBackToClient) {
      onBackToClient();
    } else {
      const isTestAdmin = typeof window !== 'undefined' && window.location.hostname.includes('admin-test-code-game-shop');
      if (isTestAdmin) {
        const target = isEn ? 'https://universal-mall-shop.pages.dev/en/' : 'https://universal-mall-shop.pages.dev/';
        const newWin = window.open(target, '_blank');
        if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
          window.location.href = target;
        }
        return;
      }
      const isUniversalMall = typeof window !== 'undefined' && (window.location.hostname.includes('admin-universal-mall') || window.location.hostname.includes('universal-mall'));
      if (isUniversalMall) {
        const target = isEn ? 'https://universal-mall-shop.pages.dev/en/' : 'https://universal-mall-shop.pages.dev/';
        const newWin = window.open(target, '_blank');
        if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
          window.location.href = target;
        }
        return;
      }
      const isDedicatedAdmin = typeof window !== 'undefined' && window.location.hostname.includes('admin-universal-mall') || hostname.includes('admin-universal-mall') || hostname.includes('admin-universal-mall') || hostname.includes('admin-universal-mall') || hostname.includes('admin-code-game-shop');
      if (isDedicatedAdmin) {
        const clientOrigin = (import.meta.env.VITE_SITE_URL || 'https://universal-mall-shop.pages.dev').replace(/\/$/, '');
        const target = isEn ? `${clientOrigin}/en/` : `${clientOrigin}/`;
        const newWin = window.open(target, '_blank');
        if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
          window.location.href = target;
        }
      } else {
        const targetPath = isEn ? '/en/' : '/';
        window.location.href = targetPath;
      }
    }
  };

  const handleLogout = () => {
    clearAdminFlags();
    setIsAuthenticated(false);
    showToast('Đăng xuất thành công', 'Phiên làm việc quản trị đã kết thúc.', 'info');
  };

  const handleLoginSuccess = async (user: AdminUser) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    localStorage.setItem('pine_admin_authenticated', 'true');
    showToast('Xác thực thành công', `Chào mừng ${user.displayName} đến với Admin Console.`, 'success');

    // Asynchronously refresh session in background without blocking console access
    verifyAdminSession().catch(() => {});
  };

  // While the server is verifying the session, render loading state with immediate escape hatch
  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300 px-4">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-sm font-medium">{isEn ? (t?.common?.verifyingAdmin || 'Verifying admin session…') : (t?.common?.verifyingAdmin || 'Đang xác thực phiên quản trị…')}</p>
          <button
            type="button"
            onClick={() => {
              clearAdminFlags();
              setIsVerifying(false);
              setIsAuthenticated(false);
            }}
            className="mt-3 px-3.5 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            {isEn ? (t?.common?.reloginAdmin || 'Relogin with Admin Account') : (t?.common?.reloginAdmin || 'Đăng nhập lại bằng tài khoản quản trị')}
          </button>
        </div>
      </div>
    );
  }

  // If not authenticated, show secure Admin Login Guard
  if (!isAuthenticated) {
    return (
      <>
        <AdminLoginGuard
          onLoginSuccess={handleLoginSuccess}
          onGoToClientSite={handleGoToClientSite}
          initialErrorMessage={sessionExpiredNotice}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} position="top-center" maxVisible={3} />

      {/* Marketing FOMO Notification Toast (Active for Admin Previews & Live Tests) */}
      <MarketingNotificationToast />
      </>
    );
  }

  return (
    <AdminLayout
      currentTab={currentTab}
      onSelectTab={(tab) => {
        setFilteredGameSlug(undefined);
        setCurrentTab(tab);
      }}
      currentUser={currentUser}
      isDarkMode={isDarkMode}
      onToggleTheme={handleToggleTheme}
      onLogout={handleLogout}
      onGoToClientSite={handleGoToClientSite}
      pendingGiftcodesCount={pendingGiftcodesCount}
      pendingOrdersCount={pendingOrdersCount}
      onQuickAction={handleQuickAction}
    >
      {/* Module View Switcher with ErrorBoundary & Lazy Suspense */}
      <ErrorBoundary key={currentTab}>
        <Suspense fallback={<AdminModuleSkeleton />}>
          {currentTab === 'dashboard' && (
          <DashboardModule onNavigate={(tab) => setCurrentTab(tab)} onShowToast={showToast} />
        )}

        {currentTab === 'games' && (
          <GamesModule
            onShowToast={showToast}
            onOpenGameCodes={(slug) => {
              setFilteredGameSlug(slug);
              setCurrentTab('free-codes');
            }}
          />
        )}

        {currentTab === 'news' && (
          <NewsModule onShowToast={showToast} />
        )}

        {currentTab === 'free-codes' && (
          <FreeCodesModule initialGameSlug={filteredGameSlug} onShowToast={showToast} />
        )}

        {currentTab === 'giftcodes' && (
          <GiftcodesModerationModule onShowToast={showToast} />
        )}

        {currentTab === 'crawler' && (
          <CrawlerModule onShowToast={showToast} />
        )}

        {currentTab === 'members' && (
          <MembersModule onShowToast={showToast} />
        )}

        {currentTab === 'wallet' && (
          <WalletModule onShowToast={showToast} />
        )}

        {currentTab === 'private-codes' && (
          <PrivateCodesModule onShowToast={showToast} />
        )}

        {currentTab === 'code-inventory' && (
          <CodeInventoryModule onShowToast={showToast} />
        )}

        {currentTab === 'utilities' && (
          <UtilitiesModule onShowToast={showToast} />
        )}

        {currentTab === 'event-scheduler' && (
          <EventSchedulerModule onShowToast={showToast} />
        )}

        {currentTab === 'email-notifications' && (
          <EmailNotificationModule onShowToast={showToast} />
        )}

        {currentTab === 'telegram' && (
          <TelegramModule />
        )}

        {currentTab === 'orders' && (
          <OrdersModule onShowToast={showToast} />
        )}

        {currentTab === 'first-purchase' && (
          <FirstPurchaseModule onShowToast={showToast} />
        )}

        {currentTab === 'marketplace' && (
          <SellerModerationModule onShowToast={showToast} />
        )}

        {currentTab === 'platform-leads' && (
          <PlatformLeadsModule onShowToast={showToast} />
        )}

        {currentTab === 'translations' && (
          <TranslationsModule onShowToast={showToast} />
        )}

        {currentTab === 'vouchers' && (
          <VouchersModule onShowToast={showToast} />
        )}

        {currentTab === 'sepay' && (
          <SePayModule onShowToast={showToast} />
        )}

        {currentTab === 'content' && (
          <ContentCMSModule onShowToast={showToast} onNavigate={(tab) => setCurrentTab(tab as any)} />
        )}

        {currentTab === 'floating-notification' && (
          <FloatingNotificationModule onShowToast={showToast} />
        )}

        {currentTab === 'homepage-sections' && (
          <HomepageSectionsModule onShowToast={showToast} />
        )}

        {currentTab === 'marketing' && (
          <MarketingModule onShowToast={showToast} />
        )}

        {currentTab === 'growth' && (
          <GrowthModule onShowToast={showToast} />
        )}

        {currentTab === 'missions' && (
          <MissionsModule />
        )}

        {currentTab === 'api-keys' && (
          <ApiKeysModule onShowToast={showToast} />
        )}

        {currentTab === 'automation-center' && (
          <AutomationCenterModule onShowToast={showToast} />
        )}

        {currentTab === 'supplier-connectors' && (
          <SupplierConnectorsModule onShowToast={showToast} />
        )}

        {currentTab === 'security-logs' && (
          <SecurityLogsModule onShowToast={showToast} />
        )}

        {currentTab === 'profile' && (
          <ProfileModule
            onShowToast={showToast}
            onUpdateCurrentUser={(updated) => setCurrentUser(updated)}
          />
        )}
        </Suspense>
      </ErrorBoundary>

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} position="top-center" maxVisible={3} />
    </AdminLayout>
  );
};

export const AdminApp: React.FC<AdminAppProps> = (props) => {
  return (
    <LanguageProvider>
      <AdminAppInner {...props} />
    </LanguageProvider>
  );
};

export default AdminApp;
