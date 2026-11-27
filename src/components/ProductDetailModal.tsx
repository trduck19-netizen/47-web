import confetti from 'canvas-confetti';
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PHYSICAL_DEFAULT_IMAGE_URL, resolveProductCoverImage, sanitizeImageUrl } from '../utils/safeImageUrl';
import {
  X,
  AlertCircle,
  ShieldCheck,
  Zap,
  ZoomIn,
  LogIn,
  Share2,
  BookOpen,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Package,
  CheckCircle2,
  Star,
  Clock,
  Sparkles,
  Minus,
  Plus,
  Lock,
  TrendingUp,
  ShoppingCart,
  Truck,
  Tag,
  BadgeCheck,
  Store,
  Heart,
  MapPin,
  Ticket,
  Check,
} from 'lucide-react';
import type { StoreProduct, UtilityProduct, UserProfile, ProductPackageVariant } from '../types/game';
import { formatCore, formatCurrencyVND } from '../utils/textUtils';
import { marketingService } from '../services/marketingService';
import { dataService } from '../services/dataService';
import { cartService } from '../services/cartService';
import { wishlistService } from '../services/wishlistService';
import { offerService } from '../services/offerService';
import { getProductPackages } from '../utils/productPackageUtils';
import { GuideLinksBanner } from './GuideLinksBanner';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { useLanguage } from '../context/LanguageContext';
import { PackageShareModal } from './PackageShareModal';
import { ProductReviewsSection } from './ProductReviewsSection';

export interface ProductDetailModalProps {
  product: StoreProduct | UtilityProduct | null;
  initialPackageId?: string;
  onClose: () => void;
  onBuyNow: (product: any, selectedPackage?: ProductPackageVariant, quantity?: number) => void;
  currentUser?: UserProfile | null;
  onOpenAuth?: () => void;
  onOpenShare?: (product: any) => void;
  onShowToast?: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product: rawProduct,
  initialPackageId,
  onClose,
  onBuyNow,
  currentUser,
  onOpenAuth,
  onOpenShare,
  onShowToast,
}) => {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const [storeSyncVersion, setStoreSyncVersion] = useState(0);
  useEffect(() => {
    const handleSync = () => setStoreSyncVersion((v) => v + 1);
    window.addEventListener('pine_store_products_updated', handleSync);
    return () => window.removeEventListener('pine_store_products_updated', handleSync);
  }, []);
  const product = useMemo(() => {
    if (!rawProduct) return null;
    if ('game_slug' in rawProduct && rawProduct.id) {
      const fresh = dataService.getStoreProducts().find((p) => p.id === rawProduct.id);
      if (fresh) {
        return {
          ...rawProduct,
          ...fresh,
          packages: (rawProduct as any).packages?.length ? (rawProduct as any).packages : (fresh as any).packages,
        };
      }
    }
    return rawProduct;
  }, [rawProduct, storeSyncVersion]);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [packageToShare, setPackageToShare] = useState<ProductPackageVariant | null>(null);
  const [offerData, setOfferData] = useState<{
    campaign?: { enabled: boolean; offer_price: number };
    offers: Record<string, { eligible: boolean; offer_price: number; discount_amount: number; reason: string | null }>;
  }>(() => {
    const slug = (product as any)?.game_slug || '';
    const cached = offerService.getCached(slug);
    if (cached) {
      return {
        campaign: cached.campaign,
        offers: cached.offers || {},
      };
    }
    return { offers: {} };
  });
  useLockBodyScroll(Boolean(product));
  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isZoomed) {
          setIsZoomed(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, isZoomed, onClose]);
  const [, setTick] = useState(0);

  // Danh sách các gói tùy chọn
  const packages: ProductPackageVariant[] = useMemo(() => {
    if (!product) return [];
    return getProductPackages(product);
  }, [product]);

  const getInitialPkgId = () => {
    if (initialPackageId && packages.some((p) => p.id === initialPackageId)) {
      return initialPackageId;
    }
    const firstInStock = packages.find((p) => {
      const s = typeof p.stock_quantity === 'number' ? p.stock_quantity : (product?.stock_quantity ?? 0);
      return s > 0;
    });
    return firstInStock?.id || packages[0]?.id || product?.id || '';
  };

  const [selectedPackageId, setSelectedPackageId] = useState<string>(getInitialPkgId);
  const [isWishlisted, setIsWishlisted] = useState<boolean>(() => Boolean(product?.id && wishlistService.isInWishlist(product.id, 'product')));

  useEffect(() => {
    if (product?.id) {
      setIsWishlisted(wishlistService.isInWishlist(product.id, 'product'));
    }
  }, [product?.id]);

  useEffect(() => {
    setActiveImageIdx(0);
    setIsZoomed(false);
    setIsDescExpanded(false);
    setQuantity(1);
    setLiveStock(null);
    if (initialPackageId && packages.some((p) => p.id === initialPackageId)) {
      setSelectedPackageId(initialPackageId);
    } else if (packages.length > 0) {
      const firstInStock = packages.find((p) => {
        const s = typeof p.stock_quantity === 'number' ? p.stock_quantity : (product?.stock_quantity ?? 0);
        return s > 0;
      });
      setSelectedPackageId(firstInStock?.id || packages[0].id);
    }
  }, [product?.id, initialPackageId]);

  useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1);
    const unsub = dataService.subscribe(handleUpdate);
    const unsubStock = marketingService.subscribeStockChange(handleUpdate);
    const unsubSold = marketingService.subscribeSoldCountChange(handleUpdate);
    window.addEventListener('pine_virtual_stock_updated', handleUpdate);
    window.addEventListener('pine_sold_count_updated', handleUpdate);
    window.addEventListener('pine_utilities_updated', handleUpdate);
    return () => {
      unsub();
      unsubStock();
      unsubSold();
      window.removeEventListener('pine_virtual_stock_updated', handleUpdate);
      window.removeEventListener('pine_sold_count_updated', handleUpdate);
      window.removeEventListener('pine_utilities_updated', handleUpdate);
    };
  }, []);

  // Fetch thông tin ưu đãi mua lần đầu (First Purchase Offer) theo tài khoản và game
  useEffect(() => {
    let isMounted = true;
    const fetchOffers = async () => {
      if (!product) return;
      try {
        const slug = (product as any).game_slug || '';
        const token = (typeof localStorage !== 'undefined' && localStorage.getItem('pine_auth_token')) ||
          (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pine_auth_token')) ||
          currentUser?.session_token || '';

        const data = await offerService.fetchOffers(slug, token);
        if (isMounted && data) {
          setOfferData({
            campaign: data.campaign,
            offers: data.offers || {},
          });
        }
      } catch (e) {
        console.warn('[ProductDetailModal] fetchOffers error:', e);
      }
    };

    fetchOffers();
    return () => {
      isMounted = false;
    };
  }, [product?.id, (product as any)?.game_slug, currentUser?.id]);

  // Lấy gói đang chọn (Hook bắt buộc chạy trước mọi early return)
  const selectedPackage: ProductPackageVariant | undefined = useMemo(() => {
    if (!product) return undefined;
    return (
      packages.find((p) => p.id === selectedPackageId) ||
      packages[0] || {
        id: product.id,
        name: product.title,
        price: product.current_price,
        original_price: product.original_price,
        stock_quantity: product.stock_quantity,
        note: t('productDetailModal.standardProcessing'),
        description: product.description,
      }
    );
  }, [packages, selectedPackageId, product]);

  // Lấy mô tả tương ứng theo gói đang chọn (ưu tiên gói con, fallback sản phẩm gốc)
  const currentDescription = useMemo(() => {
    if (selectedPackage?.description && selectedPackage.description.trim()) {
      return selectedPackage.description;
    }
    if (selectedPackage?.id) {
      const rawStore = dataService.getStoreProducts().find((p) => p.id === selectedPackage.id);
      if (rawStore?.description && rawStore.description.trim()) return rawStore.description;
      const rawUtil = dataService.getUtilityProducts().find((u) => u.id === selectedPackage.id);
      if (rawUtil?.description && rawUtil.description.trim()) return rawUtil.description;
    }
    return product?.description || '';
  }, [selectedPackage, product]);

  const [liveStock, setLiveStock] = useState<number | null>(null);

  // Tải lại tồn kho thật (stock_quantity) từ máy chủ khi mở modal hoặc đổi gói
  useEffect(() => {
    setLiveStock(null);
    const targetId = selectedPackage?.id || product?.id;
    if (!targetId) return;

    let active = true;
    dataService.refreshRealStock(targetId).then((freshStock) => {
      if (active && freshStock !== null) {
        setLiveStock(freshStock);
      }
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [selectedPackage?.id, product?.id]);

  const realStock = typeof selectedPackage?.stock_quantity === 'number'
    ? selectedPackage.stock_quantity
    : (liveStock !== null ? liveStock : (product?.stock_quantity ?? 0));

  useEffect(() => {
    if (realStock <= 0) {
      setQuantity(0);
    } else if (quantity > realStock) {
      setQuantity(realStock);
    } else if (quantity < 1) {
      setQuantity(1);
    }
  }, [realStock, selectedPackage?.id]);

  if (!product || !selectedPackage) return null;

  const isStoreProduct = 'game_slug' in product;
  const gameName = isStoreProduct
    ? (product as StoreProduct).game_name
    : (product as UtilityProduct).category_label || (product as UtilityProduct).category || t('productDetailModal.utility');

  const rawDefaultImg = resolveProductCoverImage(product, '/package-placeholder.svg');
  const defaultImg = rawDefaultImg.includes('test-game.webp') ? '/package-placeholder.svg' : rawDefaultImg;

  const rawProductImages: unknown[] = Array.isArray(product.product_images) && product.product_images.length > 0
    ? product.product_images
    : (Array.isArray((product as any).images) && (product as any).images.length > 0 ? (product as any).images : []);
  const cleanProductImages: string[] = rawProductImages
    .map((u) => sanitizeImageUrl(typeof u === 'string' ? u : ''))
    .filter((u): u is string => Boolean(u) && !u.includes('test-game.webp'));
  const images: string[] = cleanProductImages.length > 0 ? cleanProductImages : [defaultImg];
  const isActiveImgPlaceholder = images[activeImageIdx]?.includes('package-placeholder.svg');

  // Tồn kho & Đã bán của gói được chọn (Khi còn tồn kho thật realStock > 0, đảm bảo displayStock >= 1)
  const displayStock = realStock <= 0 ? 0 : Math.max(1, marketingService.getDisplayStock(selectedPackage.id || product.id, realStock));
  const displaySold = marketingService.getSoldDisplay({
    ...selectedPackage,
    created_at: product.created_at,
    fomo_anchor_time: (product as any).fomo_anchor_time,
  } as any);
  const isOutOfStock = realStock <= 0 || displayStock <= 0;

  // Quyết định hiển thị "Đã bán" dựa trên: Cấu hình toàn cục + Cấu hình sản phẩm riêng lẻ
  const isGlobalSoldEnabled = isStoreProduct
    ? (typeof window !== 'undefined' ? (localStorage.getItem('pine_store_global_show_sold') !== 'false' && localStorage.getItem('pine_admin_show_sold_store') !== 'false') : true)
    : (typeof window !== 'undefined' ? (localStorage.getItem('pine_utilities_global_show_sold') !== 'false' && localStorage.getItem('pine_admin_show_sold_util') !== 'false') : true);
  const isSoldVisible = isGlobalSoldEnabled && (product as any).show_sold_count !== false;

  const isVnd = dataService.getWebsiteBranding()?.currencyMode === 'VND' || (product as any)?.industry !== 'gaming';
  const formatPriceVal = (amount: number) => isVnd ? formatCurrencyVND(amount) : formatCore(amount);

  const currentPrice = selectedPackage.price;
  const originalPrice = (typeof selectedPackage.original_price === 'number' && selectedPackage.original_price > 0)
    ? selectedPackage.original_price
    : currentPrice;

  // Kiểm tra ưu đãi mua lần đầu & hình thức Nâng Giá cho gói đang chọn
  const selectedOffer = offerData.offers[selectedPackage.id];
  const isSelectedEscalating = selectedPackage.sale_mode === 'escalating' || Boolean(selectedOffer?.escalating?.is_escalating);
  
  const rawEsc = selectedOffer?.escalating;
  const escBase = Number(rawEsc?.base_price ?? rawEsc?.escalating_base_price ?? selectedPackage.escalating_base_price ?? selectedPackage.price ?? currentPrice) || currentPrice;
  const escStep = Number(rawEsc?.step ?? rawEsc?.escalating_step ?? selectedPackage.escalating_step ?? 0) || 0;
  const escMax = (rawEsc?.max_price !== undefined && rawEsc?.max_price !== null)
    ? Number(rawEsc.max_price)
    : ((rawEsc?.escalating_max_price !== undefined && rawEsc?.escalating_max_price !== null)
      ? Number(rawEsc.escalating_max_price)
      : (selectedPackage.escalating_max_price !== undefined && selectedPackage.escalating_max_price !== null ? Number(selectedPackage.escalating_max_price) : null));
  const escCompleted = Number(rawEsc?.completed_count ?? selectedPackage.escalating_completed_count ?? 0) || 0;
  const rawCurrent = Number(rawEsc?.current_price ?? rawEsc?.current_calculated_price ?? selectedPackage.escalating_current_price);
  const escCurrent = (rawCurrent > 0)
    ? rawCurrent
    : (escMax !== null && escMax > 0 ? Math.min(escBase + (escCompleted * escStep), escMax) : (escBase + (escCompleted * escStep)));
  const rawNext = Number(rawEsc?.next_price ?? rawEsc?.next_step_price ?? selectedPackage.escalating_next_price);
  const escNext = (rawNext > 0)
    ? rawNext
    : (escMax !== null && escMax > 0 ? Math.min(escBase + ((escCompleted + 1) * escStep), escMax) : (escBase + ((escCompleted + 1) * escStep)));

  const selectedEscData = {
    is_escalating: isSelectedEscalating,
    base_price: escBase,
    step: escStep,
    max_price: escMax,
    completed_count: escCompleted,
    current_price: escCurrent,
    next_price: escNext,
  };

  // Kiểm tra cờ riêng mua lần đầu của gói đang chọn: BẮT BUỘC cờ riêng phải đang bật (true / 1)
  const isSelectedFpFlag = selectedPackage.first_purchase_enabled === true ||
    selectedPackage.first_purchase_enabled === 1 ||
    String(selectedPackage.first_purchase_enabled) === '1' ||
    String(selectedPackage.first_purchase_enabled) === 'true';

  const selectedMaxPrice = selectedPackage.first_purchase_max_price
    ? Number(selectedPackage.first_purchase_max_price)
    : (offerData?.campaign?.max_original_price ?? 30000);

  const selectedCampaignOfferPrice = offerData?.campaign?.enabled
    ? Number(offerData.campaign.offer_price || 0)
    : 0;
  const selectedCustomOfferPrice = selectedPackage.first_purchase_price
    ? Number(selectedPackage.first_purchase_price)
    : 0;
  const selectedCandidateOfferPrice =
    selectedOffer?.offer_price !== undefined && selectedOffer?.offer_price !== null
      ? Number(selectedOffer.offer_price)
      : (selectedCustomOfferPrice > 0 ? selectedCustomOfferPrice : selectedCampaignOfferPrice);

  const defaultEligible =
    isSelectedFpFlag &&
    !isSelectedEscalating &&
    (selectedCustomOfferPrice > 0 || Boolean(offerData?.campaign?.enabled)) &&
    currentPrice <= selectedMaxPrice;

  const isSelectedOfferEligible =
    !isSelectedEscalating &&
    isSelectedFpFlag &&
    selectedCandidateOfferPrice > 0 &&
    selectedCandidateOfferPrice < currentPrice &&
    (selectedOffer !== undefined ? Boolean(selectedOffer.eligible) : defaultEligible);

  const rawOfferPrice = isSelectedOfferEligible ? selectedCandidateOfferPrice : currentPrice;

  const displayCurrentPrice = isSelectedEscalating
    ? selectedEscData.current_price
    : (isSelectedOfferEligible ? rawOfferPrice : currentPrice);

  const displayOriginalPrice = isSelectedEscalating
    ? displayCurrentPrice
    : (originalPrice > 0 ? originalPrice : currentPrice);

  // Tính tỷ lệ giảm giá chiết khấu dựa trên giá thực trả displayCurrentPrice so với giá gốc thị trường displayOriginalPrice
  // Đảm bảo mức giá nào thì mang đúng % giảm giá tương ứng (-90% cho 2.000 Core, -87% cho 2.600 Core)
  const discountPercent =
    isSelectedEscalating
      ? 0
      : (displayOriginalPrice > displayCurrentPrice
          ? Math.round(((displayOriginalPrice - displayCurrentPrice) / displayOriginalPrice) * 100)
          : 0);

  // Tổng tiền: Gói Nâng Giá khóa ở 1 gói; số lượng tính tiền được kẹp đúng bằng tồn kho thật
  const effectiveSafeQty = isSelectedEscalating ? 1 : (realStock > 0 ? Math.min(Math.max(1, quantity), realStock) : 0);
  const totalPrice = isSelectedEscalating
    ? displayCurrentPrice
    : (effectiveSafeQty > 0
        ? (isSelectedOfferEligible
            ? displayCurrentPrice + (currentPrice * (effectiveSafeQty - 1))
            : currentPrice * effectiveSafeQty)
        : 0);

  const handleShare = async () => {
    const origin =
      typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? window.location.origin
        : 'https://universal-mall-shop.pages.dev';
    const pathPrefix = isStoreProduct ? 'store#product' : 'utilities#utility';
    const shareUrl = `${origin}/${pathPrefix}=${product.id}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: product.title,
          text: t('packageShareModal.shareTextFormat', {
            name: product.title,
            game: gameName,
            price: formatPriceVal(displayCurrentPrice),
          }),
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    if (onOpenShare) {
      onOpenShare(product);
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      if (onShowToast) {
        onShowToast(t('productDetailModal.linkCopiedToast'), t('store.copyUrl', { url: shareUrl }), 'success');
      }
    }
  };

  const handleDecreaseQty = () => {
    if (realStock <= 0) return;
    setQuantity((prev) => Math.max(1, prev - 1));
  };

  const handleIncreaseQty = () => {
    if (realStock <= 0 || quantity >= realStock) return;
    setQuantity((prev) => Math.min(realStock, prev + 1));
  };

  const handleQtyInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (realStock <= 0) {
      setQuantity(0);
      return;
    }
    const val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) {
      setQuantity(1);
    } else {
      setQuantity(Math.min(realStock, val));
    }
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) {
      if (onShowToast) onShowToast(t('productDetailModal.outOfStockToast'), t('productDetailModal.outOfStockProductDesc'), 'error');
      return;
    }
    const finalSafeQty = isSelectedEscalating ? 1 : (realStock > 0 ? Math.min(Math.max(1, quantity), realStock) : 1);
    const result = cartService.addToCart({
      productId: product.id,
      productName: product.title,
      priceCore: displayCurrentPrice,
      sellerId: 'admin_store',
      sellerName: (product as any).brand || 'Codegame Mall',
      sellerSlug: (product as any).brand ? (product as any).brand.toLowerCase().replace(/\s+/g, '-') : 'codegame-mall',
      gameSlug: (product as any).game_slug,
      gameName: (product as any).brand || (product as any).game_name,
      coverUrl: product.cover_image_url || product.product_images?.[0],
      variantId: selectedPackage.id,
      variantName: selectedPackage.name,
      attributes: (selectedPackage as any).attributes,
      quantity: finalSafeQty,
    });
    if (result.success) {
      if (onShowToast) onShowToast(t('productDetailModal.success'), result.message, 'success');
      try {
        confetti({
          particleCount: 25,
          spread: 50,
          origin: { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }
        });
      } catch {}
    } else {
      if (onShowToast) onShowToast(t('productDetailModal.notice'), result.message, 'info');
    }
  };

  const handleToggleWishlist = async () => {
    if (!product?.id) return;
    const meta = {
      target_id: product.id,
      target_type: 'product' as const,
      title: product.title,
      price: displayCurrentPrice,
      image_url: product.cover_image_url || product.product_images?.[0] || '',
      category: (product as any).brand || (product as any).category || 'MALL',
    };
    const res = await wishlistService.toggleWishlist(meta);
    setIsWishlisted(res.inWishlist);
    if (onShowToast) {
      onShowToast(
        res.inWishlist ? t('wishlist.addedToast') : t('wishlist.removedToast'),
        res.inWishlist ? t('wishlist.addedDesc') : '',
        'info'
      );
    }
  };

  if (typeof document === 'undefined') return null;

  const isPhysicalProduct = (product as any).product_type === 'physical';
  const physicalShipFrom = (product as any).warehouse_address || (product as any).origin || t('shopeePhysical.warehouseDefault');
  const physicalWeightGrams = Number((product as any).weight_grams || 0);
  const physicalWarrantyHours = Number((product as any).warranty_hours || 0);

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm overflow-hidden animate-fade-in"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-modal-title"
        className="relative w-full max-w-5xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-[24px] sm:rounded-2xl overflow-hidden shadow-2xl animate-scale-in flex flex-col h-[90dvh] sm:h-auto max-h-[90dvh] sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shrink-0 sticky top-0 z-20">
          <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600/60 rounded-full mx-auto mb-2 sm:hidden shrink-0" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                <img
                  key={defaultImg}
                  src={defaultImg}
                  alt={product.title}
                  className={`w-full h-full ${defaultImg.includes('package-placeholder.svg') ? 'object-contain p-1.5' : 'object-cover'}`}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    console.warn('[ProductImageError]', {
                      location: 'modal_header',
                      failedSrc: target.currentSrc || target.src,
                      productId: product.id,
                      cover_image_url: product.cover_image_url,
                    });
                    if (isPhysicalProduct && !target.src.includes(PHYSICAL_DEFAULT_IMAGE_URL)) {
                      target.src = PHYSICAL_DEFAULT_IMAGE_URL;
                      return;
                    }
                    target.onerror = null;
                    target.className = 'w-full h-full object-contain p-1.5';
                    target.src = '/package-placeholder.svg';
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-xs bg-[#d0011b] text-white text-[10px] font-bold shrink-0 leading-none">
                    {t('shopeePhysical.mallBadge')}
                  </span>
                  <h2 id="product-detail-modal-title" className="font-heading font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate">
                    {product.title}
                  </h2>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  {isPhysicalProduct ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#ee4d2d]">
                      <Truck className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>{t('shopeePhysical.physicalTag')}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] sm:text-xs text-[#ee4d2d] font-semibold truncate block">
                      {gameName}
                    </span>
                  )}
                  {(product as any).is_affiliate && (product as any).show_supplier !== false && (product as any).supplier_name && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-700">
                      <Store className="w-3 h-3 text-[#ee4d2d] shrink-0" aria-hidden="true" />
                      <span>{t('productDetailModal.resoldBy', { seller: (product as any).store_name || (product as any).seller_name || 'Shop', supplier: (product as any).supplier_name })}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (selectedPackage) {
                    setPackageToShare(selectedPackage);
                  } else {
                    handleShare();
                  }
                }}
                className="p-2 sm:p-2.5 rounded-xl bg-slate-100 hover:bg-orange-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-[#ee4d2d] border border-slate-200 dark:border-slate-700 cursor-pointer transition-all active:scale-95"
                title={t('productDetailModal.shareSelectedPackage')}
                aria-label={t('productDetailModal.shareSelectedPackage')}
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 sm:p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-white border border-slate-200 dark:border-slate-700 cursor-pointer transition-all active:scale-90 flex items-center justify-center shrink-0"
                aria-label={t('productDetailModal.close')}
                title={t('productDetailModal.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body - 2 Columns Layout */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-6 scrollbar-thin">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* CỘT TRÁI (Left Column): Ảnh đại diện lớn, Cam kết uy tín, Chi tiết thông tin */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-5">
              {/* Main Image Gallery */}
              <div className="space-y-2.5">
                <div className="relative rounded-xl bg-slate-50 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-slate-800 group select-none shadow-xs aspect-square max-h-[340px] sm:max-h-[420px] mx-auto w-full">
                  <img
                    key={images[activeImageIdx]}
                    src={images[activeImageIdx]}
                    alt={product.title}
                    className={`w-full h-full transition-transform duration-300 ${
                      isActiveImgPlaceholder
                        ? 'object-contain p-8 bg-slate-50 dark:bg-slate-800'
                        : 'object-cover group-hover:scale-105'
                    }`}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      console.warn('[ProductImageError]', {
                        location: 'modal_gallery',
                        failedSrc: target.currentSrc || target.src,
                        productId: product.id,
                        cover_image_url: product.cover_image_url,
                      });
                      if (isPhysicalProduct && !target.src.includes(PHYSICAL_DEFAULT_IMAGE_URL)) {
                        target.src = PHYSICAL_DEFAULT_IMAGE_URL;
                        return;
                      }
                      target.onerror = null;
                      target.className = 'w-full h-full object-contain p-8 bg-slate-50 dark:bg-slate-800';
                      target.src = '/package-placeholder.svg';
                    }}
                  />
                  {isPhysicalProduct ? (
                    <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 z-10">
                      <span className="px-2 py-0.5 rounded-xs bg-[#00bfa5] text-white text-[10px] font-extrabold shadow flex items-center gap-1">
                        <Truck className="w-3 h-3" aria-hidden="true" />
                        <span>{t('shopeePhysical.freeshipXtra')}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-xs bg-[#ee4d2d] text-white text-[10px] font-bold shadow">
                        {t('shopeePhysical.return15Days')}
                      </span>
                    </div>
                  ) : (
                    <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 z-10">
                      <span className="px-2 py-0.5 rounded-xs bg-violet-600/95 text-white text-[10px] font-bold shadow flex items-center gap-1">
                        <Zap className="w-3 h-3" aria-hidden="true" />
                        <span>{t('shopeePhysical.instant0s')}</span>
                      </span>
                    </div>
                  )}

                  {images.length > 1 && (
                    <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-sm text-white text-[11px] font-mono font-medium shadow-md border border-white/10 z-10">
                      {activeImageIdx + 1} / {images.length}
                    </div>
                  )}

                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImageIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1));
                        }}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-all cursor-pointer opacity-90 sm:opacity-0 sm:group-hover:opacity-100 z-10 active:scale-95"
                        title={t('productDetailModal.prevImage')}
                        aria-label={t('productDetailModal.prevImage')}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImageIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0));
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-all cursor-pointer opacity-90 sm:opacity-0 sm:group-hover:opacity-100 z-10 active:scale-95"
                        title={t('productDetailModal.nextImage')}
                        aria-label={t('productDetailModal.nextImage')}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsZoomed(true)}
                    className="absolute bottom-2.5 right-2.5 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-all cursor-pointer z-10"
                    title={t('productDetailModal.zoomImage')}
                    aria-label={t('productDetailModal.zoomImage')}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>

                {/* Thumbnails */}
                {images.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
                    {images.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveImageIdx(idx)}
                        className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                          activeImageIdx === idx
                            ? 'border-[#ee4d2d] ring-2 ring-[#ee4d2d]/25 shadow-sm opacity-100'
                            : 'border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100 hover:border-[#ee4d2d]/50'
                        }`}
                      >
                        <img
                          src={img}
                          alt={`thumb-${idx + 1}`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.onerror = null;
                            target.src = isPhysicalProduct ? PHYSICAL_DEFAULT_IMAGE_URL : '/package-placeholder.svg';
                          }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 3 Khối Cam Kết Uy Tín Chuẩn Shopee (WCAG AA Contrast Light & Dark) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/20 flex items-center sm:flex-col sm:text-center sm:justify-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  <div>
                    <h4 className="font-bold text-xs text-emerald-800 dark:text-emerald-300">{t('productDetailModal.trustSafe')}</h4>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">{t('productDetailModal.trustSafeDesc')}</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/20 flex items-center sm:flex-col sm:text-center sm:justify-center gap-2.5">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                  <div>
                    <h4 className="font-bold text-xs text-amber-800 dark:text-amber-300">{t('productDetailModal.trustFast')}</h4>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">{t('productDetailModal.trustFastDesc')}</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-200/80 dark:border-orange-500/20 flex items-center sm:flex-col sm:text-center sm:justify-center gap-2.5">
                  <Sparkles className="w-5 h-5 text-[#ee4d2d] shrink-0" aria-hidden="true" />
                  <div>
                    <h4 className="font-bold text-xs text-[#d0011b] dark:text-orange-300">{t('productDetailModal.trustAuthentic')}</h4>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">{t('productDetailModal.trustAuthenticDesc')}</p>
                  </div>
                </div>
              </div>

              {/* Description (Hiển thị ở cột trái trên Desktop) */}
              {currentDescription && (
                <div className="space-y-2 hidden lg:block">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-heading font-bold text-sm text-foreground flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-primary" />
                      <span>{t('productDetailModal.productDetails')}</span>
                    </h4>
                    {currentDescription.length > 200 && (
                      <button
                        type="button"
                        onClick={() => setIsDescExpanded(!isDescExpanded)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary hover:opacity-90 py-1 px-2.5 rounded-lg bg-secondary/10 hover:bg-secondary/20 border border-secondary/20 cursor-pointer transition-all active:scale-95 shrink-0"
                      >
                        <span>{isDescExpanded ? (t('productDetailModal.collapseDesc')) : (t('productDetailModal.readAllDesc'))}</span>
                        {isDescExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                  <div
                    className={`relative bg-card p-3.5 sm:p-4 rounded-2xl border border-border transition-all duration-300 ${
                      !isDescExpanded && currentDescription.length > 200
                        ? 'max-h-[140px] overflow-hidden'
                        : 'sm:max-h-[500px] sm:overflow-y-auto scrollbar-thin'
                    }`}
                  >
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {currentDescription}
                    </p>
                    {!isDescExpanded && currentDescription.length > 200 && (
                      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-14 bg-gradient-to-t from-card via-card/80 to-transparent flex items-end justify-center pb-1">
                        <span className="text-[10px] text-secondary font-semibold bg-card/90 px-2 py-0.5 rounded-full border border-secondary/20 shadow-sm">
                          {t('productDetailModal.viewAllDescTip')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Guide Links Banner */}
              <GuideLinksBanner
                guideLinks={(product as any).guide_links}
                guideUrl={(product as any).guide_url}
                guideText={(product as any).guide_text}
                showGuide={(product as any).show_guide_link !== false}
                theme="indigo"
              />

              
              {/* Thông Số & Cam Kết Bán Hàng Đa Ngành */}
              {(isPhysicalProduct || (product as any).brand || (product as any).origin || (product as any).warranty_period || (product as any).shipping_fee !== undefined) && (
                <div className="p-3.5 rounded-2xl bg-card border border-border space-y-2 text-xs">
                  <div className="font-bold text-foreground flex items-center gap-1.5 pb-1.5 border-b border-border/60">
                    <BadgeCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-500" />
                    <span>{t('productDetailModal.productSpecs')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {(product as any).brand && (
                      <div>
                        <span className="text-muted-foreground">{t('productDetailModal.brand')} </span>
                        <span className="font-bold text-foreground">{(product as any).brand}</span>
                      </div>
                    )}
                    {(product as any).product_type && (
                      <div>
                        <span className="text-muted-foreground">{t('productDetailModal.productType')} </span>
                        <span className="font-bold text-foreground">
                          {isPhysicalProduct ? (t('productDetailModal.productTypePhysical')) : (t('productDetailModal.productTypeDigital'))}
                        </span>
                      </div>
                    )}
                    {(product as any).origin && (
                      <div>
                        <span className="text-muted-foreground">{t('productDetailModal.origin')} </span>
                        <span className="font-bold text-foreground">{(product as any).origin}</span>
                      </div>
                    )}
                    {isPhysicalProduct && (
                      <div>
                        <span className="text-muted-foreground">{t('shopeePhysical.warehouseLabel')}: </span>
                        <span className="font-bold text-foreground">{physicalShipFrom}</span>
                      </div>
                    )}
                    {isPhysicalProduct && physicalWeightGrams > 0 && (
                      <div>
                        <span className="text-muted-foreground">{t('shopeePhysical.weightLabel')}: </span>
                        <span className="font-bold text-foreground">{physicalWeightGrams}g</span>
                      </div>
                    )}
                    {isPhysicalProduct && (
                      <div>
                        <span className="text-muted-foreground">{t('shopeePhysical.deliveryMethodLabel')}: </span>
                        <span className="font-bold text-foreground">{t('shopeePhysical.deliveryStandard')}</span>
                      </div>
                    )}
                    {isPhysicalProduct && physicalWarrantyHours > 0 && (
                      <div>
                        <span className="text-muted-foreground">{t('shopeePhysical.warrantyLabel')}: </span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-500">{physicalWarrantyHours} {t('shopeePhysical.warrantyHoursUnit')}</span>
                      </div>
                    )}
                    {(product as any).shipping_fee !== undefined && (
                      <div>
                        <span className="text-muted-foreground">{t('productDetailModal.shipping')} </span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-500">
                          {(product as any).shipping_fee === 0 ? (t('productDetailModal.freeShipping')) : formatPriceVal((product as any).shipping_fee)}
                        </span>
                      </div>
                    )}
                  </div>
                  {((product as any).warranty_period || (product as any).warranty_text) && (
                    <div className="pt-1.5 border-t border-border/60 text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-500 shrink-0" />
                      <span>{(product as any).warranty_period || (product as any).warranty_text}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Warranty text */}
              {(product as any).show_warranty && (
                <div className="p-3 rounded-xl bg-muted/30 border border-border flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>{(product as any).warranty_text || (t('productDetailModal.warrantyDefault'))}</span>
                </div>
              )}
            </div>

            {/* CỘT PHẢI (Right Column): Khối Chọn Gói & Thanh Toán Chuẩn Shopee */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 sm:p-5 shadow-sm space-y-4 sticky top-4">
                {/* Header Gói Đã Chọn */}
                <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {t('productDetailModal.selectedPackageLabel')}
                    </span>
                    <span className="text-xs font-bold text-[#ee4d2d] truncate max-w-[260px]">
                      {selectedPackage.name}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 p-3 rounded-lg bg-[#fafafa] dark:bg-slate-800/80 border border-orange-200/70 dark:border-slate-700">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight text-[#ee4d2d]">
                        {formatPriceVal(displayCurrentPrice)}
                      </span>
                      {!isSelectedEscalating && isSelectedOfferEligible && displayCurrentPrice !== currentPrice && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 flex items-center gap-1 shadow-xs">
                          <Sparkles className="w-3 h-3 text-rose-500" aria-hidden="true" />
                          <span>{t('productDetailModal.firstPurchaseOffer')}</span>
                        </span>
                      )}
                      {!isSelectedEscalating && displayOriginalPrice > displayCurrentPrice && (
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 line-through font-mono">
                          {formatPriceVal(displayOriginalPrice)}
                        </span>
                      )}
                      {!isSelectedEscalating && discountPercent > 0 && (
                        <span className="text-[11px] font-mono font-extrabold px-1.5 py-0.5 rounded-xs bg-[#ffe97a] text-[#ee4d2d] shadow-xs">
                          -{discountPercent}%
                        </span>
                      )}
                      {isSelectedEscalating && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                          <span>{t('productDetailModal.escalatingPrice', { step: formatCore(selectedEscData.step) })}</span>
                        </span>
                      )}
                    </div>

                    {/* Trạng thái kho: Ghi rõ còn hàng hay hết hàng */}
                    <div className="shrink-0">
                      {isOutOfStock ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400 text-xs font-bold whitespace-nowrap shrink-0">
                          <span>{t('productDetailModal.outOfStockShort')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold whitespace-nowrap shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{t('productDetailModal.inStockShort')}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {isSelectedEscalating && (
                    <div className="mt-2.5 p-3 rounded-xl bg-amber-50 dark:bg-slate-900/90 border border-amber-300/70 dark:border-amber-500/30 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                          <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                          <span>{t('productDetailModal.purchaseLadderTurn', { count: Number(selectedEscData.completed_count) + 1 })}</span>
                        </span>
                        <span className="text-[11px] font-mono text-amber-800 dark:text-amber-300 font-bold">
                          +{formatCore(selectedEscData.step)}
                        </span>
                      </div>

                      {/* Thang đo giá trực quan 3 lượt */}
                      <div className="grid grid-cols-3 gap-1.5 text-center pt-1.5 border-t border-amber-200 dark:border-slate-800">
                        <div className="p-1.5 rounded-lg bg-amber-100/80 dark:bg-amber-500/20 border border-amber-400/70 dark:border-amber-500/50">
                          <span className="text-[9px] text-amber-900 dark:text-amber-300 font-bold uppercase block">
                            {t('productDetailModal.escalatingTurn', { turn: Number(selectedEscData.completed_count) + 1 })}
                          </span>
                          <span className="font-mono font-black text-xs text-[#ee4d2d] dark:text-amber-400 block mt-0.5">{formatPriceVal(displayCurrentPrice)}</span>
                          <span className="text-[8px] text-emerald-700 dark:text-emerald-400 font-semibold block">{t('productDetailModal.escalatingCurrentTurn')}</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-white dark:bg-muted/40 border border-slate-200 dark:border-border">
                          <span className="text-[9px] text-slate-600 dark:text-muted-foreground font-bold uppercase block">
                            {t('productDetailModal.escalatingTurn', { turn: Number(selectedEscData.completed_count) + 2 })}
                          </span>
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-foreground block mt-0.5">
                            {formatCore(
                              selectedEscData.max_price && (displayCurrentPrice + selectedEscData.step) > selectedEscData.max_price
                                ? selectedEscData.max_price
                                : displayCurrentPrice + selectedEscData.step
                            )}
                          </span>
                          <span className="text-[8px] text-slate-500 dark:text-muted-foreground block">{t('productDetailModal.escalatingNextTurn')}</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-white/70 dark:bg-muted/20 border border-slate-200/80 dark:border-border/60">
                          <span className="text-[9px] text-slate-600 dark:text-muted-foreground font-bold uppercase block">
                            {t('productDetailModal.escalatingTurn', { turn: Number(selectedEscData.completed_count) + 3 })}
                          </span>
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-foreground block mt-0.5">
                            {formatCore(
                              selectedEscData.max_price && (displayCurrentPrice + (selectedEscData.step * 2)) > selectedEscData.max_price
                                ? selectedEscData.max_price
                                : displayCurrentPrice + (selectedEscData.step * 2)
                            )}
                          </span>
                          <span className="text-[8px] text-slate-500 dark:text-muted-foreground block">{t('productDetailModal.escalatingLaterTurn')}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-muted-foreground pt-1 border-t border-amber-200/70 dark:border-slate-800/60">
                        <span>{t('productDetailModal.escalatingBoughtCount', { count: selectedEscData.completed_count })}</span>
                        {selectedEscData.max_price ? (
                          <span>{t('productDetailModal.escalatingPriceCap', { cap: formatCore(selectedEscData.max_price) })}</span>
                        ) : (
                          <span>{t('productDetailModal.escalatingNoCap')}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {!isSelectedEscalating && isSelectedOfferEligible && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-500/20 w-fit">
                      <Sparkles className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 animate-pulse" aria-hidden="true" />
                      <span>{t('productDetailModal.firstPurchaseOfferOnly')}</span>
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500 dark:text-amber-400" aria-hidden="true" />
                      <span>{t('productDetailModal.ratingTrusted')}</span>
                    </span>
                    {isSoldVisible && (
                      <span className="text-slate-600 dark:text-slate-400">
                        {t('productDetailModal.soldPackages', { count: displaySold })}
                      </span>
                    )}
                  </div>

                  {/* KHỐI THÔNG TIN ĐẶC THÙ HÀNG VẬT LÝ CHUẨN SHOPEE (Voucher, Vận chuyển, An tâm mua sắm, Số lượng) */}
                  {isPhysicalProduct && (
                    <div className="mt-3 pt-3 border-t border-border/70 space-y-2.5 text-xs">
                      {/* Mã Giảm Giá Của Shop */}
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <span className="col-span-4 text-[11px] text-muted-foreground font-medium">
                          {t('shopeePhysical.shopVoucherLabel')}
                        </span>
                        <div className="col-span-8 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#ee4d2d]/10 border border-dashed border-[#ee4d2d]/50 text-[#ee4d2d] text-[10px] font-bold">
                            <Ticket className="w-3 h-3" />
                            <span>{t('shopeePhysical.voucherOff15k')}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#00bfa5]/10 border border-dashed border-[#00bfa5]/50 text-[#00897b] dark:text-[#00bfa5] text-[10px] font-bold">
                            <Truck className="w-3 h-3" />
                            <span>{t('shopeePhysical.voucherFreeship30k')}</span>
                          </span>
                        </div>
                      </div>

                      {/* Vận Chuyển */}
                      <div className="grid grid-cols-12 gap-2 items-start">
                        <span className="col-span-4 text-[11px] text-muted-foreground font-medium pt-0.5">
                          {t('shopeePhysical.shippingLabel')}
                        </span>
                        <div className="col-span-8 space-y-1 text-[11px]">
                          <div className="flex items-center gap-1.5 text-foreground font-semibold">
                            <Truck className="w-3.5 h-3.5 text-[#00bfa5] shrink-0" />
                            <span>{t('shopeePhysical.shippingEta')}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <MapPin className="w-3 h-3 shrink-0 text-slate-500 dark:text-slate-400" />
                            <span>{t('shopeePhysical.shippingFrom')}: <strong className="text-foreground">{physicalShipFrom}</strong> • {t('shopeePhysical.shippingCarrierList')}</span>
                          </div>
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            {t('shopeePhysical.shippingFreeNote')}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {t('shopeePhysical.shippingDelayVoucher')}
                          </p>
                        </div>
                      </div>

                      {/* An Tâm Mua Sắm */}
                      <div className="grid grid-cols-12 gap-2 items-start">
                        <span className="col-span-4 text-[11px] text-muted-foreground font-medium pt-0.5">
                          {t('shopeePhysical.guaranteeLabel')}
                        </span>
                        <div className="col-span-8 flex items-start gap-1.5 text-[11px] text-foreground">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#ee4d2d] shrink-0 mt-0.5" />
                          <span>{t('shopeePhysical.guaranteeSummary')}</span>
                        </div>
                      </div>

                      {/* Bộ Chọn Số Lượng Chuẩn Shopee */}
                      {!isSelectedEscalating && (
                        <div className="grid grid-cols-12 gap-2 items-center pt-1">
                          <span className="col-span-4 text-[11px] text-muted-foreground font-medium">
                            {t('shopeePhysical.quantityLabel')}
                          </span>
                          <div className="col-span-8 flex items-center gap-2.5 flex-wrap">
                            <div className="inline-flex items-center border border-border rounded-lg overflow-hidden bg-card">
                              <button
                                type="button"
                                disabled={quantity <= 1 || isOutOfStock}
                                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                                className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 cursor-pointer transition"
                                aria-label="-"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={quantity}
                                disabled={isOutOfStock}
                                onChange={(e) => {
                                  const parsed = parseInt(e.target.value.replace(/\D/g, ''), 10);
                                  if (!isNaN(parsed)) {
                                    setQuantity(Math.min(Math.max(1, parsed), Math.max(1, realStock)));
                                  }
                                }}
                                aria-label={t('shopeePhysical.quantityLabel')}
                                className="w-11 h-8 text-center text-xs font-bold font-mono bg-transparent text-foreground border-x border-border focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={isOutOfStock || quantity >= realStock}
                                onClick={() => setQuantity((q) => Math.min(Math.max(1, realStock), q + 1))}
                                className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 cursor-pointer transition"
                                aria-label="+"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {isOutOfStock ? t('shopeePhysical.outOfStock') : t('shopeePhysical.inStockAvailable')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Khối Thông Tin Chi Tiết Gói Đang Chọn & Nút Mua Ngay Chuẩn Shopee (Sticky) */}
                <div className="sticky top-0 z-20 bg-white dark:bg-slate-900 -mx-4 px-4 py-3 sm:-mx-5 sm:px-5 border-y border-slate-200 dark:border-slate-800 shadow-sm space-y-2.5 transition-all">
                  {/* Tiêu đề & Nút Xem thêm / Thu gọn */}
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-heading font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-[#ee4d2d]" aria-hidden="true" />
                      <span>{t('productDetailModal.packageDetails')}</span>
                    </h4>
                    {currentDescription && currentDescription.length > 80 && (
                      <button
                        type="button"
                        onClick={() => setIsDescExpanded(!isDescExpanded)}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/15 dark:hover:bg-orange-500/25 text-[#ee4d2d] border border-[#ee4d2d]/30 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all active:scale-95 shrink-0"
                        aria-label={isDescExpanded ? t('productDetailModal.collapseDesc') : t('productDetailModal.expandDesc')}
                      >
                        <span>{isDescExpanded ? (t('productDetailModal.collapseDesc')) : (t('common.viewMore'))}</span>
                        {isDescExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>

                  {/* Nội dung mô tả (Cuộn nội bộ khi mở rộng) */}
                  {currentDescription && (
                    <div
                      className={`text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line transition-all ${
                        isDescExpanded
                          ? 'max-h-[22vh] sm:max-h-[160px] overflow-y-auto pr-1 scrollbar-thin bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800'
                          : 'line-clamp-2'
                      }`}
                    >
                      {currentDescription}
                    </div>
                  )}

                  {/* Shopee Sticky CTA Row: Add to Cart (outlined #ee4d2d) + Buy Now (solid #ee4d2d) + Wishlist */}
                  <div className="pt-0.5 space-y-1.5">
                    {!currentUser ? (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          if (onOpenAuth) onOpenAuth();
                        }}
                        className="w-full min-h-[44px] h-[46px] py-2.5 px-4 rounded-lg bg-[#ee4d2d] hover:bg-[#d73211] text-white font-display font-bold text-xs sm:text-sm shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                      >
                        <LogIn className="w-4 h-4" aria-hidden="true" />
                        <span>
                          {offerData.campaign?.enabled
                            ? t('productDetailModal.loginForOffer', { price: formatPriceVal(totalPrice) })
                            : t('productDetailModal.loginToBuy', { price: formatPriceVal(totalPrice) })}
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isOutOfStock}
                          onClick={handleAddToCart}
                          className="flex-1 px-3 min-h-[44px] h-[46px] rounded-lg font-bold text-xs sm:text-sm border border-[#ee4d2d] bg-[#ee4d2d]/10 hover:bg-[#ee4d2d]/20 text-[#ee4d2d] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title={t('productDetailModal.addToCartTitle')}
                        >
                          <ShoppingCart className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">{isPhysicalProduct ? t('shopeePhysical.addToCart') : t('productDetailModal.addToCart')}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isOutOfStock}
                          onClick={() => {
                            if (isOutOfStock) {
                              if (onShowToast) onShowToast(t('productDetailModal.outOfStockToast'), t('productDetailModal.outOfStockToastDesc'), 'error');
                              return;
                            }
                            const finalSafeQty = isSelectedEscalating ? 1 : (realStock > 0 ? Math.min(Math.max(1, quantity), realStock) : 0);
                            if (finalSafeQty <= 0) {
                              if (onShowToast) onShowToast(t('productDetailModal.outOfStockToast'), t('productDetailModal.outOfStockToastDesc'), 'error');
                              return;
                            }
                            onBuyNow(
                              product,
                              {
                                ...selectedPackage,
                                stock_quantity: realStock,
                                price: displayCurrentPrice,
                                isFirstPurchaseOffer: isSelectedOfferEligible,
                                discountAmount: isSelectedEscalating ? 0 : (selectedOffer?.discount_amount || 0),
                                sale_mode: isSelectedEscalating ? 'escalating' : (selectedPackage.sale_mode || 'normal'),
                                escalating_base_price: selectedEscData.base_price,
                                escalating_step: selectedEscData.step,
                                escalating_max_price: selectedEscData.max_price,
                                escalating_current_price: selectedEscData.current_price,
                                escalating_completed_count: selectedEscData.completed_count,
                              },
                              finalSafeQty
                            );
                          }}
                          className={`flex-1 min-h-[44px] h-[46px] py-2.5 px-3 rounded-lg font-display font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer ${
                            !isOutOfStock
                              ? isSelectedEscalating
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-slate-950 font-black'
                                : 'bg-[#ee4d2d] hover:bg-[#d73211] text-white'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {isPhysicalProduct ? <Truck className="w-4 h-4 shrink-0" aria-hidden="true" /> : <Zap className={`w-4 h-4 shrink-0 ${isSelectedEscalating ? 'fill-slate-950 text-slate-950' : ''}`} aria-hidden="true" />}
                          <span className="truncate">
                            {!isOutOfStock
                              ? (isSelectedEscalating || isSelectedOfferEligible
                                  ? t('productDetailModal.buyNowOffer', { price: formatPriceVal(totalPrice) })
                                  : t('productDetailModal.buyNow', { price: formatPriceVal(totalPrice) }))
                              : (t('productDetailModal.outOfStock'))}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={handleToggleWishlist}
                          className={`px-3 min-h-[44px] h-[46px] rounded-lg font-bold border transition-all flex items-center justify-center cursor-pointer shrink-0 ${
                            isWishlisted
                              ? 'border-[#ee4d2d] bg-[#ee4d2d]/10 text-[#ee4d2d]'
                              : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-[#ee4d2d] hover:text-[#ee4d2d]'
                          }`}
                          title={isWishlisted ? t('wishlist.removeTooltip') : t('wishlist.addTooltip')}
                          aria-label={isWishlisted ? t('wishlist.removeTooltip') : t('wishlist.addTooltip')}
                        >
                          <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-[#ee4d2d] text-[#ee4d2d]' : ''}`} />
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-center text-slate-500 dark:text-slate-400 pt-0.5">
                      {(product as any).product_type === 'physical'
                        ? (t('productDetailModal.physicalDeliveryGuarantee'))
                        : (t('productDetailModal.digitalDeliveryGuarantee'))}
                    </p>
                  </div>
                </div>

                {/* Banner Gợi Ý Cho Khách Chưa Đăng Nhập */}
                {!currentUser && offerData.campaign?.enabled && Number(offerData.campaign?.offer_price) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenAuth) onOpenAuth();
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 hover:border-[#ee4d2d]/60 transition-all cursor-pointer flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300 font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-[#ee4d2d] animate-pulse shrink-0" aria-hidden="true" />
                      <span>{t('productDetailModal.loginPromptOffer', { price: formatCore(Number(offerData.campaign.offer_price)) })}</span>
                    </div>
                    <span className="text-[10px] text-[#ee4d2d] dark:text-amber-400 font-bold underline shrink-0">{t('productDetailModal.loginNow')}</span>
                  </button>
                )}

                {/* Banner Hướng Dẫn Xác Minh Email Cho Tài Khoản Đã Đăng Nhập */}
                {currentUser && offerData.campaign?.enabled && Number(offerData.campaign?.offer_price) > 0 && offerData.campaign?.require_verified_email && !currentUser.email_verified && (
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.location.hash = '#/account';
                      }
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/35 hover:border-amber-400 transition-all cursor-pointer flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-medium">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                      <span>{t('productDetailModal.verifyEmailNotice', { price: formatCore(Number(offerData.campaign.offer_price)) })}</span>
                    </div>
                    <span className="text-[10px] text-amber-800 dark:text-amber-400 font-bold underline shrink-0">{t('productDetailModal.verifyNow')}</span>
                  </button>
                )}

                {/* Danh Sách Chọn Gói (Chọn Gói) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-secondary" />
                      <span>{t('productDetailModal.selectProductPackage')}</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {packages.length === 1 ? t('productDetailModal.availablePackages_one') : t('productDetailModal.availablePackages', { count: packages.length })}
                    </span>
                  </div>

                  
                {/* KHỐI CHỌN THUỘC TÍNH ĐA NGÀNH (MÀU SẮC, KÍCH CỠ, DUNG TÍCH...) */}
                {(product as any).attributes && (product as any).attributes.length > 0 && (
                  <div className="space-y-3 pt-2 pb-2 border-b border-border/70">
                    <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-secondary" />
                      <span>{t('productDetailModal.selectAttributes')}</span>
                    </div>
                    {(product as any).attributes.map((attr: any) => {
                      const currentSelectedVal = (selectedPackage as any)?.attributes?.[attr.name] ||
                        (selectedPackage?.name && attr.values.find((v: string) => selectedPackage.name.includes(v)));

                      return (
                        <div key={attr.id || attr.name} className="space-y-1.5">
                          <div className="text-[11px] text-muted-foreground font-semibold flex items-center justify-between">
                            <span>{attr.name}:</span>
                            {currentSelectedVal && <span className="text-secondary font-bold">{currentSelectedVal}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {attr.values.map((val: string) => {
                              const isValSelected = currentSelectedVal === val;
                              return (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => {
                                    const matchedPkg = packages.find((p) => {
                                      if ((p as any).attributes && (p as any).attributes[attr.name] === val) return true;
                                      return p.name.includes(val);
                                    });
                                    if (matchedPkg) {
                                      setSelectedPackageId(matchedPkg.id);
                                    }
                                  }}
                                  className={`relative px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer overflow-hidden ${
                                    isValSelected
                                      ? 'bg-[#ee4d2d]/10 text-[#ee4d2d] border-[#ee4d2d] shadow-xs'
                                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:border-[#ee4d2d]/60'
                                  }`}
                                >
                                  <span>{val}</span>
                                  {isValSelected && (
                                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#ee4d2d] text-white flex items-center justify-center rounded-tl">
                                      <Check className="w-2.5 h-2.5 stroke-[3]" aria-hidden="true" />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                  <div className="space-y-2 sm:max-h-[300px] sm:overflow-y-auto pr-1 scrollbar-thin">
                    {packages.map((pkg) => {
                      const isSelected = pkg.id === selectedPackage.id;
                      const pkgStock = typeof pkg.stock_quantity === 'number' ? pkg.stock_quantity : product.stock_quantity;
                      const isPkgOut = pkgStock <= 0;

                      const pkgOffer = offerData.offers[pkg.id];
                      const isPkgEscalating = pkg.sale_mode === 'escalating' || Boolean(pkgOffer?.escalating?.is_escalating);
                      const rawPkgEsc = pkgOffer?.escalating;
                      const pkgEscBase = Number(rawPkgEsc?.base_price ?? rawPkgEsc?.escalating_base_price ?? pkg.escalating_base_price ?? pkg.price) || pkg.price;
                      const pkgEscStep = Number(rawPkgEsc?.step ?? rawPkgEsc?.escalating_step ?? pkg.escalating_step ?? 0) || 0;
                      const pkgEscCompleted = Number(rawPkgEsc?.completed_count ?? pkg.escalating_completed_count ?? 0) || 0;
                      const pkgEscMax = (rawPkgEsc?.max_price !== undefined && rawPkgEsc?.max_price !== null)
                        ? Number(rawPkgEsc.max_price)
                        : (pkg.escalating_max_price !== undefined && pkg.escalating_max_price !== null ? Number(pkg.escalating_max_price) : null);
                      const rawPkgCurrent = Number(rawPkgEsc?.current_price ?? rawPkgEsc?.current_calculated_price ?? pkg.escalating_current_price);
                      const pkgEscCurrent = (rawPkgCurrent > 0)
                        ? rawPkgCurrent
                        : (pkgEscMax !== null && pkgEscMax > 0 ? Math.min(pkgEscBase + (pkgEscCompleted * pkgEscStep), pkgEscMax) : (pkgEscBase + (pkgEscCompleted * pkgEscStep)));

                      const pkgEscData = {
                        is_escalating: isPkgEscalating,
                        base_price: pkgEscBase,
                        step: pkgEscStep,
                        max_price: pkgEscMax,
                        completed_count: pkgEscCompleted,
                        current_price: pkgEscCurrent,
                      };

                      const isPkgFpFlag = pkg.first_purchase_enabled === true ||
                        pkg.first_purchase_enabled === 1 ||
                        String(pkg.first_purchase_enabled) === '1' ||
                        String(pkg.first_purchase_enabled) === 'true';

                      const pkgMaxPrice = pkg.first_purchase_max_price
                        ? Number(pkg.first_purchase_max_price)
                        : (offerData?.campaign?.max_original_price ?? 30000);

                      const pkgCampaignOfferPrice = offerData?.campaign?.enabled
                        ? Number(offerData.campaign.offer_price || 0)
                        : 0;
                      const pkgCustomOfferPrice = pkg.first_purchase_price
                        ? Number(pkg.first_purchase_price)
                        : 0;
                      const pkgCandidateOfferPrice =
                        pkgOffer?.offer_price !== undefined && pkgOffer?.offer_price !== null
                          ? Number(pkgOffer.offer_price)
                          : (pkgCustomOfferPrice > 0 ? pkgCustomOfferPrice : pkgCampaignOfferPrice);

                      const defaultPkgEligible =
                        isPkgFpFlag &&
                        !isPkgEscalating &&
                        (pkgCustomOfferPrice > 0 || Boolean(offerData?.campaign?.enabled)) &&
                        pkg.price <= pkgMaxPrice;

                      const isPkgOfferEligible =
                        !isPkgEscalating &&
                        isPkgFpFlag &&
                        pkgCandidateOfferPrice > 0 &&
                        pkgCandidateOfferPrice < pkg.price &&
                        (pkgOffer !== undefined ? Boolean(pkgOffer.eligible) : defaultPkgEligible);
                      const isPkgOfferUnverified = !isPkgEscalating && isPkgFpFlag && !isPkgOfferEligible && pkgOffer?.reason === 'email_unverified';
                      const isPkgOfferLoginReq = !isPkgEscalating && isPkgFpFlag && !isPkgOfferEligible && pkgOffer?.reason === 'login_required';

                      const pkgRawOfferPrice = isPkgOfferEligible ? pkgCandidateOfferPrice : pkg.price;

                      const pkgDisplayPrice = isPkgEscalating
                        ? pkgEscData.current_price
                        : (isPkgOfferEligible ? pkgRawOfferPrice : pkg.price);
                      const pkgOriginalPrice = isPkgEscalating
                        ? pkgDisplayPrice
                        : (pkg.original_price || pkg.price);

                      return (
                        <div
                          key={pkg.id}
                          role="button"
                          tabIndex={isPkgOut ? -1 : 0}
                          aria-disabled={isPkgOut}
                          onClick={() => {
                            if (isPkgOut) return;
                            setSelectedPackageId(pkg.id);
                            setQuantity(1);
                            setIsDescExpanded(false);
                          }}
                          onKeyDown={(e) => {
                            if (isPkgOut) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedPackageId(pkg.id);
                              setQuantity(1);
                              setIsDescExpanded(false);
                            }
                          }}
                          className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 relative overflow-hidden ${
                            isPkgOut
                              ? 'opacity-55 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40'
                              : isSelected
                              ? 'border-[#ee4d2d] bg-[#ee4d2d]/8 dark:bg-[#ee4d2d]/15 shadow-sm ring-1 ring-[#ee4d2d]/50 cursor-pointer'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:bg-orange-50/40 dark:hover:bg-slate-800 hover:border-[#ee4d2d]/60 cursor-pointer'
                          }`}
                        >
                          {isSelected && !isPkgOut && (
                            <span className="absolute bottom-0 right-0 w-4 h-4 bg-[#ee4d2d] text-white flex items-center justify-center rounded-tl-md" aria-hidden="true">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-xs font-bold truncate ${isSelected ? 'text-[#ee4d2d] dark:text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                                {pkg.name}
                              </span>
                              {isPkgEscalating && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 shrink-0 flex items-center gap-1">
                                  <Zap className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                                  {t('productDetailModal.escalatingPrice', { step: formatCore(pkgEscData.step) })}
                                </span>
                              )}
                              {!isPkgEscalating && isPkgOfferEligible && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 shrink-0 flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5 text-rose-500" aria-hidden="true" />
                                  {t('productDetailModal.firstPurchaseOfferPrice', { price: formatCore(pkgRawOfferPrice) })}
                                </span>
                              )}
                              {!isPkgEscalating && isPkgOfferUnverified && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 shrink-0 flex items-center gap-1" title={t('productDetailModal.needEmailVerification')}>
                                  <Sparkles className="w-2.5 h-2.5 text-amber-500" aria-hidden="true" />
                                  {t('productDetailModal.firstPurchaseOfferPriceEmail', { price: formatCore(pkgRawOfferPrice) })}
                                </span>
                              )}
                              {!isPkgEscalating && isPkgOfferLoginReq && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 shrink-0 flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5 text-rose-500" aria-hidden="true" />
                                  {t('productDetailModal.firstPurchaseOfferPrice', { price: formatCore(pkgRawOfferPrice) })}
                                </span>
                              )}
                              {pkg.badge && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300/70 dark:border-amber-500/30 shrink-0 leading-none">
                                  {pkg.badge === 'Hàng Số' ? t('productDetailModal.digitalBadge') : pkg.badge === 'Hàng Vật Lý' ? t('productDetailModal.physicalBadge') : pkg.badge}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                                {isPkgEscalating
                                  ? t('productDetailModal.purchaseLadderTurn', { count: Number(pkgEscData.completed_count) + 1 })
                                  : (pkg.note || t('productDetailModal.standardProcessing'))}
                              </span>
                              {isSoldVisible && (pkg as any).show_sold_count !== false && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono shrink-0">
                                  • {t('productDetailModal.soldPrefix')}: <strong className="text-slate-800 dark:text-slate-100">{isPkgEscalating ? pkgEscData.completed_count : marketingService.getSoldDisplay({ ...pkg, created_at: product.created_at } as any)}</strong>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-800/60 w-full sm:w-auto">
                            <div className="flex items-baseline gap-2 sm:block sm:text-right">
                              <span className={`font-mono font-bold text-xs sm:text-sm block ${isPkgEscalating ? 'text-amber-700 dark:text-amber-400' : 'text-[#ee4d2d]'}`}>
                                {formatPriceVal(pkgDisplayPrice)}
                              </span>
                              {!isPkgEscalating && isPkgOfferEligible && pkgOriginalPrice > pkgDisplayPrice ? (
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 line-through font-mono block">
                                  {formatPriceVal(pkgOriginalPrice)}
                                </span>
                              ) : isPkgOut ? (
                                <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold block">{t('productDetailModal.outOfStockShort')}</span>
                              ) : (
                                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold block">{t('productDetailModal.inStockShort')}</span>
                              )}
                            </div>

                            {/* Nút chia sẻ riêng từng gói (icon dễ nhận, đặt cạnh giá) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPackageToShare(pkg);
                              }}
                              className="p-1.5 sm:p-2 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-orange-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-[#ee4d2d] border border-slate-200 dark:border-slate-700 hover:border-[#ee4d2d]/40 transition-all cursor-pointer active:scale-90 shrink-0 ml-auto sm:ml-0"
                              title={t('productDetailModal.sharePackage', { name: pkg.name })}
                              aria-label={t('productDetailModal.sharePackage', { name: pkg.name })}
                            >
                              <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Số lượng mua (chỉ hiển thị cho sản phẩm số để tránh trùng lặp với bộ chọn số lượng Shopee của hàng vật lý ở trên) */}
                {!isPhysicalProduct && !isOutOfStock && (
                  isSelectedEscalating ? (
                    <div className="pt-2 border-t border-border/70 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-foreground block">{t('productDetailModal.purchaseQuantity')}</span>
                        <span className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">{t('productDetailModal.fixedOnePerOrderNotice')}</span>
                      </div>
                      <span className="font-mono font-bold text-xs text-foreground px-3 py-1 bg-muted rounded-lg border border-border">
                        {t('productDetailModal.onePackage')}
                      </span>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-border/70 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-foreground block">{t('productDetailModal.purchaseQuantity')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDecreaseQty}
                          disabled={quantity <= 1 || realStock <= 0}
                          className="w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center disabled:opacity-40 cursor-pointer active:scale-95 transition-all"
                          aria-label={t('productDetailModal.decrease')}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={realStock <= 0 ? 0 : 1}
                          max={realStock}
                          value={realStock <= 0 ? 0 : Math.min(Math.max(1, quantity), realStock)}
                          disabled={realStock <= 0}
                          onChange={handleQtyInputChange}
                          className="w-14 h-8 text-center font-mono font-bold text-sm bg-muted/60 border border-border/80 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={handleIncreaseQty}
                          disabled={realStock <= 0 || quantity >= realStock}
                          className="w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center disabled:opacity-40 cursor-pointer active:scale-95 transition-all"
                          aria-label={t('productDetailModal.increase')}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                )}

                {/* Đánh Giá & Nhận Xét Sản Phẩm Thực Tế */}
                {product?.id && (
                  <ProductReviewsSection
                    productId={product.id}
                    currentUser={currentUser}
                    onOpenAuth={onOpenAuth}
                    onShowToast={onShowToast}
                  />
                )}

                {/* Nút Mua Ngay đã được chuyển hoàn toàn lên khối mô tả ghim cố định */}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Image Zoom Lightbox */}
        {isZoomed && (
          <div
            className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setIsZoomed(false)}
          >
            <button
              onClick={() => setIsZoomed(false)}
              className="absolute top-4 right-4 p-3 rounded-full bg-slate-800 text-white border border-slate-700 hover:bg-slate-700 cursor-pointer"
              aria-label={t('productDetailModal.closeZoom')}
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={images[activeImageIdx]}
              alt={product.title}
              className="max-w-full max-h-[90vh] object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Modal Chia Sẻ Từng Gói Riêng Biệt */}
        {packageToShare && (
          <PackageShareModal
            isOpen={Boolean(packageToShare)}
            onClose={() => setPackageToShare(null)}
            product={product}
            packageItem={packageToShare}
            onBuyNow={(pkg) => {
              setPackageToShare(null);
              setSelectedPackageId(pkg.id);
              onBuyNow(product, pkg, 1);
            }}
            onShowToast={onShowToast || (() => {})}
          />
        )}
      </div>
    </div>,
    document.body
  );
};
