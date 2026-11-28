import React from 'react';
import {
  LayoutDashboard,
  Package,
  KeyRound,
  ShoppingBag,
  ShieldAlert,
  Wallet,
  QrCode,
  Link2,
  Key,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  Store,
  Lock,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  type SellerPortalTabId,
  type SellerSubRole,
  type ThemePresetPalette,
  isSellerTabAllowedForRole,
  formatSellerPortalHash,
} from './sellerPortalTheme';

export interface SellerPortalSidebarBadges {
  lowStockCount: number;
  reportedOrdersCount: number;
  unresolvedDisputesCount: number;
  sepayOpenExceptions: number;
  sepayOnline: boolean;
  sepayLocked: boolean;
}

interface SellerPortalSidebarProps {
  activeTab: SellerPortalTabId;
  onSelectTab: (tab: SellerPortalTabId) => void;
  subRole: SellerSubRole;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  palette: ThemePresetPalette;
  badges: SellerPortalSidebarBadges;
  storeName?: string;
}

interface NavGroupDef {
  id: string;
  labelKey: string;
  items: Array<{
    id: SellerPortalTabId;
    labelKey: string;
    icon: React.FC<{ className?: string }>;
    badgeCount?: number;
    badgeTone?: 'danger' | 'warn' | 'emerald';
    statusDot?: 'online' | 'locked' | null;
  }>;
}

export const SellerPortalSidebar: React.FC<SellerPortalSidebarProps> = ({
  activeTab,
  onSelectTab,
  subRole,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  palette,
  badges,
  storeName,
}) => {
  const { t } = useLanguage();

  const groups: NavGroupDef[] = [
    {
      id: 'overview',
      labelKey: 'sellerPortal.sidebar.groupOverview',
      items: [
        {
          id: 'dashboard',
          labelKey: 'sellerPortal.sidebar.dashboard',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      id: 'catalog',
      labelKey: 'sellerPortal.sidebar.groupCatalog',
      items: [
        {
          id: 'products',
          labelKey: 'sellerPortal.sidebar.products',
          icon: Package,
        },
        {
          id: 'codes',
          labelKey: 'sellerPortal.sidebar.codes',
          icon: KeyRound,
          badgeCount: badges.lowStockCount > 0 ? badges.lowStockCount : undefined,
          badgeTone: 'warn',
        },
      ],
    },
    {
      id: 'orders',
      labelKey: 'sellerPortal.sidebar.groupOrders',
      items: [
        {
          id: 'orders',
          labelKey: 'sellerPortal.sidebar.orders',
          icon: ShoppingBag,
          badgeCount: badges.reportedOrdersCount > 0 ? badges.reportedOrdersCount : undefined,
          badgeTone: 'danger',
        },
        {
          id: 'disputes',
          labelKey: 'sellerPortal.sidebar.disputes',
          icon: ShieldAlert,
          badgeCount: badges.unresolvedDisputesCount > 0 ? badges.unresolvedDisputesCount : undefined,
          badgeTone: 'danger',
        },
      ],
    },
    {
      id: 'finance_integrations',
      labelKey: 'sellerPortal.sidebar.groupFinanceIntegrations',
      items: [
        {
          id: 'sepay',
          labelKey: 'sellerPortal.sidebar.sepay',
          icon: QrCode,
          badgeCount: badges.sepayOpenExceptions > 0 ? badges.sepayOpenExceptions : undefined,
          badgeTone: 'danger',
          statusDot: badges.sepayLocked ? 'locked' : badges.sepayOnline ? 'online' : null,
        },
        {
          id: 'finance',
          labelKey: 'sellerPortal.sidebar.finance',
          icon: Wallet,
        },
        {
          id: 'affiliate',
          labelKey: 'sellerPortal.sidebar.affiliate',
          icon: Link2,
        },
        {
          id: 'api_keys',
          labelKey: 'sellerPortal.sidebar.apiKeys',
          icon: Key,
        },
        {
          id: 'settings',
          labelKey: 'sellerPortal.sidebar.settings',
          icon: Settings,
        },
      ],
    },
  ];

  // Lọc các nhóm và mục theo RBAC thực tế của sub_role
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isSellerTabAllowedForRole(item.id, subRole)),
    }))
    .filter((group) => group.items.length > 0);

  const renderNavBody = (isMobileDrawer: boolean) => (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 select-none">
      {/* Brand header */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg ${palette.accentBgClass} text-white flex items-center justify-center shrink-0 shadow-sm`}
          >
            <Store className="w-4 h-4" aria-hidden="true" />
          </div>
          {(!collapsed || isMobileDrawer) && (
            <div className="min-w-0">
              <div className="text-xs font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                {t('sellerPortal.brandTitle')}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {storeName || t('sellerPortal.brandSubtitle')}
              </div>
            </div>
          )}
        </div>

        {isMobileDrawer ? (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label={t('sellerPortal.sidebar.closeMenu')}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? t('sellerPortal.sidebar.expand') : t('sellerPortal.sidebar.collapse')}
            aria-label={collapsed ? t('sellerPortal.sidebar.expand') : t('sellerPortal.sidebar.collapse')}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" aria-hidden="true" /> : <ChevronLeft className="w-4 h-4" aria-hidden="true" />}
          </button>
        )}
      </div>

      {/* Semantic Navigation Landmark (Natural Tab order, aria-current="page" + non-color indicator) */}
      <nav
        aria-label={t('sellerPortal.sidebar.navAriaLabel')}
        className="flex-1 overflow-y-auto py-3 px-2 space-y-4"
      >
        {visibleGroups.map((group) => (
          <div key={group.id}>
            {(!collapsed || isMobileDrawer) && (
              <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t(group.labelKey)}
              </div>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const label = t(item.labelKey);
                const href = formatSellerPortalHash(item.id);

                return (
                  <li key={item.id}>
                    <a
                      href={href}
                      aria-current={isActive ? 'page' : undefined}
                      title={collapsed && !isMobileDrawer ? label : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        onSelectTab(item.id);
                        if (isMobileDrawer) onCloseMobile();
                      }}
                      className={`group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 ${
                        isActive
                          ? `${palette.accentSoftBgClass} ${palette.accentTextClass} font-bold`
                          : 'text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800/80'
                      } ${collapsed && !isMobileDrawer ? 'justify-center px-1.5' : ''}`}
                    >
                      {/* Non-color structural active indicator bar (WCAG 1.4.1) */}
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full ${palette.accentBarClass}`}
                        />
                      )}
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {(!collapsed || isMobileDrawer) && (
                        <span className="truncate flex-1">{label}</span>
                      )}
                      {(!collapsed || isMobileDrawer) && item.statusDot === 'online' && (
                        <span
                          title={t('sellerPortal.topbar.sepayOnline')}
                          className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                        />
                      )}
                      {(!collapsed || isMobileDrawer) && item.statusDot === 'locked' && (
                        <span
                          title={t('sellerPortal.topbar.sepayLocked')}
                          className="w-2 h-2 rounded-full bg-rose-500 shrink-0"
                        />
                      )}
                      {item.badgeCount !== undefined && item.badgeCount > 0 && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none shrink-0 ${
                            item.badgeTone === 'danger'
                              ? 'bg-rose-600 text-white'
                              : item.badgeTone === 'warn'
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-emerald-600 text-white'
                          } ${collapsed && !isMobileDrawer ? 'absolute -top-1 -right-1 px-1 text-[9px]' : ''}`}
                        >
                          {item.badgeCount > 99 ? '99+' : item.badgeCount}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Role restriction footer hint when logged in as Subaccount */}
      {subRole !== 'OWNER' && (!collapsed || isMobileDrawer) && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <Lock className="w-3.5 h-3.5 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
            <span>{t('sellerPortal.sidebar.subRoleRestrictedHint')}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop persistent collapsible sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-[width] duration-200 ${
          collapsed ? 'w-[68px]' : 'w-[240px]'
        }`}
      >
        <div className="sticky top-0 h-dvh">{renderNavBody(false)}</div>
      </aside>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label={t('sellerPortal.sidebar.navAriaLabel')}
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 w-[264px] max-w-[82vw] h-full shadow-2xl">
            {renderNavBody(true)}
          </div>
        </div>
      )}
    </>
  );
};
