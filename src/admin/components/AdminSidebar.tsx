import React, { useState } from 'react';
import {
  LayoutDashboard,
  Gamepad2,
  Gift,
  CheckSquare,
  Users,
  Wallet,
  KeyRound,
  Package,
  ShoppingCart,
  Zap,
  Globe,
  ShieldAlert,
  UserCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Megaphone,
  BellRing,
  Rocket,
  X,
  Search,
  Bot,
  Newspaper,
  Clock,
  Mail,
  Send,
  Sparkles,
  Store,
  Ticket,
  SlidersHorizontal,
  Cpu,
  PlugZap,
  Link2,
  QrCode,
} from 'lucide-react';
import { AdminUser } from '../types/adminTypes';
import { normalizeVietnamese } from '../../utils/textUtils';
import { useLanguage } from '../../context/LanguageContext';
import { useBrand } from '../../context/BrandContext';

export type AdminModuleTab =
  | 'dashboard'
  | 'brand-identity'
  | 'games'
  | 'news'
  | 'free-codes'
  | 'giftcodes'
  | 'crawler'
  | 'marketing'
  | 'floating-notification'
  | 'homepage-sections'
  | 'growth'
  | 'members'
  | 'wallet'
  | 'private-codes'
  | 'code-inventory'
  | 'utilities'
  | 'missions'
  | 'event-scheduler'
  | 'email-notifications'
  | 'telegram'
  | 'orders'
  | 'marketplace'
  | 'intershop-affiliate'
  | 'seller-sepay'
  | 'platform-leads'
  | 'translations'
  | 'vouchers'
  | 'first-purchase'
  | 'sepay'
  | 'content'
  | 'api-keys'
  | 'automation-center'
  | 'supplier-connectors'
  | 'security-logs'
  | 'profile';

interface AdminSidebarProps {
  currentTab: AdminModuleTab;
  onSelectTab: (tab: AdminModuleTab) => void;
  pendingGiftcodesCount?: number;
  pendingOrdersCount?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  currentUser: AdminUser | null;
  onGoToClientSite?: () => void;
  onCloseMobile?: () => void;
}

interface NavSection {
  title: string;
  items: {
    id: AdminModuleTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    badgeColor?: string;
  }[];
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentTab,
  onSelectTab,
  pendingGiftcodesCount = 0,
  pendingOrdersCount = 0,
  collapsed,
  onToggleCollapse,
  currentUser,
  onGoToClientSite,
  onCloseMobile,
}) => {
  const { language, t } = useLanguage();
  const { brand } = useBrand();
  const isEn = language === 'en';
  const [navSearch, setNavSearch] = useState('');

  const sections: NavSection[] = [
    {
      title: t('adminSidebarStrict.k1'),
      items: [
        {
          id: 'dashboard',
          label: t('adminSidebarStrict.k2'),
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: t('adminSidebarStrict.k3'),
      items: [
        {
          id: 'brand-identity',
          label: t('brandIdentity.menuLabel'),
          icon: Sparkles,
          badge: t('brandIdentity.menuBadge') as any,
          badgeColor: 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold',
        },
        {
          id: 'games',
          label: t('adminSidebarStrict.k4'),
          icon: Gamepad2,
        },
        {
          id: 'news',
          label: t('adminSidebarStrict.k5'),
          icon: Newspaper,
        },
        {
          id: 'free-codes',
          label: t('adminSidebarStrict.k6'),
          icon: Gift,
        },
        {
          id: 'giftcodes',
          label: t('adminSidebarStrict.k7'),
          icon: CheckSquare,
          badge: pendingGiftcodesCount,
          badgeColor: 'bg-amber-500 text-white',
        },
        {
          id: 'crawler',
          label: t('adminSidebarStrict.k8'),
          icon: Bot,
        },
        {
          id: 'content',
          label: t('adminSidebarStrict.k9'),
          icon: Globe,
        },
        {
          id: 'translations',
          label: t('adminSidebarStrict.k10'),
          icon: Globe,
          badge: 'VI+EN',
          badgeColor: 'bg-cyan-500 text-neutral-950 font-bold',
        },
        {
          id: 'floating-notification',
          label: t('adminSidebarStrict.k11'),
          icon: BellRing,
        },
        {
          id: 'homepage-sections',
          label: t('adminSidebarStrict.k12'),
          icon: SlidersHorizontal,
        },
        {
          id: 'marketing',
          label: t('adminSidebarStrict.k13'),
          icon: Megaphone,
        },
        {
          id: 'email-notifications',
          label: t('adminSidebarStrict.k14'),
          icon: Mail,
          badge: t('adminSidebarStrict.k15'),
          badgeColor: 'bg-emerald-500 text-neutral-950 font-bold',
        },
        {
          id: 'telegram',
          label: t('adminSidebarStrict.k16'),
          icon: Send,
          badge: 'BOT',
          badgeColor: 'bg-[#229ED9] text-white font-bold',
        },
      ],
    },
    {
      title: t('adminSidebarStrict.k17'),
      items: [
        {
          id: 'code-inventory',
          label: t('adminSidebarStrict.k18'),
          icon: Package,
        },
        {
          id: 'utilities',
          label: t('adminSidebarStrict.k19'),
          icon: Wrench,
        },
        {
          id: 'private-codes',
          label: t('adminSidebarStrict.k20'),
          icon: KeyRound,
        },
        {
          id: 'event-scheduler',
          label: t('adminSidebarStrict.k21'),
          icon: Clock,
          badge: t('adminSidebarStrict.k22'),
          badgeColor: 'bg-amber-500 text-neutral-950 font-bold',
        },
        {
          id: 'orders',
          label: t('adminSidebarStrict.k23'),
          icon: ShoppingCart,
          badge: pendingOrdersCount,
          badgeColor: 'bg-sky-500 text-white',
        },
        {
          id: 'vouchers',
          label: t('adminSidebarStrict.k24'),
          icon: Ticket,
          badge: 'SHOPEE',
          badgeColor: 'bg-orange-500 text-white font-bold',
        },
        {
          id: 'first-purchase',
          label: t('adminSidebarStrict.k25'),
          icon: Sparkles,
          badge: 'HOT',
          badgeColor: 'bg-rose-500 text-white font-bold',
        },
        {
          id: 'marketplace',
          label: t('adminSidebarStrict.k26'),
          icon: Store,
          badge: t('adminSidebarStrict.k27'),
          badgeColor: 'bg-emerald-500 text-neutral-950 font-bold',
        },
        {
          id: 'intershop-affiliate',
          label: t('intershopAffiliate.menuLabel'),
          icon: Link2,
        },
        {
          id: 'seller-sepay',
          label: t('adminSellerSepay.menuLabel'),
          icon: QrCode,
        },
        {
          id: 'platform-leads',
          label: t('adminSidebarStrict.k28'),
          icon: Rocket,
          badge: 'LEADS',
          badgeColor: 'bg-amber-500 text-neutral-950 font-bold',
        },
      ],
    },
    {
      title: t('adminSidebarStrict.k29'),
      items: [
        {
          id: 'members',
          label: t('adminSidebarStrict.k30'),
          icon: Users,
        },
        {
          id: 'wallet',
          label: t('adminSidebarStrict.k31'),
          icon: Wallet,
        },
        {
          id: 'sepay',
          label: t('adminSidebarStrict.k32'),
          icon: Zap,
        },
      ],
    },
    {
      title: t('adminSidebarStrict.k33'),
      items: [
        {
          id: 'missions',
          label: t('adminSidebarStrict.k34'),
          icon: CheckSquare,
        },
        {
          id: 'growth',
          label: t('adminSidebarStrict.k35'),
          icon: Rocket,
        },
      ],
    },
    {
      title: t('adminSidebarStrict.k36'),
      items: [
        {
          id: 'automation-center',
          label: t('automationCenter.menuLabel'),
          icon: Cpu,
          badge: 'LIVE',
          badgeColor: 'bg-purple-500 text-white font-bold',
        },
        {
          id: 'supplier-connectors',
          label: t('supplierConnectors.menuLabel'),
          icon: PlugZap,
        },
        {
          id: 'api-keys',
          label: t('adminSidebarStrict.k37'),
          icon: KeyRound,
          badge: t('adminSidebarStrict.k38'),
          badgeColor: 'bg-indigo-500 text-white font-bold',
        },
        {
          id: 'security-logs',
          label: t('adminSidebarStrict.k39'),
          icon: ShieldAlert,
        },
        {
          id: 'profile',
          label: t('adminSidebarStrict.k40'),
          icon: UserCircle,
        },
      ],
    },
  ];

  const filteredSections = navSearch.trim()
    ? sections
        .map((sec) => ({
          ...sec,
          items: sec.items.filter((item) =>
            normalizeVietnamese(item.label).includes(normalizeVietnamese(navSearch))
          ),
        }))
        .filter((sec) => sec.items.length > 0)
    : sections;

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen border-r border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 flex flex-col ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4 dark:border-slate-800">
        {!collapsed ? (
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20 overflow-hidden">
              <img src={brand.logoUrl || '/logo.webp'} alt={brand.brandName} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white truncate" title={brand.brandName}>
                {brand.brandName}
              </h1>
              <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                PRO PORTAL v2.5
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md overflow-hidden">
            <img src={brand.logoUrl || '/logo.webp'} alt={brand.brandName} className="w-full h-full object-cover" />
          </div>
        )}

        {onCloseMobile ? (
          <button
            onClick={onCloseMobile}
            className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title={t?.admin?.sidebar?.collapse || t('adminSidebarStrict.k41')}
            aria-label={t?.admin?.sidebar?.collapse || t('adminSidebarStrict.k42')}
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}

        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title={collapsed ? t('adminSidebarStrict.k43') : t('adminSidebarStrict.k44')}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 scrollbar-thin">
        {!collapsed && (
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              placeholder={t('adminSidebarStrict.k45')}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-200"
            />
            {navSearch && (
              <button
                type="button"
                onClick={() => setNavSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {filteredSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {!collapsed && (
              <div className="px-3 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                {section.title}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;

                return (
                  <React.Fragment key={item.id}>
                    <button
                      onClick={() => {
                        onSelectTab(item.id);
                        if (item.id === 'news' && currentTab !== 'news') {
                          window.location.hash = '#/news';
                          window.dispatchEvent(new CustomEvent('pine_admin_news_subtab', { detail: 'news' }));
                        }
                      }}
                      title={collapsed ? item.label : undefined}
                      className={`group relative flex w-full items-center rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-150 ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                      } ${collapsed ? 'justify-center' : 'justify-between'}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 flex-shrink-0 transition-transform group-hover:scale-110 ${
                            isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'
                          }`}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </div>

                      {(typeof item.badge === 'number' ? item.badge > 0 : Boolean(item.badge)) ? (
                        collapsed ? (
                          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
                        ) : (
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                              item.badgeColor || 'bg-indigo-500 text-white'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )
                      ) : null}
                    </button>

                    {item.id === 'news' && !collapsed && (
                      <div className="ml-5 pl-2 border-l-2 border-indigo-200 dark:border-indigo-900/60 space-y-1 my-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTab('news');
                            window.location.hash = '#/news';
                            window.dispatchEvent(new CustomEvent('pine_admin_news_subtab', { detail: 'news' }));
                          }}
                          className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                            currentTab === 'news' && (typeof window !== 'undefined' && !window.location.hash.includes('tab=events') && !window.location.hash.includes('tab=pending'))
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-bold'
                              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                        >
                          <Newspaper className="w-3 h-3 shrink-0" />
                          <span>{t('adminSidebarStrict.k50')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTab('news');
                            window.location.hash = '#/news?tab=events';
                            window.dispatchEvent(new CustomEvent('pine_admin_news_subtab', { detail: 'events' }));
                          }}
                          className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                            currentTab === 'news' && (typeof window !== 'undefined' && window.location.hash.includes('tab=events'))
                              ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 font-bold'
                              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                        >
                          <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>{t('adminSidebarStrict.k46')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTab('news');
                            window.location.hash = '#/news?tab=pending';
                            window.dispatchEvent(new CustomEvent('pine_admin_news_subtab', { detail: 'pending' }));
                          }}
                          className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                            currentTab === 'news' && (typeof window !== 'undefined' && window.location.hash.includes('tab=pending'))
                              ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 font-bold'
                              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                        >
                          <Clock className="w-3 h-3 text-purple-500 shrink-0" />
                          <span>{t('adminSidebarStrict.k47')}</span>
                        </button>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Info & Client Link */}
      <div className="border-t border-slate-100 p-3 dark:border-slate-800 space-y-2">
        {onGoToClientSite && (
          <button
            onClick={onGoToClientSite}
            className={`flex w-full items-center rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors ${
              collapsed ? 'justify-center' : 'justify-between'
            }`}
            title={t('adminSidebarStrict.k48')}
          >
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-indigo-500" />
              {!collapsed && <span>{t('adminSidebarStrict.k49')}</span>}
            </div>
            {!collapsed && <span className="text-[10px] text-slate-400">↗</span>}
          </button>
        )}

        {/* User preview */}
        <div
          onClick={() => onSelectTab('profile')}
          className={`flex cursor-pointer items-center rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
            collapsed ? 'justify-center' : 'gap-3'
          }`}
        >
          <img
            src={currentUser?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Admin'}
            alt="Avatar"
            className="h-8 w-8 rounded-full ring-2 ring-indigo-500/30 object-cover"
          />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                {currentUser?.displayName || 'Admin Quản Trị'}
              </p>
              <p className="truncate text-[10px] text-slate-400 capitalize">
                {currentUser?.role || 'Super Admin'}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
