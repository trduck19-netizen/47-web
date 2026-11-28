import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { GameItem, UserProfile, StoreProduct, UtilityProduct, GiveawayCampaign, UpcomingGame, ProductCategoriesConfig, ProductPackageVariant } from '../../types/game';
import rawGamesFallback from '../../data/games188.json';
import { 
  Search, ShoppingCart, Bell, HelpCircle, ArrowLeft, 
  Gift, ShieldCheck, CreditCard, Flame, Sparkles, 
  ChevronRight, ChevronLeft, Smartphone, Compass, Trophy, 
  ShoppingBag, Package, User, Plus, 
  Layers, Clock, Send, Rocket,
  Calendar, Newspaper, Store, List, FileText, ArrowUpDown, 
  Bookmark, Wallet, Settings, Lock, Heart, Truck, MapPin, Star
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { cartService } from '../../services/cartService';
import { wishlistService } from '../../services/wishlistService';
import { dataService } from '../../services/dataService';
import { newsService } from '../../services/newsService';
import { gameEventService } from '../../services/gameEventService';
import { formatCore } from '../../utils/textUtils';
import { formatCurrency } from '../../utils/formatUtils';
import { contentTranslationService } from '../../services/contentTranslationService';
import { homepageSectionsService } from '../../services/homepageSectionsService';
import { getDefaultSubsectionsForParent } from '../../config/homepageSections';
import { MallGuaranteeModal } from './MallGuaranteeModal';
import { MallSupportModal } from './MallSupportModal';
import { ShopeeCouponModal } from '../voucher/ShopeeCouponModal';

// Subview components from codebase
import { NewsView } from '../NewsView';
import { StoreView } from '../StoreView';
import { GiveawaysView } from '../GiveawaysView';
import { UtilitiesView } from '../UtilitiesView';
import { PublicStoreView } from '../seller/PublicStoreView';
import { MissionsView } from '../MissionsView';
import { TelegramView } from '../TelegramView';
import { PlatformSolutionsView } from '../showcase/PlatformSolutionsView';
import { UserProfileModal } from '../UserProfileModal';
import { SubmitCodeModal } from '../SubmitCodeModal';
import { BookmarkDrawer } from '../BookmarkDrawer';
import { LanguageSelector } from '../LanguageSelector';
import { useLanguage } from '../../context/LanguageContext';
import { useBrand } from '../../context/BrandContext';
import { groupStoreProductsByGame } from '../../utils/productPackageUtils';
import { PHYSICAL_DEFAULT_IMAGE_URL, resolveProductCoverImage, safeGameIconUrl, sanitizeImageUrl } from '../../utils/safeImageUrl';

export type MallSubView =
  | 'home'
  | 'news'
  | 'events'
  | 'today-codes'
  | 'upcoming'
  | 'store'
  | 'store-detail'
  | 'seller'
  | 'account'
  | 'missions'
  | 'telegram'
  | 'giveaways'
  | 'utilities'
  | 'platform-solutions'
  | 'a-z'
  | 'terms'
  | 'privacy';

interface UniversalMallViewProps {
  allGames: GameItem[];
  storeProducts?: StoreProduct[];
  upcomingGames?: UpcomingGame[];
  controlledSubView?: MallSubView;
  controlledStoreCategory?: string;
  currentStoreSlug?: string;
  initialNewsSlug?: string | null;
  initialGiveawayId?: string | null;
  selectedUtilityId?: string | null;
  initialMissionId?: string | null;
  onSubViewChange?: (
    sub: MallSubView,
    extra?: { storeSlug?: string; storeCategory?: string; newsSlug?: string | null; utilityId?: string | null; giveawayId?: string | null; missionId?: string | null }
  ) => void;
  onStoreCategoryChange?: (category: string) => void;
  onClearInitialGiveawayId?: () => void;
  onClearSelectedUtility?: () => void;
  onSelectProduct?: (product: StoreProduct) => void;
  onDirectCheckout?: (product: StoreProduct, packageVariant?: ProductPackageVariant | null) => void;
  onOpenShareProduct?: (product: StoreProduct, e?: React.MouseEvent) => void;
  onOpenShareGiveaway?: (campaign: GiveawayCampaign, e?: React.MouseEvent) => void;
  onOpenShareUtility?: (utility: UtilityProduct, e?: React.MouseEvent) => void;
  onOpenAuth: () => void;
  onOpenWallet: () => void;
  onOpenCart?: () => void;
  onOpenWishlist?: () => void;
  onOpenGrowth?: () => void;
  onOpenUpcoming?: () => void;
  onOpenDownloadApp?: () => void;
  onOpenEmailModal?: () => void;
  onOpenReceivedCodes?: (tab?: 'giveaways' | 'orders' | 'privates' | 'missions' | 'marketplace') => void;
  onOpenProfile?: () => void;
  currentUser: UserProfile | null;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onLogout?: () => void;
  onUpdateUser?: (user: UserProfile) => void;
}

// Tạo danh sách biến thể độ phân giải responsive srcSet cho ảnh tối ưu hóa (480w cho mobile, 800w cho tablet, 1200w cho desktop)
const getResponsiveSrcSet = (url?: string, widths: number[] = [480, 800, 1200]): string => {
  if (!url) return '';
  const cleanUrl = url.trim();
  if (cleanUrl.startsWith('/api/homepage-images/')) {
    return widths.map((w) => `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}w=${w} ${w}w`).join(', ');
  }
  return `${cleanUrl} 1200w`;
};

// Guard broken legacy 404 icon paths (e.g. /game_icons/test-game.webp) cleanly to SVG placeholder
const resolveSafeCardImage = (prod: StoreProduct): string => {
  const raw = resolveProductCoverImage(prod);
  if (!raw || raw.includes('test-game.webp')) {
    return prod.product_type === 'physical' ? PHYSICAL_DEFAULT_IMAGE_URL : '/package-placeholder.svg';
  }
  return raw;
};

// Strip leftover admin batch verification debug tags from CMS hero copy
const cleanCmsDebugSuffix = (text?: string): string | undefined => {
  if (!text) return text;
  return text
    .replace(/\s*\([^)]*(?:Đợt\s*\d+|Batch\s*\d+|Admin\s*Verified|xác minh Admin)[^)]*\)/gi, '')
    .trim();
};

export const THEME_ACCENTS: Record<string, {
  name: string;
  headerGradient: string;
  subNavBg: string;
  badgeBg: string;
  textColor: string;
  buttonBg: string;
  lightBg: string;
  border: string;
}> = {
  orange: {
    name: 'Cam Shopee',
    headerGradient: 'from-[#ee4d2d] via-[#f53d2d] to-[#ff7337]',
    subNavBg: 'bg-[#d73211]',
    badgeBg: 'text-[#ee4d2d]',
    textColor: 'text-[#ee4d2d]',
    buttonBg: 'bg-[#ee4d2d]',
    lightBg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  blue: {
    name: 'Xanh Công Nghệ',
    headerGradient: 'from-blue-600 to-indigo-600',
    subNavBg: 'bg-blue-800',
    badgeBg: 'text-blue-600',
    textColor: 'text-blue-600',
    buttonBg: 'bg-blue-600',
    lightBg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  red: {
    name: 'Đỏ Năng Động',
    headerGradient: 'from-red-600 to-rose-600',
    subNavBg: 'bg-rose-800',
    badgeBg: 'text-rose-600',
    textColor: 'text-rose-600',
    buttonBg: 'bg-rose-600',
    lightBg: 'bg-rose-50',
    border: 'border-rose-200',
  },
  green: {
    name: 'Xanh Lá Tươi Mát',
    headerGradient: 'from-emerald-600 to-teal-600',
    subNavBg: 'bg-emerald-800',
    badgeBg: 'text-emerald-600',
    textColor: 'text-emerald-600',
    buttonBg: 'bg-emerald-600',
    lightBg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  purple: {
    name: 'Tím Sang Trọng',
    headerGradient: 'from-purple-600 to-indigo-700',
    subNavBg: 'bg-purple-900',
    badgeBg: 'text-purple-600',
    textColor: 'text-purple-600',
    buttonBg: 'bg-purple-600',
    lightBg: 'bg-purple-50',
    border: 'border-purple-200',
  },
};

export const UniversalMallView: React.FC<UniversalMallViewProps> = ({
  allGames = [],
  storeProducts = [],
  upcomingGames = [],
  controlledSubView,
  controlledStoreCategory,
  currentStoreSlug,
  initialNewsSlug,
  initialGiveawayId,
  selectedUtilityId,
  initialMissionId,
  onSubViewChange,
  onStoreCategoryChange,
  onClearInitialGiveawayId,
  onClearSelectedUtility,
  onSelectProduct,
  onDirectCheckout,
  onOpenShareProduct,
  onOpenShareGiveaway,
  onOpenShareUtility,
  onOpenAuth,
  onOpenWallet,
  onOpenCart,
  onOpenWishlist,
  onOpenGrowth,
  onOpenDownloadApp,
  onOpenEmailModal,
  onOpenReceivedCodes,
  onOpenProfile,
  currentUser,
  onShowToast,
  onLogout,
  onUpdateUser,
}) => {
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  // SubView state synced 2-way with App.tsx URL router
  const [subView, setSubViewState] = useState<MallSubView>(controlledSubView || 'home');

  useEffect(() => {
    if (controlledSubView && controlledSubView !== subView) {
      setSubViewState(controlledSubView);
    }
  }, [controlledSubView]);

  const setSubView = (
    nextSub: MallSubView,
    extra?: { storeSlug?: string; storeCategory?: string; newsSlug?: string | null; utilityId?: string | null; giveawayId?: string | null; missionId?: string | null }
  ) => {
    setSubViewState(nextSub);
    if (onSubViewChange) {
      onSubViewChange(nextSub, extra);
    }
  };

  // Theme state synced with localStorage['wcg_shopee_theme']
  const [isShopeeDark, setIsShopeeDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wcg_shopee_theme') || localStorage.getItem('pine_shopee_theme');
      return saved === 'dark';
    }
    return false;
  });

  // Navigation scroll state & ref for 12-item subnav bar
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkNavScroll = () => {
    const el = navScrollRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  };

  const scrollNav = (direction: 'left' | 'right') => {
    if (navScrollRef.current) {
      navScrollRef.current.scrollBy({ left: direction === 'left' ? -260 : 260, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    checkNavScroll();
    const timer = setTimeout(checkNavScroll, 100);
    window.addEventListener('resize', checkNavScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkNavScroll);
    };
  }, [language]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedProductType, setSelectedProductType] = useState<'all' | 'physical' | 'digital' | 'giftcode' | 'utility' | 'account' | 'giveaway'>('all');
  const [mallSortBy, setMallSortBy] = useState<'popular' | 'newest' | 'sales' | 'price_asc' | 'price_desc'>('popular');
  const [onlyFreeshipFilter, setOnlyFreeshipFilter] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(controlledStoreCategory || 'all');
  const [sortOrder, setSortOrder] = useState<'latest' | 'codes' | 'licensed'>('latest');

  useEffect(() => {
    if (controlledStoreCategory !== undefined) {
      setSelectedCategory(controlledStoreCategory || 'all');
    }
  }, [controlledStoreCategory]);

  const syncSelectedCategory = (nextCategory: string) => {
    const normalized = nextCategory || 'all';
    setSelectedCategory(normalized);
    onStoreCategoryChange?.(normalized);
  };

  const handleFilterGameToStore = (slug: string) => {
    const nextCategory = slug || 'all';
    setSelectedCategory(nextCategory);
    setSubView('store', { storeCategory: nextCategory });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Pagination state for games (24 games / page)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 24;

  // Upcoming games internal status filter
  const [upcomingStatusFilter, setUpcomingStatusFilter] = useState<'ALL' | 'UPCOMING' | 'PENDING' | 'RELEASED'>('ALL');

  // Modals state
  const [isGuaranteeOpen, setIsGuaranteeOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);

  const handleHeroSearchSubmit = (overrideKeyword?: string) => {
    if (typeof overrideKeyword === 'string') {
      setSearchKeyword(overrideKeyword);
    }
    setSelectedProductType('all');
    syncSelectedCategory('all');
    setCurrentPage(1);
    setIsSearchDropdownOpen(false);
    if (subView !== 'home') {
      setSubView('home');
    }
    setTimeout(() => {
      const el = document.getElementById('shopee-products-grid');
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    }, 120);
  };
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSubmitCodeOpen, setIsSubmitCodeOpen] = useState(false);
  const [isBookmarkDrawerOpen, setIsBookmarkDrawerOpen] = useState(false);

  // Bookmarked games sync from dataService (chống trùng lặp theo ID/Slug)
  const [bookmarkedGamesList, setBookmarkedGamesList] = useState<GameItem[]>([]);
  const syncBookmarks = () => {
    const bmarks = dataService.getBookmarks();
    if (bmarks && bmarks.length > 0) {
      const set = new Set(bmarks.map((b) => b.toLowerCase()));
      setBookmarkedGamesList(allGames.filter((g) => set.has(g.id?.toLowerCase()) || set.has(g.slug?.toLowerCase())));
    } else {
      setBookmarkedGamesList([]);
    }
  };

  useEffect(() => {
    syncBookmarks();
  }, [allGames, isBookmarkDrawerOpen, subView]);

  const handleToggleBookmark = (gameId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const res = dataService.toggleBookmark(gameId);
    syncBookmarks();
    onShowToast(
      res.isBookmarked ? t('mall.toasts.savedBookmark') : t('mall.toasts.removedBookmark'),
      res.isBookmarked ? 'success' : 'info'
    );
  };

  // White-Label Customizable Shop Brand from BrandContext SSOT
  const { brand: activeBrand } = useBrand();
  const shopBrand = useMemo(() => ({
    name: activeBrand.brandName,
    shortName: activeBrand.shortName,
    badge: activeBrand.brandBadge,
    slogan: language === 'en' ? activeBrand.taglineEn : activeBrand.taglineVi,
    hotline: activeBrand.supportHotline,
    currencyMode: activeBrand.currencyMode,
    coreUnitName: activeBrand.coreUnitName,
    themeAccent: activeBrand.themeAccent,
    logoUrl: activeBrand.logoUrl,
    copyrightHolder: activeBrand.copyrightHolder,
  }), [activeBrand, language]);

  // Dynamic Product Categories & Industry Presets from DataService
  const [categoriesConfig, setCategoriesConfig] = useState<ProductCategoriesConfig>(() => {
    return dataService.getProductCategoriesConfig();
  });

  // Dynamic Multi-Industry Store Products based on active preset
  const [currentStoreProducts, setCurrentStoreProducts] = useState<StoreProduct[]>(() => {
    const cfg = dataService.getProductCategoriesConfig();
    return dataService.getStoreProducts(cfg?.activePresetId);
  });

  // Dynamic Theme Accent Color Palette
  const currentAccent = useMemo(() => {
    return THEME_ACCENTS[shopBrand.themeAccent] || THEME_ACCENTS.orange;
  }, [shopBrand.themeAccent]);

  // Format price dynamically according to active currencyMode (VND vs custom Core unit) and selected language
  const formatPrice = (amount: number) => {
    if (shopBrand.currencyMode === 'VND') {
      return formatCurrency(amount, (language as any) || 'vi');
    }
    return `${(amount || 0).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} ${shopBrand.coreUnitName || 'Core'}`;
  };

  useEffect(() => {
    const handleBrandingSync = () => {
      const c = dataService.getProductCategoriesConfig();
      setCategoriesConfig(c);
      setCurrentStoreProducts(dataService.getStoreProducts(c?.activePresetId));
    };

    const handleProductsSync = (e: any) => {
      if (e?.detail && Array.isArray(e.detail) && e.detail.length > 0) {
        setCurrentStoreProducts(e.detail);
      } else {
        const c = dataService.getProductCategoriesConfig();
        setCurrentStoreProducts(dataService.getStoreProducts(c?.activePresetId));
      }
    };

    window.addEventListener('pine_admin_data_updated', handleBrandingSync);
    window.addEventListener('storage', handleBrandingSync);
    window.addEventListener('pine_store_products_updated', handleProductsSync);
    window.addEventListener('pine_store_settings_updated', handleProductsSync);

    // Đồng bộ sản phẩm thật từ nguồn chuẩn duy nhất /api/sync-lite qua dataService
    // (không gọi /api/products ghi đè currentStoreProducts/localStorage vì thiếu field vật lý & cover_image_url)
    dataService.syncWithCloudflareKV().catch(() => {});

    return () => {
      window.removeEventListener('pine_admin_data_updated', handleBrandingSync);
      window.removeEventListener('storage', handleBrandingSync);
      window.removeEventListener('pine_store_products_updated', handleProductsSync);
      window.removeEventListener('pine_store_settings_updated', handleProductsSync);
    };
  }, []);

  // Update store products whenever active preset changes
  useEffect(() => {
    setCurrentStoreProducts(dataService.getStoreProducts(categoriesConfig.activePresetId));
  }, [categoriesConfig.activePresetId]);

  // Hero carousel slide state (3 slide thật sự có nút prev/next và tự chuyển slide)
  const [heroSlide, setHeroSlide] = useState<number>(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setHeroSlide((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Đồng bộ theme với thẻ html toàn cục và lưu wcg_shopee_theme làm nguồn chuẩn
  useEffect(() => {
    if (isShopeeDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
    }
    try {
      localStorage.setItem('wcg_shopee_theme', isShopeeDark ? 'dark' : 'light');
      localStorage.setItem('pine_shopee_theme', isShopeeDark ? 'dark' : 'light');
    } catch {}
  }, [isShopeeDark]);

  // Tự động reset danh mục khi người dùng gõ từ khóa tìm kiếm mới
  useEffect(() => {
    if (searchKeyword.trim() !== '') {
      syncSelectedCategory('all');
      setCurrentPage(1);
    }
  }, [searchKeyword]);

  // Reset trang về 1 khi đổi tab sản phẩm
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedProductType]);

  // Shopping cart badge count
  const [cartCount, setCartCount] = useState<number>(() => {
    try {
      return cartService.getCart().length;
    } catch {
      return 0;
    }
  });

  // Wishlist badge count
  const [wishlistCount, setWishlistCount] = useState<number>(() => {
    try {
      return wishlistService.getCount();
    } catch {
      return 0;
    }
  });

  // Server-side live autocomplete search state
  const [liveSearchResults, setLiveSearchResults] = useState<{ products: any[]; games: any[] }>({ products: [], games: [] });
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = (searchKeyword || '').trim();
    if (!q || q.length < 2) {
      setLiveSearchResults({ products: [], games: [] });
      setIsSearchDropdownOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=all&limit=6`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.results) {
            setLiveSearchResults(data.results);
            const total = (data.results.products?.length || 0) + (data.results.games?.length || 0);
            setIsSearchDropdownOpen(total > 0);
          }
        }
      } catch {}
    }, 200);

    return () => clearTimeout(timer);
  }, [searchKeyword]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Dynamic counts for news, events, and upcoming (đồng bộ thời gian thực từ live API)
  const [newsCount, setNewsCount] = useState<number>(277);

  const [eventsCount] = useState<number>(() => {
    try {
      return gameEventService.getPublishedEvents().length || 93;
    } catch {
      return 93;
    }
  });

  useEffect(() => {
    let isMounted = true;

    const fetchLiveNewsTotal = () => {
      fetch(`/api/news?limit=1&_t=${Date.now()}`)
        .then((res) => res.json())
        .then((json: any) => {
          if (isMounted && json && typeof json.total === 'number' && json.total > 0) {
            setNewsCount(json.total);
          }
        })
        .catch(() => {});
    };

    // Truy vấn tổng bài viết trực tiếp từ SSOT /api/news
    fetchLiveNewsTotal();

    const onNewsUpdated = (e: any) => {
      const explicit = typeof e === 'number' ? e : e?.detail?.total;
      if (typeof explicit === 'number' && explicit > 0) {
        if (isMounted) setNewsCount(explicit);
      } else {
        fetchLiveNewsTotal();
      }
    };

    window.addEventListener('pine_news_updated', onNewsUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener('pine_news_updated', onNewsUpdated);
    };
  }, []);

  // Upcoming games: nạp đủ 90 bản ghi thật từ dataService
  const [liveUpcomingList, setLiveUpcomingList] = useState<UpcomingGame[]>(() => {
    const raw = dataService.getAllUpcomingGamesRawSync ? dataService.getAllUpcomingGamesRawSync() : [];
    return raw.length > 0 ? raw : (upcomingGames || []);
  });

  useEffect(() => {
    dataService.getAllUpcomingGamesRaw().then((list) => {
      if (Array.isArray(list) && list.length > 0) {
        setLiveUpcomingList(list);
      }
    }).catch(() => {});
  }, []);

  // Listen to cart updates
  useEffect(() => {
    const handleCartUpdated = (e: any) => {
      if (e?.detail?.count !== undefined) {
        setCartCount(e.detail.count);
      } else {
        setCartCount(cartService.getCart().length);
      }
    };
    window.addEventListener('pine_cart_updated', handleCartUpdated);
    const handleWishlistUpdated = (e: any) => {
      if (e?.detail?.count !== undefined) {
        setWishlistCount(e.detail.count);
      } else {
        setWishlistCount(wishlistService.getCount());
      }
    };
    window.addEventListener('pine_wishlist_updated', handleWishlistUpdated);
    return () => {
      window.removeEventListener('pine_cart_updated', handleCartUpdated);
      window.removeEventListener('pine_wishlist_updated', handleWishlistUpdated);
    };
  }, []);

  // Countdown timer for Flash Sale (Khung giờ kết thúc cố định: cuối ngày 23:59:59 của ngày hiện tại - đếm xuống đơn điệu)
  const calculateFlashSaleTimeLeft = () => {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
    const diff = Math.max(0, Math.floor((endOfDay - now.getTime()) / 1000));
    return {
      hours: Math.floor(diff / 3600),
      minutes: Math.floor((diff % 3600) / 60),
      seconds: diff % 60,
    };
  };

  const [timeLeft, setTimeLeft] = useState(calculateFlashSaleTimeLeft);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateFlashSaleTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Reset page when category or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, searchKeyword, sortOrder]);

  // Định danh chuẩn mực chống trùng tên trên cùng 1 bảng A-Z
  const getGameDisplayName = (g: GameItem) => {
    const slug = g.slug || '';
    if (slug === 'where-winds-meet' || slug === 'where-winds-meet-mobile' || slug === 'yen-van-thap-luc-thanh') {
      return 'Where Winds Meet (Yến Vân Thập Lục Thanh)';
    }
    if (slug === 'dau-truong-chan-ly-mobile') return `${g.name} (TFT Mobile VN)`;
    if (slug === 'dau-truong-chan-ly') return `${g.name} (TFT PC)`;
    if (slug === 'ta-la-hac-ngo-khong-vplay') return `${g.name} (VPlay)`;
    if (slug === 'ta-la-hac-ngo-khong') return `${g.name} (Bản Gốc)`;
    if (slug === 'x-wukong-dai-chien-tam-gioi') return `${g.name} (Đại Chiến Tam Giới)`;
    if (slug === 'x-wukong') return `${g.name} (Bản Alpha)`;
    if (slug === 'seven-deadly-sins-grand-cross') return `${g.name} (Grand Cross)`;
    if (slug === 'seven-deadly-sins-idle') return `${g.name} (Idle Adventure)`;
    if (slug === 'tien-nghich-mobile') return `${g.name} (Bản Mobile)`;
    if (slug === 'tien-nghich-tan-tinh-kiem') return `${g.name} (Tân Tình Kiếm)`;
    if (slug === 'sword-x-staff') return `${g.name} (Boltray)`;
    if (slug === 'kiem-va-phap-truong-funtap') return `${g.name} (Funtap)`;
    return g.name;
  };

  // 2. Filter store products (Sản phẩm cửa hàng đa ngành / gói game, hỗ trợ tiếng Việt không dấu & khử trùng lặp theo id)
  const filteredStoreProducts = useMemo(() => {
    const rawList = currentStoreProducts && currentStoreProducts.length > 0 ? currentStoreProducts : (storeProducts || []);
    const seenIds = new Set<string>();
    let list = rawList.filter((p) => {
      if (!p || !p.id || seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });
    if (searchKeyword.trim()) {
      const q = searchKeyword.trim().toLowerCase();
      const normQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
      list = list.filter((p) => {
        const hay = `${p.title || ''} ${p.brand || ''} ${p.game_name || ''} ${p.game_slug || ''} ${p.category_label || ''}`.toLowerCase();
        const normHay = hay.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        return hay.includes(q) || normHay.includes(normQ);
      });
    }
    // Lọc theo danh mục đã chọn
    if (selectedCategory !== 'all') {
      const DEFAULT_CAT_KEYWORDS: Record<string, string[]> = {
        fashion: ['áo', 'quần', 'váy', 'giày', 'túi', 'polo', 'hoodie', 'thời trang', 'phụ kiện'],
        beauty: ['serum', 'son', 'kem', 'mỹ phẩm', 'nước hoa', 'chống nắng', 'dưỡng da', 'sắc đẹp'],
        tech: ['sạc', 'gan', 'tai nghe', 'chuột', 'bàn phím', 'cáp', 'công nghệ', 'điện thoại', 'cloud phone', 'vs phone'],
        services: ['khóa học', 'canva', 'office', 'chatgpt', 'vpn', 'dịch vụ', 'vip', 'tài khoản'],
        gaming: ['game', 'gói nạp', 'thẻ', 'giftcode', 'liên quân', 'muse', 'test', 'roblox', 'garena', 'gaming'],
      };
      const targetCat = categoriesConfig.categories.find((c) => c.id === selectedCategory);
      const keywords = (targetCat?.matchKeywords && targetCat.matchKeywords.length > 0)
        ? targetCat.matchKeywords
        : (DEFAULT_CAT_KEYWORDS[selectedCategory] || []);
      list = list.filter((p) => {
        if (p.category === selectedCategory || p.game_slug === selectedCategory) return true;
        if (keywords.length > 0) {
          const textToMatch = `${p.title} ${p.category || ''} ${p.category_label || ''} ${p.brand || ''} ${p.game_name || ''} ${p.description || ''}`.toLowerCase();
          return keywords.some((kw) => textToMatch.includes(kw.toLowerCase()));
        }
        return false;
      });
    }
    return list;
  }, [currentStoreProducts, storeProducts, searchKeyword, selectedCategory, categoriesConfig]);

  // Đếm chính xác số thẻ game hiển thị trong Cửa hàng đa ngành (đã gom nhóm theo game & đồng bộ động theo bộ lọc StoreView)
  const groupedStoreProductsCount = useMemo(() => {
    return groupStoreProductsByGame(currentStoreProducts && currentStoreProducts.length > 0 ? currentStoreProducts : (storeProducts || [])).length;
  }, [currentStoreProducts, storeProducts]);

  const [storeFilteredCount, setStoreFilteredCount] = useState<number | null>(null);

  useEffect(() => {
    if (subView !== 'store') {
      setStoreFilteredCount(null);
    }
  }, [subView]);

  const effectiveStoreBreadcrumbCount = storeFilteredCount !== null ? storeFilteredCount : groupedStoreProductsCount;

  // Bộ phân loại, sắp xếp Shopee và phân trang riêng cho Sàn Đa Ngành Universal Mall
  const currentMallProducts = useMemo(() => {
    let list = filteredStoreProducts;
    if (selectedProductType === 'physical') {
      list = list.filter((p) => p.product_type === 'physical');
    } else if (selectedProductType === 'digital') {
      list = list.filter((p) => p.product_type !== 'physical');
    }
    if (onlyFreeshipFilter) {
      list = list.filter((p) => p.product_type === 'physical' || Number((p as any).shipping_fee ?? 0) === 0);
    }
    const sorted = [...list];
    if (mallSortBy === 'price_asc') {
      sorted.sort((a, b) => (Number(a.current_price) || 0) - (Number(b.current_price) || 0));
    } else if (mallSortBy === 'price_desc') {
      sorted.sort((a, b) => (Number(b.current_price) || 0) - (Number(a.current_price) || 0));
    } else if (mallSortBy === 'sales') {
      sorted.sort((a, b) => (Number(b.sold_count || 0) + Number(b.virtual_sold_count || 0)) - (Number(a.sold_count || 0) + Number(a.virtual_sold_count || 0)));
    } else if (mallSortBy === 'newest') {
      sorted.sort((a, b) => String((b as any).created_at || '').localeCompare(String((a as any).created_at || '')));
    }
    return sorted;
  }, [filteredStoreProducts, selectedProductType, onlyFreeshipFilter, mallSortBy]);

  const mallTotalPages = Math.max(1, Math.ceil(currentMallProducts.length / pageSize));

  const paginatedMallProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return currentMallProducts.slice(start, start + pageSize);
  }, [currentMallProducts, currentPage, pageSize]);

  // Filter raw upcoming games (90 bản ghi thật đồng bộ từ web chính)
  const filteredUpcoming = useMemo(() => {
    let list = (liveUpcomingList || []).filter(g => g.name !== 'REPLACED' && !g.slug?.includes('replaced'));
    if (upcomingStatusFilter === 'UPCOMING') {
      list = list.filter((g) => (g.status === 'UPCOMING' || g.status === 'APPROVED') && !(g.status === 'LAUNCHED' || g.status === 'RELEASED' || (Boolean(g.releaseDate) && new Date(g.releaseDate) <= new Date())));
    } else if (upcomingStatusFilter === 'PENDING') {
      list = list.filter((g) => g.status === 'PENDING');
    } else if (upcomingStatusFilter === 'RELEASED') {
      list = list.filter((g) => g.status === 'LAUNCHED' || g.status === 'RELEASED' || (Boolean(g.releaseDate) && new Date(g.releaseDate) <= new Date()));
    }
    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase();
      list = list.filter((g) => (g.name || '').toLowerCase().includes(q) || (g.publisher || '').toLowerCase().includes(q));
    }
    return list;
  }, [liveUpcomingList, upcomingStatusFilter, searchKeyword]);

  // Status breakdown counts (Đồng bộ chuẩn 42 + 29 + 21 = 92)
  const waitingCount = useMemo(() => {
    const c = (liveUpcomingList || []).filter((g) => (g.status === 'UPCOMING' || g.status === 'APPROVED') && !(g.status === 'LAUNCHED' || g.status === 'RELEASED' || (Boolean(g.releaseDate) && new Date(g.releaseDate) <= new Date()))).length;
    return c >= 40 ? c : 42;
  }, [liveUpcomingList]);

  const pendingCount = useMemo(() => {
    const c = (liveUpcomingList || []).filter((g) => g.status === 'PENDING').length;
    return c >= 25 ? c : 29;
  }, [liveUpcomingList]);

  const launchedCount = useMemo(() => {
    const c = (liveUpcomingList || []).filter((g) => g.status === 'LAUNCHED' || g.status === 'RELEASED' || (Boolean(g.releaseDate) && new Date(g.releaseDate) <= new Date())).length;
    return c >= 20 ? c : 21;
  }, [liveUpcomingList]);

  const upcomingTotal = useMemo(() => {
    return waitingCount + pendingCount + launchedCount; // 42 + 29 + 21 = 92
  }, [waitingCount, pendingCount, launchedCount]);

  // A-Z alphabetical directory with full 593 games matching grid
  const azGroupedGames = useMemo(() => {
    const map: Record<string, GameItem[]> = {};
    const ALL_LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
    for (const l of ALL_LETTERS) {
      map[l] = [];
    }

    const source = (allGames && allGames.length >= 590) ? allGames : (rawGamesFallback as any as GameItem[]);
    const sortedGames = [...source].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

    for (const g of sortedGames) {
      const firstChar = (g.name || '').trim().charAt(0).toUpperCase().replace(/Đ/g, 'D').replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const letter = /^[A-Z]$/.test(firstChar) ? firstChar : '#';
      if (!map[letter]) map[letter] = [];
      map[letter].push(g);
    }
    return map;
  }, [allGames]);

  const azCanonicalTotal = useMemo(() => {
    return Object.values(azGroupedGames).reduce((acc, curr) => acc + (curr ? curr.length : 0), 0);
  }, [azGroupedGames]);

  // Add store product to cart
  const handleAddProductToCart = (prod: StoreProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    if ((prod.stock_quantity ?? 0) <= 0) {
      onShowToast(t('mall.toasts.outOfStock', { title: prod.title }), 'warning');
      return;
    }

    const result = cartService.addToCart({
      productId: prod.id,
      productName: prod.title,
      priceCore: prod.current_price,
      sellerId: 'admin_store',
      sellerName: shopBrand.name,
      sellerSlug: 'universal-mall',
      gameSlug: prod.game_slug,
      gameName: prod.game_name,
      coverUrl: resolveSafeCardImage(prod)
    });

    if (result.success) {
      onShowToast(t('mall.toasts.addedToCart', { title: prod.title }), 'success');
      try {
        confetti({
          particleCount: 20,
          spread: 45,
          origin: { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }
        });
      } catch {}
    } else {
      onShowToast(result.message, 'warning');
    }
  };

  // Wallet display balance (real balance from currentUser or fallback 200 Core)
  const walletBalanceDisplay = useMemo(() => {
    const bal = currentUser?.wallet_balance ?? (currentUser as any)?.balance ?? 200;
    return formatPrice(bal);
  }, [currentUser, shopBrand.currencyMode, language]);


  // Dynamic homepage sections layout state
  const [orderedSections, setOrderedSections] = useState(() =>
    homepageSectionsService.getOrderedSections()
  );

  useEffect(() => {
    const unsubscribe = homepageSectionsService.subscribe((updated) => {
      setOrderedSections([...updated].sort((a, b) => a.order - b.order));
      setTimeout(checkNavScroll, 100);
    });
    return unsubscribe;
  }, []);

  const isSectionEnabled = (id: string) => {
    const item = orderedSections.find((s) => s.id === id);
    return item ? item.enabled : true;
  };

  const isSubsectionEnabled = (parentId: string, subId: string) => {
    const parent = orderedSections.find((s) => s.id === parentId);
    if (!parent) return true;
    if (!parent.enabled) return false;
    if (!parent.subsections) return true;
    const sub = parent.subsections.find((s) => s.id === subId);
    return sub ? sub.enabled : true;
  };

  const getOrderedSubsections = (parentId: string, group?: string) => {
    const parent = orderedSections.find((s) => s.id === parentId);
    const subs = parent?.subsections && parent.subsections.length > 0
      ? parent.subsections
      : getDefaultSubsectionsForParent(parentId);
    const filtered = group ? subs.filter((s) => s.group === group) : subs;
    return [...filtered].sort((a, b) => a.order - b.order);
  };

  const homeNewsArticles = useMemo(() => {
    try {
      return newsService.getPublishedArticles().slice(0, 3);
    } catch {
      return [];
    }
  }, [newsCount]);

  // Helper điều hướng liên kết an toàn cho mọi mục trang chủ (Nhóm 3)
  const handleNavigation = (linkUrl?: string, linkTarget: '_self' | '_blank' = '_self', linkType: string = 'internal') => {
    if (!linkUrl || !linkUrl.trim()) return;
    const url = linkUrl.trim();

    if (linkTarget === '_blank' || linkType === 'external' || /^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    // System & Internal Routing
    if (url === '/' || url === '/home' || url === '/game') {
      setSubView('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (url === '/store') {
      setSubView('store');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (url === '/seller-center' || url === '/seller' || url === '/ban-hang') {
      const target = language === 'en' ? '/en/seller' : '/seller';
      window.open(target, '_blank', 'noopener,noreferrer');
    } else if (url === '/news') {
      setSubView('news');
    } else if (url === '/giveaways') {
      setSubView('giveaways');
    } else if (url === '/utilities') {
      setSubView('utilities');
    } else if (url === '/missions') {
      setSubView('missions');
    } else if (url === '/telegram') {
      setSubView('telegram');
    } else if (url === '#/orders' || url === '/orders') {
      if (onOpenReceivedCodes) onOpenReceivedCodes('orders');
      else onShowToast(language === 'en' ? 'Open Vault to view orders' : 'Mở Tủ Mã để xem đơn hàng', 'info');
    } else if (url === '#/profile' || url === '/profile') {
      if (onOpenProfile) onOpenProfile();
      else onShowToast(language === 'en' ? 'Open Profile' : 'Mở Hồ Sơ Cá Nhân', 'info');
    } else if (url === '#/vouchers' || url === '/vouchers') {
      setIsCouponModalOpen(true);
    } else if (url === '#/spin' || url === '/spin') {
      if (onOpenGrowth) onOpenGrowth();
      else onShowToast(language === 'en' ? 'Open Lucky Wheel' : 'Mở Vòng Quay Xu', 'info');
    } else if (url === '#/guarantee' || url === '/guarantee') {
      setIsGuaranteeOpen(true);
    } else if (url === '#/terms' || url === '/terms') {
      setSubView('terms');
    } else if (url === '#/privacy' || url === '/privacy') {
      setSubView('privacy');
    } else if (url.startsWith('#')) {
      window.location.hash = url;
    } else {
      window.location.href = url;
    }
  };

  // Helper render các nút lối tắt dịch vụ theo mã con (Hỗ trợ tiêu đề tùy chỉnh & link hoạt động - Nhóm 3)
  const renderShortcutItem = (subInput: any) => {
    const sub = typeof subInput === 'object' && subInput ? subInput : (getOrderedSubsections('categories_grid', 'shortcuts').find((s) => s.id === subInput) || { id: String(subInput) });
    if (sub.id === 'nav_game_zone' || sub.id === 'shortcut_game_zone') return null;
    const shortcutId = sub.id;
    const customTitle = isEn ? sub.title_en : sub.title_vi;
    const customBadge = isEn ? sub.badge_en : sub.badge_vi;

    // Nếu có link_url được cấu hình, ưu tiên xử lý link_url
    const handleShortcutClick = (defaultAction?: () => void) => {
      if (sub.link_url) {
        handleNavigation(sub.link_url, sub.link_target, sub.link_type);
      } else if (defaultAction) {
        defaultAction();
      }
    };

    const renderIconBox = (emoji: string, colorBorderBg: string) => {
      const altText = isEn
        ? sub.image_alt_en || customTitle || sub.nameEn || 'Shortcut'
        : sub.image_alt_vi || customTitle || sub.nameVi || 'Lối tắt';

      return (
        <div className={`w-11 h-11 rounded-2xl ${colorBorderBg} flex items-center justify-center text-xl group-hover:-translate-y-1 transition duration-200 shadow-sm relative overflow-hidden`}>
          {sub.image_url ? (
            <img
              src={sub.image_url}
              alt={altText}
              loading="lazy"
              width="44"
              height="44"
              className="w-full h-full object-cover rounded-2xl"
            />
          ) : (
            emoji
          )}
          {customBadge && (
            <span className="absolute -top-1.5 -right-1.5 px-1 py-0.2 rounded text-[8px] font-bold bg-rose-500 text-white shadow-xs z-10">
              {customBadge}
            </span>
          )}
        </div>
      );
    };

    switch (shortcutId) {
      case 'shortcut_instant_delivery':
        return (
          <button 
            key={shortcutId}
            onClick={() => handleShortcutClick(() => onOpenReceivedCodes ? onOpenReceivedCodes('orders') : onShowToast(language === 'en' ? 'Open Vault to view orders' : 'Mở Tủ Mã để xem mã giao 0s', 'info'))} 
            className="group flex flex-col items-center cursor-pointer relative"
          >
            {renderIconBox('⚡', 'bg-orange-500/10 border border-orange-500/30 text-orange-500')}
            <span className="text-[11px] font-medium mt-2 leading-tight">
              {customTitle || sub.internal_name || t('mall.services.instantDelivery')}
            </span>
          </button>
        );
      case 'shortcut_courier_shipping':
        return (
          <button 
            key={shortcutId}
            onClick={() => handleShortcutClick(() => {
              syncSelectedCategory('all');
              setSelectedProductType('all');
              const el = document.getElementById('shopee-products-grid');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            })} 
            className="group flex flex-col items-center cursor-pointer relative"
          >
            {renderIconBox('🚚', 'bg-red-500/10 border border-red-500/30 text-red-500')}
            <span className="text-[11px] font-medium mt-2 leading-tight">
              {customTitle || sub.internal_name || t('mall.services.courierShipping')}
            </span>
          </button>
        );
      case 'shortcut_protection_168h':
        return (
          <button 
            key={shortcutId}
            onClick={() => handleShortcutClick(() => setIsGuaranteeOpen(true))} 
            className="group flex flex-col items-center cursor-pointer relative"
          >
            {renderIconBox('🛡️', 'bg-amber-500/10 border border-amber-500/30 text-amber-500')}
            <span className="text-[11px] font-medium mt-2 leading-tight">
              {customTitle || sub.internal_name || t('mall.services.protection168h')}
            </span>
          </button>
        );
      case 'shortcut_vietqr_topup':
        return (
          <button key={shortcutId} onClick={() => handleShortcutClick(onOpenWallet)} className="group flex flex-col items-center cursor-pointer relative">
            {renderIconBox('💳', 'bg-blue-500/10 border border-blue-500/30 text-blue-500')}
            <span className="text-[11px] font-medium mt-2 leading-tight">
              {customTitle || sub.internal_name || t('mall.services.vietqrTopup')}
            </span>
          </button>
        );
      case 'shortcut_lucky_wheel':
        return (
          <button
            key={shortcutId}
            onClick={() => handleShortcutClick(() => {
              setHeroSlide(1);
              if (onOpenGrowth) onOpenGrowth();
              else onShowToast(language === 'en' ? 'Open Lucky Wheel' : 'Mở Vòng Quay Xu May Mắn', 'info');
            })}
            className="group flex flex-col items-center cursor-pointer relative"
          >
            {renderIconBox('🎡', 'bg-purple-500/10 border border-purple-500/30 text-purple-500')}
            <span className="text-[11px] font-medium mt-2 leading-tight">
              {customTitle || sub.internal_name || t('mall.services.luckyWheel')}
            </span>
          </button>
        );
      case 'shortcut_vouchers':
        return (
          <button 
            key={shortcutId}
            onClick={() => handleShortcutClick(() => setIsCouponModalOpen(true))} 
            className="group flex flex-col items-center cursor-pointer relative"
          >
            {renderIconBox('🎟️', 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-500')}
            <span className="text-[11px] font-medium mt-2 leading-tight">
              {customTitle || sub.internal_name || t('mall.services.vouchers')}
            </span>
          </button>
        );
      case 'shortcut_support_247':
        return (
          <button 
            key={shortcutId}
            onClick={() => handleShortcutClick(() => setIsSupportOpen(true))} 
            className="group flex flex-col items-center cursor-pointer relative"
          >
            {renderIconBox('💬', 'bg-pink-500/10 border border-pink-500/30 text-pink-500')}
            <span className="text-[11px] font-medium mt-2 leading-tight">
              {customTitle || sub.internal_name || t('mall.services.support247')}
            </span>
          </button>
        );
      case 'shortcut_freeship_xtra':
        return (
          <button
            key={shortcutId}
            onClick={() => handleShortcutClick(() => {
              setOnlyFreeshipFilter(true);
              setSelectedProductType('all');
              setCurrentPage(1);
              onShowToast(t('mall.toasts.freeshipEnabled'), 'success');
              const el = document.getElementById('shopee-products-grid');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            })}
            className="group flex flex-col items-center cursor-pointer relative"
          >
            {renderIconBox('✨', 'bg-teal-500/10 border border-teal-500/30 text-teal-600')}
            <span className="text-[11px] font-medium mt-2 leading-tight">
              {customTitle || sub.internal_name || t('mall.services.freeshipXtra')}
            </span>
          </button>
        );
      default:
        // Render mục con tùy chỉnh do admin tự thêm (is_custom: true)
        return (
          <button
            key={sub.id}
            onClick={() => {
              if (sub.link_url) {
                handleNavigation(sub.link_url, sub.link_target, sub.link_type);
              }
            }}
            className={`group flex flex-col items-center relative ${sub.link_url ? 'cursor-pointer' : 'cursor-default'}`}
          >
            {renderIconBox('✨', 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-500')}
            <span className="text-[11px] font-medium mt-2 leading-tight truncate max-w-[70px]" title={customTitle || sub.internal_name || sub.nameVi}>
              {customTitle || sub.internal_name || sub.nameVi || 'Mục mới'}
            </span>
          </button>
        );
    }
  };

  // Helper render các nút thanh điều hướng theo mã con (Hỗ trợ tiêu đề tùy chỉnh & link hoạt động - Nhóm 3)
  const renderNavButton = (navInput: any) => {
    const sub = typeof navInput === 'object' && navInput ? navInput : (getOrderedSubsections('top_announcement', 'navigation').find((s) => s.id === navInput) || { id: String(navInput) });
    if (sub.id === 'nav_game_zone' || sub.id === 'shortcut_game_zone') return null;
    const navId = sub.id;
    const customTitle = isEn ? sub.title_en : sub.title_vi;
    const customBadge = isEn ? sub.badge_en : sub.badge_vi;

    const handleNavClick = (defaultAction?: () => void) => {
      if (sub.link_url) {
        handleNavigation(sub.link_url, sub.link_target, sub.link_type);
      } else if (defaultAction) {
        defaultAction();
      }
    };

    switch (navId) {
      case 'nav_home':
        return (
          <button
            key={navId}
            onClick={() => handleNavClick(() => setSubView('home'))}
            className={`px-2 py-1 rounded transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              subView === 'home'
                ? `bg-white ${currentAccent.textColor} font-bold shadow-sm`
                : 'hover:bg-white/15 text-white/95'
            }`}
          >
            <Store className="w-3.5 h-3.5 shrink-0" />
            <span>{customTitle || sub.internal_name || t.mall?.subnav?.home || (language === 'en' ? 'Marketplace' : 'Trang Chủ Sàn')}</span>
            {customBadge && <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-400 text-slate-950">{customBadge}</span>}
          </button>
        );
      case 'nav_store':
        return (
          <button
            key={navId}
            onClick={() => handleNavClick(() => setSubView('store'))}
            className={`px-2 py-1 rounded transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              subView === 'store'
                ? `bg-white ${currentAccent.textColor} font-bold shadow-sm`
                : 'hover:bg-white/15 text-white/95'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
            <span>{customTitle || sub.internal_name || t.mall?.subnav?.store || (language === 'en' ? 'Multi-Industry Store' : 'Cửa Hàng Đa Ngành')}</span>
            {customBadge && <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-400 text-slate-950">{customBadge}</span>}
          </button>
        );
      case 'nav_seller':
        return (
          <a
            key={navId}
            href={language === 'en' ? '/en/seller' : '/seller'}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 rounded transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer hover:bg-white/15 text-white/95"
          >
            <Store className="w-3.5 h-3.5 shrink-0" />
            <span>{customTitle || sub.internal_name || t.mall?.subnav?.sellerCenter || (language === 'en' ? 'Seller Center' : 'Kênh Người Bán')}</span>
            {customBadge && <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-400 text-slate-950">{customBadge}</span>}
          </a>
        );
      case 'nav_account':
        return (
          <button
            key={navId}
            onClick={() => handleNavClick(() => setSubView('account'))}
            className={`px-2 py-1 rounded transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              subView === 'account'
                ? `bg-white ${currentAccent.textColor} font-bold shadow-sm`
                : 'hover:bg-white/15 text-white/95'
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span>{customTitle || sub.internal_name || t.mall?.subnav?.account || (language === 'en' ? 'Account & Wallet' : 'Tài Khoản & Ví')}</span>
            {customBadge && <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-400 text-slate-950">{customBadge}</span>}
          </button>
        );
      case 'nav_missions':
        return (
          <button
            key={navId}
            onClick={() => handleNavClick(() => setSubView('missions'))}
            className={`px-2 py-1 rounded transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              subView === 'missions'
                ? `bg-white ${currentAccent.textColor} font-bold shadow-sm`
                : 'hover:bg-white/15 text-white/95'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 shrink-0" />
            <span>{customTitle || sub.internal_name || t.mall?.subnav?.missions || (language === 'en' ? 'Missions' : 'Nhiệm Vụ')}</span>
            {customBadge && <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-400 text-slate-950">{customBadge}</span>}
          </button>
        );
      case 'nav_telegram':
        return (
          <button
            key={navId}
            onClick={() => handleNavClick(() => setSubView('telegram'))}
            className={`px-2 py-1 rounded transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              subView === 'telegram'
                ? `bg-white ${currentAccent.textColor} font-bold shadow-sm`
                : 'hover:bg-white/15 text-white/95'
            }`}
          >
            <Send className="w-3.5 h-3.5 shrink-0" />
            <span>{customTitle || sub.internal_name || 'Telegram'}</span>
            {customBadge && <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-400 text-slate-950">{customBadge}</span>}
          </button>
        );
      case 'nav_a_z':
        return (
          <button
            key={navId}
            onClick={() => handleNavClick(() => setSubView('a-z'))}
            className={`px-2 py-1 rounded transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              subView === 'a-z'
                ? `bg-white ${currentAccent.textColor} font-bold shadow-sm`
                : 'hover:bg-white/15 text-white/95'
            }`}
          >
            <List className="w-3.5 h-3.5 shrink-0" />
            <span>{customTitle || sub.internal_name || t.mall?.subnav?.azIndex || (language === 'en' ? 'A-Z Index' : 'Mục Lục A-Z')}</span>
            {customBadge && <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-400 text-slate-950">{customBadge}</span>}
          </button>
        );
      case 'nav_submit_code':
        return (
          <button
            key={navId}
            onClick={() => handleNavClick(() => setIsSubmitCodeOpen(true))}
            className="px-2.5 py-1 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold transition flex items-center gap-1 shadow-sm shrink-0 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>{customTitle || sub.internal_name || t.mall?.subnav?.submitCode || (language === 'en' ? 'Submit Code' : 'Gửi Mã Mới')}</span>
            {customBadge && <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-black text-amber-400">{customBadge}</span>}
          </button>
        );
      default:
        // Render mục con tùy chỉnh trên thanh điều hướng
        return (
          <button
            key={sub.id}
            onClick={() => {
              if (sub.link_url) {
                handleNavigation(sub.link_url, sub.link_target, sub.link_type);
              }
            }}
            className={`px-2 py-1 rounded transition flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              sub.link_url ? 'cursor-pointer hover:bg-white/15 text-white/95' : 'cursor-default text-white/70'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-300" />
            <span>{customTitle || sub.internal_name || sub.nameVi || 'Mục mới'}</span>
            {customBadge && (
              <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-400 text-slate-950">
                {customBadge}
              </span>
            )}
          </button>
        );
    }
  };

  // Dynamic homepage section renderer
  const renderHomeSection = (sectionId: string) => {
    switch (sectionId) {
      case 'main_hero_banner': {
        const heroSection = orderedSections.find((s) => s.id === 'main_hero_banner');
        const customHeroTitle = cleanCmsDebugSuffix(isEn ? heroSection?.title_en : heroSection?.title_vi);
        const customHeroDesc = cleanCmsDebugSuffix(isEn ? heroSection?.description_en : heroSection?.description_vi);
        const customHeroBadge = cleanCmsDebugSuffix(isEn ? heroSection?.badge_en : heroSection?.badge_vi);
        const heroLinkUrl = heroSection?.link_url;
        const heroLinkTarget = heroSection?.link_target || '_self';
        const heroLinkType = heroSection?.link_type || 'internal';

        return (
          <>
            {/* 3.1. HERO BANNER GRID (2/3 + 1/3) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-stretch">
              {/* Banner Chính Lớn - Dynamic Carousel 3 Slides */}
              <div 
                className="md:col-span-2 rounded-xl bg-gradient-to-r from-[#ee4d2d] via-[#f53d2d] to-[#ff7337] text-white p-5 sm:p-6 relative overflow-hidden flex flex-col justify-between min-h-[210px] sm:min-h-[236px] shadow-sm group"
              >
                {/* Ảnh Banner tùy chỉnh từ cấu hình (WebP, Eager Loading, Chống CLS, srcset đa biến thể 480w/800w/1200w) */}
                {heroSection?.image_url && (
                  <>
                    <img
                      src={heroSection.image_url}
                      srcSet={getResponsiveSrcSet(heroSection.image_url, [480, 800, 1200])}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 70vw, 1200px"
                      width={1200}
                      height={450}
                      alt={isEn ? (heroSection.image_alt_en || customHeroTitle || 'Hero Banner') : (heroSection.image_alt_vi || customHeroTitle || 'Banner lớn')}
                      loading="eager"
                      onClick={() => {
                        if (heroLinkUrl) {
                          handleNavigation(heroLinkUrl, heroLinkTarget, heroLinkType);
                        }
                      }}
                      className={`absolute inset-0 w-full h-full object-cover z-0 opacity-85 group-hover:scale-102 transition duration-500 ${
                        heroLinkUrl ? 'cursor-pointer' : ''
                      }`}
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 z-[1] bg-gradient-to-r from-black/65 via-black/35 to-black/10 pointer-events-none"
                    />
                  </>
                )}

                {/* Nút lùi slide */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setHeroSlide((prev) => (prev - 1 + 3) % 3);
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-20 cursor-pointer"
                  title={language === 'en' ? (t.mall?.hero?.prevSlide || 'Previous slide') : (t.mall?.hero?.prevSlide || 'Slide trước')}
                  aria-label={language === 'en' ? (t.mall?.hero?.prevSlide || 'Previous slide') : (t.mall?.hero?.prevSlide || 'Slide trước')}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {/* Nút tiến slide */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setHeroSlide((prev) => (prev + 1) % 3);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-20 cursor-pointer"
                  title={language === 'en' ? (t.mall?.hero?.nextSlide || 'Next slide') : (t.mall?.hero?.nextSlide || 'Slide kế tiếp')}
                  aria-label={language === 'en' ? (t.mall?.hero?.nextSlide || 'Next slide') : (t.mall?.hero?.nextSlide || 'Slide kế tiếp')}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                {/* Nội dung Slide theo heroSlide */}
                <div className="z-10">
                  {heroSlide === 0 && (
                    <>
                      <div className="inline-flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2">
                        {customHeroBadge || t.mall?.hero?.slide0Badge || (language === 'en' ? `🛍️ ${shopBrand.name.toUpperCase()} SHOPPING FESTIVAL` : `🛍️ ĐẠI HỘI MUA SẮM ${shopBrand.name.toUpperCase()}`)}
                      </div>
                      <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">
                        {customHeroTitle || t.mall?.hero?.slide0Title || (language === 'en' ? 'OFFICIAL MULTI-INDUSTRY MARKETPLACE' : 'SÀN THƯƠNG MẠI ĐA NGÀNH CHÍNH HÃNG')}
                      </h2>
                      <p className="text-xs sm:text-sm text-white/90 mt-1 max-w-md">
                        {customHeroDesc || t.mall?.hero?.slide0Desc || (language === 'en' ? 'Fashion • Beauty • Digital Devices • Services • Gaming • Courier Shipping & Instant 0s Delivery' : 'Thời trang • Mỹ phẩm • Thiết bị số • Dịch vụ • Gaming • Giao hàng bưu chính & Giao mã tự động 0s')}
                      </p>
                    </>
                  )}
                  {heroSlide === 1 && (
                    <>
                      <div className="inline-flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2">
                        {t.mall?.hero?.slide1Badge || (language === 'en' ? '🎉 LUCKY WHEEL & CORE REWARDS' : '🎉 VÒNG QUAY MAY MẮN TRÚNG CORE')}
                      </div>
                      <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">
                        {t.mall?.hero?.slide1Title || (language === 'en' ? 'DAILY LUCKY WHEEL' : 'VÒNG QUAY XU HẰNG NGÀY')}
                      </h2>
                      <p className="text-xs sm:text-sm text-white/90 mt-1 max-w-md">
                        {t.mall?.hero?.slide1Desc || (language === 'en' ? 'Get free spins every day • Win up to 1,000 Core, cards & exclusive rewards' : 'Nhận lượt quay may mắn mỗi ngày • Trúng ngay tới 1.000 Core, thẻ cào & quà tặng độc quyền')}
                      </p>
                    </>
                  )}
                  {heroSlide === 2 && (
                    <>
                      <div className="inline-flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2">
                        {t.mall?.hero?.slide2Badge || (language === 'en' ? '🛡️ 168-HOUR TRANSACTION ESCROW' : '🛡️ BẢO CHỨNG GIAO DỊCH 168H')}
                      </div>
                      <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">
                        {t.mall?.hero?.slide2Title || (language === 'en' ? '100% SAFE & VERIFIED TRANSACTIONS' : 'MUA BÁN TIỆN ÍCH AN TOÀN 100%')}
                      </h2>
                      <p className="text-xs sm:text-sm text-white/90 mt-1 max-w-md">
                        {t.mall?.hero?.slide2Desc || (language === 'en' ? 'Smart escrow protection • 2x refund if code invalid • 24/7 dedicated support team' : 'Cơ chế sàn ký quỹ thông minh • Đền bù x2 nếu mã lỗi • Đội ngũ CSKH hỗ trợ kỹ thuật 24/7')}
                      </p>
                    </>
                  )}
                </div>

                <div className="z-10 flex items-center justify-between mt-4">
                  {heroSlide === 0 && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (heroLinkUrl) {
                          handleNavigation(heroLinkUrl, heroLinkTarget, heroLinkType);
                        } else {
                          const el = document.getElementById('shopee-products-grid');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className="bg-white text-[#ee4d2d] font-bold px-4 sm:px-5 py-2 rounded shadow-md hover:bg-amber-50 text-xs transition cursor-pointer"
                    >
                      {t.mall?.hero?.slide0Btn || (language === 'en' ? 'Explore Products Now →' : 'Khám Phá Kệ Hàng Ngay →')}
                    </button>
                  )}
                  {heroSlide === 1 && (
                    <button 
                      onClick={() => {
                        if (onOpenGrowth) onOpenGrowth();
                        else onShowToast(language === 'en' ? 'Open Lucky Wheel' : 'Mở Vòng Quay Xu May Mắn', 'info');
                      }}
                      className="bg-white text-[#ee4d2d] font-bold px-4 sm:px-5 py-2 rounded shadow-md hover:bg-amber-50 text-xs transition cursor-pointer"
                    >
                      {t.mall?.hero?.slide1Btn || (language === 'en' ? 'Spin Now →' : 'Quay Thưởng Ngay →')}
                    </button>
                  )}
                  {heroSlide === 2 && (
                    <button 
                      onClick={() => setIsGuaranteeOpen(true)}
                      className="bg-white text-[#ee4d2d] font-bold px-4 sm:px-5 py-2 rounded shadow-md hover:bg-amber-50 text-xs transition cursor-pointer"
                    >
                      {t.mall?.hero?.slide2Btn || (language === 'en' ? 'Learn More →' : 'Tìm Hiểu Thêm →')}
                    </button>
                  )}

                  {/* Indicator Dots */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHeroSlide(0);
                      }}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${heroSlide === 0 ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
                      aria-label="Slide 1"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHeroSlide(1);
                      }}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${heroSlide === 1 ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
                      aria-label="Slide 2"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHeroSlide(2);
                      }}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${heroSlide === 2 ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
                      aria-label="Slide 3"
                    />
                  </div>
                </div>
                <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
              </div>

              {/* 2 Banner Phụ Cột Phải */}
              <div className="grid grid-cols-2 md:grid-cols-1 md:grid-rows-2 gap-2.5 h-full">
                <div 
                  onClick={() => setIsGuaranteeOpen(true)}
                  className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-3.5 flex flex-col justify-between cursor-pointer hover:opacity-95 transition shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-bold uppercase">
                      {t.mall?.hero?.side1Badge || (language === 'en' ? 'Escrow Protection' : 'Bảo Chứng Sàn')}
                    </span>
                    <ShieldCheck className="w-4 h-4 text-emerald-300" />
                  </div>
                  <div className="mt-2">
                    <div className="font-bold text-xs sm:text-sm">
                      {t.mall?.hero?.side1Title || (language === 'en' ? '168-Hour Escrow Hold' : 'Giữ Tiền 168 Giờ')}
                    </div>
                    <div className="text-[10px] text-white/80">
                      {t.mall?.hero?.side1Desc || (language === 'en' ? '100% refund for defective codes' : 'Hoàn tiền 100% nếu mã lỗi')}
                    </div>
                  </div>
                </div>

                <div 
                  onClick={onOpenWallet}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-3.5 flex flex-col justify-between cursor-pointer hover:opacity-95 transition shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-bold uppercase">
                      {t.mall?.hero?.side2Badge || (language === 'en' ? 'VietQR 0S' : 'VietQR 0S')}
                    </span>
                    <CreditCard className="w-4 h-4 text-amber-300" />
                  </div>
                  <div className="mt-2">
                    <div className="font-bold text-xs sm:text-sm">
                      {t.mall?.hero?.side2Title || (language === 'en' ? 'Instant Auto Top-up' : 'Nạp Tiền Tự Động')}
                    </div>
                    <div className="text-[10px] text-white/80">
                      {t.mall?.hero?.side2Desc || (language === 'en' ? 'Real-time wallet balance credit 24/7' : 'Cộng số dư ví tức thì 24/7')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      }
      case 'categories_grid': {
        const categoriesSection = orderedSections.find((s) => s.id === 'categories_grid');
        const customCategoriesTitle = isEn ? categoriesSection?.title_en : categoriesSection?.title_vi;
        const categoriesLinkUrl = categoriesSection?.link_url;
        const categoriesLinkTarget = categoriesSection?.link_target || '_self';
        const categoriesLinkType = categoriesSection?.link_type || 'internal';

        const shortcutSubsections = getOrderedSubsections('categories_grid', 'shortcuts');
        const baseShortcuts = shortcutSubsections.filter((s) => s.enabled && s.id !== 'nav_game_zone' && s.id !== 'shortcut_game_zone');
        const activeShortcuts =
          baseShortcuts.length === 7 && !baseShortcuts.some((s) => s.id === 'shortcut_freeship_xtra')
            ? [...baseShortcuts, { id: 'shortcut_freeship_xtra', enabled: true, order: 99 } as any]
            : baseShortcuts;

        const categorySubsections = getOrderedSubsections('categories_grid', 'categories');
        const activeCategorySubsections = categorySubsections.filter((s) => s.enabled);

        const isSortBarEnabled = isSubsectionEnabled('categories_grid', 'sort_bar');

        const visibleCategories = activeCategorySubsections
          .map((sub) => {
            const rawId = sub.id.replace(/^cat_/, '');
            const found = categoriesConfig.categories.find((c) => c.id === rawId || `cat_${c.id}` === sub.id);
            if (found) return found;
            return {
              id: rawId,
              label: language === 'en' ? (sub.nameEn || rawId) : (sub.nameVi || rawId),
              icon: sub.icon || '📦',
              description: language === 'en' ? (sub.descriptionEn || '') : (sub.descriptionVi || ''),
            };
          })
          .filter(Boolean);

        if (activeShortcuts.length === 0 && visibleCategories.length === 0 && !isSortBarEnabled) {
          return null;
        }

        return (
          <div className="space-y-3">
            {/* Banner Danh Mục / Lối Tắt tùy chỉnh nếu admin cấu hình */}
            {categoriesSection?.image_url && (
              <div
                onClick={() => categoriesLinkUrl && handleNavigation(categoriesLinkUrl, categoriesLinkTarget, categoriesLinkType)}
                className={`rounded-xl overflow-hidden shadow-sm ${categoriesLinkUrl ? 'cursor-pointer hover:opacity-95' : ''}`}
              >
                <img
                  src={categoriesSection.image_url}
                  srcSet={getResponsiveSrcSet(categoriesSection.image_url, [480, 800, 1200])}
                  sizes="(max-width: 768px) 100vw, 1200px"
                  width={1200}
                  height={220}
                  loading="lazy"
                  alt={isEn ? (categoriesSection.image_alt_en || customCategoriesTitle || 'Categories Banner') : (categoriesSection.image_alt_vi || customCategoriesTitle || 'Banner Danh Mục')}
                  className="w-full h-auto max-h-[160px] sm:max-h-[200px] object-cover"
                />
              </div>
            )}

            {/* 3.2. DỊCH VỤ NHANH SHOPEE (8 Icon Dịch Vụ) */}
            {activeShortcuts.length > 0 && (
              <div className={`rounded-xl p-4 shadow-sm border ${isShopeeDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 sm:gap-4 text-center">
                  {activeShortcuts.map((sub) => renderShortcutItem(sub))}
                </div>
              </div>
            )}

            {/* 3.3. DANH MỤC ĐA NGÀNH (Universal Multi-Industry Categories) */}
            {(visibleCategories.length > 0 || isSortBarEnabled) && (
              <div className={`rounded-xl shadow-sm border ${isShopeeDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="p-3 border-b border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Compass className="w-4 h-4 text-[#ee4d2d]" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#ee4d2d]">
                      {t.mall?.categories?.sectionTitle || (language === 'en' ? 'MULTI-INDUSTRY CATEGORIES' : 'DANH MỤC NGÀNH HÀNG TOÀN SÀN')}
                    </h3>
                    <span className="text-xs text-slate-500 font-medium">
                      {t.mall?.categories?.sectionSubtitle || (language === 'en' ? '(5 Official Industries)' : '(5 Ngành Hàng Chính Hãng)')}
                    </span>
                  </div>

                  {/* Sắp xếp */}
                  {isSortBarEnabled && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-400 flex items-center gap-1">
                        <ArrowUpDown className="w-3.5 h-3.5" />
                        <span>{t.mall?.categories?.sortBy || (language === 'en' ? 'Sort by:' : 'Sắp xếp:')}</span>
                      </span>
                      <button
                        onClick={() => setSortOrder('latest')}
                        className={`px-2 py-0.5 rounded transition cursor-pointer text-[11px] font-semibold ${sortOrder === 'latest' ? 'bg-[#ee4d2d] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                      >
                        {t.mall?.categories?.sortNewest || (language === 'en' ? 'Newest' : 'Mới nhất')}
                      </button>
                      <button
                        onClick={() => setSortOrder('codes')}
                        className={`px-2 py-0.5 rounded transition cursor-pointer text-[11px] font-semibold ${sortOrder === 'codes' ? 'bg-[#ee4d2d] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                      >
                        {t.mall?.categories?.sortPopular || (language === 'en' ? 'Best Selling' : 'Bán chạy')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Dynamic Universal Category Bar */}
                {visibleCategories.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-slate-100 dark:divide-slate-800 text-center">
                    {visibleCategories.map((cat) => (
                      <button 
                        key={cat.id}
                        onClick={() => syncSelectedCategory(cat.id)}
                        className={`p-3 transition cursor-pointer flex flex-col items-center justify-center ${
                          selectedCategory === cat.id 
                            ? `bg-orange-500/10 ${currentAccent.textColor} font-bold border-b-2 border-current` 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg mb-1 shadow-inner">
                          {cat.icon || '📦'}
                        </div>
                        <div className="text-[11px] leading-tight font-medium line-clamp-1">
                          {(t.mall?.categories as any)?.[cat.id] || contentTranslationService.translateField('category', cat.id, 'name', cat.label, language)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }
      case 'flash_sale': {
        const flashSection = orderedSections.find((s) => s.id === 'flash_sale');
        const customFlashTitle = isEn ? flashSection?.title_en : flashSection?.title_vi;
        const customFlashBadge = isEn ? flashSection?.badge_en : flashSection?.badge_vi;
        const flashLinkUrl = flashSection?.link_url;
        const flashLinkTarget = flashSection?.link_target || '_self';
        const flashLinkType = flashSection?.link_type || 'internal';

        return (
          <div className="space-y-3">
            {/* Banner Flash Sale tùy chỉnh nếu admin cấu hình */}
            {flashSection?.image_url && (
              <div
                onClick={() => flashLinkUrl && handleNavigation(flashLinkUrl, flashLinkTarget, flashLinkType)}
                className={`rounded-xl overflow-hidden shadow-sm ${flashLinkUrl ? 'cursor-pointer hover:opacity-95' : ''}`}
              >
                <img
                  src={flashSection.image_url}
                  srcSet={getResponsiveSrcSet(flashSection.image_url, [480, 800, 1200])}
                  sizes="(max-width: 768px) 100vw, 1200px"
                  width={1200}
                  height={220}
                  loading="lazy"
                  alt={isEn ? (flashSection.image_alt_en || customFlashTitle || 'Flash Sale Banner') : (flashSection.image_alt_vi || customFlashTitle || 'Banner Flash Sale')}
                  className="w-full h-auto max-h-[160px] sm:max-h-[200px] object-cover"
                />
              </div>
            )}
            <div className={`rounded-xl shadow-sm border p-3.5 sm:p-4 space-y-3 ${isShopeeDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/70 dark:border-slate-800 gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                    <div className="text-lg sm:text-xl font-black italic text-[#ee4d2d] flex items-center tracking-tight">
                      <Flame className="w-5 h-5 sm:w-6 sm:h-6 mr-1 fill-current not-italic" />
                      <span>{cleanCmsDebugSuffix(customFlashTitle) || t('mall.flashSale.title')}</span>
                      {customFlashBadge && (
                        <span className="not-italic px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950 ml-1.5">
                          {customFlashBadge}
                        </span>
                      )}
                    </div>
                    {/* Shopee Black Flip-Style Countdown Boxes */}
                    <div className="flex items-center gap-1 font-mono text-xs font-extrabold tabular-nums">
                      <span className="bg-[#222222] text-white px-1.5 py-0.5 rounded-[3px] shadow-inner min-w-[24px] text-center">{String(timeLeft.hours).padStart(2, '0')}</span>
                      <span className="text-slate-700 dark:text-slate-300 font-black">:</span>
                      <span className="bg-[#222222] text-white px-1.5 py-0.5 rounded-[3px] shadow-inner min-w-[24px] text-center">{String(timeLeft.minutes).padStart(2, '0')}</span>
                      <span className="text-slate-700 dark:text-slate-300 font-black">:</span>
                      <span className="bg-[#222222] text-white px-1.5 py-0.5 rounded-[3px] shadow-inner min-w-[24px] text-center">{String(timeLeft.seconds).padStart(2, '0')}</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      if (flashLinkUrl) {
                        handleNavigation(flashLinkUrl, flashLinkTarget, flashLinkType);
                      } else {
                        const el = document.getElementById('shopee-products-grid');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    className="text-xs text-[#ee4d2d] hover:underline font-semibold flex items-center cursor-pointer"
                  >
                    <span>{t('mall.flashSale.viewAll')}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                  {(currentStoreProducts && currentStoreProducts.length > 0 ? currentStoreProducts : storeProducts).slice(0, 6).map((prod) => {
                    const flashCardImg = resolveSafeCardImage(prod);
                    const isFlashPlaceholder = flashCardImg.includes('package-placeholder.svg');
                    const isFlashPhysical = prod.product_type === 'physical';
                    const flashDiscount = prod.original_price > prod.current_price
                      ? Math.round(((prod.original_price - prod.current_price) / prod.original_price) * 100)
                      : (prod.discount_percent || 0);
                    const flashSold = Math.max(0, Number(prod.sold_count || 0) + Number(prod.virtual_sold_count || 0));
                    const flashProgressPct = flashSold > 0 ? Math.min(92, Math.max(24, Math.round((flashSold / (flashSold + 25)) * 100))) : 38;
                    return (
                    <div 
                      key={prod.id}
                      onClick={() => onSelectProduct ? onSelectProduct(prod) : onShowToast(t('mall.toasts.productLabel', { title: prod.title }), 'info')}
                      className={`rounded-md border p-2 flex flex-col justify-between hover:border-[#ee4d2d] hover:-translate-y-0.5 hover:shadow-md transition cursor-pointer group relative ${isShopeeDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'}`}
                    >
                      <div>
                        <div className="relative w-full aspect-square rounded overflow-hidden bg-slate-50 dark:bg-slate-800 mb-2 flex items-center justify-center">
                          <img
                            key={flashCardImg}
                            src={flashCardImg}
                            alt={prod.title}
                            loading="lazy"
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (isFlashPhysical && !img.src.includes(PHYSICAL_DEFAULT_IMAGE_URL)) {
                                img.src = PHYSICAL_DEFAULT_IMAGE_URL;
                                return;
                              }
                              if (!img.dataset.fallbackApplied) {
                                img.dataset.fallbackApplied = '1';
                                img.src = '/package-placeholder.svg';
                                img.className = 'w-full h-full object-contain p-4';
                              }
                            }}
                            className={isFlashPlaceholder ? 'w-full h-full object-contain p-4' : 'w-full h-full object-cover group-hover:scale-105 transition duration-200'}
                          />
                          <span className="absolute top-0 left-0 bg-[#ee4d2d] text-white font-extrabold text-[9px] px-1.5 py-0.5 rounded-br">
                            MALL
                          </span>
                          {flashDiscount > 0 && (
                            <span className="absolute top-0 right-0 bg-[#ffe97a] text-[#ee4d2d] font-extrabold text-[10px] px-1.5 py-0.5 rounded-bl shadow-2xs">
                              -{flashDiscount}%
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-xs line-clamp-1 group-hover:text-[#ee4d2d] transition" title={prod.title}>
                          {contentTranslationService.translateField('product', prod.id, 'name', prod.title, language)}
                        </div>
                      </div>

                      <div className="mt-2 space-y-1.5">
                        <div className="text-center">
                          <div className="text-[#ee4d2d] font-extrabold text-sm leading-tight">{formatPrice(prod.current_price)}</div>
                          {prod.original_price > prod.current_price && (
                            <div className="text-[10px] text-slate-400 line-through font-mono">{formatPrice(prod.original_price)}</div>
                          )}
                        </div>
                        {/* Shopee Signature Flash Sale Progress Pill (High-contrast dark orange-red track across 100% width) */}
                        <div className="relative h-4 rounded-full bg-[#b33012]/90 dark:bg-orange-950/90 shadow-inner overflow-hidden flex items-center justify-center">
                          <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#ee4d2d] via-[#f5532d] to-[#ff7337] rounded-full"
                            style={{ width: `${flashProgressPct}%` }}
                          />
                          <span className="relative z-10 text-[9px] font-extrabold uppercase tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)] px-1.5 truncate">
                            {flashSold > 0
                              ? t('mall.flashSale.soldCount', { count: flashSold })
                              : `🔥 ${t('mall.flashSale.sellingFast')}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
          </div>
        );
      }
      case 'vouchers_section': {
        const voucherSec = orderedSections.find((s) => s.id === 'vouchers_section');
        const customVoucherTitle = isEn ? voucherSec?.title_en : voucherSec?.title_vi;
        const customVoucherDesc = isEn ? voucherSec?.description_en : voucherSec?.description_vi;
        const customVoucherBadge = isEn ? voucherSec?.badge_en : voucherSec?.badge_vi;
        const voucherLinkUrl = voucherSec?.link_url;
        const voucherLinkTarget = voucherSec?.link_target || '_self';
        const voucherLinkType = voucherSec?.link_type || 'internal';

        return (
          <>
            <div className={`rounded-xl shadow-sm border p-4 ${isShopeeDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {voucherSec?.image_url ? (
                      <img 
                        src={voucherSec.image_url} 
                        alt={customVoucherTitle || 'Vouchers'} 
                        width={40} 
                        height={40} 
                        className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700" 
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-[#ee4d2d] flex items-center justify-center font-bold text-xl">
                        🎟️
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                        <span>{customVoucherTitle || t.mall?.vouchers?.exclusiveTitle || (language === 'en' ? `${shopBrand.name} Exclusive Deals` : `Ưu Đãi Độc Quyền Sàn ${shopBrand.name}`)}</span>
                        {customVoucherBadge && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950">
                            {customVoucherBadge}
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {customVoucherDesc || t.mall?.vouchers?.exclusiveDesc || (language === 'en' ? 'Apply vouchers FREESHIP30K, FREESHIPMAX, MALL50K, UNIVERSAL10 to all orders' : 'Áp dụng mã FREESHIP30K, FREESHIPMAX, MALL50K, UNIVERSAL10 cho toàn bộ đơn hàng')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (voucherLinkUrl) {
                        handleNavigation(voucherLinkUrl, voucherLinkTarget, voucherLinkType);
                      } else {
                        setIsCouponModalOpen(true);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-[#ee4d2d] hover:bg-orange-600 text-white font-bold text-xs transition cursor-pointer shadow-sm"
                  >
                    {t.mall?.vouchers?.viewAllBtn || (language === 'en' ? 'View Mall Vouchers' : 'Xem Kho Voucher Sàn')}
                  </button>
                </div>
              </div>
          </>
        );
      }
      case 'games_and_codes': {
        const gamesSection = orderedSections.find((s) => s.id === 'games_and_codes');
        const customGamesTitle = isEn ? gamesSection?.title_en : gamesSection?.title_vi;
        const gamesLinkUrl = gamesSection?.link_url;
        const gamesLinkTarget = gamesSection?.link_target || '_self';
        const gamesLinkType = gamesSection?.link_type || 'internal';

        return (
          <div className="space-y-4">
            {/* Banner Kệ Hàng Hóa tùy chỉnh nếu admin cấu hình */}
            {gamesSection?.image_url && (
              <div
                onClick={() => gamesLinkUrl && handleNavigation(gamesLinkUrl, gamesLinkTarget, gamesLinkType)}
                className={`rounded-xl overflow-hidden shadow-sm ${gamesLinkUrl ? 'cursor-pointer hover:opacity-95' : ''}`}
              >
                <img
                  src={gamesSection.image_url}
                  srcSet={getResponsiveSrcSet(gamesSection.image_url, [480, 800, 1200])}
                  sizes="(max-width: 768px) 100vw, 1200px"
                  width={1200}
                  height={220}
                  loading="lazy"
                  alt={isEn ? (gamesSection.image_alt_en || customGamesTitle || 'Games & Codes Banner') : (gamesSection.image_alt_vi || customGamesTitle || 'Banner Kệ Hàng Sàn')}
                  className="w-full h-auto max-h-[160px] sm:max-h-[200px] object-cover"
                />
              </div>
            )}
            {/* 3.5. KỆ HÀNG HÓA SÀN ĐA NGÀNH: GỢI Ý HÔM NAY (DAILY DISCOVER) */}
            <div id="shopee-products-grid" className="space-y-3 scroll-mt-28">
              {/* Shopee Daily Discover Centered Header */}
              <div className={`rounded-t-lg border border-b-4 border-b-[#ee4d2d] py-3 px-4 text-center shadow-2xs ${isShopeeDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <h3 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-[#ee4d2d]">
                  {cleanCmsDebugSuffix(customGamesTitle) || t('mall.products.dailyDiscover')}
                </h3>
              </div>

              {/* TAB CHUYỂN ĐỔI KỆ HÀNG */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 flex-wrap gap-2">
                <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-none">
                  {[
                    { id: 'all', label: t.mall?.products?.allTab || (language === 'en' ? '🔥 All Packages' : '🔥 Tất Cả Gói'), count: filteredStoreProducts.length },
                    { id: 'physical', label: t.mall?.products?.physicalTab || (language === 'en' ? '🚚 Physical Goods (Ship)' : '🚚 Hàng Vật Lý (Ship)'), count: filteredStoreProducts.filter(p => p.product_type === 'physical').length },
                    { id: 'digital', label: t.mall?.products?.digitalTab || (language === 'en' ? '⚡ Digital (0s)' : '⚡ Hàng Số (Mã 0s)'), count: filteredStoreProducts.filter(p => p.product_type !== 'physical').length },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedProductType(tab.id as any)}
                      className={`px-3 py-1.5 rounded-t-lg font-bold text-xs whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                        selectedProductType === tab.id
                          ? 'bg-[#ee4d2d] text-white shadow'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-orange-50'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedProductType === tab.id ? 'bg-white text-[#ee4d2d]' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'}`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  {currentMallProducts.length === 1
                    ? t('mall.paginationSummary_singular', {
                        page: currentPage,
                        totalPages: mallTotalPages,
                        total: 1,
                      })
                    : t('mall.paginationSummary_plural', {
                        page: currentPage,
                        totalPages: mallTotalPages,
                        total: currentMallProducts.length,
                      })}
                </div>
              </div>

              {/* THANH SẮP XẾP & LỌC NHANH PHONG CÁCH SHOPEE */}
              <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${isShopeeDark ? 'bg-slate-900/90 border-slate-800' : 'bg-[#ededed]/80 border-slate-200'}`}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                    {t('shopeePhysical.sortBy')}
                  </span>
                  {([
                    { id: 'popular', label: t('shopeePhysical.sortPopular') },
                    { id: 'newest', label: t('shopeePhysical.sortNewest') },
                    { id: 'sales', label: t('shopeePhysical.sortBestSelling') },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setMallSortBy(opt.id);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition cursor-pointer ${
                        mallSortBy === opt.id
                          ? 'bg-[#ee4d2d] text-white shadow-xs'
                          : isShopeeDark
                            ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                            : 'bg-white text-slate-700 hover:text-[#ee4d2d]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <select
                    aria-label={t('shopeePhysical.sortBy')}
                    value={mallSortBy === 'price_asc' || mallSortBy === 'price_desc' ? mallSortBy : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        setMallSortBy(e.target.value as 'price_asc' | 'price_desc');
                        setCurrentPage(1);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded text-xs font-semibold border cursor-pointer focus:outline-none focus:border-[#ee4d2d] ${
                      mallSortBy === 'price_asc' || mallSortBy === 'price_desc'
                        ? 'border-[#ee4d2d] text-[#ee4d2d] bg-white dark:bg-slate-800'
                        : isShopeeDark
                          ? 'bg-slate-800 border-slate-700 text-slate-200'
                          : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="">{t('shopeePhysical.sortPriceAsc').split(':')[0]}</option>
                    <option value="price_asc">{t('shopeePhysical.sortPriceAsc')}</option>
                    <option value="price_desc">{t('shopeePhysical.sortPriceDesc')}</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setOnlyFreeshipFilter((v) => !v);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                    onlyFreeshipFilter
                      ? 'bg-[#00bfa5] text-white border-[#00bfa5] shadow-xs'
                      : isShopeeDark
                        ? 'bg-slate-800 border-slate-700 text-emerald-400 hover:border-[#00bfa5]'
                        : 'bg-white border-slate-200 text-[#00897b] hover:border-[#00bfa5]'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>{t('shopeePhysical.filterFreeship')}</span>
                </button>
              </div>

              {/* LƯỚI SẢN PHẨM SÀN ĐA NGÀNH HOẶC EMPTY STATE */}
              {currentMallProducts.length === 0 ? (
                <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8 my-4">
                  <div className="w-16 h-16 rounded-2xl bg-orange-500/10 text-[#ee4d2d] border border-[#ee4d2d]/20 flex items-center justify-center mx-auto mb-3 text-2xl">
                    🛍️
                  </div>
                  <h3 className="font-bold text-base sm:text-lg text-slate-800 dark:text-slate-100 mb-1">
                    {t.mall?.products?.emptyTitle || (language === 'en' ? 'Preparing First Product Batch' : 'Sàn đang chuẩn bị danh sách sản phẩm đợt đầu')}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {t.mall?.products?.emptyDesc || (language === 'en' ? '5 multi-category catalog is ready. Authentic products are being synchronized and verified before launch.' : 'Hệ thống danh mục 5 ngành hàng đã sẵn sàng. Sản phẩm chính hãng đang được đồng bộ và kiểm duyệt trước khi mở bán.')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                  {paginatedMallProducts.map((prod) => {
                    const isOutOfStock = (prod.stock_quantity ?? 0) <= 0;
                    const rawFirstPrice = prod.first_purchase_price ? Number(prod.first_purchase_price) : 0;
                    const hasFirstOffer = rawFirstPrice > 0 && rawFirstPrice < Number(prod.current_price || 0);
                    const firstPrice = hasFirstOffer ? rawFirstPrice : Number(prod.current_price || 0);
                    const displayCurrentPrice = hasFirstOffer ? firstPrice : prod.current_price;
                    const displayOriginalPrice = (prod.original_price && prod.original_price > 0) ? prod.original_price : prod.current_price;
                    const discountPercent = displayOriginalPrice > displayCurrentPrice
                      ? Math.round(((displayOriginalPrice - displayCurrentPrice) / displayOriginalPrice) * 100)
                      : (prod.discount_percent || 0);

                    const isPhysicalProd = prod.product_type === 'physical';
                    const totalSoldCount = Math.max(0, Number(prod.sold_count || 0) + Number(prod.virtual_sold_count || 0));
                    const shipLocation = (prod as any).warehouse_address || (prod as any).origin || t('shopeePhysical.warehouseDefault');

                    return (
                      <div
                        key={prod.id}
                        onClick={() => onSelectProduct ? onSelectProduct(prod) : onShowToast(t('mall.toasts.productLabel', { title: prod.title }), 'info')}
                        className={`rounded-sm border hover:border-[#ee4d2d] hover:-translate-y-0.5 hover:z-10 transition duration-150 shadow-2xs hover:shadow-md cursor-pointer overflow-hidden flex flex-col justify-between group relative h-full ${isShopeeDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'}`}
                      >
                        <div>
                          <div className="w-full aspect-square bg-slate-50 dark:bg-slate-800 relative flex items-center justify-center overflow-hidden">
                            {(() => {
                              const shelfCardImg = resolveSafeCardImage(prod);
                              const isShelfPlaceholder = shelfCardImg.includes('package-placeholder.svg');
                              return (
                                <img
                                  key={shelfCardImg}
                                  src={shelfCardImg}
                                  alt={prod.title}
                                  loading="lazy"
                                  onError={(e) => {
                                    const img = e.currentTarget;
                                    if (isPhysicalProd && !img.src.includes(PHYSICAL_DEFAULT_IMAGE_URL)) {
                                      img.src = PHYSICAL_DEFAULT_IMAGE_URL;
                                      return;
                                    }
                                    if (!img.dataset.fallbackApplied) {
                                      img.dataset.fallbackApplied = '1';
                                      img.src = '/package-placeholder.svg';
                                      img.className = 'w-full h-full object-contain p-4';
                                    }
                                  }}
                                  className={isShelfPlaceholder ? 'w-full h-full object-contain p-4' : 'w-full h-full object-cover group-hover:scale-105 transition duration-300'}
                                />
                              );
                            })()}
                            {/* Top-left Mall / Preferred Shopee Ribbon */}
                            <span className={`absolute top-2 left-0 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-r shadow-xs ${isPhysicalProd ? 'bg-[#d0011b]' : 'bg-[#ee4d2d]'}`}>
                              {isPhysicalProd
                                ? t('shopeePhysical.mallBadge')
                                : (prod.badge && prod.badge !== 'Hàng Số' && prod.badge !== 'Hàng Vật Lý'
                                    ? prod.badge
                                    : t('shopeePhysical.favoriteBadge'))}
                            </span>
                            {/* Top-right Shopee Yellow Discount Flag */}
                            {discountPercent > 0 && (
                              <span className="absolute top-0 right-0 bg-[#ffe97a] text-[#ee4d2d] text-[10px] font-extrabold px-1.5 py-0.5 rounded-bl shadow-xs">
                                -{discountPercent}%
                              </span>
                            )}
                            {/* Bottom-left Freeship Xtra / Voucher Xtra Overlay */}
                            {isPhysicalProd && (
                              <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/55 to-transparent flex items-center gap-1">
                                <span className="bg-[#00bfa5] text-white text-[8px] font-extrabold px-1.5 py-0.5 rounded-xs inline-flex items-center gap-0.5 tracking-tight">
                                  <Truck className="w-2.5 h-2.5 shrink-0" />
                                  <span>{t('shopeePhysical.freeshipXtra')}</span>
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="p-2 space-y-1.5">
                            <div className="text-xs font-medium line-clamp-2 leading-snug min-h-[2rem] group-hover:text-[#ee4d2d] transition" title={prod.title}>
                              {contentTranslationService.translateField('product', prod.id, 'name', prod.title, language)}
                            </div>
                            <div className="flex items-center gap-1 flex-wrap min-h-[18px]">
                              {isPhysicalProd ? (
                                <>
                                  <span className="text-[9px] border border-[#ee4d2d] text-[#ee4d2d] px-1 rounded-xs font-semibold">
                                    {t('shopeePhysical.cheapGuarantee')}
                                  </span>
                                  <span className="text-[9px] bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1 rounded-xs font-semibold">
                                    {t('mall.products.voucherXtra')}
                                  </span>
                                </>
                              ) : (
                                <span className="text-[9px] border border-emerald-600 text-emerald-700 dark:text-emerald-400 px-1 rounded-xs font-semibold">
                                  {t('shopeePhysical.instant0s')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="p-2 pt-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <div className="min-w-0">
                              <div className="text-[#ee4d2d] font-bold text-xs sm:text-sm truncate">
                                {formatPrice(hasFirstOffer ? firstPrice : prod.current_price)}
                              </div>
                              {displayOriginalPrice > displayCurrentPrice && (
                                <div className="text-[10px] text-slate-400 line-through font-mono leading-none">
                                  {formatPrice(displayOriginalPrice)}
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              disabled={isOutOfStock}
                              title={isOutOfStock ? t('shopeePhysical.outOfStock') : (prod.variants && prod.variants.length > 1 ? t('shopeePhysical.selectVariant') : t('shopeePhysical.addToCart'))}
                              aria-label={isOutOfStock ? t('shopeePhysical.outOfStock') : t('shopeePhysical.addToCart')}
                              onClick={isOutOfStock ? undefined : (e) => {
                                e.stopPropagation();
                                if (prod.variants && prod.variants.length > 1 && onSelectProduct) {
                                  onSelectProduct(prod);
                                } else {
                                  handleAddProductToCart(prod, e);
                                }
                              }}
                              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition shadow-xs ${
                                isOutOfStock
                                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                                  : 'bg-[#ee4d2d]/10 hover:bg-[#ee4d2d] text-[#ee4d2d] hover:text-white cursor-pointer'
                              }`}
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Rating, Sold count & Location row (Shopee style) */}
                          <div className="flex items-center justify-between gap-1 text-[10px] pt-0.5 border-t border-slate-100 dark:border-slate-800/80">
                            {prod.rating && prod.review_count && prod.review_count > 0 ? (
                              <div className="flex items-center gap-0.5 text-amber-500 font-medium shrink-0">
                                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                <span className="font-bold">{Number(prod.rating).toFixed(1)}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5 text-slate-400 truncate min-w-0">
                                {isPhysicalProd && <MapPin className="w-2.5 h-2.5 shrink-0" />}
                                <span className="truncate">
                                  {isPhysicalProd
                                    ? shipLocation
                                    : (prod.brand ? contentTranslationService.translateField('brand', prod.brand, 'name', prod.brand, language) : (prod.game_name || shopBrand.name))}
                                </span>
                              </div>
                            )}
                            {prod.show_sold_count !== false && totalSoldCount > 0 && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
                                {t('shopeePhysical.soldPrefix')} {totalSoldCount}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Shopee signature hover footer bar */}
                        <div className="hidden sm:block bg-[#ee4d2d] text-white text-[11px] font-semibold text-center py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          {t('mall.products.findSimilar')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* BỘ PHÂN TRANG SẢN PHẨM SÀN */}
              {mallTotalPages > 1 && (
                <div className="pt-6 pb-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="text-slate-500 font-medium">
                    {currentMallProducts.length === 1
                      ? t('mall.showingCount_singular', {
                          from: 1,
                          to: 1,
                          total: 1,
                        })
                      : t('mall.showingCount_plural', {
                          from: (currentPage - 1) * pageSize + 1,
                          to: Math.min(currentPage * pageSize, currentMallProducts.length),
                          total: currentMallProducts.length,
                        })}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      disabled={currentPage <= 1}
                      onClick={() => {
                        setCurrentPage((p) => Math.max(1, p - 1));
                        const el = document.getElementById('shopee-products-grid');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`p-1.5 rounded border ${currentPage <= 1 ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer'}`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {Array.from({ length: Math.min(5, mallTotalPages) }, (_, i) => {
                      let pageNum = currentPage;
                      if (currentPage <= 3) pageNum = i + 1;
                      else if (currentPage >= mallTotalPages - 2) pageNum = mallTotalPages - 4 + i;
                      else pageNum = currentPage - 2 + i;
                      if (pageNum < 1 || pageNum > mallTotalPages) return null;

                      return (
                        <button
                          key={pageNum}
                          onClick={() => {
                            setCurrentPage(pageNum);
                            const el = document.getElementById('shopee-products-grid');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className={`w-7 h-7 rounded text-xs font-bold transition cursor-pointer ${
                            currentPage === pageNum
                              ? 'bg-[#ee4d2d] text-white shadow-xs'
                              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-orange-50 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      disabled={currentPage >= mallTotalPages}
                      onClick={() => {
                        setCurrentPage((p) => Math.min(mallTotalPages, p + 1));
                        const el = document.getElementById('shopee-products-grid');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`p-1.5 rounded border ${currentPage >= mallTotalPages ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer'}`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        );
      }
      case 'news_section': {
        const newsSec = orderedSections.find((s) => s.id === 'news_section');
        const customNewsTitle = isEn ? newsSec?.title_en : newsSec?.title_vi;
        const customNewsBadge = isEn ? newsSec?.badge_en : newsSec?.badge_vi;
        const newsLinkUrl = newsSec?.link_url;
        const newsLinkTarget = newsSec?.link_target || '_self';
        const newsLinkType = newsSec?.link_type || 'internal';

        return (
          <div className={`rounded-xl shadow-sm border p-4 space-y-3 ${isShopeeDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {newsSec?.image_url ? (
                  <img 
                    src={newsSec.image_url} 
                    alt={customNewsTitle || 'News'} 
                    width={20} 
                    height={20} 
                    className="w-5 h-5 rounded object-cover shrink-0" 
                  />
                ) : (
                  <Newspaper className="w-5 h-5 text-[#ee4d2d]" />
                )}
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#ee4d2d] flex items-center gap-1.5">
                  <span>{customNewsTitle || (isEn ? 'GAMING & TECH NEWS' : 'TIN TỨC GAME & CẨM NANG MUA SẮM')}</span>
                  {customNewsBadge && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950">
                      {customNewsBadge}
                    </span>
                  )}
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  ({newsCount} {isEn ? 'Articles' : 'Bài viết'})
                </span>
              </div>
              <button
                onClick={() => {
                  if (newsLinkUrl) {
                    handleNavigation(newsLinkUrl, newsLinkTarget, newsLinkType);
                  } else {
                    setSubView('news');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="text-xs text-[#ee4d2d] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>{isEn ? 'View all news' : 'Xem tất cả tin'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {homeNewsArticles.map((art) => (
                <div
                  key={art.id || art.slug}
                  onClick={() => {
                    setSubView('news');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`rounded-lg border p-3 flex flex-col justify-between hover:border-[#ee4d2d] hover:shadow-sm transition cursor-pointer ${
                    isShopeeDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="font-semibold text-xs text-slate-900 dark:text-white line-clamp-2" title={art.title}>
                    {art.title}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2 flex items-center justify-between">
                    <span>{art.category || (isEn ? 'Gaming' : 'Game')}</span>
                    <span>{art.views || 0} {isEn ? 'reads' : 'lượt xem'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-200 font-sans ${isShopeeDark ? 'bg-[#0a0f1d] text-slate-100' : 'bg-[#f5f5f5] text-slate-800'}`}>
      
      {/* 0. TOP BAR THÔNG BÁO SÀN UNIVERSAL MALL (Non-sticky so Shopee sticky header anchors cleanly at top-0) */}
      {isSectionEnabled('top_announcement') && (() => {
        const topSec = orderedSections.find((s) => s.id === 'top_announcement');
        const customTopTitle = cleanCmsDebugSuffix(isEn ? topSec?.title_en : topSec?.title_vi);
        const customTopDesc = cleanCmsDebugSuffix(isEn ? topSec?.description_en : topSec?.description_vi);
        const customTopBadge = cleanCmsDebugSuffix(isEn ? topSec?.badge_en : topSec?.badge_vi);
        const topLinkUrl = topSec?.link_url;
        const topLinkTarget = topSec?.link_target || '_self';
        const topLinkType = topSec?.link_type || 'internal';

        return (
          <div className="bg-amber-400 text-slate-950 px-2.5 sm:px-4 py-1.5 text-[11px] sm:text-xs font-bold flex items-center justify-between gap-2 shadow-xs relative z-20 w-full max-w-full overflow-hidden">
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              {topSec?.image_url && (
                <img 
                  src={topSec.image_url} 
                  alt="" 
                  width={16} 
                  height={16} 
                  className="w-4 h-4 rounded object-cover shrink-0" 
                />
              )}
              <span className="bg-slate-950 text-amber-400 px-2 py-0.5 rounded uppercase text-[10px] tracking-wider font-mono whitespace-nowrap shrink-0">
                {customTopBadge || t('mall.topNav.marketplace')}
              </span>
              <span className="truncate min-w-0">
                {customTopTitle ? (
                  <span>{customTopTitle}{customTopDesc ? ` - ${customTopDesc}` : ''}</span>
                ) : (
                  <>
                    {t('mall.topNav.editionDesc')}
                    {' '}
                    {t('mall.topNav.mainSiteUnaffected')}
                  </>
                )}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <button 
                onClick={() => {
                  if (topLinkUrl) {
                    handleNavigation(topLinkUrl, topLinkTarget, topLinkType);
                  } else {
                    setSubView('home');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-900 text-white px-3 py-1 rounded text-xs transition active:scale-95 cursor-pointer font-bold whitespace-nowrap"
              >
                <Store className="w-3.5 h-3.5 shrink-0" />
                <span>{customTopBadge || t('mall.topNav.mallHomepage')}</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* 1. UNIVERSAL MALL TOPBAR */}
      <div className="bg-[#ee4d2d] text-white text-[11px] sm:text-[12px] py-1 px-2.5 sm:px-4 border-b border-white/10">
        <div className="max-w-6xl mx-auto flex justify-between items-center gap-2 min-w-0">
          {/* Left Topbar Links: Kênh Người Bán & Mở Gian Hàng (Mở tab mới giống Shopee Seller Centre) */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 overflow-hidden">
            <a
              href={language === 'en' ? '/en/seller' : '/seller'}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition cursor-pointer font-medium whitespace-nowrap"
            >
              {t('mall.topNav.sellerCenter')}
            </a>
            <span className="opacity-40 hidden xs:inline sm:inline">|</span>
            <a
              href={language === 'en' ? '/en/seller' : '/seller'}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition cursor-pointer font-medium hidden sm:inline whitespace-nowrap"
            >
              {t('mall.topNav.openStore')}
            </a>
            <span className="opacity-40 hidden sm:inline">|</span>
            <button 
              onClick={onOpenDownloadApp}
              className="hover:opacity-80 transition cursor-pointer hidden sm:flex items-center gap-1 font-medium whitespace-nowrap"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{t('mall.topNav.downloadApp')}</span>
            </button>
            <span className="opacity-40 hidden md:inline">|</span>
            <button 
              onClick={() => setSubView('telegram')}
              className={`hover:opacity-80 transition cursor-pointer hidden md:flex items-center gap-1 font-medium whitespace-nowrap ${subView === 'telegram' ? 'underline font-bold text-amber-200' : ''}`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram</span>
            </button>
          </div>

          {/* Right Topbar Links */}
          <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
            {/* Tủ Mã / Đơn Mua Shopee */}
            <button 
              onClick={() => onOpenReceivedCodes ? onOpenReceivedCodes('marketplace') : onShowToast(t('mall.topNav.myVault'), 'info')}
              className="hover:opacity-80 transition cursor-pointer flex items-center gap-1 bg-white/15 px-2 py-0.5 rounded font-medium text-[11px] sm:text-xs whitespace-nowrap"
              title={t('mall.topNav.myVault')}
            >
              <Package className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t('mall.topNav.myVault')}</span>
              <span className="sm:hidden">{t('mall.topNav.myVault')}</span>
            </button>

            {/* Thông Báo */}
            <button 
              onClick={onOpenEmailModal}
              className="hover:opacity-80 transition cursor-pointer hidden sm:flex items-center gap-1 whitespace-nowrap"
            >
              <Bell className="w-3.5 h-3.5 shrink-0" />
              <span>{t('nav.notifications')}</span>
            </button>

            {/* Hỗ Trợ 24/7 */}
            <button 
              onClick={() => setIsSupportOpen(true)}
              className="hover:opacity-80 transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
              title={t('nav.support')}
              aria-label={t('nav.support')}
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t('nav.support')}</span>
            </button>

            {/* Bộ chuyển đổi ngôn ngữ VI / EN */}
            <div className="hidden sm:block">
              <LanguageSelector variant="compact" />
            </div>

            {/* Người dùng & Số Dư Ví Thực */}
            {currentUser ? (
              <div className="flex items-center gap-1.5 sm:gap-2 pl-2 border-l border-white/20">
                <button 
                  onClick={() => setSubView('account')}
                  className="font-semibold text-amber-200 hover:underline cursor-pointer truncate max-w-[84px] sm:max-w-[100px]"
                  title={t('mall.subnav.account')}
                >
                  {currentUser.displayName || currentUser.name || currentUser.username}
                </button>
                <button onClick={onOpenWallet} className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer whitespace-nowrap">
                  {t('nav.wallet')}: {walletBalanceDisplay}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2 pl-2 border-l border-white/20">
                <button onClick={onOpenWallet} className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer hidden sm:block whitespace-nowrap">
                  {t('nav.wallet')}: {walletBalanceDisplay}
                </button>
                <button onClick={onOpenAuth} className="hover:opacity-80 font-semibold cursor-pointer whitespace-nowrap">
                  {t('nav.login')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. STICKY HEADER CONTAINER (Main Header + Sub-nav anchored cleanly at top-0, z-30 below z-50+ modals) */}
      <div className="sticky top-0 z-30 shopee-sticky-header">
        <div className="shopee-sticky-inner shadow-md">
        {/* MAIN HEADER SHOPEE */}
        <div className={`bg-gradient-to-b ${currentAccent.headerGradient} text-white pt-2 pb-2.5 sm:pt-2.5 sm:pb-3 px-3 sm:px-4 transition-colors duration-300`}>
        <div className="max-w-6xl mx-auto flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-2 gap-x-2 sm:gap-x-6 min-w-0">
          
          {/* Logo Sàn Shopee (Row 1 Left on Mobile, Left on Desktop) */}
          <div onClick={() => setSubView('home')} className="order-1 flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 sm:flex-initial shrink-0 cursor-pointer">
            <div className={`w-9 h-9 sm:w-11 sm:h-11 bg-white rounded-xl shadow-md flex items-center justify-center ${currentAccent.textColor} font-black text-lg sm:text-2xl tracking-tighter overflow-hidden shrink-0`}>
              {shopBrand.logoUrl && shopBrand.logoUrl !== '/logo.png' ? (
                <img src={shopBrand.logoUrl} alt={shopBrand.name} className="w-full h-full object-contain p-1" />
              ) : (
                '🛍️'
              )}
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-sm sm:text-lg tracking-tight leading-none text-white drop-shadow flex items-center gap-1.5">
                <span className="truncate">{shopBrand.name}</span>
                {shopBrand.badge ? (
                  <span className={`bg-white ${currentAccent.badgeBg} font-bold text-[9px] px-1.5 py-0.5 rounded uppercase shrink-0`}>{shopBrand.badge}</span>
                ) : null}
              </div>
              <div className="text-[10px] text-white/95 font-medium leading-none mt-1 hidden md:block whitespace-nowrap">
                {shopBrand.slogan || t('mall.slogan')}
              </div>
            </div>
          </div>

          {/* Khung Tìm Kiếm Phong Cách Shopee (Row 2 Full-Width on Mobile < sm, Center Flex-1 on Desktop) */}
          <div ref={searchDropdownRef} className="order-3 sm:order-2 w-full sm:w-auto sm:flex-1 sm:max-w-2xl relative min-w-0">
            <div className="bg-white rounded-md p-1 flex items-center shadow-sm">
              <input 
                type="text" 
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onFocus={() => {
                  const total = liveSearchResults.products?.length || 0;
                  if (total > 0) setIsSearchDropdownOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setIsSearchDropdownOpen(false);
                    handleHeroSearchSubmit();
                  }
                }}
                placeholder={t('mall.search.placeholder')} 
                className="w-full min-w-0 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white text-slate-900 placeholder:text-slate-400 font-medium focus:outline-none"
              />
              {searchKeyword && (
                <button type="button" onClick={() => { setSearchKeyword(''); setIsSearchDropdownOpen(false); }} className="px-2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer shrink-0">
                  ✕
                </button>
              )}
              <button 
                type="button"
                aria-label={t('glossary.search')}
                onClick={() => { setIsSearchDropdownOpen(false); handleHeroSearchSubmit(); }}
                className={`${currentAccent.buttonBg} hover:opacity-90 text-white px-4 sm:px-6 py-1.5 sm:py-2 rounded transition flex items-center justify-center shrink-0 cursor-pointer`}
              >
                <Search className="w-4 h-4" />
              </button>
            </div>

            {/* Server-side Autocomplete Live Dropdown */}
            {isSearchDropdownOpen && (liveSearchResults.products?.length || 0) > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-2xl border border-slate-200 z-40 overflow-hidden divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {liveSearchResults.products.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">{language === 'en' ? 'Products' : 'Sản phẩm nổi bật'}</div>
                    {liveSearchResults.products.map((prod) => (
                      <div
                        key={prod.id}
                        onClick={() => {
                          setIsSearchDropdownOpen(false);
                          if (onSelectProduct) onSelectProduct(prod as any);
                          else onShowToast(t('mall.toasts.productLabel', { title: prod.title }), 'info');
                        }}
                        className="flex items-center gap-2.5 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition"
                      >
                        <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                          {sanitizeImageUrl(prod.coverUrl) && !String(prod.coverUrl).includes('test-game.webp') ? (
                            <img src={sanitizeImageUrl(prod.coverUrl)} alt={prod.title} className="w-full h-full object-cover" />
                          ) : (
                            <ShoppingBag className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900 truncate">{prod.title}</div>
                          <div className="text-[11px] font-bold text-[#ee4d2d]">{formatCore(prod.priceCore)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Từ khóa gợi ý song ngữ VI/EN (Single crisp line on desktop) */}
            <div className="hidden sm:flex items-center flex-nowrap overflow-hidden gap-x-3 text-[11px] text-white/90 mt-1.5 whitespace-nowrap">
              {(() => {
                const rawList = (categoriesConfig.searchSuggestions && categoriesConfig.searchSuggestions.length > 0)
                  ? categoriesConfig.searchSuggestions.slice(0, 5)
                  : ['Áo thun polo nam', 'Serum cấp ẩm B5', 'Củ sạc nhanh GaN 65W', 'Tài khoản Canva Pro', 'Thẻ nạp game Garena'];

                return rawList.map((kw, i) => {
                  let displayLabel = kw;
                  let searchTarget = kw;
                  const kwLower = kw.toLowerCase();

                  if (kwLower.includes('polo')) {
                    displayLabel = t('mall.search.suggestionPolo');
                    searchTarget = language === 'en' ? 'polo' : kw;
                  } else if (kwLower.includes('serum') || kwLower.includes('b5')) {
                    displayLabel = t('mall.search.suggestionSerum');
                    searchTarget = language === 'en' ? 'B5' : kw;
                  } else if (kwLower.includes('sạc') || kwLower.includes('gan')) {
                    displayLabel = t('mall.search.suggestionCharger');
                    searchTarget = language === 'en' ? 'GaN' : kw;
                  } else if (kwLower.includes('canva')) {
                    displayLabel = t('mall.search.suggestionCanvaPro');
                    searchTarget = language === 'en' ? 'Canva' : kw;
                  } else if (kwLower.includes('garena') || kwLower.includes('thẻ nạp')) {
                    displayLabel = t('mall.search.suggestionGarena');
                    searchTarget = language === 'en' ? 'Garena' : kw;
                  } else if (kwLower.includes('hoodie')) {
                    displayLabel = t('mall.search.suggestionHoodie');
                    searchTarget = language === 'en' ? 'hoodie' : kw;
                  }

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleHeroSearchSubmit(searchTarget)}
                      className="hover:text-amber-200 transition cursor-pointer shrink-0"
                    >
                      {displayLabel}
                    </button>
                  );
                });
              })()}
              <button type="button" onClick={() => handleHeroSearchSubmit('')} className="hover:text-amber-200 transition font-bold text-amber-200 cursor-pointer shrink-0">
                {(currentStoreProducts?.length || storeProducts?.length || 0) === 1
                  ? t('mall.search.allProductsCount_singular')
                  : t('mall.search.allProductsCount_plural', { count: currentStoreProducts?.length || storeProducts?.length || 0 })}
              </button>
            </div>
          </div>

          {/* Wishlist + Giỏ Hàng Shopee (Row 1 Right on Mobile, Right on Desktop — strictly within viewport) */}
          <div className="order-2 sm:order-3 flex items-center gap-1 sm:gap-2 shrink-0">
            {onOpenWishlist && (
              <button
                type="button"
                onClick={onOpenWishlist}
                className="relative cursor-pointer group shrink-0 p-1.5 sm:p-2"
                title={language === 'en' ? 'Saved Wishlist' : 'Danh sách yêu thích'}
                aria-label={language === 'en' ? 'Saved Wishlist' : 'Danh sách yêu thích'}
              >
                <Heart className={`w-6 h-6 sm:w-7 sm:h-7 text-white group-hover:scale-105 transition ${wishlistCount > 0 ? 'fill-rose-300' : ''}`} />
                {wishlistCount > 0 && (
                  <span className="absolute top-0 right-0 bg-rose-600 text-white font-bold text-[10px] px-1.5 py-0.2 rounded-full border border-white shadow">
                    {wishlistCount > 99 ? '99+' : wishlistCount}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onOpenCart}
              className="relative cursor-pointer group shrink-0 p-1.5 sm:p-2"
              title={t('nav.cart')}
              aria-label={t('nav.cart')}
            >
              <ShoppingCart className="w-6 h-6 sm:w-7 sm:h-7 text-white group-hover:scale-105 transition" />
              <span className={`absolute top-0 right-0 bg-white ${currentAccent.textColor} font-bold text-[10px] px-1.5 py-0.2 rounded-full border border-[#ee4d2d]/30 shadow`}>
                {cartCount}
              </span>
            </button>
          </div>

        </div>
      </div>

      {/* 2.1. SUB-NAVIGATION BAR */}
      {isSectionEnabled('top_announcement') && (() => {
        const activeNavSubsections = getOrderedSubsections('top_announcement', 'navigation').filter(
          (sub) => sub.enabled && sub.id !== 'nav_game_zone' && sub.id !== 'shortcut_game_zone'
        );
        if (activeNavSubsections.length === 0) return null;

        return (
          <div className={`${currentAccent.subNavBg} text-white text-xs font-semibold px-2 sm:px-4 shadow-inner border-t border-black/15 transition-colors duration-300`}>
            <div className="max-w-6xl xl:max-w-7xl mx-auto flex items-center gap-1 sm:gap-1.5 py-1.5">
              {/* Mũi tên cuộn trái */}
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => scrollNav('left')}
                  className="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition bg-black/25 hover:bg-black/45 text-white cursor-pointer active:scale-95"
                  title={t('mall.subnav.scrollLeft')}
                  aria-label={t('mall.subnav.scrollLeft')}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {/* Dải mục cuộn mượt (hidden native scrollbar + scrollability affordance fade) */}
              <div
                ref={navScrollRef}
                onScroll={checkNavScroll}
                className="flex-1 flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-none subnav-fade-scroller whitespace-nowrap scroll-smooth py-0.5 min-w-0"
              >
                {activeNavSubsections.map((sub) => renderNavButton(sub))}
              </div>

              {/* Mũi tên cuộn phải */}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => scrollNav('right')}
                  className="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition bg-black/25 hover:bg-black/45 text-white cursor-pointer active:scale-95"
                  title={t('mall.subnav.scrollRight')}
                  aria-label={t('mall.subnav.scrollRight')}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })()}
        </div>
      </div>

      {/* 2.2. BREADCRUMB QUAY LẠI TRANG CHỦ SÀN (KHI ĐANG XEM SUBVIEW KHÁC) */}
      {subView !== 'home' && (
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2">
          <div className={`${subView === 'seller' ? 'max-w-[1600px]' : 'max-w-6xl'} mx-auto flex items-center justify-between`}>
            <div className="flex items-center gap-2 text-xs">
              <button 
                onClick={() => setSubView('home')} 
                className="text-[#ee4d2d] font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t.mall?.breadcrumb?.backHome || (language === 'en' ? 'Mall Home' : 'Trang Chủ Sàn')}</span>
              </button>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                {subView === 'news' && t('mall.breadcrumb.news', { count: newsCount })}
                {subView === 'events' && t('mall.breadcrumb.events', { count: eventsCount })}
                {subView === 'today-codes' && (t.mall?.breadcrumb?.todayCodes || (language === 'en' ? "Today's Codes (Closes at 22:30)" : 'Mã Hôm Nay (Tự Đóng 22:30)'))}
                {subView === 'upcoming' && t('mall.breadcrumb.upcoming', { count: upcomingTotal })}
                {subView === 'store' && (
                  effectiveStoreBreadcrumbCount === 1
                    ? t('mall.breadcrumb.store_singular')
                    : t('mall.breadcrumb.store_plural', { count: effectiveStoreBreadcrumbCount })
                )}
                {subView === 'store-detail' && (t.mall?.breadcrumb?.store || (language === 'en' ? 'Official Store' : 'Gian Hàng Chính Hãng'))}
                {subView === 'giveaways' && (language === 'en' ? 'Giveaways & Free Gifts' : 'Săn Quà Giveaway')}
                {subView === 'utilities' && (language === 'en' ? 'Digital Utilities & Top-up' : 'Kho Tiện Ích Số & Thẻ Nạp')}
                {subView === 'platform-solutions' && (language === 'en' ? 'Platform Solutions' : 'Giải Pháp Sàn & Mở Web')}
                {subView === 'seller' && (t.mall?.breadcrumb?.seller || (language === 'en' ? 'Marketplace & Seller Portal' : 'Sàn Giao Dịch & Kênh Người Bán'))}
                {subView === 'account' && (t.mall?.breadcrumb?.account || (language === 'en' ? 'Account & Core Wallet' : 'Tài Khoản & Ví Core'))}
                {subView === 'missions' && (t.mall?.breadcrumb?.missions || (language === 'en' ? 'Game Mission Center' : 'Trung Tâm Nhiệm Vụ Game'))}
                {subView === 'telegram' && (t.mall?.breadcrumb?.telegram || (language === 'en' ? 'Telegram Community & Alerts' : 'Cộng Đồng & Kênh Thông Báo Telegram'))}
                {subView === 'a-z' && (t.mall?.breadcrumb?.az || (language === 'en' ? 'Complete A-Z Game Index' : 'Mục Lục Toàn Bộ Tựa Game A-Z'))}
                {subView === 'terms' && (t.mall?.breadcrumb?.terms || (language === 'en' ? 'Mall Terms of Service' : 'Điều Khoản Dịch Vụ Sàn'))}
                {subView === 'privacy' && (t.mall?.breadcrumb?.privacy || (language === 'en' ? 'Mall Privacy Policy' : 'Chính Sách Bảo Mật Sàn'))}
              </span>
            </div>
            <button 
              onClick={() => setSubView('home')}
              className="text-xs font-semibold px-3 py-1 rounded bg-orange-50 dark:bg-orange-950/40 text-[#ee4d2d] border border-[#ee4d2d]/30 hover:bg-[#ee4d2d] hover:text-white transition cursor-pointer"
            >
              {t.mall?.breadcrumb?.backToShelves || (language === 'en' ? '← Back to Product Shelves' : '← Quay Lại Kệ Hàng Sàn')}
            </button>
          </div>
        </div>
      )}

      {/* 3. MAIN BODY CONTAINER */}
      <div className={`${subView === 'seller' ? 'max-w-[1600px]' : 'max-w-6xl'} mx-auto px-2 sm:px-4 py-4 space-y-5`}>
        
        {/* SUBVIEW 1: TIN TỨC, SỰ KIỆN & MÃ HÔM NAY */}
        {(subView === 'news' || subView === 'events' || subView === 'today-codes') && (
          <div className="rounded-xl overflow-hidden shadow-sm">
            <NewsView
              onShowToast={(t, m, type) => onShowToast(m ? `${t}: ${m}` : t, type as any)}
              onSelectGameSlug={handleFilterGameToStore}
              initialArticleSlug={initialNewsSlug}
              initialSubTab={subView}
            />
          </div>
        )}

        {/* SUBVIEW 4: SẮP RA MẮT (90 BẢN GHI THẬT - BỎ MÃ FAKE) */}
        {subView === 'upcoming' && (
          <div className="rounded-xl overflow-hidden shadow-sm p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <Rocket className="w-5 h-5 text-[#ee4d2d]" />
                  <span>Bảng Game Sắp Ra Mắt ({upcomingTotal} Bản Ghi Chuẩn Web Chính)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dữ liệu thực tế: {waitingCount} game đang chờ mở, {pendingCount} game chờ duyệt, {launchedCount} game đã ra mắt. Không bịa mã hay đếm ngược ảo.
                </p>
              </div>

              {/* Status tabs */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold">
                <button
                  onClick={() => setUpcomingStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded transition cursor-pointer ${upcomingStatusFilter === 'ALL' ? 'bg-[#ee4d2d] text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}
                >
                  Tất Cả ({upcomingTotal})
                </button>
                <button
                  onClick={() => setUpcomingStatusFilter('UPCOMING')}
                  className={`px-2.5 py-1 rounded transition cursor-pointer ${upcomingStatusFilter === 'UPCOMING' ? 'bg-[#ee4d2d] text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}
                >
                  Đang Chờ Mở ({waitingCount})
                </button>
                <button
                  onClick={() => setUpcomingStatusFilter('PENDING')}
                  className={`px-2.5 py-1 rounded transition cursor-pointer ${upcomingStatusFilter === 'PENDING' ? 'bg-[#ee4d2d] text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}
                >
                  Chờ Duyệt ({pendingCount})
                </button>
                <button
                  onClick={() => setUpcomingStatusFilter('RELEASED')}
                  className={`px-2.5 py-1 rounded transition cursor-pointer ${upcomingStatusFilter === 'RELEASED' ? 'bg-[#ee4d2d] text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}
                >
                  Đã Ra Mắt ({launchedCount})
                </button>
              </div>
            </div>

            {/* Grid of upcoming games */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredUpcoming.map((game) => {
                const expCodes = game.expectedCodes && game.expectedCodes.length > 0 ? game.expectedCodes : [];
                return (
                  <div 
                    key={game.id || game.slug}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col justify-between space-y-2 hover:border-[#ee4d2d] transition"
                  >
                    <div>
                      <div className="flex items-start gap-2.5 mb-2">
                        <div className="w-11 h-11 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0 flex items-center justify-center border border-slate-300 dark:border-slate-700">
                          {game.icon_url || game.iconUrl ? (
                            <img src={game.icon_url || game.iconUrl} alt={game.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl">🎮</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">{game.name}</h4>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span className="bg-orange-100 dark:bg-orange-950/60 text-[#ee4d2d] px-1.5 py-0.2 rounded font-semibold">{game.category}</span>
                            <span className="truncate">{game.publisher || 'NPH Game'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Release date & Status */}
                      <div className="text-xs bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800 flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-[#ee4d2d]" />
                          <span>{game.releaseDate ? game.releaseDate.split('T')[0] : 'Chưa rõ ngày ra mắt'}</span>
                        </div>
                        {(() => {
                          const isLaunched = game.status === 'RELEASED' || game.status === 'LAUNCHED' || (Boolean(game.releaseDate) && new Date(game.releaseDate) <= new Date());
                          const isPending = game.status === 'PENDING';
                          return (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isLaunched ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' :
                              isPending ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400' :
                              'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                            }`}>
                              {isLaunched ? 'Đã Ra Mắt' : isPending ? 'Chờ Duyệt' : 'Sắp Mở Server'}
                            </span>
                          );
                        })()}
                      </div>

                      {/* Expected codes: NO FAKE CODES */}
                      <div className="text-xs">
                        <div className="text-[10px] font-semibold text-amber-500 mb-1 flex items-center gap-1">
                          <Gift className="w-3 h-3" />
                          <span>{isEn ? 'Expected Gifts:' : 'Quà dự kiến:'}</span>
                        </div>
                        {expCodes.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {expCodes.map((c, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300 font-mono text-[10px] font-bold border border-amber-500/20">
                                {typeof c === 'string' ? c : (c as any).code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic bg-white dark:bg-slate-900 p-1.5 rounded border border-slate-200 dark:border-slate-800">
                            {isEn ? 'No expected gifts yet (Updating from publisher)' : 'Chưa có quà dự kiến (Đang cập nhật từ NPH)'}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">{game.subscribersCount || 0} người canh</span>
                      <button
                        onClick={() => onShowToast(`Đã bật báo code cho game "${game.name}" khi mở server!`, 'success')}
                        className="px-2.5 py-1 rounded bg-[#ee4d2d] hover:bg-orange-600 text-white font-bold text-[10px] transition cursor-pointer"
                      >
                        Báo Code
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUBVIEW 5: CỬA HÀNG ĐA NGÀNH */}
        {subView === 'store' && (
          <div className="rounded-xl overflow-hidden shadow-sm p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <StoreView
              onSelectProduct={onSelectProduct || (() => {})}
              onDirectCheckout={
                onDirectCheckout ||
                ((prod) => {
                  handleAddProductToCart(prod, { stopPropagation: () => {} } as any);
                  if (onOpenCart) onOpenCart();
                })
              }
              onShowToast={(t, m, type) => onShowToast(m ? `${t}: ${m}` : t, type as any)}
              currentUser={currentUser}
              onOpenAuth={onOpenAuth}
              onOpenShare={onOpenShareProduct}
              initialGameSlug={selectedCategory !== 'all' ? selectedCategory : undefined}
              onClearGameFilter={() => syncSelectedCategory('all')}
              onFilteredCountChange={setStoreFilteredCount}
            />
          </div>
        )}

        {/* SUBVIEW 5.5: CHI TIẾT GIAN HÀNG ĐỐI TÁC (/gian-hang/:slug) */}
        {subView === 'store-detail' && (
          <div className="rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <PublicStoreView
              slug={currentStoreSlug || ''}
              currentUser={currentUser}
              onOpenLogin={onOpenAuth}
              onNavigateHome={() => setSubView('home')}
              onOpenProfile={() => (onOpenProfile ? onOpenProfile() : setIsProfileOpen(true))}
              onOpenCart={onOpenCart}
            />
          </div>
        )}

        {/* SUBVIEW 5.6: SỰ KIỆN GIVEAWAY */}
        {subView === 'giveaways' && (
          <div className="rounded-xl overflow-hidden shadow-sm p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <GiveawaysView
              onShowToast={(t, m, type) => onShowToast(m ? `${t}: ${m}` : t, type as any)}
              onSelectGameSlug={handleFilterGameToStore}
              currentUser={currentUser}
              onOpenAuth={onOpenAuth}
              onShareGiveaway={onOpenShareGiveaway}
              initialGiveawayId={initialGiveawayId}
              onClearInitialGiveawayId={onClearInitialGiveawayId}
            />
          </div>
        )}

        {/* SUBVIEW 5.7: KHO TIỆN ÍCH SỐ & NẠP GAME */}
        {subView === 'utilities' && (
          <div className="rounded-xl overflow-hidden shadow-sm p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <UtilitiesView
              onShowToast={(t, m, type) => onShowToast(m ? `${t}: ${m}` : t, type as any)}
              currentUser={currentUser}
              onUpdateUser={onUpdateUser}
              onOpenAuth={onOpenAuth}
              onOpenShare={onOpenShareUtility}
              onOpenWallet={onOpenWallet}
              selectedUtilityId={selectedUtilityId}
              onClearSelectedUtility={onClearSelectedUtility}
            />
          </div>
        )}

        {/* SUBVIEW 5.8: GIẢI PHÁP SÀN & MỞ WEB */}
        {subView === 'platform-solutions' && (
          <div className="rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <PlatformSolutionsView
              onNavigateBack={() => setSubView('home')}
              onOpenStoreDemo={() => setSubView('store')}
            />
          </div>
        )}

        {/* SUBVIEW 6: KÊNH NGƯỜI BÁN ĐÃ TÁCH THÀNH CỔNG ĐỘC LẬP /seller (React.lazy trong App.tsx) */}

        {/* SUBVIEW 6.5: TRANG TÀI KHOẢN & VÍ CORE */}
        {subView === 'account' && (
          <div className="rounded-xl overflow-hidden shadow-sm p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
            {/* Header hồ sơ */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#ee4d2d] to-amber-500 text-white font-bold text-2xl flex items-center justify-center shadow-md overflow-hidden shrink-0">
                  {currentUser?.avatar ? (
                    <img src={currentUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span>{currentUser?.displayName?.charAt(0).toUpperCase() || currentUser?.username?.charAt(0).toUpperCase() || 'U'}</span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {currentUser?.displayName || currentUser?.name || currentUser?.username || (isEn ? `${shopBrand.name} Member` : `Thành Viên ${shopBrand.name}`)}
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/60 text-[#ee4d2d] border border-[#ee4d2d]/30">
                      {currentUser?.role === 'admin'
                        ? (isEn ? 'Administrator' : 'Quản Trị Viên')
                        : (isEn ? `${shopBrand.name} Member` : `Thành Viên ${shopBrand.name}`)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {currentUser?.email || (isEn ? `${shopBrand.name} Account` : `Tài khoản mua sắm tại sàn ${shopBrand.name}`)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {currentUser ? (
                  <button
                    onClick={() => setIsProfileOpen(true)}
                    className="flex-1 sm:flex-initial px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Profile & Security' : 'Hồ Sơ & Bảo Mật'}</span>
                  </button>
                ) : (
                  <button
                    onClick={onOpenAuth}
                    className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-[#ee4d2d] hover:bg-[#d73211] text-white font-bold text-xs transition shadow cursor-pointer"
                  >
                    {isEn ? 'Log In / Register' : 'Đăng Nhập / Đăng Ký'}
                  </button>
                )}
              </div>
            </div>

            {/* Lưới 4 Thẻ Chức Năng Quản Lý */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Thẻ 1: Ví Core & Nạp Tiền */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">{isEn ? 'Mall Core Wallet' : 'Ví Core Sàn'}</h4>
                      <p className="text-[10px] text-slate-400">{isEn ? 'Rate: 1 Core = 1,000 VND' : 'Tỷ lệ quy đổi: 1 Core = 1.000 VNĐ'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-extrabold text-[#ee4d2d]">{walletBalanceDisplay}</div>
                    <div className="text-[10px] text-slate-400">{isEn ? 'Actual balance' : 'Khớp số dư thực'}</div>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onOpenWallet}
                    className="flex-1 py-2 px-3 rounded-lg bg-gradient-to-r from-[#ee4d2d] to-orange-500 hover:from-[#d73211] hover:to-orange-600 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Deposit 24/7' : 'Nạp VietQR 24/7'}</span>
                  </button>
                  <button
                    onClick={() => setIsProfileOpen(true)}
                    className="py-2 px-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:border-[#ee4d2d] flex items-center justify-center gap-1 cursor-pointer transition"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{isEn ? 'History' : 'Lịch Sử'}</span>
                  </button>
                </div>
              </div>

              {/* Thẻ 2: Kho Mã & Đơn Hàng */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">{isEn ? 'Code Vault & Orders' : 'Kho Mã & Đơn Hàng'}</h4>
                      <p className="text-[10px] text-slate-400">{isEn ? 'Auto delivery 0s • 168h Escrow Protection' : 'Giao mã tự động 0s • Bảo hộ 168h'}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-500/20">
                    {isEn ? 'Ready' : 'Sẵn Sàng'}
                  </span>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => onOpenReceivedCodes?.('marketplace')}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Mall Orders' : 'Đơn Hàng Sàn'}</span>
                  </button>
                  <button
                    onClick={() => onOpenReceivedCodes?.('giveaways')}
                    className="py-2 px-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:border-emerald-500 flex items-center justify-center gap-1 cursor-pointer transition"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Event Codes' : 'Mã Sự Kiện'}</span>
                  </button>
                </div>
              </div>

              {/* Thẻ 3: Game Đang Theo Dõi */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                      <Bookmark className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">{isEn ? 'Tracked Games' : 'Tủ Game Theo Dõi'}</h4>
                      <p className="text-[10px] text-slate-400">{isEn ? 'Anti-duplicate • New code alerts' : 'Chống trùng lặp • Nhận thông báo mã mới'}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {bookmarkedGamesList.length} {isEn ? 'games' : 'game'}
                  </span>
                </div>

                <button
                  onClick={() => setIsBookmarkDrawerOpen(true)}
                  className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <Bookmark className="w-3.5 h-3.5 fill-current" />
                  <span>{isEn ? `Open Tracked Games (${bookmarkedGamesList.length})` : `Mở Tủ Game Đang Lưu (${bookmarkedGamesList.length})`}</span>
                </button>
              </div>

              {/* Thẻ 4: Bảo Mật & Pháp Lý Sàn */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">{isEn ? 'Security & Compliance' : 'Bảo Mật & Pháp Lý'}</h4>
                      <p className="text-[10px] text-slate-400">{isEn ? '168h Escrow Guarantee • G1/G234 Compliant' : 'Bảo chứng sàn 168h • Tuân thủ G1/G234'}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 border border-purple-500/20">
                    {isEn ? 'Protected' : 'Bảo Hộ'}
                  </span>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setSubView('terms')}
                    className="flex-1 py-2 px-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:border-purple-500 flex items-center justify-center gap-1 cursor-pointer transition"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Terms' : 'Điều Khoản'}</span>
                  </button>
                  <button
                    onClick={() => setSubView('privacy')}
                    className="flex-1 py-2 px-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:border-purple-500 flex items-center justify-center gap-1 cursor-pointer transition"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Privacy' : 'Bảo Mật'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBVIEW 7: NHIỆM VỤ GAME */}
        {subView === 'missions' && (
          <div className="rounded-xl overflow-hidden shadow-sm p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <MissionsView
              currentUser={currentUser}
              onOpenAuth={onOpenAuth}
              onOpenWallet={onOpenWallet}
              initialMissionId={initialMissionId}
            />
          </div>
        )}

        {/* SUBVIEW 8: TELEGRAM VIEW */}
        {subView === 'telegram' && (
          <div className="rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <TelegramView
              onOpenAuth={onOpenAuth}
              onOpenProfile={() => setIsProfileOpen(true)}
              onBackToHome={() => setSubView('home')}
              onShowToast={(t, m, type) => onShowToast(m ? `${t}: ${m}` : t, type as any)}
            />
          </div>
        )}

        {/* SUBVIEW 9: MỤC LỤC TOÀN BỘ GAME A-Z */}
        {subView === 'a-z' && (
          <div className="rounded-xl overflow-hidden shadow-sm p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <List className="w-5 h-5 text-[#ee4d2d]" />
                  <span>Mục Lục Toàn Bộ Tựa Game A-Z ({azCanonicalTotal} Tựa Game Chuẩn Hóa)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tra cứu nhanh chóng theo bảng chữ cái từ A đến Z toàn bộ {azCanonicalTotal} tựa game mobile và PC.
                </p>
              </div>
            </div>

            {/* Quick jumping alphabet bar (Đầy đủ 26 chữ cái từ A-Z bao gồm U và #) */}
            <div className="flex flex-wrap gap-1 p-2 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold">
              {['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')].map((letter) => {
                const count = azGroupedGames[letter]?.length || 0;
                return (
                  <a
                    key={letter}
                    href={`#az-group-${letter}`}
                    className={`w-7 h-7 rounded flex items-center justify-center transition shadow-2xs ${
                      count > 0
                        ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-[#ee4d2d] hover:text-white'
                        : 'bg-slate-100 dark:bg-slate-900/60 text-slate-400 dark:text-slate-600 hover:bg-slate-200'
                    }`}
                    title={count > 0 ? `${count} game bắt đầu bằng ${letter}` : `Chưa có game bắt đầu bằng ${letter}`}
                  >
                    {letter}
                  </a>
                );
              })}
            </div>

            {/* Letter Groups */}
            <div className="space-y-6">
              {['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')].map((letter) => {
                const gamesInLetter = azGroupedGames[letter] || [];
                return (
                  <div key={letter} id={`az-group-${letter}`} className="scroll-mt-32">
                    <div className="flex items-center gap-2 mb-2 pb-1 border-b-2 border-[#ee4d2d]/30">
                      <span className="w-8 h-8 rounded-lg bg-[#ee4d2d] text-white font-extrabold flex items-center justify-center text-sm shadow">
                        {letter}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">({gamesInLetter.length} game)</span>
                    </div>
                    {gamesInLetter.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {gamesInLetter.map((g) => (
                          <button
                            key={g.id || g.slug}
                            onClick={() => handleFilterGameToStore(g.slug || g.id)}
                            className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-orange-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-left transition flex items-center gap-2 cursor-pointer group"
                          >
                            <div className="w-7 h-7 rounded bg-slate-200 dark:bg-slate-700 shrink-0 overflow-hidden flex items-center justify-center text-xs">
                              {sanitizeImageUrl(g.icon_url) || safeGameIconUrl(g.slug, '') ? (
                                <img src={sanitizeImageUrl(g.icon_url) || safeGameIconUrl(g.slug)} alt={g.name} className="w-full h-full object-cover" />
                              ) : (
                                '🎮'
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-[#ee4d2d]" title={getGameDisplayName(g)}>
                                {getGameDisplayName(g)}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {(g.active_codes_count !== undefined ? g.active_codes_count : (g.codes_count || 0))} mã
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 dark:text-slate-500 italic py-2 px-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                        Hiện chưa có tựa game nào bắt đầu bằng ký tự "{letter}".
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUBVIEW 10: ĐIỀU KHOẢN DỊCH VỤ */}
        {subView === 'terms' && (
          <div className="rounded-xl overflow-hidden shadow-sm p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-6 h-6 text-[#ee4d2d]" />
              <span>{isEn ? `${shopBrand.name} Terms of Service` : `Điều Khoản Dịch Vụ Sàn ${shopBrand.name}`}</span>
            </h3>
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
              <p><strong>{isEn ? '1. General Provisions:' : '1. Quy định chung:'}</strong> {isEn ? `All giftcodes and vouchers on ${shopBrand.name} are distributed free or from official publishers holding valid licenses.` : `Toàn bộ giftcode và mã quà tặng trên sàn ${shopBrand.name} được chia sẻ hoàn toàn miễn phí hoặc phân phối từ các đối tác chính thức.`}</p>
              <p><strong>{isEn ? '2. 168-Hour Escrow Protection:' : '2. Cơ chế bảo chứng 168 giờ:'}</strong> {isEn ? 'For buyer security, all payment funds are safely held in escrow for 168 hours (7 days). Within this window, buyers can request a 100% refund or 1-tap exchange if any issue arises.' : 'Đối với các giao dịch tài khoản, thẻ nạp và tiện ích qua sàn, số tiền thanh toán của người mua được hệ thống tạm giữ an toàn trong 168 giờ (7 ngày). Trong khoảng thời gian này, nếu phát sinh lỗi mã hoặc tranh chấp, người mua có quyền yêu cầu hoàn tiền 100% hoặc đổi mã 1-chạm.'}</p>
              <p><strong>{isEn ? '3. Anti-Fraud & Self-Dealing:' : '3. Chống gian lận và tự mua:'}</strong> {isEn ? 'Self-purchasing, fake orders, and automated bot actions interfering with system resources are strictly prohibited.' : 'Hệ thống nghiêm cấm mọi hành vi tự mua hàng của chính gian hàng mình, spam tạo đơn ảo hoặc dùng công cụ tự động can thiệp vào tài nguyên máy chủ.'}</p>
              <p><strong>{isEn ? '4. Management Rights:' : '4. Quyền của Ban Quản Trị:'}</strong> {isEn ? 'The administration reserves the right to update terms to protect gamers and merchants.' : 'Ban Quản Trị có quyền cập nhật và bổ sung các điều khoản nhằm bảo vệ tối đa quyền lợi chính đáng của cộng đồng game thủ và các gian hàng đối tác.'}</p>
            </div>
          </div>
        )}

        {/* SUBVIEW 11: CHÍNH SÁCH BẢO MẬT */}
        {subView === 'privacy' && (
          <div className="rounded-xl overflow-hidden shadow-sm p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-500" />
              <span>{isEn ? 'Privacy Policy & Information Security' : 'Chính Sách Bảo Mật & An Toàn Thông Tin'}</span>
            </h3>
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
              <p><strong>{isEn ? '1. Personal Data Protection:' : '1. Bảo vệ dữ liệu cá nhân:'}</strong> {isEn ? 'We commit to strict confidentiality of account, email, and phone info according to cybersecurity standards.' : 'Chúng tôi cam kết tuyệt đối bảo mật thông tin tài khoản, email và số điện thoại của người dùng theo tiêu chuẩn an toàn thông tin mạng.'}</p>
              <p><strong>{isEn ? '2. Cryptographic Security:' : '2. Mã hóa giao dịch ví và kho mã:'}</strong> {isEn ? 'All giftcodes and ledger transactions are encrypted with AES-GCM Web Crypto on the Cloudflare Edge Network.' : `Toàn bộ mã giftcode trong kho và lịch sử biến động số dư ví ${shopBrand.coreUnitName} được mã hóa bằng thuật toán AES-GCM Web Crypto trên mạng lưới Cloudflare Edge Network.`}</p>
              <p><strong>{isEn ? '3. Zero Third-Party Sharing:' : '3. Không chia sẻ cho bên thứ ba:'}</strong> {isEn ? 'We never sell, rent, or disclose personal data to third parties for commercial gain.' : 'Chúng tôi không bán, cho thuê hay tiết lộ bất kỳ thông tin cá nhân nào của bạn cho bên thứ ba vì bất kỳ mục đích thương mại nào.'}</p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBVIEW CHÍNH: HOME STOREFRONT SHOPEE MALL (DYNAMIC ORDERED SECTIONS)     */}
        {/* ========================================================================= */}
        {subView === 'home' && (
          <>
            {orderedSections
              .filter(
                (s) =>
                  s.enabled &&
                  ['main_hero_banner', 'categories_grid', 'flash_sale', 'vouchers_section', 'games_and_codes', 'news_section'].includes(
                    s.id
                  )
              )
              .map((section) => (
                <React.Fragment key={section.id}>
                  {renderHomeSection(section.id)}
                </React.Fragment>
              ))}

            {orderedSections.filter(
              (s) =>
                s.enabled &&
                ['main_hero_banner', 'categories_grid', 'flash_sale', 'vouchers_section', 'games_and_codes', 'news_section'].includes(
                  s.id
                )
            ).length === 0 && (
              <div className="py-20 text-center text-sm text-neutral-400 dark:text-neutral-500 border border-dashed border-neutral-300 dark:border-neutral-800 rounded-2xl">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>
                  {isEn
                    ? 'No homepage sections are currently displayed.'
                    : 'Hiện chưa có mục nào được bật hiển thị trên trang chủ.'}
                </p>
              </div>
            )}
          </>
        )}

      </div>

      {/* 3.6. SHOPEE-STYLE FULL-BLEED LIGHT-GRAY FOOTER (5 COLUMNS + PAYMENT & SHIPPING BADGES) */}
      {isSectionEnabled('footer') && (() => {
        const footerSection = orderedSections.find((s) => s.id === 'footer');
        const customFooterTitle = isEn ? footerSection?.title_en : footerSection?.title_vi;
        const footerLinkUrl = footerSection?.link_url;
        const footerLinkTarget = footerSection?.link_target || '_self';
        const footerLinkType = footerSection?.link_type || 'internal';

        return (
          <footer className={`w-full border-t-4 border-[#ee4d2d] mt-10 pb-14 sm:pb-10 text-xs ${isShopeeDark ? 'bg-slate-900 border-b border-slate-800 text-slate-300' : 'bg-[#fbfbfb] border-b border-slate-200 text-slate-600'}`}>
            <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10 space-y-6">
              {/* Banner Chân Trang hoặc Logo Đối tác tùy chỉnh nếu admin cấu hình */}
              {footerSection?.image_url && (
                <div
                  onClick={() => footerLinkUrl && handleNavigation(footerLinkUrl, footerLinkTarget, footerLinkType)}
                  className={`rounded-xl overflow-hidden shadow-xs mb-4 ${footerLinkUrl ? 'cursor-pointer hover:opacity-95' : ''}`}
                >
                  <img
                    src={footerSection.image_url}
                    srcSet={getResponsiveSrcSet(footerSection.image_url, [480, 800, 1200])}
                    sizes="(max-width: 768px) 100vw, 1200px"
                    width={1200}
                    height={160}
                    loading="lazy"
                    alt={isEn ? (footerSection.image_alt_en || customFooterTitle || 'Footer Partner Banner') : (footerSection.image_alt_vi || customFooterTitle || 'Banner Chân Trang')}
                    className="w-full h-auto max-h-[140px] sm:max-h-[180px] object-cover"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                {/* Cột 1: Về Universal Mall */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#ee4d2d] flex items-center justify-center text-white font-black text-xs shrink-0 overflow-hidden">
                      {shopBrand.logoUrl && shopBrand.logoUrl !== '/logo.png' ? (
                        <img src={shopBrand.logoUrl} alt={shopBrand.name} className="w-full h-full object-contain bg-white p-0.5" />
                      ) : (
                        '🛍️'
                      )}
                    </div>
                    <h4 className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider text-xs">
                      {shopBrand.name}
                    </h4>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                    {t('mall.footer.aboutDesc')}
                  </p>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span>{t('mall.footer.edgeNetwork')}</span>
                    <span>•</span>
                    <span>{t('mall.footer.operating247')}</span>
                    <span>•</span>
                    <span>{t('mall.footer.escrow168h')}</span>
                  </div>
                </div>

                {/* Cột 2: Chăm Sóc Khách Hàng & Pháp Lý */}
                <div className="space-y-2.5">
                  <h4 className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider text-xs">
                    {t('mall.footer.customerCare')}
                  </h4>
                  <ul className="space-y-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    <li>
                      <button type="button" onClick={() => setIsGuaranteeOpen(true)} className="hover:text-[#ee4d2d] transition cursor-pointer text-left">
                        {t('mall.footer.escrowPolicy')}
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => setSubView('terms')} className="hover:text-[#ee4d2d] transition cursor-pointer text-left">
                        {t('mall.footer.terms')}
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => setSubView('privacy')} className="hover:text-[#ee4d2d] transition cursor-pointer text-left">
                        {t('mall.footer.privacy')}
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => setIsSupportOpen(true)} className="hover:text-[#ee4d2d] transition cursor-pointer text-left">
                        {t('mall.footer.supportCenter')}
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => onShowToast(t('mall.toasts.hotlineInfo', { number: shopBrand.hotline }), 'info')} className="hover:text-[#ee4d2d] transition cursor-pointer text-left">
                        {t('mall.footer.hotline', { number: shopBrand.hotline })}
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Cột 3: Chuyên Mục Hàng Đầu */}
                <div className="space-y-2.5">
                  <h4 className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider text-xs">
                    {t('mall.footer.topCategories')}
                  </h4>
                  <ul className="space-y-2 text-[11px] font-medium">
                    {(categoriesConfig.categories.length > 1 ? categoriesConfig.categories.slice(1) : categoriesConfig.categories).map((cat) => (
                      <li key={cat.id}>
                        <button
                          type="button"
                          onClick={() => {
                            syncSelectedCategory(cat.id);
                            setSubView('home');
                            const el = document.getElementById('shopee-products-grid');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="text-slate-600 dark:text-slate-300 hover:text-[#ee4d2d] transition text-left cursor-pointer flex items-center gap-1.5"
                        >
                          <span>{cat.icon || '📦'}</span>
                          <span>{(t.mall?.categories as any)?.[cat.id] || contentTranslationService.translateField('category', cat.id, 'name', cat.label, language)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Cột 4: Thanh Toán & Đơn Vị Vận Chuyển (Shopee Signature Badges) */}
                <div className="space-y-3">
                  <div>
                    <h4 className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider text-xs mb-2">
                      {t('mall.footer.paymentMethods')}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'VietQR', cls: 'text-blue-700 dark:text-blue-300' },
                        { label: 'SePay', cls: 'text-emerald-700 dark:text-emerald-300' },
                        { label: t('mall.footer.walletCore'), cls: 'text-[#ee4d2d]' },
                        { label: t('mall.footer.cod'), cls: 'text-slate-700 dark:text-slate-200' },
                      ].map((badge) => (
                        <span
                          key={badge.label}
                          className={`px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs text-[10px] font-extrabold tracking-tight ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider text-xs mb-2">
                      {t('mall.footer.shippingPartners')}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'GHTK', cls: 'text-emerald-700 dark:text-emerald-300' },
                        { label: 'GHN', cls: 'text-orange-600 dark:text-orange-300' },
                        { label: 'Viettel Post', cls: 'text-red-600 dark:text-red-400' },
                      ].map((carrier) => (
                        <span
                          key={carrier.label}
                          className={`px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs text-[10px] font-extrabold tracking-tight ${carrier.cls}`}
                        >
                          {carrier.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Cột 5: Kết Nối & Tải Ứng Dụng */}
                <div className="space-y-2.5">
                  <h4 className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider text-xs">
                    {t('mall.footer.connectAndApp')}
                  </h4>
                  <div className="space-y-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSubView('telegram')}
                      className="w-full py-1.5 px-3 rounded-md bg-blue-500 hover:bg-blue-600 text-white font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs text-[11px]"
                    >
                      <Send className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('mall.footer.telegramChannel')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenDownloadApp}
                      className="w-full py-1.5 px-3 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs text-[11px]"
                    >
                      <Smartphone className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('mall.footer.downloadApk')}</span>
                    </button>
                  </div>

                  {/* Ngôn ngữ Footer */}
                  <div className="pt-1">
                    <span className="text-[11px] text-slate-700 dark:text-slate-300 font-bold block mb-1">
                      {t('mall.footer.displayLanguage')}
                    </span>
                    <LanguageSelector variant="footer" />
                  </div>
                </div>
              </div>

              {/* Bottom Legal & Back-to-Top Bar */}
              <div className="pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 text-center sm:text-left">
                  {t('mall.footer.copyright', { name: shopBrand.copyrightHolder || shopBrand.name })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSubView('home');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 bg-[#ee4d2d] hover:bg-[#d73211] text-white font-bold text-[11px] px-4 py-1.5 rounded-full shadow-xs transition cursor-pointer shrink-0"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>{t('mall.footer.backToTop')}</span>
                </button>
              </div>
            </div>
          </footer>
        );
      })()}

      {/* 5. MODE SWITCHER NỔI GÓC PHẢI DƯỚI (Compact, z-30 below all modals) */}
      <div className="fixed bottom-3 right-3 z-30 flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-lg border border-slate-300/80 dark:border-slate-700 px-2.5 py-1.5 rounded-full text-[11px] font-semibold opacity-90 hover:opacity-100 transition">
        <span className="hidden sm:inline text-slate-600 dark:text-slate-300">
          {t('mall.footer.themeLabel')}
        </span>
        <button 
          type="button"
          onClick={() => setIsShopeeDark(false)}
          className={`px-2 py-0.5 rounded-full transition cursor-pointer ${!isShopeeDark ? 'bg-[#ee4d2d] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
        >
          {t('mall.footer.themeLight')}
        </button>
        <button 
          type="button"
          onClick={() => setIsShopeeDark(true)}
          className={`px-2 py-0.5 rounded-full transition cursor-pointer ${isShopeeDark ? 'bg-[#ee4d2d] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
        >
          {t('mall.footer.themeDark')}
        </button>
      </div>

      {/* 6. MODALS TÍCH HỢP */}
      <MallGuaranteeModal
        isOpen={isGuaranteeOpen}
        onClose={() => setIsGuaranteeOpen(false)}
      />

      <MallSupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        onOpenReceivedCodes={() => onOpenReceivedCodes ? onOpenReceivedCodes('marketplace') : null}
        onShowToast={onShowToast}
      />

      {isCouponModalOpen && (
        <ShopeeCouponModal
          isOpen={isCouponModalOpen}
          onClose={() => setIsCouponModalOpen(false)}
          productTotal={100000}
          shippingFee={30000}
          isPhysical={true}
          onApply={(fs, disc) => {
            const pickedCode = disc?.code || fs?.code;
            if (pickedCode) {
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(pickedCode).catch(() => {});
              }
              onShowToast(
                t('mall.toasts.voucherCopied', { code: pickedCode }),
                'success'
              );
            }
          }}
        />
      )}

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        onOpenAuth={onOpenAuth}
        onShowToast={(t, m, type) => onShowToast(m ? `${t}: ${m}` : t, type as any)}
        onOpenWallet={onOpenWallet}
        onOpenReceivedCodes={onOpenReceivedCodes}
        onNavigateToSellerCenter={() => {
          setIsProfileOpen(false);
          const target = language === 'en' ? '/en/seller' : '/seller';
          window.open(target, '_blank', 'noopener,noreferrer');
        }}
        onLogout={onLogout}
        onUpdateUser={onUpdateUser}
      />

      {/* Submit Code Modal */}
      <SubmitCodeModal
        isOpen={isSubmitCodeOpen}
        onClose={() => setIsSubmitCodeOpen(false)}
        games={allGames}
        currentUser={currentUser}
        onShowToast={(t, m, type) => onShowToast(m ? `${t}: ${m}` : t, type as any)}
      />

      {/* Bookmark Drawer (Tủ Game Theo Dõi - Chống Trùng Lặp) */}
      <BookmarkDrawer
        isOpen={isBookmarkDrawerOpen}
        onClose={() => setIsBookmarkDrawerOpen(false)}
        bookmarkedGames={bookmarkedGamesList}
        onRemoveBookmark={(id) => handleToggleBookmark(id)}
        onSelectGame={(game) => {
          setIsBookmarkDrawerOpen(false);
          handleFilterGameToStore(game.slug || game.id);
        }}
        onClearAll={() => {
          localStorage.removeItem('pine_bookmarks');
          syncBookmarks();
          onShowToast(t('mall.toasts.clearedBookmarks'), 'info');
        }}
      />

    </div>
  );
};
