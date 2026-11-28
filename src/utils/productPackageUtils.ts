import viLocale from '../locales/vi.json';
import enLocale from '../locales/en.json';
import type {
  StoreProduct,
  UtilityProduct,
  ProductPackageVariant,
  GiveawayCampaign,
  GiveawayRewardPackage,
} from '../types/game';

type ProductPackageLocaleKey = keyof typeof viLocale.productPackage;

function isEnglishActive(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const path = window.location.pathname.toLowerCase();
      if (path === '/en' || path.startsWith('/en/')) return true;
      const params = new URLSearchParams(window.location.search);
      const qLang = params.get('lang')?.toLowerCase();
      if (qLang === 'en') return true;
      if (qLang === 'vi') return false;
      if (path === '/vi' || path.startsWith('/vi/')) return false;
      if (localStorage.getItem('pine_language') === 'en') return true;
    } catch {}
  }
  if (typeof document !== 'undefined' && document.documentElement?.lang === 'en') {
    return true;
  }
  return false;
}

function pkgText(key: ProductPackageLocaleKey, params?: Record<string, string | number>): string {
  const dict = isEnglishActive() ? enLocale.productPackage : viLocale.productPackage;
  const raw = dict[key] || viLocale.productPackage[key] || key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, k) => (params[k] !== undefined ? String(params[k]) : match));
}

const KNOWN_DEFAULT_NOTE_KEYS: Array<{
  key: ProductPackageLocaleKey;
  aliases: string[];
}> = [
  { key: 'standardProcessing', aliases: ['xử lý tiêu chuẩn', 'standard processing'] },
  { key: 'official', aliases: ['chính hãng', 'official'] },
  { key: 'forAllMembers', aliases: ['dành cho tất cả thành viên', 'for all members'] },
  { key: 'gameTopupPack', aliases: ['gói nạp game', 'game top-up pack', 'pack'] },
  { key: 'instantAccountDelivery', aliases: ['giao tài khoản tự động trong 0 giây', 'instant 0s account delivery'] },
  { key: 'forMembers', aliases: ['dành cho thành viên', 'for members'] },
];

export function localizePackageNote(note?: string): string | undefined {
  if (!note) return note;
  const norm = note.trim().toLowerCase();
  for (const entry of KNOWN_DEFAULT_NOTE_KEYS) {
    if (entry.aliases.includes(norm)) {
      return pkgText(entry.key);
    }
  }
  return note;
}

/**
 * Lấy danh sách các gói con của một sản phẩm (StoreProduct hoặc UtilityProduct).
 * Nếu sản phẩm chưa có mảng `packages`, tự động tạo một gói mặc định tương thích ngược 100%.
 */
export function getProductPackages(product: StoreProduct | UtilityProduct): ProductPackageVariant[] {
  if (!product) return [];

  if (Array.isArray(product.packages) && product.packages.length > 0) {
    return product.packages.map((pkg) => ({
      ...pkg,
      note: localizePackageNote(pkg.note),
      first_purchase_enabled: pkg.first_purchase_enabled !== undefined ? pkg.first_purchase_enabled : (product as any).first_purchase_enabled,
      first_purchase_price: pkg.first_purchase_price !== undefined ? pkg.first_purchase_price : (product as any).first_purchase_price,
      first_purchase_max_price: pkg.first_purchase_max_price !== undefined ? pkg.first_purchase_max_price : (product as any).first_purchase_max_price,
    }));
  }

  // Tương thích đa ngành: Chuyển đổi các biến thể (variants: Size, Màu sắc, Dung lượng...) thành packages
  if (Array.isArray((product as any).variants) && (product as any).variants.length > 0) {
    return (product as any).variants.map((v: any, idx: number) => {
      const resolvedPrice = Number(v.price ?? v.price_core ?? product.current_price ?? 0);
      return {
        id: v.id || `${product.id}_var_${idx + 1}`,
        name: v.name,
        price: resolvedPrice,
        original_price: Number(v.original_price ?? v.original_price_core ?? resolvedPrice),
        stock_quantity: v.stock_quantity ?? product.stock_quantity ?? 0,
        sold_count: v.sold_count || 0,
        badge: v.attributes ? Object.values(v.attributes).join(' / ') : undefined,
        note: v.sku ? `SKU: ${v.sku}` : pkgText('official'),
        description: product.description,
        is_active: v.is_active !== false,
        sale_mode: 'normal',
        first_purchase_enabled: (product as any).first_purchase_enabled,
        first_purchase_price: (product as any).first_purchase_price,
        first_purchase_max_price: (product as any).first_purchase_max_price,
      };
    });
  }

  // Fallback 100% cho sản phẩm cũ đơn gói
  return [
    {
      id: product.id,
      name: product.title,
      price: product.current_price || 0,
      original_price: product.original_price || product.current_price || 0,
      stock_quantity: typeof product.stock_quantity === 'number' ? product.stock_quantity : 0,
      sold_count: product.sold_count || 0,
      badge: (product as any).badge || undefined,
      note: pkgText('standardProcessing'),
      description: product.description,
      is_active: product.is_active !== false,
      sale_mode: (product as any).sale_mode || 'normal',
      escalating_base_price: (product as any).escalating_base_price,
      escalating_step: (product as any).escalating_step,
      escalating_max_price: (product as any).escalating_max_price,
      escalating_completed_count: (product as any).escalating_completed_count,
      escalating_current_price: (product as any).escalating_current_price,
      escalating_next_price: (product as any).escalating_next_price,
      first_purchase_enabled: (product as any).first_purchase_enabled,
      first_purchase_price: (product as any).first_purchase_price,
      first_purchase_max_price: (product as any).first_purchase_max_price,
    },
  ];
}

/**
 * Lấy mức giá thấp nhất của sản phẩm từ các gói con
 */
export function getProductMinPrice(product: StoreProduct | UtilityProduct): number {
  if (!product) return 0;
  const packages = getProductPackages(product);
  if (packages.length === 0) return product.current_price || 0;
  return Math.min(
    ...packages.map((p) =>
      p.sale_mode === 'escalating'
        ? (p.escalating_current_price ?? p.escalating_base_price ?? p.price)
        : p.price
    )
  );
}

/**
 * Lấy mức giá cao nhất của sản phẩm từ các gói con
 */
export function getProductMaxPrice(product: StoreProduct | UtilityProduct): number {
  if (!product) return 0;
  const packages = getProductPackages(product);
  if (packages.length === 0) return product.current_price || 0;
  return Math.max(...packages.map((p) => p.price));
}

/**
 * Lấy tổng tồn kho thực tế từ tất cả các gói con
 */
export function getProductTotalStock(product: StoreProduct | UtilityProduct): number {
  if (!product) return 0;
  const packages = getProductPackages(product);
  if (!product.packages || product.packages.length === 0) {
    return typeof product.stock_quantity === 'number' ? product.stock_quantity : 0;
  }
  return packages.reduce((sum, pkg) => sum + (Number(pkg.stock_quantity) || 0), 0);
}

/**
 * Lấy tổng số lượng đã bán từ tất cả các gói con
 */
export function getProductTotalSold(product: StoreProduct | UtilityProduct): number {
  if (!product) return 0;
  if (!product.packages || product.packages.length === 0) {
    return Number(product.sold_count) || 0;
  }
  const packages = getProductPackages(product);
  return packages.reduce((sum, pkg) => sum + (Number(pkg.sold_count) || 0), 0);
}

/**
 * Lấy danh sách các gói quà tặng của một chiến dịch Giveaway.
 * Nếu chưa có packages, fallback gói chính từ campaign.
 */
export function getGiveawayPackages(campaign: GiveawayCampaign): GiveawayRewardPackage[] {
  if (!campaign) return [];

  if (Array.isArray(campaign.packages) && campaign.packages.length > 0) {
    return campaign.packages.map((pkg) => ({
      ...pkg,
      note: localizePackageNote(pkg.note),
    }));
  }

  // Fallback gói mặc định
  const poolCount =
    Array.isArray(campaign.codes_pool)
      ? campaign.codes_pool.length
      : (typeof campaign.remaining_codes === 'number' ? campaign.remaining_codes : 0);

  return [
    {
      id: campaign.id,
      name: campaign.title || pkgText('defaultGiftcode'),
      rewards: campaign.rewards || pkgText('exclusiveGiftcode'),
      total_codes: campaign.total_codes || 0,
      claimed_codes: campaign.claimed_codes || 0,
      remaining_codes: poolCount,
      codes_pool: campaign.codes_pool || [],
      is_active: !(campaign.is_active === false || campaign.is_active === 0 || campaign.is_active === '0' || campaign.status === 'PAUSED'),
      note: pkgText('forAllMembers'),
    },
  ];
}

/**
 * Gom nhóm sản phẩm Store theo cùng Tựa Game (game_slug)
 * Giúp mỗi game chỉ hiển thị 1 thẻ đại diện ngoài sàn,
 * khi ấn vào mở modal chọn các gói nạp tương ứng.
 */
export function groupStoreProductsByGame(products: StoreProduct[]): StoreProduct[] {
  if (!Array.isArray(products) || products.length === 0) return [];

  const gameMap = new Map<string, StoreProduct[]>();
  const results: StoreProduct[] = [];

  for (const prod of products) {
    // Nếu sản phẩm đã có mảng packages riêng (đã là sản phẩm cha), giữ nguyên
    if (Array.isArray(prod.packages) && prod.packages.length > 1) {
      results.push(prod);
      continue;
    }

    const key = prod.game_slug ? prod.game_slug.toLowerCase().trim() : prod.id;
    if (!gameMap.has(key)) {
      gameMap.set(key, []);
    }
    gameMap.get(key)!.push(prod);
  }

  for (const [, list] of gameMap.entries()) {
    if (list.length === 1) {
      results.push(list[0]);
    } else {
      // Gộp nhiều sản phẩm cùng game thành 1 sản phẩm cha
      const lead = list[0];
      const packages: ProductPackageVariant[] = list.map((item) => ({
        id: item.id,
        name: item.title,
        price: item.current_price,
        original_price: item.original_price,
        stock_quantity: item.stock_quantity,
        sold_count: item.sold_count || 0,
        virtual_sold_count: item.virtual_sold_count || 0,
        badge: item.badge,
        note: localizePackageNote(item.package_type) || pkgText('gameTopupPack'),
        description: item.description,
        is_active: item.is_active !== false,
        sale_mode: item.sale_mode || 'normal',
        escalating_base_price: item.escalating_base_price,
        escalating_step: item.escalating_step,
        escalating_max_price: item.escalating_max_price,
        escalating_completed_count: item.escalating_completed_count,
        escalating_current_price: item.escalating_current_price,
        escalating_next_price: item.escalating_next_price,
        first_purchase_enabled: item.first_purchase_enabled,
        first_purchase_price: item.first_purchase_price,
        first_purchase_max_price: item.first_purchase_max_price,
      }));

      const totalStock = packages.reduce((sum, p) => sum + (Number(p.stock_quantity) || 0), 0);
      const totalSold = packages.reduce((sum, p) => sum + (Number(p.sold_count) || 0), 0);
      const totalVirtualSold = list.reduce((sum, p) => sum + (Number(p.virtual_sold_count) || 0), 0);
      const minPrice = Math.min(
        ...packages.map((p) =>
          p.sale_mode === 'escalating'
            ? (p.escalating_current_price ?? p.escalating_base_price ?? p.price)
            : p.price
        )
      );

      const parentProduct: StoreProduct = {
        ...lead,
        id: lead.id,
        title: pkgText('parentStoreTitle', { name: lead.game_name }),
        current_price: minPrice,
        stock_quantity: totalStock,
        sold_count: totalSold,
        virtual_sold_count: totalVirtualSold,
        packages,
      };

      results.push(parentProduct);
    }
  }

  return results;
}

/**
 * Gom nhóm sản phẩm Tiện Ích theo cùng Chủ Đề / Dịch Vụ
 * Ví dụ: gom các gói Basic (1D, 7D, 30D), VIP (1D, 7D, 30D)... của VS Phone
 * thành các sản phẩm đại diện có danh sách gói tùy chọn.
 */
export function groupUtilitiesByTheme(utilities: UtilityProduct[]): UtilityProduct[] {
  if (!Array.isArray(utilities) || utilities.length === 0) return [];

  // Map theo prefix định danh của gói
  const vsPrefixMap: Record<string, string> = {
    'ut_vs_01_basic': 'vs_basic',
    'ut_vs_02_basic': 'vs_basic',
    'ut_vs_03_basic': 'vs_basic',
    'ut_vs_04_vip': 'vs_vip',
    'ut_vs_05_vip': 'vs_vip',
    'ut_vs_06_vip': 'vs_vip',
    'ut_vs_07_kvip': 'vs_kvip',
    'ut_vs_08_kvip': 'vs_kvip',
    'ut_vs_09_kvip': 'vs_kvip',
    'ut_vs_10_svip': 'vs_svip',
    'ut_vs_11_svip': 'vs_svip',
    'ut_vs_12_svip': 'vs_svip',
    'ut_vs_13_xvip': 'vs_xvip',
    'ut_vs_14_xvip': 'vs_xvip',
    'ut_vs_15_xvip': 'vs_xvip',
    'ut_vs_16_mvip': 'vs_mvip',
    'ut_vs_17_mvip': 'vs_mvip',
    'ut_vs_18_mvip': 'vs_mvip',
  };

  const groupThemeMeta: Record<
    string,
    { title: string; badge: string; description: string }
  > = {
    vs_basic: {
      title: pkgText('vsBasicTitle'),
      badge: pkgText('vsBasicBadge'),
      description: pkgText('vsBasicDesc'),
    },
    vs_vip: {
      title: pkgText('vsVipTitle'),
      badge: pkgText('vsVipBadge'),
      description: pkgText('vsVipDesc'),
    },
    vs_kvip: {
      title: pkgText('vsKvipTitle'),
      badge: pkgText('vsKvipBadge'),
      description: pkgText('vsKvipDesc'),
    },
    vs_svip: {
      title: pkgText('vsSvipTitle'),
      badge: pkgText('vsSvipBadge'),
      description: pkgText('vsSvipDesc'),
    },
    vs_xvip: {
      title: pkgText('vsXvipTitle'),
      badge: pkgText('vsXvipBadge'),
      description: pkgText('vsXvipDesc'),
    },
    vs_mvip: {
      title: pkgText('vsMvipTitle'),
      badge: pkgText('vsMvipBadge'),
      description: pkgText('vsMvipDesc'),
    },
  };

  const themeGroups = new Map<string, UtilityProduct[]>();
  const independentItems: UtilityProduct[] = [];

  for (const item of utilities) {
    // Nếu sản phẩm đã có mảng packages riêng (như Dịch vụ Facebook...), giữ nguyên
    if (Array.isArray(item.packages) && item.packages.length > 1) {
      independentItems.push(item);
      continue;
    }

    // Kiểm tra tiền tố VS Phone
    let matchedGroup: string | null = null;
    for (const [prefix, groupKey] of Object.entries(vsPrefixMap)) {
      if (item.id.startsWith(prefix)) {
        matchedGroup = groupKey;
        break;
      }
    }

    if (matchedGroup) {
      if (!themeGroups.has(matchedGroup)) {
        themeGroups.set(matchedGroup, []);
      }
      themeGroups.get(matchedGroup)!.push(item);
    } else {
      independentItems.push(item);
    }
  }

  const results: UtilityProduct[] = [...independentItems];

  // Tạo sản phẩm đại diện cho từng nhóm VS Phone
  for (const [groupKey, list] of themeGroups.entries()) {
    const lead = list[0];
    const meta = groupThemeMeta[groupKey] || {
      title: lead.title,
      badge: lead.badge || 'HOT',
      description: lead.description,
    };

    const packages: ProductPackageVariant[] = list.map((subItem) => {
      // Trích xuất tên gói thời hạn (1 Ngày, 7 Ngày, 30 Ngày)
      let durationName = subItem.title;
      if (subItem.title.includes('1 Day')) durationName = pkgText('plan1Day');
      else if (subItem.title.includes('7 Days')) durationName = pkgText('plan7Days');
      else if (subItem.title.includes('30 Days')) durationName = pkgText('plan30Days');

      return {
        id: subItem.id,
        name: durationName,
        price: subItem.current_price,
        original_price: subItem.original_price,
        stock_quantity: subItem.stock_quantity,
        sold_count: subItem.sold_count || 0,
        virtual_sold_count: subItem.virtual_sold_count || 0,
        badge: subItem.badge,
        note: pkgText('instantAccountDelivery'),
        description: subItem.description,
        is_active: subItem.is_active !== false,
        sale_mode: subItem.sale_mode || 'normal',
        first_purchase_enabled: subItem.first_purchase_enabled,
        first_purchase_price: subItem.first_purchase_price,
        first_purchase_max_price: subItem.first_purchase_max_price,
      };
    });

    const totalStock = packages.reduce((sum, p) => sum + (Number(p.stock_quantity) || 0), 0);
    const totalSold = packages.reduce((sum, p) => sum + (Number(p.sold_count) || 0), 0);
    const totalVirtualSold = list.reduce((sum, p) => sum + (Number(p.virtual_sold_count) || 0), 0);
    const minPrice = Math.min(...packages.map((p) => p.price));

    const parentUtility: UtilityProduct = {
      ...lead,
      id: lead.id,
      title: meta.title,
      badge: meta.badge,
      description: meta.description || lead.description,
      current_price: minPrice,
      stock_quantity: totalStock,
      sold_count: totalSold,
      virtual_sold_count: totalVirtualSold,
      packages,
    };

    results.push(parentUtility);
  }

  return results;
}

/**
 * Gom nhóm các chiến dịch Giveaway cùng 1 tựa game
 * Giúp mỗi game chỉ hiện 1 sự kiện quà tặng đại diện,
 * bên trong chứa các gói quà tặng khác nhau (Tân thủ, Tuần, Tri ân...).
 */
export function groupGiveawaysByGame(campaigns: GiveawayCampaign[]): GiveawayCampaign[] {
  if (!Array.isArray(campaigns) || campaigns.length === 0) return [];

  const gameMap = new Map<string, GiveawayCampaign[]>();
  const results: GiveawayCampaign[] = [];

  for (const camp of campaigns) {
    if (Array.isArray(camp.packages) && camp.packages.length > 1) {
      results.push(camp);
      continue;
    }

    const key = camp.game_slug ? camp.game_slug.toLowerCase().trim() : camp.id;
    if (!gameMap.has(key)) {
      gameMap.set(key, []);
    }
    gameMap.get(key)!.push(camp);
  }

  for (const [, list] of gameMap.entries()) {
    if (list.length === 1) {
      results.push(list[0]);
    } else {
      const lead = list[0];
      const packages: GiveawayRewardPackage[] = list.map((item, idx) => ({
        id: item.id,
        name: item.title || pkgText('giftPackageIndexed', { index: idx + 1 }),
        rewards: item.rewards,
        total_codes: item.total_codes || 0,
        claimed_codes: item.claimed_codes || 0,
        remaining_codes:
          Array.isArray(item.codes_pool) && item.codes_pool.length > 0
            ? item.codes_pool.length
            : (typeof item.remaining_codes === 'number' ? item.remaining_codes : 0),
        codes_pool: item.codes_pool || [],
        is_active: !(item.is_active === false || item.is_active === 0 || item.is_active === '0' || item.status === 'PAUSED'),
        note: pkgText('forMembers'),
      }));

      const totalPool = packages.reduce((sum, p) => sum + (Number(p.remaining_codes) || 0), 0);
      const totalClaimed = packages.reduce((sum, p) => sum + (Number(p.claimed_codes) || 0), 0);
      const totalVirtualClaimed = list.reduce((sum, p) => sum + (Number(p.virtual_claimed_offset) || 0), 0);
      const isLeadActive = !(lead.is_active === false || lead.is_active === 0 || lead.is_active === '0' || lead.status === 'PAUSED');
      const anyPkgActive = packages.some((p) => p.is_active);
      const isGroupActive = isLeadActive && anyPkgActive;

      const parentCampaign: GiveawayCampaign = {
        ...lead,
        id: lead.id,
        title: pkgText('exclusiveCodeTitle', { name: lead.game_name }),
        is_active: isGroupActive,
        status: isGroupActive ? 'ACTIVE' : 'PAUSED',
        remaining_codes: isGroupActive ? totalPool : 0,
        claimed_codes: totalClaimed,
        virtual_claimed_offset: totalVirtualClaimed,
        total_codes: totalPool + totalClaimed,
        packages,
      };

      results.push(parentCampaign);
    }
  }

  return results;
}
