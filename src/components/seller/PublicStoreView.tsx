import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Store,
  ShieldCheck,
  Clock,
  Package,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShoppingBag,
  X,
  PauseCircle,
  ShoppingCart,
  Star,
  QrCode,
  RefreshCw,
  Search,
  Share2,
  Megaphone,
  Award,
  Zap,
  Truck,
  Calendar,
  FileCheck2,
  SlidersHorizontal,
} from 'lucide-react';
import QRCode from 'qrcode';
import { dataService } from '../../services/dataService';
import { cartService } from '../../services/cartService';
import { useBrand } from '../../context/BrandContext';
import { useLanguage } from '../../context/LanguageContext';
import { formatCore } from '../../utils/textUtils';
import { resolveProductCoverImage, PHYSICAL_DEFAULT_IMAGE_URL } from '../../utils/safeImageUrl';
import { getStorefrontBannerPreset } from './storefrontThemes';

interface PublicStoreViewProps {
  slug: string;
  currentUser: any;
  onOpenLogin: () => void;
  onNavigateHome: () => void;
  onOpenProfile?: () => void;
  onOpenCart?: () => void;
}

type StoreTabId = 'all' | 'digital' | 'physical' | 'reviews' | 'about';
type StoreSortId = 'newest' | 'best_selling' | 'price_asc' | 'price_desc';

export const PublicStoreView: React.FC<PublicStoreViewProps> = ({
  slug,
  currentUser,
  onOpenLogin,
  onNavigateHome,
  onOpenProfile,
  onOpenCart,
}) => {
  const { t, language } = useLanguage();
  const { brand } = useBrand();
  const isEn = language === 'en';

  const [loading, setLoading] = useState<boolean>(true);
  const [store, setStore] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [isVacation, setIsVacation] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [cartToast, setCartToast] = useState<{ message: string; success: boolean } | null>(null);

  // Storefront Navigation, Search, Filters & Sort
  const [activeTab, setActiveTab] = useState<StoreTabId>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGameSlug, setSelectedGameSlug] = useState<string>('all');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<StoreSortId>('newest');
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Share Store & QR Modal
  const [copiedStoreUrl, setCopiedStoreUrl] = useState<boolean>(false);
  const [showShareQrModal, setShowShareQrModal] = useState<boolean>(false);
  const [shareQrDataUrl, setShareQrDataUrl] = useState<string>('');

  // Ratings State
  const [ratingsData, setRatingsData] = useState<{ avg_stars: number | null; total_ratings: number; ratings: any[] }>({
    avg_stars: null,
    total_ratings: 0,
    ratings: [],
  });

  // Purchase Modal State
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [purchasing, setPurchasing] = useState<boolean>(false);
  const [purchasedOrder, setPurchasedOrder] = useState<any>(null);
  const [purchaseError, setPurchaseError] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [directQrOrder, setDirectQrOrder] = useState<any>(null);
  const [directQrImg, setDirectQrImg] = useState<string>('');
  const [creatingQr, setCreatingQr] = useState<boolean>(false);

  const getAuthToken = () => {
    try {
      return localStorage.getItem('pine_auth_token') || sessionStorage.getItem('pine_auth_token') || '';
    } catch {
      return '';
    }
  };

  const getHeaders = () => {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  };

  // Poll Direct SePay VietQR order status
  useEffect(() => {
    if (!directQrOrder?.parentId) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/seller-orders/multi/${encodeURIComponent(directQrOrder.parentId)}`, {
          headers: getHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (data?.parent_order?.status === 'PAID' || data?.parent_order?.status === 'COMPLETED') {
          clearInterval(timer);
          const firstChild = (data.child_orders || [])[0];
          setPurchasedOrder(firstChild || { delivered_code: '' });
          setDirectQrOrder(null);
          setDirectQrImg('');
        }
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, [directQrOrder?.parentId]);

  // Fetch Store, Products & Ratings in parallel
  useEffect(() => {
    let active = true;
    const fetchStoreData = async () => {
      setLoading(true);
      setErrorMsg('');
      setBrokenImages({});
      try {
        const storeRes = await fetch(`/api/stores/${encodeURIComponent(slug)}`);
        const storeData = await storeRes.json().catch(() => ({}));
        if (!active) return;

        if (!storeData.success || !storeData.store) {
          setErrorMsg(storeData.error || t('publicStore.notFoundDesc'));
          setLoading(false);
          return;
        }

        setStore(storeData.store);
        setIsVacation(Boolean(storeData.store.is_vacation));

        const [prodsRes, ratingsRes] = await Promise.all([
          fetch(`/api/stores/${encodeURIComponent(slug)}/products`).catch(() => null),
          fetch(`/api/stores/${encodeURIComponent(slug)}/ratings`).catch(() => null),
        ]);

        if (!active) return;

        if (prodsRes) {
          const prodsData = await prodsRes.json().catch(() => ({}));
          if (prodsData.success) {
            setProducts(prodsData.products || []);
            if (prodsData.is_vacation) setIsVacation(true);
          }
        }

        if (ratingsRes) {
          const ratingsJson = await ratingsRes.json().catch(() => ({}));
          if (ratingsJson.success) {
            setRatingsData({
              avg_stars: ratingsJson.avg_stars,
              total_ratings: ratingsJson.total_ratings || 0,
              ratings: ratingsJson.ratings || [],
            });
          }
        }
      } catch {
        if (active) setErrorMsg(t('publicStore.connectionError'));
      } finally {
        if (active) setLoading(false);
      }
    };

    if (slug) {
      fetchStoreData();
    }
    return () => {
      active = false;
    };
  }, [slug, t]);

  // Derived catalog counts, game filter chips & filtered products
  const digitalCount = useMemo(
    () => products.filter((p) => (p.product_type || 'digital') !== 'physical').length,
    [products]
  );
  const physicalCount = useMemo(
    () => products.filter((p) => p.product_type === 'physical').length,
    [products]
  );

  const gameChips = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; count: number }>();
    for (const p of products) {
      const gSlug = String(p.game_slug || 'other').toLowerCase();
      const gName = String(p.game_name || p.game_slug || t('publicStore.otherCategory'));
      const cur = map.get(gSlug);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(gSlug, { slug: gSlug, name: gName, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [products, t]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      const pType = p.product_type === 'physical' ? 'physical' : 'digital';
      if (activeTab === 'digital' && pType !== 'digital') return false;
      if (activeTab === 'physical' && pType !== 'physical') return false;
      if (selectedGameSlug !== 'all' && String(p.game_slug || 'other').toLowerCase() !== selectedGameSlug) {
        return false;
      }
      if (inStockOnly && !p.has_stock) return false;
      if (q) {
        const hay = `${p.name || ''} ${p.game_name || ''} ${p.game_slug || ''} ${p.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'price_asc') return Number(a.price_core || 0) - Number(b.price_core || 0);
      if (sortBy === 'price_desc') return Number(b.price_core || 0) - Number(a.price_core || 0);
      if (sortBy === 'best_selling') return Number(b.sold_count || 0) - Number(a.sold_count || 0);
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [products, activeTab, selectedGameSlug, inStockOnly, searchQuery, sortBy]);

  const storePublicUrl = useMemo(() => {
    const path = isEn ? `/en/gian-hang/${slug}` : `/gian-hang/${slug}`;
    return typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
  }, [slug, isEn]);

  const handleCopyStoreUrl = async () => {
    try {
      await navigator.clipboard.writeText(storePublicUrl);
      setCopiedStoreUrl(true);
      setTimeout(() => setCopiedStoreUrl(false), 2000);
    } catch {}
  };

  const handleOpenShareQr = async () => {
    setShowShareQrModal(true);
    try {
      const url = await QRCode.toDataURL(storePublicUrl, { margin: 1.5, width: 220 });
      setShareQrDataUrl(url);
    } catch {}
  };

  const handleSelectTab = (tabId: StoreTabId) => {
    setActiveTab(tabId);
    const btn = tabButtonRefs.current[tabId];
    if (btn && typeof btn.scrollIntoView === 'function') {
      try {
        btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {}
    }
  };

  const handleAddToCart = (p: any) => {
    const res = cartService.addToCart({
      productId: p.id,
      productName: p.name,
      priceCore: p.price_core,
      sellerId: store?.id || p.seller_id,
      sellerName: store?.name || t('publicStore.storeFallbackName'),
      sellerSlug: slug,
      sellerAvatar: store?.avatar_url,
      gameSlug: p.game_slug,
      gameName: p.game_name,
      coverUrl: resolveProductCoverImage(p),
    });
    setCartToast({ message: res.message, success: res.success });
    setTimeout(() => setCartToast(null), 3000);
  };

  const handleCreateDirectQr = async () => {
    if (!currentUser) {
      onOpenLogin();
      return;
    }
    if (!selectedProduct) return;
    setCreatingQr(true);
    setPurchaseError('');
    try {
      const res = await fetch('/api/seller-orders/multi', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ items: [{ product_id: selectedProduct.id, quantity: 1 }] }),
      });
      const data = await res.json().catch(() => ({}));
      const grp = Array.isArray(data?.shop_groups) ? data.shop_groups[0] : null;
      if (!res.ok || !data.success || !grp?.qr_allowed || !grp?.qr_payload) {
        setPurchaseError(data.error || t('checkoutModal.sellerCoreOnlyNote'));
        return;
      }
      const imgUrl = await QRCode.toDataURL(grp.qr_payload, { margin: 1.5, width: 220 });
      setDirectQrImg(imgUrl);
      setDirectQrOrder({
        parentId: data.parent_order.id,
        bankName: grp.bank_name,
        accountNumber: grp.account_number,
        bankAccount: grp.bank_account,
        amount: grp.total_amount,
        content: grp.qr_content,
      });
    } catch {
      setPurchaseError(t('sellerSepay.connectionError'));
    } finally {
      setCreatingQr(false);
    }
  };

  const handlePurchase = async () => {
    if (!currentUser) {
      onOpenLogin();
      return;
    }
    if (!selectedProduct) return;

    setPurchasing(true);
    setPurchaseError('');
    try {
      const res = await fetch('/api/seller-orders', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ product_id: selectedProduct.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setPurchasedOrder(data.order);
        if (typeof data.new_balance === 'number' && currentUser) {
          currentUser.wallet_balance = data.new_balance;
          dataService.saveCurrentUser(currentUser);
        }
      } else {
        setPurchaseError(data.error || t('publicStore.paymentFailed'));
      }
    } catch {
      setPurchaseError(t('publicStore.connectionError'));
    } finally {
      setPurchasing(false);
      dataService.refreshCurrentUserBalance().catch(() => {});
    }
  };

  const copyDeliveredCode = () => {
    if (!purchasedOrder?.delivered_code) return;
    navigator.clipboard.writeText(purchasedOrder.delivered_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 animate-pulse">
        <div className="rounded-3xl overflow-hidden border border-border bg-card">
          <div className="h-44 bg-slate-200 dark:bg-slate-800" />
          <div className="p-6 grid grid-cols-2 sm:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800/70" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-72 rounded-2xl bg-card border border-border" />
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg || !store) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold mb-2">{t('publicStore.notFoundTitle')}</h2>
        <p className="text-muted-foreground text-sm max-w-md mb-6">{errorMsg || t('publicStore.notFoundDesc')}</p>
        <button
          type="button"
          onClick={onNavigateHome}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm cursor-pointer"
        >
          {t('publicStore.backHomeBtn')}
        </button>
      </div>
    );
  }

  const bannerPreset = getStorefrontBannerPreset(store.banner_preset);
  const joinedLabel = store.created_at
    ? new Date(store.created_at).toLocaleDateString(isEn ? 'en-US' : 'vi-VN', {
        month: 'short',
        year: 'numeric',
      })
    : '2026';

  const tabs: { id: StoreTabId; label: string; count?: number }[] = [
    { id: 'all', label: t('publicStore.tabAll'), count: products.length },
    ...(digitalCount > 0 ? [{ id: 'digital' as StoreTabId, label: t('publicStore.tabDigital'), count: digitalCount }] : []),
    ...(physicalCount > 0 ? [{ id: 'physical' as StoreTabId, label: t('publicStore.tabPhysical'), count: physicalCount }] : []),
    { id: 'reviews', label: t('publicStore.tabReviews'), count: ratingsData.total_ratings },
    { id: 'about', label: t('publicStore.tabAbout') },
  ];

  const showingCatalog = activeTab === 'all' || activeTab === 'digital' || activeTab === 'physical';

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 py-5 sm:py-7 space-y-6">
      {/* ====================================================================
          1. FLAGSHIP STOREFRONT HERO & 6-METRIC TRUST BAR
         ==================================================================== */}
      <section className="rounded-3xl overflow-hidden bg-card border border-border shadow-md">
        {/* Hero Banner Stage */}
        <div className={`relative bg-gradient-to-r ${bannerPreset.gradientClass} text-white overflow-hidden`}>
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: bannerPreset.meshOverlay }} />
          {store.cover_url && (
            <img
              src={store.cover_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-40"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-slate-950/15" />

          <div className="relative z-10 p-5 sm:p-7 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            {/* Store Avatar + Title + Trust Badges */}
            <div className="flex items-start sm:items-center gap-4 min-w-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-white/80 bg-slate-900/90 shadow-xl flex items-center justify-center text-white font-black text-3xl overflow-hidden shrink-0">
                {store.avatar_url && !brokenImages['__avatar__'] ? (
                  <img
                    src={store.avatar_url}
                    alt={store.name}
                    className="w-full h-full object-cover"
                    onError={() => setBrokenImages((prev) => ({ ...prev, __avatar__: true }))}
                  />
                ) : (
                  <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/25 to-white/5 tracking-tight">
                    {String(store.name || 'S').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border backdrop-blur-sm inline-flex items-center gap-1 ${bannerPreset.pillClass}`}>
                    <Award className="w-3 h-3" />
                    {store.status === 'ACTIVE' ? t('publicStore.badgeOfficial') : t('publicStore.badgePartner')}
                  </span>
                  {store.sepay_qr_available && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/25 text-emerald-100 border border-emerald-300/40 backdrop-blur-sm inline-flex items-center gap-1">
                      <QrCode className="w-3 h-3" /> {t('publicStore.badgeVietQr')}
                    </span>
                  )}
                  {isVacation ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/30 text-amber-100 border border-amber-300/40 inline-flex items-center gap-1">
                      <PauseCircle className="w-3 h-3" /> {t('publicStore.badgeVacation')}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/15 text-emerald-200 border border-white/20 inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {t('publicStore.badgeOnline')}
                    </span>
                  )}
                </div>

                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white truncate">
                  {store.name}
                </h1>

                <div className="flex items-center gap-2.5 text-xs text-white/85 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Store className="w-3.5 h-3.5 opacity-80" />
                    <span>{t('publicStore.verifiedOnBrand', { brandName: brand.brandName })}</span>
                  </span>
                  <span className="opacity-50">•</span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-black/25 px-2 py-0.5 rounded-md">
                    /gian-hang/{store.slug}
                  </span>
                </div>
              </div>
            </div>

            {/* Store Share & Quick Actions */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={handleCopyStoreUrl}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/25 text-white text-xs font-bold transition cursor-pointer"
              >
                {copiedStoreUrl ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedStoreUrl ? t('publicStore.copiedLinkBtn') : t('publicStore.copyLinkBtn')}</span>
              </button>
              <button
                type="button"
                onClick={handleOpenShareQr}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-extrabold shadow-md transition cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{t('publicStore.shareQrBtn')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 6-Metric Live Trust Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-border/70 border-b border-border bg-background/60">
          <div className="px-4 py-3 flex items-center gap-2.5">
            <Package className="w-4 h-4 text-indigo-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground font-medium truncate">{t('publicStore.metricProducts')}</div>
              <div className="text-sm font-extrabold text-foreground">{Number(store.total_products ?? products.length).toLocaleString()}</div>
            </div>
          </div>

          <div className="px-4 py-3 flex items-center gap-2.5">
            <ShoppingBag className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground font-medium truncate">{t('publicStore.metricCompleted')}</div>
              <div className="text-sm font-extrabold text-foreground">{Number(store.completed_orders_count || 0).toLocaleString()}</div>
            </div>
          </div>

          <div className="px-4 py-3 flex items-center gap-2.5">
            <Star className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground font-medium truncate">{t('publicStore.metricRating')}</div>
              <div className="text-sm font-extrabold text-foreground truncate">
                {ratingsData.total_ratings > 0 && ratingsData.avg_stars !== null
                  ? `${ratingsData.avg_stars}/5 (${ratingsData.total_ratings})`
                  : t('publicStore.noRatingShort')}
              </div>
            </div>
          </div>

          <div className="px-4 py-3 flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground font-medium truncate">{t('publicStore.metricReputation')}</div>
              <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{store.reputation_score || 100} / 100</div>
            </div>
          </div>

          <div className="px-4 py-3 flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-sky-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground font-medium truncate">{t('publicStore.metricSupport')}</div>
              <div className="text-xs font-bold text-foreground truncate">{store.support_hours || '08:00 - 22:00'}</div>
            </div>
          </div>

          <div className="px-4 py-3 flex items-center gap-2.5">
            <Calendar className="w-4 h-4 text-purple-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground font-medium truncate">{t('publicStore.metricJoined')}</div>
              <div className="text-xs font-bold text-foreground truncate">{joinedLabel}</div>
            </div>
          </div>
        </div>

        {/* Pinned Notice + 3-Pillar Buyer Protection Bar */}
        <div className="p-4 sm:px-6 space-y-3 bg-card">
          {store.pinned_notice && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-start gap-2.5">
              <Megaphone className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span className="leading-relaxed">{store.pinned_notice}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-2xl bg-muted/40 border border-border/70 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-bold text-foreground">{t('publicStore.pillarWarrantyTitle')}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                  {store.warranty_policy || t('publicStore.defaultWarranty')}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-muted/40 border border-border/70 flex items-start gap-2.5">
              <FileCheck2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-bold text-foreground">{t('publicStore.pillarRefundTitle')}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                  {store.refund_policy || t('publicStore.defaultRefund')}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-muted/40 border border-border/70 flex items-start gap-2.5">
              <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-bold text-foreground">{t('publicStore.pillarEscrowTitle')}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                  {t('publicStore.pillarEscrowDesc')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Vacation Notice Banner */}
      {isVacation && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-400 flex items-center gap-3">
          <PauseCircle className="w-6 h-6 shrink-0" />
          <div className="text-xs">
            <div className="font-bold text-sm">{t('publicStore.vacationTitle')}</div>
            <div className="opacity-90 mt-0.5">{t('publicStore.vacationDesc')}</div>
          </div>
        </div>
      )}

      {/* ====================================================================
          2. STOREFRONT TABS (WCAG 1.4.1 non-color underline, single-row scroll)
         ==================================================================== */}
      <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden">
        <div
          role="tablist"
          aria-label={t('publicStore.tabsAriaLabel')}
          className="flex items-center overflow-x-auto scrollbar-none border-b border-border px-2 sm:px-4"
        >
          {tabs.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabButtonRefs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                id={`store-tab-${tab.id}`}
                aria-selected={isSelected}
                onClick={() => handleSelectTab(tab.id)}
                className={`relative flex-none px-4 py-3.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  isSelected
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      isSelected
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {/* Non-color 3px bottom indicator (WCAG 1.4.1) */}
                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 bottom-0 border-b-[3px] border-primary rounded-t"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Filter & Search Toolbar (only when viewing catalog tabs) */}
        {showingCatalog && (
          <div className="p-3.5 sm:p-4 bg-muted/20 border-b border-border/70 space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {/* In-Shop Search */}
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('publicStore.searchPlaceholder', { storeName: store.name })}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-background text-xs font-semibold text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-primary focus:ring-0"
                  />
                  <span>{t('publicStore.inStockOnly')}</span>
                </label>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <select
                    aria-label={t('publicStore.sortLabel')}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as StoreSortId)}
                    className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
                  >
                    <option value="newest">{t('publicStore.sortNewest')}</option>
                    <option value="best_selling">{t('publicStore.sortBestSelling')}</option>
                    <option value="price_asc">{t('publicStore.sortPriceAsc')}</option>
                    <option value="price_desc">{t('publicStore.sortPriceDesc')}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Auto-Derived Game / Category Filter Chips */}
            {gameChips.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedGameSlug('all')}
                  className={`flex-none px-3 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                    selectedGameSlug === 'all'
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-background text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {t('publicStore.filterAllGames')} ({products.length})
                </button>
                {gameChips.map((chip) => (
                  <button
                    key={chip.slug}
                    type="button"
                    onClick={() => setSelectedGameSlug(chip.slug)}
                    className={`flex-none px-3 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                      selectedGameSlug === chip.slug
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-background text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    {chip.name} ({chip.count})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            3. TAB PANEL CONTENT
           ==================================================================== */}
        <div
          role="tabpanel"
          aria-labelledby={`store-tab-${activeTab}`}
          className="p-4 sm:p-5"
          style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}
        >
          {/* A. PRODUCT CATALOG GRID */}
          {showingCatalog && (
            <>
              {filteredProducts.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <Package className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                  <div className="text-sm font-bold text-foreground">{t('publicStore.emptyProductsTitle')}</div>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    {searchQuery || selectedGameSlug !== 'all' || inStockOnly
                      ? t('publicStore.emptyFilterDesc')
                      : t('publicStore.emptyProductsDesc')}
                  </p>
                  {(searchQuery || selectedGameSlug !== 'all' || inStockOnly) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedGameSlug('all');
                        setInStockOnly(false);
                      }}
                      className="mt-2 px-4 py-1.5 rounded-xl border border-border text-xs font-bold hover:bg-muted cursor-pointer"
                    >
                      {t('publicStore.clearFiltersBtn')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducts.map((p) => {
                    const isPhysical = p.product_type === 'physical';
                    const hasDiscount =
                      Number(p.original_price_core || 0) > Number(p.price_core || 0) && Number(p.price_core || 0) > 0;
                    const discountPct = hasDiscount
                      ? Math.round(((p.original_price_core - p.price_core) / p.original_price_core) * 100)
                      : 0;
                    const resolvedImg = resolveProductCoverImage(p);
                    const isImgBroken = Boolean(brokenImages[p.id]);

                    return (
                      <article
                        key={p.id}
                        className="group rounded-2xl bg-background border border-border hover:border-primary/50 hover:shadow-lg transition-all overflow-hidden flex flex-col justify-between"
                      >
                        <div>
                          {/* Card Media Stage (16:10 crisp cover with zero broken 404 icon) */}
                          <div className="relative aspect-[16/9] bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 overflow-hidden border-b border-border/60">
                            {!isImgBroken ? (
                              <img
                                src={resolvedImg}
                                alt={p.name}
                                loading="lazy"
                                onError={(e) => {
                                  const el = e.currentTarget;
                                  if (isPhysical && !el.dataset.fb) {
                                    el.dataset.fb = '1';
                                    el.src = PHYSICAL_DEFAULT_IMAGE_URL;
                                    return;
                                  }
                                  setBrokenImages((prev) => ({ ...prev, [p.id]: true }));
                                }}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div
                                className={`w-full h-full bg-gradient-to-br ${bannerPreset.gradientClass} flex flex-col items-center justify-center p-4 text-center text-white`}
                              >
                                <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur border border-white/25 flex items-center justify-center text-xl font-black shadow-md mb-1.5">
                                  {String(p.game_name || p.name || 'G').charAt(0).toUpperCase()}
                                </div>
                                <span className="text-[11px] font-bold text-white/90 line-clamp-1">
                                  {p.game_name || p.game_slug}
                                </span>
                              </div>
                            )}

                            {/* Top Badges */}
                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold backdrop-blur-md border inline-flex items-center gap-1 ${
                                  isPhysical
                                    ? 'bg-amber-950/75 text-amber-200 border-amber-400/40'
                                    : 'bg-slate-950/75 text-sky-200 border-sky-400/40'
                                }`}
                              >
                                {isPhysical ? <Truck className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                                {isPhysical ? t('publicStore.typePhysical') : t('publicStore.typeDigital')}
                              </span>
                            </div>

                            {discountPct > 0 && (
                              <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-[#ee4d2d] text-white text-[10px] font-black shadow">
                                -{discountPct}%
                              </span>
                            )}

                            <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-sm text-white text-[10px] font-bold uppercase truncate max-w-[68%]">
                                {p.game_name || p.game_slug}
                              </span>
                              {p.has_stock ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/90 text-white text-[10px] font-extrabold shrink-0">
                                  {t('publicStore.inStockBadge')}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-rose-600/90 text-white text-[10px] font-extrabold shrink-0">
                                  {t('publicStore.outOfStockBadge')}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Card Body */}
                          <div className="p-4 space-y-2.5">
                            <div>
                              <h3 className="font-extrabold text-sm text-foreground line-clamp-2 leading-snug" title={p.name}>
                                {p.name}
                              </h3>
                              {p.is_affiliate && p.show_supplier !== false && p.supplier_name && (
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                                  <Store className="w-3 h-3 text-primary shrink-0" />
                                  <span className="truncate">
                                    {t('publicStore.suppliedBy', { supplier: p.supplier_name })}
                                  </span>
                                </div>
                              )}
                            </div>

                            {p.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                {p.description}
                              </p>
                            )}

                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                              <span className="px-2 py-0.5 rounded-md bg-muted font-semibold">
                                {t('publicStore.warrantyBadge', { type: p.warranty_type || '24H' })}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-muted font-semibold">
                                {p.delivery_type === 'AUTO'
                                  ? t('publicStore.deliveryAuto')
                                  : t('publicStore.deliveryManual')}
                              </span>
                              {Number(p.sold_count || 0) > 0 && (
                                <span className="ml-auto font-bold text-foreground">
                                  {t('publicStore.soldCount', { count: Number(p.sold_count) })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Footer: Price & Actions */}
                        <footer className="px-4 py-3 border-t border-border/60 bg-muted/20 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-base font-black text-primary leading-tight truncate">
                              {formatCore(p.price_core, language)}
                            </div>
                            {hasDiscount && (
                              <div className="text-[10px] text-muted-foreground line-through">
                                {formatCore(p.original_price_core, language)}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={!p.has_stock || isVacation}
                              onClick={() => handleAddToCart(p)}
                              className="p-2 rounded-xl bg-background hover:bg-muted border border-border hover:border-primary text-foreground hover:text-primary transition disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                              title={t('publicStore.addToCartBtn')}
                              aria-label={t('publicStore.addToCartBtn')}
                            >
                              <ShoppingCart className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={!p.has_stock || isVacation}
                              onClick={() => {
                                setSelectedProduct(p);
                                setPurchasedOrder(null);
                                setPurchaseError('');
                                setDirectQrOrder(null);
                                setDirectQrImg('');
                              }}
                              className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:opacity-95 transition shadow-sm disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap cursor-pointer"
                            >
                              {t('publicStore.buyNowBtn')}
                            </button>
                          </div>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* B. CUSTOMER REVIEWS TAB */}
          {activeTab === 'reviews' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                    <span>{t('publicStore.reviewsTitle')}</span>
                    {ratingsData.total_ratings > 0 && ratingsData.avg_stars !== null && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                        {ratingsData.avg_stars} / 5 ({ratingsData.total_ratings})
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('publicStore.reviewsSubtitle')}</p>
                </div>
              </div>

              {ratingsData.ratings.length === 0 ? (
                <div className="py-14 text-center bg-muted/20 border border-border rounded-2xl p-6">
                  <Star className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <div className="text-sm font-bold text-foreground">{t('publicStore.noReviewsTitle')}</div>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    {t('publicStore.noReviewsDesc')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ratingsData.ratings.map((r: any) => (
                    <article
                      key={r.id}
                      className="p-4 rounded-2xl bg-background border border-border shadow-xs flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((starVal) => (
                              <Star
                                key={starVal}
                                className={`w-3.5 h-3.5 ${
                                  starVal <= r.stars
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-muted-foreground/30'
                                }`}
                              />
                            ))}
                            <span className="text-xs font-bold text-amber-500 ml-1">
                              {r.stars}/5
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString(isEn ? 'en-US' : 'vi-VN') : ''}
                          </span>
                        </div>
                        {r.comment && (
                          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{r.comment}</p>
                        )}
                      </div>
                      <footer className="text-[11px] text-muted-foreground pt-2 border-t border-border/50 flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          {t('publicStore.buyerLabel')}: <strong className="font-mono">{r.buyer_name}</strong>
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {t('publicStore.verifiedPurchase')}
                        </span>
                      </footer>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* C. ABOUT & POLICIES TAB */}
          {activeTab === 'about' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-5 rounded-2xl bg-background border border-border space-y-2.5">
                <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                  <Store className="w-4 h-4 text-primary" />
                  <span>{t('publicStore.aboutBioTitle')}</span>
                </h3>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {store.description || t('publicStore.defaultBio', { storeName: store.name })}
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-background border border-border space-y-3">
                <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>{t('publicStore.aboutPolicyTitle')}</span>
                </h3>
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                    <div className="font-bold text-foreground mb-0.5">{t('publicStore.pillarWarrantyTitle')}</div>
                    <div className="text-muted-foreground">{store.warranty_policy || t('publicStore.defaultWarranty')}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                    <div className="font-bold text-foreground mb-0.5">{t('publicStore.pillarRefundTitle')}</div>
                    <div className="text-muted-foreground">{store.refund_policy || t('publicStore.defaultRefund')}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====================================================================
          4. STORE QR SHARE MODAL
         ==================================================================== */}
      {showShareQrModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowShareQrModal(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold flex items-center gap-2 text-foreground">
                <QrCode className="w-4 h-4 text-primary" />
                <span>{t('publicStore.shareModalTitle')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowShareQrModal(false)}
                className="p-1 rounded-lg hover:bg-muted cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {shareQrDataUrl && (
              <div className="p-3 bg-white rounded-2xl inline-block border border-border shadow-inner">
                <img src={shareQrDataUrl} alt={store.name} className="w-48 h-48 mx-auto" />
              </div>
            )}

            <div className="space-y-1">
              <div className="font-extrabold text-sm text-foreground">{store.name}</div>
              <div className="text-[11px] font-mono text-muted-foreground break-all bg-muted/60 px-2.5 py-1.5 rounded-lg">
                {storePublicUrl}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyStoreUrl}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedStoreUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedStoreUrl ? t('publicStore.copiedLinkBtn') : t('publicStore.copyLinkBtn')}</span>
            </button>
          </div>
        </div>
      )}

      {/* ====================================================================
          5. PURCHASE MODAL (WALLET CORE + DIRECT SEPAY VIETQR)
         ==================================================================== */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary" />
                <span>{t('publicStore.checkoutModalTitle')}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedProduct(null);
                  setPurchasedOrder(null);
                  setDirectQrOrder(null);
                  setDirectQrImg('');
                }}
                className="p-1 rounded-lg hover:bg-muted cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!purchasedOrder ? (
              <div className="space-y-4 text-xs">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/60">
                  <img
                    src={resolveProductCoverImage(selectedProduct)}
                    alt={selectedProduct.name}
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (!el.dataset.fb) {
                        el.dataset.fb = '1';
                        el.src = PHYSICAL_DEFAULT_IMAGE_URL;
                      }
                    }}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 border border-border bg-background"
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-foreground truncate">{selectedProduct.name}</div>
                    <div className="text-muted-foreground text-[11px] truncate">
                      {selectedProduct.game_name || selectedProduct.game_slug}
                    </div>
                    <div className="text-primary font-extrabold mt-0.5">
                      {formatCore(selectedProduct.price_core, language)}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-background border border-border space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('publicStore.checkoutPriceLabel')}:</span>
                    <strong className="text-foreground">{formatCore(selectedProduct.price_core, language)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('publicStore.checkoutWalletBalance')}:</span>
                    <strong className="text-amber-500">
                      {currentUser
                        ? formatCore(
                            Number(
                              currentUser.wallet_balance ??
                                (currentUser as any).balance ??
                                (currentUser as any).core_balance
                            ) || 0,
                            language
                          )
                        : t('publicStore.notLoggedIn')}
                    </strong>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-border/60">
                    <span className="text-muted-foreground">{t('publicStore.checkoutDeliveryLabel')}:</span>
                    <strong className="text-emerald-500">{t('publicStore.checkoutDeliveryInstant')}</strong>
                  </div>
                </div>

                {purchaseError && (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{purchaseError}</span>
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  {!currentUser ? (
                    <button
                      type="button"
                      onClick={onOpenLogin}
                      className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold cursor-pointer"
                    >
                      {t('publicStore.loginToBuyBtn')}
                    </button>
                  ) : directQrOrder ? (
                    <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 space-y-2.5 text-center">
                      {directQrImg && (
                        <img
                          src={directQrImg}
                          alt="VietQR"
                          className="w-44 h-44 mx-auto rounded-xl bg-white p-1.5 border border-border"
                        />
                      )}
                      <div className="text-xs text-left space-y-1 bg-background p-2.5 rounded-lg border border-border">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('checkoutModal.bankLabel')}</span>
                          <strong>{directQrOrder.bankName}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('checkoutModal.accountNumberLabel')}</span>
                          <strong className="font-mono">{directQrOrder.accountNumber}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('checkoutModal.accountHolderLabel')}</span>
                          <strong>{directQrOrder.bankAccount}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('checkoutModal.transferMemoLabel')}</span>
                          <strong className="font-mono text-primary select-all">{directQrOrder.content}</strong>
                        </div>
                      </div>
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{t('checkoutModal.qrWaitingDigital')}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={purchasing}
                        onClick={handlePurchase}
                        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
                      >
                        {purchasing
                          ? t('publicStore.purchasingBtn')
                          : t('publicStore.confirmPayBtn', { amount: formatCore(selectedProduct.price_core, language) })}
                      </button>
                      {store?.sepay_qr_available && (
                        <button
                          type="button"
                          disabled={creatingQr}
                          onClick={handleCreateDirectQr}
                          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          <QrCode className="w-4 h-4" />
                          <span>
                            {creatingQr ? t('checkoutModal.qrCreatingTitle') : t('sellerSepay.payWithShopQrBtn')}
                          </span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-center py-2">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-foreground">{t('publicStore.purchaseSuccessTitle')}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('publicStore.purchaseSuccessDesc')}</p>
                </div>

                <div className="p-4 rounded-xl bg-muted/80 border border-border">
                  <div className="text-[10px] text-muted-foreground font-semibold mb-1 uppercase tracking-wider">
                    {t('publicStore.deliveredCodeLabel')}
                  </div>
                  <div className="font-mono text-base font-black text-primary select-all break-all py-1">
                    {purchasedOrder.delivered_code}
                  </div>
                  <button
                    type="button"
                    onClick={copyDeliveredCode}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedCode ? t('publicStore.copiedCodeBtn') : t('publicStore.copyCodeBtn')}</span>
                  </button>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setPurchasedOrder(null);
                    }}
                    className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted cursor-pointer"
                  >
                    {t('publicStore.continueShoppingBtn')}
                  </button>
                  {onOpenProfile && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProduct(null);
                        setPurchasedOrder(null);
                        onOpenProfile();
                      }}
                      className="flex-1 py-2 rounded-xl bg-muted hover:bg-muted/80 text-xs font-bold cursor-pointer"
                    >
                      {t('publicStore.openVaultBtn')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Cart Toast Notification */}
      {cartToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="p-3.5 rounded-2xl bg-card border border-border shadow-xl flex items-center gap-3 max-w-sm">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                cartToast.success ? 'bg-emerald-500/20 text-emerald-500' : 'bg-destructive/20 text-destructive'
              }`}
            >
              {cartToast.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">{cartToast.message}</div>
            </div>
            {onOpenCart && cartToast.success && (
              <button
                type="button"
                onClick={onOpenCart}
                className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold shrink-0 hover:opacity-90 shadow-sm cursor-pointer"
              >
                {t('publicStore.openCartBtn')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
