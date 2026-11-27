import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import {
  ShoppingBag,
  ShieldCheck,
  Search,
  ChevronRight,
  Share2,
  LayoutGrid,
  List,
  Package,
  Truck,
  Zap,
  X,
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { marketingService } from '../services/marketingService';
import { formatCore, smartVietnameseMatch } from '../utils/textUtils';
import { getProductPackages, getProductMinPrice, groupStoreProductsByGame } from '../utils/productPackageUtils';
import type { StoreProduct, UserProfile, ProductPackageVariant } from '../types/game';
import { EventCountdownBadge } from './countdown/EventCountdownBadge';
import { eventSchedulerService } from '../services/eventSchedulerService';
import { templateService } from '../services/templateService';
import { offerService } from '../services/offerService';
import { PHYSICAL_DEFAULT_IMAGE_URL, resolveProductCoverImage } from '../utils/safeImageUrl';

interface StoreViewProps {
  onSelectProduct: (product: StoreProduct) => void;
  onDirectCheckout?: (product: StoreProduct, packageVariant?: ProductPackageVariant | null) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  currentUser?: UserProfile | null;
  onOpenAuth?: () => void;
  onOpenShare?: (product: StoreProduct) => void;
  initialGameSlug?: string;
  onClearGameFilter?: () => void;
}

const STORE_VIEW_MODE_STORAGE_KEY = 'pine_store_view_mode';

export const StoreView: React.FC<StoreViewProps> = ({
  onSelectProduct,
  onDirectCheckout,
  onShowToast,
  currentUser,
  onOpenAuth,
  onOpenShare,
  initialGameSlug,
  onClearGameFilter,
}) => {
  const { t, language, formatCurrency } = useLanguage();
  const isVndMode = dataService.getWebsiteBranding()?.currencyMode === 'VND';
  const formatProductPrice = (amount: number, prod?: StoreProduct) =>
    isVndMode || (prod as any)?.product_type === 'physical' || (prod as any)?.industry !== 'gaming'
      ? formatCurrency(amount)
      : formatCore(amount);
  const [products, setProducts] = useState<StoreProduct[]>(() => dataService.getStoreProducts().map((p) => templateService.resolveStoreProduct(p)));
  const [categoriesList, setCategoriesList] = useState(() => dataService.getStoreCategories());
  const [filterType, setFilterType] = useState<string>('all');
  const [gameFilter, setGameFilter] = useState<string>(initialGameSlug || 'all');
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    setGameFilter(initialGameSlug && initialGameSlug !== 'all' ? initialGameSlug : 'all');
  }, [initialGameSlug]);
  const [cmsIntro, setCmsIntro] = useState(() => dataService.getContentByKey('store_section'));
  const [isGlobalSoldEnabled, setIsGlobalSoldEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('pine_store_global_show_sold') !== 'false' && localStorage.getItem('pine_admin_show_sold_store') !== 'false';
  });

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORE_VIEW_MODE_STORAGE_KEY) as 'grid' | 'list';
      if (saved === 'grid' || saved === 'list') return saved;
    }
    return 'grid';
  });

  const handleSetViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem(STORE_VIEW_MODE_STORAGE_KEY, mode);
    } catch {}
  };

  useEffect(() => {
    const handleUpdate = () => {
      setProducts(dataService.getStoreProducts().map((p) => templateService.resolveStoreProduct(p)));
      setCmsIntro(dataService.getContentByKey('store_section'));
      setCategoriesList([...dataService.getStoreCategories()]);
      setIsGlobalSoldEnabled(
        localStorage.getItem('pine_store_global_show_sold') !== 'false' && localStorage.getItem('pine_admin_show_sold_store') !== 'false'
      );
    };
    dataService.syncWithCloudflareKV().catch(() => {});
    offerService.fetchOffers().catch(() => {});
    const unsub = dataService.subscribe(handleUpdate);
    const unsubTpl = templateService.subscribe(handleUpdate);
    const unsubStock = marketingService.subscribeStockChange(handleUpdate);
    const unsubSold = marketingService.subscribeSoldCountChange(handleUpdate);
    window.addEventListener('pine_store_products_updated', handleUpdate);
    window.addEventListener('pine_admin_data_updated', handleUpdate);
    window.addEventListener('pine_virtual_stock_updated', handleUpdate);
    window.addEventListener('pine_sold_count_updated', handleUpdate);
    window.addEventListener('pine_store_settings_updated', handleUpdate);
    window.addEventListener('pine_universal_templates_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      unsub();
      unsubTpl();
      unsubStock();
      unsubSold();
      window.removeEventListener('pine_store_products_updated', handleUpdate);
      window.removeEventListener('pine_admin_data_updated', handleUpdate);
      window.removeEventListener('pine_virtual_stock_updated', handleUpdate);
      window.removeEventListener('pine_sold_count_updated', handleUpdate);
      window.removeEventListener('pine_store_settings_updated', handleUpdate);
      window.removeEventListener('pine_universal_templates_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const handleShareProduct = (product: StoreProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenShare) {
      onOpenShare(product);
    } else {
      const origin = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? window.location.origin
        : 'https://universal-mall-shop.pages.dev';
      const shareUrl = `${origin}/store#product=${product.id}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl);
        onShowToast(
          t('store.copySuccess'),
          t('store.copyUrl', { url: shareUrl }),
          'success'
        );
      }
    }
  };

  const handleProductAction = (product: StoreProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.stock_quantity <= 0) {
      onShowToast(
        t('store.outOfStock'),
        t('store.outOfStockDesc'),
        'error'
      );
      return;
    }

    const packages = getProductPackages(product);
    const hasMultiplePackages = Array.isArray(packages) && packages.length > 1;

    if (hasMultiplePackages) {
      onSelectProduct(product);
      return;
    }

    // Gói chỉ có 1 mã/gói: đi thẳng tới thanh toán (ProductCheckoutModal)
    const singlePkg = (Array.isArray(packages) && packages.length > 0) ? packages[0] : null;
    if (!currentUser && onOpenAuth) {
      onOpenAuth();
      onShowToast(t('store.authRequired'), t('store.authRequiredDesc'), 'info');
      return;
    }

    if (onDirectCheckout) {
      onDirectCheckout(product, singlePkg);
    } else {
      onSelectProduct(product);
    }
  };

  const getCategoryLabel = (cat: { id: string; label: string }) => {
    const idLower = (cat.id || '').toLowerCase();
    const labelLower = (cat.label || '').toLowerCase();
    if (idLower === 'pack' || labelLower.includes('gói nạp') || labelLower.includes('top-up')) {
      return t('store.catPack');
    }
    if (idLower === 'monthly' || labelLower.includes('thẻ tháng') || labelLower.includes('pass')) {
      return t('store.catMonthly');
    }
    if (idLower === 'gift' || labelLower.includes('code vip') || labelLower.includes('vip code')) {
      return t('store.catGift');
    }
    if (idLower === 'account' || labelLower.includes('tài khoản') || labelLower.includes('account')) {
      return t('store.catAccount');
    }
    if (idLower === 'digital' || labelLower.includes('hàng số') || labelLower.includes('digital')) {
      return t('store.catDigital');
    }
    return cat.label;
  };

  const categoryTabs = [
    { id: 'all', label: t('store.allPackages'), icon: '📦' },
    ...categoriesList.map((c) => ({
      id: c.id,
      label: getCategoryLabel(c),
      icon: c.icon || '🏷️',
    })),
  ];

  // Gom nhóm các gói nạp theo từng Tựa Game thành sản phẩm đại diện
  const groupedProducts = useMemo(() => groupStoreProductsByGame(products), [products]);

  // Filter & sort products (Mặc định ưu tiên hàng còn lên trên đầu)
  const filtered = groupedProducts
    .filter((p) => {
      if (p.is_active === false || p.is_active === 0 || (p as any).is_active === '0') return false;
      if (filterType !== 'all') {
        const target = filterType.toLowerCase().trim();
        const pkgType = (p.package_type || '').toLowerCase().trim();
        const cat = (p.category || '').toLowerCase().trim();
        const catLabel = (p.category_label || '').toLowerCase().trim();
        const matches = pkgType === target || cat === target || catLabel === target;
        if (!matches) return false;
      }
      if (gameFilter !== 'all') {
        const targetGame = gameFilter.toLowerCase().trim();
        if ((p.game_slug || '').toLowerCase().trim() !== targetGame && (p.category || '').toLowerCase().trim() !== targetGame) {
          return false;
        }
      }
      if (!search.trim()) return true;
      const childNames = Array.isArray(p.packages) ? p.packages.map((pkg) => pkg.name) : [];
      const gameSlugWords = p.game_slug ? p.game_slug.replace(/[-_]/g, ' ') : '';
      return smartVietnameseMatch(
        [
          p.title,
          p.game_name,
          p.game_slug,
          gameSlugWords,
          p.description,
          p.package_type,
          p.category,
          p.category_label,
          p.badge,
          ...childNames,
        ],
        search
      );
    })
    .sort((a, b) => {
      const inStockA = (Number(a.stock_quantity) || 0) > 0 ? 1 : 0;
      const inStockB = (Number(b.stock_quantity) || 0) > 0 ? 1 : 0;

      // 1. Mặc định ưu tiên hàng còn lên trên đầu
      if (inStockA !== inStockB) {
        return inStockB - inStockA;
      }

      // 2. Nếu cùng còn hàng, ưu tiên tồn kho nhiều hơn
      if (inStockA > 0) {
        const diff = (Number(b.stock_quantity) || 0) - (Number(a.stock_quantity) || 0);
        if (diff !== 0) return diff;
      }

      // 3. Giữ thứ tự tạo mới nhất
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });

  return (
    <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5 animate-fade-in">
      {/* Shopee-Style Store Header Banner (High Contrast Light & Dark) */}
      <div className="relative p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#ee4d2d] via-[#f55c38] to-[#ff7337] text-white shadow-md overflow-hidden">
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] sm:text-xs font-bold border border-white/30">
                <ShoppingBag className="w-3 sm:w-3.5 h-3 sm:h-3.5" aria-hidden="true" />
                <span>{language === 'en' ? t('store.badge') : (cmsIntro?.extraData?.badge || t('store.badge'))}</span>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#ffe97a] text-[#d0011b] text-[11px] font-extrabold shadow-xs">
                {t('mall.search.allProductsCount', { count: filtered.length })}
              </span>
            </div>
            <h1 className="font-display font-extrabold text-lg sm:text-2xl md:text-3xl text-white tracking-tight">
              {language === 'en' ? t('store.headerTitle') : (cmsIntro?.title || t('store.headerTitle'))}
            </h1>
            <p className="text-xs sm:text-sm text-orange-50/95 leading-relaxed line-clamp-2 sm:line-clamp-none">
              {language === 'en' ? t('store.headerDesc') : (cmsIntro?.content || t('store.headerDesc'))}
            </p>
          </div>

          <div className="flex items-center gap-2.5 bg-white/15 backdrop-blur-xs border border-white/25 px-3 py-2 rounded-xl shrink-0">
            <ShieldCheck className="w-5 h-5 text-[#ffe97a] shrink-0" aria-hidden="true" />
            <div>
              <span className="font-heading font-bold text-xs text-white block">
                {language === 'en' ? t('store.warrantyTitle') : (cmsIntro?.extraData?.warrantyTitle || t('store.warrantyTitle'))}
              </span>
              <span className="text-[10px] sm:text-[11px] text-orange-50/90">
                {language === 'en' ? t('store.warrantyDesc') : (cmsIntro?.extraData?.warrantyDesc || t('store.warrantyDesc'))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Shopee-Style Filter, Search & View Switcher Toolbar */}
      <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Type tabs - Horizontal scrollable on mobile */}
        <div className="relative flex-1 min-w-0 overflow-hidden w-full max-w-full">
          <div className="flex items-center gap-1.5 overflow-x-auto flex-nowrap scrollbar-none sm:flex-wrap pb-1 sm:pb-0 w-full max-w-full">
            {gameFilter !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setGameFilter('all');
                  onClearGameFilter?.();
                }}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer bg-[#d0011b] hover:bg-[#b50017] text-white shadow-xs active:scale-95"
                title={t('store.allPackages')}
              >
                <span>#{gameFilter}</span>
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
            {categoryTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={filterType === tab.id}
                onClick={() => setFilterType(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer active:scale-95 ${
                  filterType === tab.id
                    ? 'bg-[#ee4d2d] text-white shadow-xs border border-[#ee4d2d]'
                    : 'bg-white dark:bg-slate-800 hover:bg-orange-50/70 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#ee4d2d]/60 hover:text-[#ee4d2d]'
                }`}
              >
                <span aria-hidden="true">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-50 dark:from-slate-900 to-transparent sm:hidden z-10" />
        </div>

        {/* Search & View Mode Switcher */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative min-w-[180px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('store.searchPlaceholder')}
              aria-label={t('store.searchPlaceholder')}
              className="w-full pl-8 pr-7 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-base sm:text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-[#ee4d2d]/30 focus:border-[#ee4d2d] focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* View Mode Toggle (Grid vs List) */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded-lg shadow-xs shrink-0">
            <button
              type="button"
              aria-pressed={viewMode === 'grid'}
              onClick={() => handleSetViewMode('grid')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[#ee4d2d] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-[#ee4d2d] hover:bg-orange-50 dark:hover:bg-slate-700'
              }`}
              title={t('store.gridView')}
              aria-label={t('store.gridView')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              onClick={() => handleSetViewMode('list')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[#ee4d2d] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-[#ee4d2d] hover:bg-orange-50 dark:hover:bg-slate-700'
              }`}
              title={t('store.listView')}
              aria-label={t('store.listView')}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="py-14 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 my-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-slate-800 border border-orange-200/70 dark:border-slate-700 flex items-center justify-center mx-auto mb-3 text-[#ee4d2d]">
            <Package className="w-7 h-7" aria-hidden="true" />
          </div>
          <h3 className="font-heading font-bold text-base sm:text-lg text-slate-900 dark:text-slate-100 mb-1">
            {t('store.noProducts')}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            {t('store.noProductsDesc')}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* MODE 2: LIST VIEW (Shopee Horizontal Rows) */
        <div className="flex flex-col gap-2.5">
          {filtered.map((product) => {
            const flashSale = eventSchedulerService.getScheduleForProduct(product.id);
            const isFlashSaleLive = flashSale?.status === 'LIVE';
            const isFlashSaleUpcoming = flashSale?.status === 'UPCOMING';
            const isProductEscalating = product.sale_mode === 'escalating';
            const isPhysical = (product as any).product_type === 'physical';
            const effectivePrice = isProductEscalating
              ? (product.escalating_current_price ?? product.escalating_base_price ?? product.current_price)
              : (isFlashSaleLive && flashSale.event.sale_price ? flashSale.event.sale_price : product.current_price);
            const effectiveDiscount = isProductEscalating
              ? 0
              : (isFlashSaleLive && flashSale.event.discount_percent ? flashSale.event.discount_percent : product.discount_percent);

            const packages = getProductPackages(product);
            const hasMultiplePackages = Array.isArray(packages) && packages.length > 1;
            const displayPrice = hasMultiplePackages ? getProductMinPrice(product) : effectivePrice;
            const rawCoverSrc = resolveProductCoverImage(product, '/package-placeholder.svg');
            const coverSrc = rawCoverSrc.includes('test-game.webp') ? '/package-placeholder.svg' : rawCoverSrc;
            const isPlaceholder = coverSrc.includes('package-placeholder.svg');

            const displayStock =
              product.stock_quantity <= 0
                ? 0
                : marketingService.getDisplayStock(product.id, product.stock_quantity);
            const displaySold = marketingService.getSoldDisplay(product);
            const localizedTitle = language === 'en' && (product as any).title_en ? (product as any).title_en : product.title;

            return (
              <article
                key={product.id}
                onClick={() => onSelectProduct({ ...product, current_price: effectivePrice, discount_percent: effectiveDiscount })}
                className="bg-white dark:bg-slate-900 hover:bg-orange-50/30 dark:hover:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#ee4d2d] shadow-xs hover:shadow-md p-2.5 sm:p-3 transition-all duration-200 flex items-center justify-between gap-2.5 sm:gap-3 cursor-pointer group relative overflow-hidden"
              >
                {/* Product Thumbnail */}
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-slate-50 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                  <img
                    src={coverSrc}
                    alt={localizedTitle}
                    className={`w-full h-full transition-transform duration-300 ${isPlaceholder ? 'object-contain p-2' : 'object-cover group-hover:scale-105'}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (isPhysical && !target.src.includes(PHYSICAL_DEFAULT_IMAGE_URL)) {
                        target.src = PHYSICAL_DEFAULT_IMAGE_URL;
                        return;
                      }
                      target.onerror = null;
                      target.className = 'w-full h-full object-contain p-2';
                      target.src = '/package-placeholder.svg';
                    }}
                  />
                  {(effectiveDiscount > 0 || isFlashSaleLive) && (
                    <div className={`absolute top-0 right-0 px-1 py-0.5 rounded-bl-xs text-[9px] font-extrabold leading-none ${isFlashSaleLive ? 'bg-[#d0011b] text-white' : 'bg-[#ffe97a] text-[#ee4d2d]'}`}>
                      -{effectiveDiscount}%
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-xs bg-[#d0011b] text-white shrink-0 leading-none">
                      {t('shopeePhysical.mallBadge')}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-xs bg-orange-50 dark:bg-orange-500/15 text-[#ee4d2d] border border-[#ee4d2d]/25 truncate max-w-[140px] sm:max-w-none leading-none">
                      {product.game_name || (product as any).category_label || t('store.allProducts')}
                    </span>
                    {product.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-xs bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-500/30 shrink-0 leading-none">
                        {product.badge}
                      </span>
                    )}
                    {isFlashSaleUpcoming && flashSale && (
                      <EventCountdownBadge
                        targetDate={flashSale.event.start_time}
                        label={t('store.saleUpcoming')}
                        theme={flashSale.event.theme || 'fire'}
                        variant="pill"
                        onExpire={() => setProducts([...dataService.getStoreProducts()])}
                      />
                    )}
                    {isFlashSaleLive && flashSale && (
                      <EventCountdownBadge
                        targetDate={flashSale.event.end_time}
                        label={t('store.saleEnding')}
                        theme={flashSale.event.theme || 'fire'}
                        variant="pill"
                        onExpire={() => setProducts([...dataService.getStoreProducts()])}
                      />
                    )}
                  </div>
                  <h3 className="font-heading font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 group-hover:text-[#ee4d2d] transition-colors truncate">
                    {localizedTitle}
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    {displayStock <= 0 ? (
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        {t('store.outOfStock')}
                      </span>
                    ) : (
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {t('store.inStock')}
                      </span>
                    )}
                    {isGlobalSoldEnabled && product.show_sold_count !== false && (
                      <>
                        <span aria-hidden="true">•</span>
                        <span className="text-slate-600 dark:text-slate-400 hidden xs:inline">
                          {t('store.soldCount', { count: displaySold })}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Price & Action */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <div className="text-right">
                    <div className="font-display font-extrabold text-xs sm:text-sm md:text-base text-[#ee4d2d] flex items-center justify-end gap-1">
                      {hasMultiplePackages && <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">{t('store.fromPrice')}</span>}
                      <span>{formatProductPrice(displayPrice, product)}</span>
                    </div>
                    {hasMultiplePackages && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-xs bg-orange-50 dark:bg-orange-500/15 text-[#ee4d2d] border border-[#ee4d2d]/25 inline-block leading-none">
                        {packages.length === 1 ? t('store.packageCountSingular', { count: packages.length }) : t('store.packageCountPlural', { count: packages.length })}
                      </span>
                    )}
                    {product.original_price > effectivePrice && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 line-through font-mono hidden xs:block">
                        {formatProductPrice(product.original_price, product)}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={product.stock_quantity <= 0}
                    onClick={(e) => handleProductAction(product, e)}
                    className={`min-h-[40px] h-[42px] px-3 sm:px-4 py-2 rounded-lg font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1 shrink-0 ${
                      product.stock_quantity <= 0
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700 cursor-not-allowed'
                        : isFlashSaleLive
                        ? 'bg-gradient-to-r from-[#d0011b] to-[#ee4d2d] hover:opacity-95 text-white cursor-pointer active:scale-95'
                        : 'bg-[#ee4d2d] hover:bg-[#d73211] text-white cursor-pointer active:scale-95'
                    }`}
                  >
                    {product.stock_quantity <= 0 ? (
                      <span>{t('store.outOfStock')}</span>
                    ) : (
                      <>
                        <span>{hasMultiplePackages ? t('store.selectPackage') : (isFlashSaleLive ? t('store.huntSale') : t('store.buyNow'))}</span>
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleShareProduct(product, e)}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-[#ee4d2d] border border-slate-200 dark:border-slate-700 transition-all cursor-pointer active:scale-90 hidden sm:flex"
                    title={t('store.shareProduct')}
                    aria-label={t('store.shareProduct')}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* MODE 1: GRID VIEW (Shopee Standard 2 cols mobile -> 5 cols desktop) */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">
          {filtered.map((product) => {
            const flashSale = eventSchedulerService.getScheduleForProduct(product.id);
            const isFlashSaleLive = flashSale?.status === 'LIVE';
            const isFlashSaleUpcoming = flashSale?.status === 'UPCOMING';
            const isProductEscalating = product.sale_mode === 'escalating';
            const isPhysical = (product as any).product_type === 'physical';
            const effectivePrice = isProductEscalating
              ? (product.escalating_current_price ?? product.escalating_base_price ?? product.current_price)
              : (isFlashSaleLive && flashSale.event.sale_price ? flashSale.event.sale_price : product.current_price);
            const effectiveDiscount = isProductEscalating
              ? 0
              : (isFlashSaleLive && flashSale.event.discount_percent ? flashSale.event.discount_percent : product.discount_percent);

            const packages = getProductPackages(product);
            const hasMultiplePackages = Array.isArray(packages) && packages.length > 1;
            const displayPrice = hasMultiplePackages ? getProductMinPrice(product) : effectivePrice;
            const rawCoverSrc = resolveProductCoverImage(product, '/package-placeholder.svg');
            const coverSrc = rawCoverSrc.includes('test-game.webp') ? '/package-placeholder.svg' : rawCoverSrc;
            const isPlaceholder = coverSrc.includes('package-placeholder.svg');
            const localizedTitle = language === 'en' && (product as any).title_en ? (product as any).title_en : product.title;
            const displayStock =
              product.stock_quantity <= 0
                ? 0
                : marketingService.getDisplayStock(product.id, product.stock_quantity);
            const displaySold = marketingService.getSoldDisplay(product);

            return (
              <article
                key={product.id}
                onClick={() => onSelectProduct({ ...product, current_price: effectivePrice, discount_percent: effectiveDiscount })}
                className="group h-full bg-white dark:bg-slate-900 rounded-sm border border-slate-200/90 dark:border-slate-800 hover:border-[#ee4d2d] shadow-xs hover:shadow-[0_4px_16px_rgba(238,77,45,0.14)] hover:-translate-y-0.5 hover:z-10 transition-all duration-200 flex flex-col overflow-hidden cursor-pointer relative"
              >
                {/* Square 1:1 Shopee Thumbnail */}
                <div className="relative aspect-square w-full overflow-hidden bg-slate-50 dark:bg-slate-800 shrink-0">
                  <img
                    src={coverSrc}
                    alt={localizedTitle}
                    className={`w-full h-full transition-transform duration-300 ${isPlaceholder ? 'object-contain p-4 bg-slate-50 dark:bg-slate-800' : 'object-cover group-hover:scale-105'}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (isPhysical && !target.src.includes(PHYSICAL_DEFAULT_IMAGE_URL)) {
                        target.src = PHYSICAL_DEFAULT_IMAGE_URL;
                        return;
                      }
                      target.onerror = null;
                      target.className = 'w-full h-full object-contain p-4 bg-slate-50 dark:bg-slate-800';
                      target.src = '/package-placeholder.svg';
                    }}
                  />

                  {/* Top-left Mall / Badge Ribbon */}
                  <div className="absolute top-2 left-0 flex flex-col gap-1 items-start z-10">
                    <span className="bg-[#d0011b] text-white text-[10px] leading-none font-bold px-1.5 py-1 rounded-r-xs shadow-xs">
                      {t('shopeePhysical.mallBadge')}
                    </span>
                    {product.badge && (
                      <span className="bg-[#ee4d2d] text-white text-[9px] leading-none font-bold px-1.5 py-0.5 rounded-r-xs shadow-xs">
                        {product.badge}
                      </span>
                    )}
                  </div>

                  {/* Top-right Discount Flag */}
                  {(effectiveDiscount > 0 || isFlashSaleLive) && (
                    <div className={`absolute top-0 right-0 px-1.5 py-1 rounded-bl-xs text-[11px] font-extrabold leading-none shadow-xs z-10 ${isFlashSaleLive ? 'bg-[#d0011b] text-white' : 'bg-[#ffe97a] text-[#ee4d2d]'}`}>
                      -{effectiveDiscount}%
                    </div>
                  )}

                  {/* Bottom-left Freeship / Instant Strip + Share button */}
                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-1.5 py-1 bg-gradient-to-t from-black/55 via-black/20 to-transparent">
                    {isPhysical ? (
                      <span className="bg-[#00bfa5] text-white text-[9px] leading-none font-extrabold px-1.5 py-1 rounded-xs flex items-center gap-1 tracking-tight shadow-xs">
                        <Truck className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                        <span>{t('shopeePhysical.freeshipXtra')}</span>
                      </span>
                    ) : (
                      <span className="bg-violet-600/95 text-white text-[9px] leading-none font-bold px-1.5 py-1 rounded-xs flex items-center gap-1 shadow-xs">
                        <Zap className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                        <span>{t('shopeePhysical.instant0s')}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleShareProduct(product, e)}
                      className="p-1 rounded bg-black/55 hover:bg-[#ee4d2d] text-white transition-colors cursor-pointer shrink-0"
                      title={t('store.shareProduct')}
                      aria-label={t('store.shareProduct')}
                    >
                      <Share2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      {product.game_name && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-xs bg-orange-50 dark:bg-orange-500/15 text-[#ee4d2d] border border-[#ee4d2d]/25 truncate max-w-full leading-none">
                          {product.game_name}
                        </span>
                      )}
                      {isFlashSaleUpcoming && flashSale && (
                        <EventCountdownBadge
                          targetDate={flashSale.event.start_time}
                          label={t('store.sale')}
                          theme={flashSale.event.theme || 'fire'}
                          variant="pill"
                          onExpire={() => setProducts([...dataService.getStoreProducts()])}
                        />
                      )}
                      {isFlashSaleLive && flashSale && (
                        <EventCountdownBadge
                          targetDate={flashSale.event.end_time}
                          label={t('store.saleEnding')}
                          theme={flashSale.event.theme || 'fire'}
                          variant="pill"
                          onExpire={() => setProducts([...dataService.getStoreProducts()])}
                        />
                      )}
                    </div>
                    <h3 className="font-medium text-xs text-slate-800 dark:text-slate-100 group-hover:text-[#ee4d2d] transition-colors line-clamp-2 min-h-[2.125rem] leading-snug">
                      {localizedTitle}
                    </h3>
                  </div>

                  {/* Price, Stock, Sold & Quick CTA */}
                  <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-baseline gap-1 flex-wrap">
                      {hasMultiplePackages && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{t('store.fromPrice')}</span>
                      )}
                      <span className="font-display font-bold text-sm sm:text-[15px] text-[#ee4d2d] leading-none">
                        {formatProductPrice(displayPrice, product)}
                      </span>
                      {!hasMultiplePackages && product.original_price > effectivePrice && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 line-through font-mono leading-none">
                          {formatProductPrice(product.original_price, product)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1 text-[10px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                      {displayStock <= 0 ? (
                        <span className="font-semibold text-rose-600 dark:text-rose-400">
                          {t('store.outOfStock')}
                        </span>
                      ) : hasMultiplePackages ? (
                        <span className="font-semibold text-[#ee4d2d]">
                          {packages.length === 1 ? t('store.packageCountSingular', { count: packages.length }) : t('store.packageCountPlural', { count: packages.length })}
                        </span>
                      ) : (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {t('store.inStock')}
                        </span>
                      )}
                      {isGlobalSoldEnabled && product.show_sold_count !== false && (
                        <span className="truncate">
                          {t('store.soldCount', { count: displaySold })}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={product.stock_quantity <= 0}
                      onClick={(e) => handleProductAction(product, e)}
                      className={`w-full min-h-[36px] py-1.5 px-2 rounded-xs font-bold text-xs transition-colors flex items-center justify-center gap-1 ${
                        product.stock_quantity <= 0
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                          : isFlashSaleLive
                          ? 'bg-gradient-to-r from-[#d0011b] to-[#ee4d2d] hover:opacity-95 text-white cursor-pointer'
                          : 'bg-[#ee4d2d] hover:bg-[#d73211] text-white cursor-pointer'
                      }`}
                    >
                      {product.stock_quantity <= 0 ? (
                        <span>{t('store.outOfStock')}</span>
                      ) : (
                        <>
                          <span className="truncate">{hasMultiplePackages ? t('store.selectPackage') : (isFlashSaleLive ? t('store.huntSale') : t('store.buyNow'))}</span>
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Shopee Signature Hover Bar ("Tìm sản phẩm tương tự" / "Find Similar") */}
                <div
                  aria-hidden="true"
                  className="hidden sm:flex items-center justify-center bg-[#ee4d2d] text-white text-[11px] font-semibold py-1.5 px-2 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
                >
                  {language === 'en' ? 'Find Similar' : 'Tìm sản phẩm tương tự'}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
