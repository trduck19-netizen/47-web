/**
 * Cloudflare Edge Search Service
 * Tìm kiếm và lọc sản phẩm & game trực tiếp trên CSDL D1 theo chuẩn Universal Mall.
 */

export interface SearchQueryParams {
  q?: string;
  type?: 'all' | 'products' | 'games';
  category?: string;
  sellerId?: string;
  productType?: 'digital' | 'physical';
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  sort?: 'popular' | 'price_asc' | 'price_desc' | 'rating' | 'newest';
  page?: number;
  limit?: number;
}

export interface SearchResultItem {
  id: string;
  title: string;
  slug?: string;
  gameSlug?: string;
  gameName?: string;
  priceCore: number;
  originalPrice?: number;
  discountPercent?: number;
  productType?: string;
  coverUrl?: string;
  sellerId?: string;
  sellerName?: string;
  soldCount?: number;
  rating?: number;
  itemType: 'product' | 'game';
}

export interface SearchResponseData {
  success: boolean;
  query: string;
  results: {
    products: SearchResultItem[];
    games: SearchResultItem[];
  };
  pagination: {
    page: number;
    limit: number;
    totalProducts: number;
    totalGames: number;
    totalPages: number;
  };
}

/**
 * Loại bỏ dấu tiếng Việt để tìm kiếm không dấu
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Thực hiện tìm kiếm và lọc đa tầng trên D1
 */
export async function searchUnified(db: D1Database, params: SearchQueryParams): Promise<SearchResponseData> {
  const rawQ = (params.q || '').trim();
  const searchType = params.type || 'all';
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  const results: { products: SearchResultItem[]; games: SearchResultItem[] } = {
    products: [],
    games: [],
  };

  let totalProducts = 0;
  let totalGames = 0;

  // 1. TÌM KIẾM SẢN PHẨM (STORE_PRODUCTS) & 2. TÌM KIẾM GAME (GAMES) — chạy song song qua Promise.all
  const runProductsSearch = async () => {
    if (!(searchType === 'all' || searchType === 'products')) return;
    const baseConditions: string[] = ["(is_active = 1 OR is_active IS NULL)"];
    const baseBinds: any[] = [];

    if (params.category) {
      baseConditions.push('(category = ? OR category_label LIKE ?)');
      baseBinds.push(params.category, `%${params.category}%`);
    }

    if (params.minPrice !== undefined && params.minPrice > 0) {
      baseConditions.push('current_price >= ?');
      baseBinds.push(params.minPrice);
    }

    if (params.maxPrice !== undefined && params.maxPrice > 0) {
      baseConditions.push('current_price <= ?');
      baseBinds.push(params.maxPrice);
    }

    const whereConditions = [...baseConditions];
    const queryBinds = [...baseBinds];
    const normQ = removeVietnameseTones(rawQ).toLowerCase();
    const slugQ = normQ.replace(/\s+/g, '-');

    if (rawQ) {
      whereConditions.push('(title LIKE ? OR game_name LIKE ? OR game_slug LIKE ? OR description LIKE ? OR game_slug LIKE ?)');
      const likeParam = `%${rawQ}%`;
      const slugParam = `%${slugQ}%`;
      queryBinds.push(likeParam, likeParam, likeParam, likeParam, slugParam);
    }

    const whereClause = whereConditions.join(' AND ');

    // Sắp xếp
    let orderClause = 'ORDER BY created_at DESC';
    if (params.sort === 'price_asc') {
      orderClause = 'ORDER BY current_price ASC';
    } else if (params.sort === 'price_desc') {
      orderClause = 'ORDER BY current_price DESC';
    } else if (params.sort === 'popular') {
      orderClause = 'ORDER BY sold_count DESC, created_at DESC';
    }

    try {
      // Nếu lọc rating > 5 (ví dụ rating=6), mọi sản phẩm tối đa 5 sao đều bị loại ngay lập tức
      if (params.rating !== undefined && params.rating > 5) {
        totalProducts = 0;
        results.products = [];
      } else {
        const ratingVal = params.rating && params.rating > 0 ? params.rating : 0;
        const ratingWhere = ratingVal > 0
          ? ` AND COALESCE((SELECT AVG(pr.rating) FROM product_reviews pr WHERE pr.product_id = store_products.id AND pr.status = 'approved'), 5) >= ?`
          : '';
        const ratingBinds = ratingVal > 0 ? [ratingVal] : [];

        const countRes = await db
          .prepare(`SELECT COUNT(*) as total FROM store_products WHERE ${whereClause}${ratingWhere}`)
          .bind(...queryBinds, ...ratingBinds)
          .first<{ total: number }>();
        totalProducts = countRes?.total || 0;

        if (totalProducts > 0 || !rawQ) {
          const listRes = await db
            .prepare(`
              SELECT id, title, game_slug, game_name, original_price,
                     current_price as price_core,
                     discount_percent,
                     COALESCE(cover_image_url, game_icon_url, '') as cover_url,
                     sold_count,
                     COALESCE((SELECT AVG(pr.rating) FROM product_reviews pr WHERE pr.product_id = store_products.id AND pr.status = 'approved'), 5) as avg_rating
              FROM store_products
              WHERE ${whereClause}${ratingWhere}
              ${orderClause}
              LIMIT ? OFFSET ?
            `)
            .bind(...queryBinds, ...ratingBinds, limit, offset)
            .all<any>();

          const rows = listRes?.results || [];
          results.products = rows.map((r: any) => ({
            id: r.id,
            title: r.title,
            gameSlug: r.game_slug,
            gameName: r.game_name,
            priceCore: r.price_core || 0,
            originalPrice: r.original_price || r.price_core || 0,
            discountPercent: r.discount_percent || 0,
            productType: 'digital' as const,
            coverUrl: r.cover_url || undefined,
            soldCount: r.sold_count || 0,
            rating: Number(Number(r.avg_rating ?? 5).toFixed(1)),
            itemType: 'product' as const,
          }));
        } else {
          // Fallback tìm kiếm tiếng Việt không dấu (vd: "lien quan" khớp "Liên Quân Mobile")
          const baseWhere = baseConditions.join(' AND ');
          const candRes = await db
            .prepare(`
              SELECT id, title, game_slug, game_name, description, original_price,
                     current_price as price_core,
                     discount_percent,
                     COALESCE(cover_image_url, game_icon_url, '') as cover_url,
                     sold_count,
                     COALESCE((SELECT AVG(pr.rating) FROM product_reviews pr WHERE pr.product_id = store_products.id AND pr.status = 'approved'), 5) as avg_rating
              FROM store_products
              WHERE ${baseWhere}${ratingWhere}
              ${orderClause}
              LIMIT 400
            `)
            .bind(...baseBinds, ...ratingBinds)
            .all<any>();

          const matched = (candRes?.results || []).filter((r: any) => {
            const hay = removeVietnameseTones(
              `${r.title || ''} ${r.game_name || ''} ${r.game_slug || ''} ${r.description || ''}`
            ).toLowerCase();
            return hay.includes(normQ) || hay.includes(slugQ);
          });

          totalProducts = matched.length;
          results.products = matched.slice(offset, offset + limit).map((r: any) => ({
            id: r.id,
            title: r.title,
            gameSlug: r.game_slug,
            gameName: r.game_name,
            priceCore: r.price_core || 0,
            originalPrice: r.original_price || r.price_core || 0,
            discountPercent: r.discount_percent || 0,
            productType: 'digital' as const,
            coverUrl: r.cover_url || undefined,
            soldCount: r.sold_count || 0,
            rating: Number(Number(r.avg_rating ?? 5).toFixed(1)),
            itemType: 'product' as const,
          }));
        }
      }
    } catch (err) {
      console.warn('[searchUnified products error]', err);
    }
  };

  // 2. TÌM KIẾM GAME (GAMES)
  const runGamesSearch = async () => {
    if (!(searchType === 'all' || searchType === 'games')) return;
    if (rawQ) {
      try {
        const normQ = removeVietnameseTones(rawQ).toLowerCase();
        const slugQ = normQ.replace(/\s+/g, '-');
        const likeParam = `%${rawQ}%`;
        const slugParam = `%${slugQ}%`;
        const ratingCond = params.rating && params.rating > 0 ? ' AND COALESCE(rating, 5) >= ?' : '';
        const ratingBind = params.rating && params.rating > 0 ? [params.rating] : [];

        const countRes = await db
          .prepare(`SELECT COUNT(*) as total FROM games WHERE (name LIKE ? OR slug LIKE ? OR publisher LIKE ? OR slug LIKE ?)${ratingCond}`)
          .bind(likeParam, likeParam, likeParam, slugParam, ...ratingBind)
          .first<{ total: number }>();
        totalGames = countRes?.total || 0;

        if (totalGames > 0) {
          const gamesRes = await db
            .prepare(`
              SELECT id, slug, name, publisher, icon_url, banner_url, rating
              FROM games
              WHERE (name LIKE ? OR slug LIKE ? OR publisher LIKE ? OR slug LIKE ?)${ratingCond}
              ORDER BY rating DESC
              LIMIT ? OFFSET ?
            `)
            .bind(likeParam, likeParam, likeParam, slugParam, ...ratingBind, limit, offset)
            .all<any>();

          const gRows = gamesRes?.results || [];
          results.games = gRows.map((g: any) => ({
            id: g.id || g.slug,
            title: g.name,
            slug: g.slug,
            gameSlug: g.slug,
            gameName: g.name,
            priceCore: 0,
            coverUrl: g.icon_url || g.banner_url || undefined,
            rating: g.rating || 5,
            itemType: 'game',
          }));
        } else {
          // Fallback tìm kiếm tiếng Việt không dấu cho bảng games
          const candGames = await db
            .prepare(`SELECT id, slug, name, publisher, icon_url, banner_url, rating FROM games WHERE 1=1${ratingCond} ORDER BY rating DESC LIMIT 800`)
            .bind(...ratingBind)
            .all<any>();

          const matchedGames = (candGames?.results || []).filter((g: any) => {
            const hay = removeVietnameseTones(`${g.name || ''} ${g.slug || ''} ${g.publisher || ''}`).toLowerCase();
            return hay.includes(normQ) || hay.includes(slugQ);
          });

          totalGames = matchedGames.length;
          results.games = matchedGames.slice(offset, offset + limit).map((g: any) => ({
            id: g.id || g.slug,
            title: g.name,
            slug: g.slug,
            gameSlug: g.slug,
            gameName: g.name,
            priceCore: 0,
            coverUrl: g.icon_url || g.banner_url || undefined,
            rating: g.rating || 5,
            itemType: 'game',
          }));
        }
      } catch (err) {
        console.warn('[searchUnified games error]', err);
      }
    }
  };

  await Promise.all([runProductsSearch(), runGamesSearch()]);

  const maxTotal = Math.max(totalProducts, totalGames);
  const totalPages = Math.ceil(maxTotal / limit) || 1;

  return {
    success: true,
    query: rawQ,
    results,
    pagination: {
      page,
      limit,
      totalProducts,
      totalGames,
      totalPages,
    },
  };
}
