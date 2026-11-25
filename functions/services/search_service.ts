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

  // 1. TÌM KIẾM SẢN PHẨM (STORE_PRODUCTS)
  if (searchType === 'all' || searchType === 'products') {
    const whereConditions: string[] = ["(status = 'ACTIVE' OR status IS NULL OR status = '')"];
    const queryBinds: any[] = [];

    if (rawQ) {
      whereConditions.push('(title LIKE ? OR game_name LIKE ? OR game_slug LIKE ? OR description LIKE ?)');
      const likeParam = `%${rawQ}%`;
      queryBinds.push(likeParam, likeParam, likeParam, likeParam);
    }

    if (params.category) {
      whereConditions.push('(category_slug = ? OR category_id = ?)');
      queryBinds.push(params.category, params.category);
    }

    if (params.sellerId) {
      whereConditions.push('seller_id = ?');
      queryBinds.push(params.sellerId);
    }

    if (params.productType) {
      whereConditions.push('product_type = ?');
      queryBinds.push(params.productType);
    }

    if (params.minPrice !== undefined && params.minPrice > 0) {
      whereConditions.push('price_core >= ?');
      queryBinds.push(params.minPrice);
    }

    if (params.maxPrice !== undefined && params.maxPrice > 0) {
      whereConditions.push('price_core <= ?');
      queryBinds.push(params.maxPrice);
    }

    const whereClause = whereConditions.join(' AND ');

    // Đếm tổng sản phẩm thỏa điều kiện
    try {
      const countRes = await db
        .prepare(`SELECT COUNT(*) as total FROM store_products WHERE ${whereClause}`)
        .bind(...queryBinds)
        .first<{ total: number }>();
      totalProducts = countRes?.total || 0;
    } catch {
      totalProducts = 0;
    }

    // Sắp xếp
    let orderClause = 'ORDER BY created_at DESC';
    if (params.sort === 'price_asc') {
      orderClause = 'ORDER BY price_core ASC';
    } else if (params.sort === 'price_desc') {
      orderClause = 'ORDER BY price_core DESC';
    } else if (params.sort === 'popular') {
      orderClause = 'ORDER BY sold_count DESC, created_at DESC';
    } else if (params.sort === 'rating') {
      orderClause = 'ORDER BY rating DESC, created_at DESC';
    }

    // Lấy dữ liệu phân trang
    try {
      const listRes = await db
        .prepare(`
          SELECT id, title, game_slug, game_name, original_price, price_core,
                 discount_percent, product_type, cover_url, seller_id, sold_count, rating
          FROM store_products
          WHERE ${whereClause}
          ${orderClause}
          LIMIT ? OFFSET ?
        `)
        .bind(...queryBinds, limit, offset)
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
        productType: r.product_type || 'digital',
        coverUrl: r.cover_url || undefined,
        sellerId: r.seller_id || undefined,
        soldCount: r.sold_count || 0,
        rating: r.rating || 5,
        itemType: 'product',
      }));
    } catch (err) {
      console.warn('[searchUnified products error]', err);
    }
  }

  // 2. TÌM KIẾM GAME (GAMES)
  if (searchType === 'all' || searchType === 'games') {
    if (rawQ) {
      try {
        const likeParam = `%${rawQ}%`;
        const countRes = await db
          .prepare("SELECT COUNT(*) as total FROM games WHERE (name LIKE ? OR slug LIKE ? OR publisher LIKE ?)")
          .bind(likeParam, likeParam, likeParam)
          .first<{ total: number }>();
        totalGames = countRes?.total || 0;

        const gamesRes = await db
          .prepare(`
            SELECT id, slug, name, publisher, icon_url, cover_url, rating
            FROM games
            WHERE (name LIKE ? OR slug LIKE ? OR publisher LIKE ?)
            ORDER BY rating DESC, release_date DESC
            LIMIT ? OFFSET ?
          `)
          .bind(likeParam, likeParam, likeParam, limit, offset)
          .all<any>();

        const gRows = gamesRes?.results || [];
        results.games = gRows.map((g: any) => ({
          id: g.id || g.slug,
          title: g.name,
          slug: g.slug,
          gameSlug: g.slug,
          gameName: g.name,
          priceCore: 0,
          coverUrl: g.icon_url || g.cover_url || undefined,
          rating: g.rating || 5,
          itemType: 'game',
        }));
      } catch (err) {
        console.warn('[searchUnified games error]', err);
      }
    }
  }

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
