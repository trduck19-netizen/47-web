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
  Ticket,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Images,
  ListChecks,
  Layers,
} from 'lucide-react';
import QRCode from 'qrcode';
import { dataService } from '../../services/dataService';
import { cartService } from '../../services/cartService';
import { useBrand } from '../../context/BrandContext';
import { useLanguage } from '../../context/LanguageContext';
import { formatCore } from '../../utils/textUtils';
import { resolveProductCoverImage, sanitizeImageUrl, PHYSICAL_DEFAULT_IMAGE_URL } from '../../utils/safeImageUrl';
import {
  parseSafeJsonArray,
  type ProductSpecItem,
  type ProductVariantItem,
} from '../../config/sellerIndustries';
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

function extractProductGallery(p: any): string[] {
  const rawArr = Array.isArray(p?.images)
    ? p.images
    : parseSafeJsonArray<string>(p?.images_json);
  const cleaned = rawArr
    .map((u: unknown) => sanitizeImageUrl(typeof u === 'string' ? u : ''))
    .filter((u: string | undefined): u is string => Boolean(u) && !u.includes('test-game.webp'));
  if (cleaned.length > 0) {
    return cleaned.slice(0, 10);
  }
  const fallback = resolveProductCoverImage(p);
  return [fallback];
}

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
  const [selectedCollection, setSelectedCollection] = useState<string>('all');
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

  // Saved Shop Voucher Code
  const [savedVoucherCode, setSavedVoucherCode] = useState<string>('');

  // Interactive 10-Image Product Detail & Checkout <dialog> Modal State
  const productDialogRef = useRef<HTMLDialogElement>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [buyerNote, setBuyerNote] = useState<string>('');
  const [voucherInput, setVoucherInput] = useState<string>('');
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

  // Sync native <dialog> open/close state cleanly (Modern Web Guidance)
  useEffect(() => {
    const dialog = productDialogRef.current;
    if (!dialog) return;
    if (selectedProduct) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [selectedProduct]);

  const openProductModal = (p: any) => {
    const vars: ProductVariantItem[] = Array.isArray(p?.variants)
      ? p.variants
      : parseSafeJsonArray<ProductVariantItem>(p?.variants_json);
    const firstAvailableVar = vars.find((v) => Number(v.stock_quantity ?? 1) > 0) || vars[0];
    setSelectedProduct(p);
    setActivePhotoIdx(0);
    setLightboxOpen(false);
    setSelectedVariantId(firstAvailableVar?.id || '');
    setBuyerNote('');
    setVoucherInput(savedVoucherCode || '');
    setPurchasedOrder(null);
    setPurchaseError('');
    setDirectQrOrder(null);
    setDirectQrImg('');
  };

  const closeProductModal = () => {
    setLightboxOpen(false);
    setSelectedProduct(null);
    setPurchasedOrder(null);
    setPurchaseError('');
    setDirectQrOrder(null);
    setDirectQrImg('');
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
      setSelectedCollection('all');
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

  const storeVouchers: any[] = useMemo(
    () => (Array.isArray(store?.vouchers) ? store.vouchers : []),
    [store?.vouchers]
  );

  // Derived catalog counts, multi-industry collection filter chips & filtered products
  const digitalCount = useMemo(
    () => products.filter((p) => (p.product_type || 'digital') !== 'physical').length,
    [products]
  );
  const physicalCount = useMemo(
    () => products.filter((p) => p.product_type === 'physical').length,
    [products]
  );

  const collectionChips = useMemo(() => {
    const map = new Map<string, { key: string; name: string; count: number }>();
    const declaredCollections: string[] = Array.isArray(store?.shop_categories)
      ? store.shop_categories
      : parseSafeJsonArray<string>(store?.shop_categories_json);
    for (const col of declaredCollections) {
      const clean = String(col || '').trim();
      if (clean) {
        map.set(clean.toLowerCase(), { key: clean.toLowerCase(), name: clean, count: 0 });
      }
    }
    for (const p of products) {
      const label = String(
        p.shop_category || p.category_name || p.game_name || t('publicStore.otherCategory')
      ).trim();
      const key = label.toLowerCase();
      const cur = map.get(key);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(key, { key, name: label, count: 1 });
      }
    }
    return Array.from(map.values())
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [products, store?.shop_categories, store?.shop_categories_json, t]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      const pType = p.product_type === 'physical' ? 'physical' : 'digital';
      if (activeTab === 'digital' && pType !== 'digital') return false;
      if (activeTab === 'physical' && pType !== 'physical') return false;
      if (selectedCollection !== 'all') {
        const pCol = String(
          p.shop_category || p.category_name || p.game_name || t('publicStore.otherCategory')
        )
          .trim()
          .toLowerCase();
        if (pCol !== selectedCollection) return false;
      }
      if (inStockOnly && !p.has_stock) return false;
      if (q) {
        const hay = `${p.name || ''} ${p.shop_category || ''} ${p.category_name || ''} ${p.sku || ''} ${p.game_name || ''} ${p.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'price_asc') return Number(a.price_core || 0) - Number(b.price_core || 0);
      if (sortBy === 'price_desc') return Number(b.price_core || 0) - Number(a.price_core || 0);
      if (sortBy === 'best_selling') return Number(b.sold_count || 0) - Number(a.sold_count || 0);
      const featDiff = Number(b.is_featured || 0) - Number(a.is_featured || 0);
      if (featDiff !== 0) return featDiff;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [products, activeTab, selectedCollection, inStockOnly, searchQuery, sortBy, t]);

  // Active Modal Derived Data (10-Photo Gallery, Variants, Specs & Live Voucher Discount)
  const activeGalleryImages = useMemo(
    () => (selectedProduct ? extractProductGallery(selectedProduct) : []),
    [selectedProduct]
  );

  const activeVariants: ProductVariantItem[] = useMemo(() => {
    if (!selectedProduct) return [];
    return Array.isArray(selectedProduct.variants)
      ? selectedProduct.variants
      : parseSafeJsonArray<ProductVariantItem>(selectedProduct.variants_json);
  }, [selectedProduct]);

  const activeSpecs: ProductSpecItem[] = useMemo(() => {
    if (!selectedProduct) return [];
    return Array.isArray(selectedProduct.specs)
      ? selectedProduct.specs
      : parseSafeJsonArray<ProductSpecItem>(selectedProduct.specs_json);
  }, [selectedProduct]);

  const activeVariantObj = useMemo(() => {
    if (activeVariants.length === 0) return null;
    return activeVariants.find((v) => v.id === selectedVariantId) || activeVariants[0] || null;
  }, [activeVariants, selectedVariantId]);

  const activeUnitPrice = useMemo(() => {
    if (!selectedProduct) return 0;
    if (activeVariantObj && Number(activeVariantObj.price_core) > 0) {
      return Number(activeVariantObj.price_core);
    }
    return Number(selectedProduct.price_core || 0);
  }, [selectedProduct, activeVariantObj]);

  const appliedVoucherPreview = useMemo(() => {
    const cleanCode = voucherInput.trim().toUpperCase();
    if (!cleanCode || activeUnitPrice <= 0) return { discount: 0, voucher: null, invalidMin: false };
    const matched = storeVouchers.find((v) => String(v.code || '').toUpperCase() === cleanCode);
    if (!matched) return { discount: 0, voucher: null, invalidMin: false };
    if (activeUnitPrice < Number(matched.min_order_core || 0)) {
      return { discount: 0, voucher: matched, invalidMin: true };
    }
    let discount = 0;
    if (matched.discount_type === 'PERCENT') {
      discount = Math.floor((activeUnitPrice * Number(matched.discount_value || 0)) / 100);
      if (Number(matched.max_discount_core || 0) > 0) {
        discount = Math.min(discount, Number(matched.max_discount_core));
      }
    } else {
      discount = Number(matched.discount_value || 0);
    }
    discount = Math.max(0, Math.min(discount, Math.max(0, activeUnitPrice - 1)));
    return { discount, voucher: matched, invalidMin: false };
  }, [voucherInput, activeUnitPrice, storeVouchers]);

  const finalPayableCore = Math.max(1, activeUnitPrice - appliedVoucherPreview.discount);

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

  const handleSaveShopVoucher = (code: string) => {
    setSavedVoucherCode(code);
    setVoucherInput(code);
    setCartToast({
      message: t('publicStore.voucherSavedToast', { code }),
      success: true,
    });
    setTimeout(() => setCartToast(null), 2800);
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

  const handleAddToCart = (p: any, variantOverride?: ProductVariantItem | null) => {
    const chosenPrice =
      variantOverride && Number(variantOverride.price_core) > 0
        ? Number(variantOverride.price_core)
        : Number(p.price_core || 0);
    const res = cartService.addToCart({
      productId: p.id,
      productName: p.name,
      priceCore: chosenPrice,
      sellerId: store?.id || p.seller_id,
      sellerName: store?.name || t('publicStore.storeFallbackName'),
      sellerSlug: slug,
      sellerAvatar: store?.avatar_url,
      gameSlug: p.game_slug,
      gameName: p.category_name || p.game_name,
      coverUrl: extractProductGallery(p)[0],
      variantId: variantOverride?.id,
      variantName: variantOverride?.name,
      productType: p.product_type === 'physical' ? 'physical' : 'digital',
      weightGrams: Number(p.weight_grams || 0) || undefined,
      warehouseAddress: p.product_type === 'physical' ? p.warehouse_address || undefined : undefined,
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
        body: JSON.stringify({
          items: [
            {
              product_id: selectedProduct.id,
              quantity: 1,
              variant_id: activeVariantObj?.id,
              variant_name: activeVariantObj?.name,
            },
          ],
        }),
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
        body: JSON.stringify({
          product_id: selectedProduct.id,
          selected_variant: activeVariantObj?.name || undefined,
          variant_id: activeVariantObj?.id || undefined,
          buyer_note: buyerNote.trim() || undefined,
          voucher_code: voucherInput.trim().toUpperCase() || undefined,
        }),
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
          1. FLAGSHIP STOREFRONT HERO, TRUST BAR & SHOP VOUCHERS STRIP
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

        {/* Pinned Notice + 3-Pillar Buyer Protection + Shop Vouchers Strip */}
        <div className="p-4 sm:px-6 space-y-3.5 bg-card">
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

          {/* Shop Vouchers Strip (Shopee Mall Style) */}
          {storeVouchers.length > 0 && (
            <div className="pt-1 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-extrabold text-foreground inline-flex items-center gap-1.5">
                  <Ticket className="w-4 h-4 text-primary" />
                  <span>{t('publicStore.shopVouchersTitle')}</span>
                </span>
                {savedVoucherCode && (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    {t('publicStore.savedVoucherReady', { code: savedVoucherCode })}
                  </span>
                )}
              </div>

              <div className="flex items-stretch gap-2.5 overflow-x-auto scrollbar-none pb-1">
                {storeVouchers.map((v: any) => {
                  const isSaved = savedVoucherCode === v.code;
                  const discountText =
                    v.discount_type === 'PERCENT'
                      ? `-${v.discount_value}%`
                      : `-${formatCore(Number(v.discount_value || 0), language)}`;
                  return (
                    <div
                      key={v.id || v.code}
                      className="flex-none min-w-[235px] max-w-[270px] p-3 rounded-2xl bg-primary/5 border border-dashed border-primary/40 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black text-primary">{discountText}</span>
                          <span className="px-1.5 py-0.2 rounded bg-primary/15 text-primary font-mono text-[10px] font-bold">
                            {v.code}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {Number(v.min_order_core || 0) > 0
                            ? t('publicStore.voucherMinSpend', {
                                amount: formatCore(Number(v.min_order_core), language),
                              })
                            : t('publicStore.voucherNoMinSpend')}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSaveShopVoucher(v.code)}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold shrink-0 transition cursor-pointer ${
                          isSaved
                            ? 'bg-emerald-600 text-white'
                            : 'bg-primary text-primary-foreground hover:opacity-90'
                        }`}
                      >
                        {isSaved ? t('publicStore.voucherSavedBtn') : t('publicStore.voucherSaveBtn')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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

            {/* Multi-Industry Shop Collection & Category Chips */}
            {collectionChips.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedCollection('all')}
                  className={`flex-none px-3 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                    selectedCollection === 'all'
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-background text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {t('publicStore.filterAllCategories')} ({products.length})
                </button>
                {collectionChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setSelectedCollection(chip.key)}
                    className={`flex-none px-3 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                      selectedCollection === chip.key
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
                    {searchQuery || selectedCollection !== 'all' || inStockOnly
                      ? t('publicStore.emptyFilterDesc')
                      : t('publicStore.emptyProductsDesc')}
                  </p>
                  {(searchQuery || selectedCollection !== 'all' || inStockOnly) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCollection('all');
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
                    const gallery = extractProductGallery(p);
                    const resolvedImg = gallery[0];
                    const isImgBroken = Boolean(brokenImages[p.id]);
                    const isFeatured = Number(p.is_featured || 0) === 1;
                    const pVariants = Array.isArray(p.variants)
                      ? p.variants
                      : parseSafeJsonArray<any>(p.variants_json);
                    const hasDiscount =
                      Number(p.original_price_core || 0) > Number(p.price_core || 0) && Number(p.price_core || 0) > 0;
                    const discountPct = hasDiscount
                      ? Math.round(((p.original_price_core - p.price_core) / p.original_price_core) * 100)
                      : 0;
                    const categoryDisplay =
                      p.shop_category || p.category_name || p.game_name || t('publicStore.otherCategory');

                    return (
                      <article
                        key={p.id}
                        className="group rounded-2xl bg-background border border-border hover:border-primary/50 hover:shadow-lg transition-all overflow-hidden flex flex-col justify-between"
                      >
                        <div>
                          {/* Card Media Stage (Click opens 10-Photo Detail Modal) */}
                          <div
                            onClick={() => openProductModal(p)}
                            className="relative aspect-[16/10] bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 overflow-hidden border-b border-border/60 cursor-pointer"
                          >
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
                                  {String(categoryDisplay || p.name || 'S').charAt(0).toUpperCase()}
                                </div>
                                <span className="text-[11px] font-bold text-white/90 line-clamp-1">
                                  {categoryDisplay}
                                </span>
                              </div>
                            )}

                            {/* Top Badges */}
                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
                              {isFeatured && (
                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-amber-500 text-slate-950 shadow inline-flex items-center gap-1">
                                  <Star className="w-3 h-3 fill-current" />
                                  <span>{t('publicStore.featuredBadge')}</span>
                                </span>
                              )}
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

                            {/* Photo Count + Discount Badges */}
                            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                              {gallery.length > 1 && (
                                <span className="px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold inline-flex items-center gap-1">
                                  <Images className="w-3 h-3" />
                                  <span>{gallery.length}</span>
                                </span>
                              )}
                              {discountPct > 0 && (
                                <span className="px-2 py-0.5 rounded-lg bg-[#ee4d2d] text-white text-[10px] font-black shadow">
                                  -{discountPct}%
                                </span>
                              )}
                            </div>

                            <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-sm text-white text-[10px] font-bold uppercase truncate max-w-[68%]">
                                {categoryDisplay}
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
                              <button
                                type="button"
                                onClick={() => openProductModal(p)}
                                className="text-left font-extrabold text-sm text-foreground hover:text-primary line-clamp-2 leading-snug cursor-pointer"
                                title={p.name}
                              >
                                {p.name}
                              </button>
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
                              {pVariants.length > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold inline-flex items-center gap-1">
                                  <Layers className="w-2.5 h-2.5" />
                                  <span>{t('publicStore.variantsCountBadge', { count: pVariants.length })}</span>
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded-md bg-muted font-semibold">
                                {t('publicStore.warrantyBadge', { type: p.warranty_type || '24H' })}
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
                              disabled={isVacation}
                              onClick={() => openProductModal(p)}
                              className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:opacity-95 transition shadow-sm disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap cursor-pointer"
                            >
                              {p.has_stock ? t('publicStore.buyNowBtn') : t('publicStore.viewDetailBtn')}
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
          5. FLAGSHIP 10-PHOTO PRODUCT DETAIL & CHECKOUT <dialog> MODAL
             (Native <dialog>, no redundant role/aria-modal, overscroll-behavior: contain)
         ==================================================================== */}
      <dialog
        ref={productDialogRef}
        aria-labelledby="store-product-dialog-title"
        onClose={closeProductModal}
        className="m-auto w-full max-w-4xl rounded-2xl border border-border bg-card text-foreground p-0 shadow-2xl [overscroll-behavior:contain] backdrop:bg-black/70 backdrop:backdrop-blur-xs backdrop:overflow-hidden backdrop:[overscroll-behavior:contain]"
      >
        {selectedProduct && (
          <div className="flex flex-col max-h-[90vh]">
            {/* Sticky Modal Header */}
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 bg-card sticky top-0 z-10">
              <div className="min-w-0 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-extrabold shrink-0">
                  {selectedProduct.shop_category ||
                    selectedProduct.category_name ||
                    selectedProduct.game_name ||
                    store.name}
                </span>
                <h2
                  id="store-product-dialog-title"
                  className="text-sm sm:text-base font-extrabold text-foreground truncate"
                >
                  {selectedProduct.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeProductModal}
                aria-label={t('common.close')}
                className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-4 sm:p-6 overflow-y-auto">
              {!purchasedOrder ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* LEFT COLUMN: 10-IMAGE INTERACTIVE GALLERY + CUSTOM SPECS */}
                  <div className="lg:col-span-7 space-y-4">
                    {/* Main Hero Photo (fetchpriority="high", NO loading="lazy") */}
                    <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-border select-none">
                      <img
                        key={activeGalleryImages[activePhotoIdx]}
                        src={activeGalleryImages[activePhotoIdx]}
                        alt={`${selectedProduct.name} - ${activePhotoIdx + 1}`}
                        fetchPriority="high"
                        onError={(e) => {
                          const el = e.currentTarget;
                          if (!el.dataset.fb) {
                            el.dataset.fb = '1';
                            el.src = PHYSICAL_DEFAULT_IMAGE_URL;
                          }
                        }}
                        className="w-full h-full object-contain bg-slate-950"
                      />

                      {/* Counter Pill */}
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/70 text-white text-[11px] font-mono font-bold">
                        {activePhotoIdx + 1} / {activeGalleryImages.length}
                      </span>

                      {/* Lightbox Zoom Toggle */}
                      <button
                        type="button"
                        onClick={() => setLightboxOpen(!lightboxOpen)}
                        aria-label={t('publicStore.zoomPhotoBtn')}
                        className="absolute top-3 right-3 p-2 rounded-xl bg-black/65 hover:bg-black/85 text-white cursor-pointer"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>

                      {/* Prev / Next Navigation when multiple photos exist */}
                      {activeGalleryImages.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setActivePhotoIdx((idx) =>
                                idx > 0 ? idx - 1 : activeGalleryImages.length - 1
                              )
                            }
                            aria-label={t('publicStore.prevPhotoBtn')}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-black/65 hover:bg-black/85 text-white cursor-pointer"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActivePhotoIdx((idx) =>
                                idx < activeGalleryImages.length - 1 ? idx + 1 : 0
                              )
                            }
                            aria-label={t('publicStore.nextPhotoBtn')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-black/65 hover:bg-black/85 text-white cursor-pointer"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Expanded Lightbox View inside Dialog */}
                    {lightboxOpen && (
                      <div className="p-3 rounded-2xl bg-slate-950 border border-primary/40 space-y-2">
                        <div className="flex items-center justify-between text-xs text-white/80">
                          <span>
                            {t('publicStore.fullSizePreview')} ({activePhotoIdx + 1}/{activeGalleryImages.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => setLightboxOpen(false)}
                            className="px-2.5 py-1 rounded-lg bg-white/15 text-white font-bold cursor-pointer"
                          >
                            {t('common.close')}
                          </button>
                        </div>
                        <img
                          src={activeGalleryImages[activePhotoIdx]}
                          alt={selectedProduct.name}
                          className="w-full max-h-[65vh] object-contain rounded-xl mx-auto"
                        />
                      </div>
                    )}

                    {/* 10-Photo Thumbnail Strip */}
                    {activeGalleryImages.length > 1 && (
                      <div className="grid grid-cols-5 sm:grid-cols-5 gap-2">
                        {activeGalleryImages.map((imgUrl, idx) => (
                          <button
                            key={`${imgUrl}-${idx}`}
                            type="button"
                            onClick={() => setActivePhotoIdx(idx)}
                            aria-label={`${t('publicStore.photoThumbLabel')} ${idx + 1}`}
                            className={`relative aspect-square rounded-xl overflow-hidden border-2 transition cursor-pointer ${
                              activePhotoIdx === idx
                                ? 'border-primary ring-2 ring-primary/25 opacity-100'
                                : 'border-border opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={imgUrl}
                              alt=""
                              loading="lazy"
                              onError={(e) => {
                                const el = e.currentTarget;
                                if (!el.dataset.fb) {
                                  el.dataset.fb = '1';
                                  el.src = PHYSICAL_DEFAULT_IMAGE_URL;
                                }
                              }}
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/70 text-white text-[9px] font-bold">
                              {idx + 1}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Custom Specifications Table & Description */}
                    {(activeSpecs.length > 0 ||
                      selectedProduct.sku ||
                      selectedProduct.product_type === 'physical') && (
                      <div className="p-3.5 rounded-2xl bg-muted/30 border border-border space-y-2 text-xs">
                        <div className="font-extrabold text-foreground flex items-center gap-1.5 pb-1.5 border-b border-border/60">
                          <ListChecks className="w-4 h-4 text-primary" />
                          <span>{t('publicStore.specsSectionTitle')}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                          {selectedProduct.sku && (
                            <div className="flex justify-between gap-2 border-b border-border/40 py-1">
                              <span className="text-muted-foreground">SKU</span>
                              <strong className="font-mono text-foreground">{selectedProduct.sku}</strong>
                            </div>
                          )}
                          {selectedProduct.product_type === 'physical' && selectedProduct.weight_grams > 0 && (
                            <div className="flex justify-between gap-2 border-b border-border/40 py-1">
                              <span className="text-muted-foreground">{t('publicStore.specWeight')}</span>
                              <strong className="text-foreground">{selectedProduct.weight_grams}g</strong>
                            </div>
                          )}
                          {selectedProduct.product_type === 'physical' && selectedProduct.warehouse_address && (
                            <div className="flex justify-between gap-2 border-b border-border/40 py-1 sm:col-span-2">
                              <span className="text-muted-foreground">{t('publicStore.specShipsFrom')}</span>
                              <strong className="text-foreground text-right">{selectedProduct.warehouse_address}</strong>
                            </div>
                          )}
                          {activeSpecs.map((sp, idx) => (
                            <div key={`${sp.label}-${idx}`} className="flex justify-between gap-2 border-b border-border/40 py-1">
                              <span className="text-muted-foreground">{sp.label}</span>
                              <strong className="text-foreground text-right">{sp.value}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedProduct.description && (
                      <div className="p-3.5 rounded-2xl bg-background border border-border space-y-1.5 text-xs">
                        <div className="font-extrabold text-foreground">{t('publicStore.descriptionTitle')}</div>
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                          {selectedProduct.description}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* RIGHT COLUMN: VARIANTS, BUYER NOTE, VOUCHER & CHECKOUT */}
                  <div className="lg:col-span-5 space-y-4 text-xs">
                    {/* Price Summary Box */}
                    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/25 space-y-1">
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <div className="text-2xl font-black text-primary">
                          {formatCore(finalPayableCore, language)}
                        </div>
                        {appliedVoucherPreview.discount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-extrabold">
                            -{formatCore(appliedVoucherPreview.discount, language)}
                          </span>
                        )}
                      </div>
                      {(appliedVoucherPreview.discount > 0 ||
                        Number(selectedProduct.original_price_core || 0) > activeUnitPrice) && (
                        <div className="text-[11px] text-muted-foreground line-through">
                          {formatCore(
                            appliedVoucherPreview.discount > 0
                              ? activeUnitPrice
                              : Number(selectedProduct.original_price_core),
                            language
                          )}
                        </div>
                      )}
                    </div>

                    {/* Variant Picker */}
                    {activeVariants.length > 0 && (
                      <div className="space-y-2">
                        <label className="block font-extrabold text-foreground">
                          {t('publicStore.selectVariantLabel')}:
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {activeVariants.map((v) => {
                            const isPicked = activeVariantObj?.id === v.id;
                            const vOut = Number(v.stock_quantity ?? 1) <= 0;
                            return (
                              <button
                                key={v.id}
                                type="button"
                                disabled={vOut}
                                onClick={() => setSelectedVariantId(v.id)}
                                className={`p-2.5 rounded-xl border text-left transition cursor-pointer disabled:opacity-40 ${
                                  isPicked
                                    ? 'border-primary bg-primary/10 text-primary font-extrabold'
                                    : 'border-border bg-background hover:bg-muted text-foreground font-semibold'
                                }`}
                              >
                                <div className="truncate">{v.name}</div>
                                <div className="text-[11px] opacity-85 mt-0.5">
                                  {formatCore(Number(v.price_core || selectedProduct.price_core), language)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Buyer Note Input (Custom Order / Shipping / Account Service Info) */}
                    <div>
                      <label className="block font-bold text-foreground mb-1">
                        {selectedProduct.buyer_note_prompt || t('publicStore.buyerNoteLabel')}
                      </label>
                      <input
                        type="text"
                        value={buyerNote}
                        onChange={(e) => setBuyerNote(e.target.value)}
                        placeholder={
                          selectedProduct.buyer_note_prompt || t('publicStore.buyerNotePlaceholder')
                        }
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:border-primary"
                      />
                    </div>

                    {/* Shop Voucher Selector / Input */}
                    <div className="p-3 rounded-2xl bg-muted/35 border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground inline-flex items-center gap-1.5">
                          <Ticket className="w-3.5 h-3.5 text-primary" />
                          <span>{t('publicStore.applyShopVoucherLabel')}</span>
                        </span>
                      </div>

                      <input
                        type="text"
                        value={voucherInput}
                        onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                        placeholder={t('publicStore.voucherCodePlaceholder')}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background font-mono text-xs uppercase focus:outline-none focus:border-primary"
                      />

                      {storeVouchers.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {storeVouchers.map((v: any) => (
                            <button
                              key={v.code}
                              type="button"
                              onClick={() => setVoucherInput(v.code)}
                              className={`px-2 py-0.5 rounded-lg border text-[10px] font-mono font-bold cursor-pointer ${
                                voucherInput.trim().toUpperCase() === v.code
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background border-border text-foreground hover:border-primary/50'
                              }`}
                            >
                              {v.code}
                            </button>
                          ))}
                        </div>
                      )}

                      {appliedVoucherPreview.invalidMin && appliedVoucherPreview.voucher && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                          {t('publicStore.voucherMinSpend', {
                            amount: formatCore(Number(appliedVoucherPreview.voucher.min_order_core), language),
                          })}
                        </div>
                      )}
                    </div>

                    {/* Wallet & Fulfillment Summary */}
                    <div className="p-3 rounded-xl bg-background border border-border space-y-1.5">
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
                        <strong className="text-emerald-500">
                          {selectedProduct.product_type === 'physical'
                            ? t('publicStore.typePhysical')
                            : selectedProduct.delivery_type === 'AUTO'
                              ? t('publicStore.checkoutDeliveryInstant')
                              : t('publicStore.deliveryManual')}
                        </strong>
                      </div>
                    </div>

                    {purchaseError && (
                      <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{purchaseError}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        disabled={!selectedProduct.has_stock || isVacation}
                        onClick={() => handleAddToCart(selectedProduct, activeVariantObj)}
                        className="w-full py-2.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/15 text-primary font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>{t('publicStore.addToCartBtn')}</span>
                      </button>

                      {!currentUser ? (
                        <button
                          type="button"
                          onClick={() => {
                            closeProductModal();
                            onOpenLogin();
                          }}
                          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-extrabold cursor-pointer"
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
                            disabled={purchasing || !selectedProduct.has_stock || isVacation}
                            onClick={handlePurchase}
                            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-extrabold shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
                          >
                            {purchasing
                              ? t('publicStore.purchasingBtn')
                              : t('publicStore.confirmPayBtn', {
                                  amount: formatCore(finalPayableCore, language),
                                })}
                          </button>
                          {store?.sepay_qr_available && selectedProduct.has_stock && (
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
                </div>
              ) : (
                <div className="max-w-md mx-auto space-y-4 text-center py-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-foreground">{t('publicStore.purchaseSuccessTitle')}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('publicStore.purchaseSuccessDesc')}</p>
                  </div>

                  {purchasedOrder.delivered_code && (
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
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeProductModal}
                      className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold hover:bg-muted cursor-pointer"
                    >
                      {t('publicStore.continueShoppingBtn')}
                    </button>
                    {onOpenProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          closeProductModal();
                          onOpenProfile();
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-xs font-bold cursor-pointer"
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
      </dialog>

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
