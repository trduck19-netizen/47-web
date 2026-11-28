import { getMultipleSettingsD1, loadAllStoreProductsD1 } from '../services/d1_service';
import { getCatalogEpoch, matchesIfNoneMatch } from '../services/cache_service';
import { BRAND_IDENTITY_SETTING_KEY, extractBrandFromSettingsMap } from '../services/brand_service';
import fallbackGamesData from '../data/compact_games_fallback.json';
import fallbackGiveawaysData from '../../src/data/giveaways.json';
import { DEFAULT_NEWS_ARTICLES as fallbackNewsArticles } from '../data/compact_seed_news';
import { SEED_GAME_EVENTS } from '../../src/data/seedGameEvents';
import { DEFAULT_UPCOMING_GAMES as fallbackUpcomingGames } from '../../src/types/game';
import { DEFAULT_MARKETING_CONFIG } from '../../src/services/marketingService';
import canonicalBackupState from '../data/compact_canonical_state.json';
import { getActiveTombstonesMap, filterOutTombstones } from '../services/soft_delete_service';

declare const __BUILD_ID__: string | undefined;

interface Env {
  DB: D1Database;
  ADMIN_SYNC_SECRET?: string;
  JWT_SECRET?: string;
}

const SYNC_LITE_SETTING_KEYS = [
  'wcg_admin_games_v5',
  'wcg_admin_games_v4',
  'wcg_admin_upcoming_games_v1',
  'wcg_game_events_v1',
  'wcg_deleted_game_events_v1',
  'wcg_admin_giveaways_v4',
  'wcg_deleted_giveaways',
  'wcg_news_articles_v1',
  'wcg_deleted_news_articles_v1',
  'wcg_admin_content_v4',
  BRAND_IDENTITY_SETTING_KEY,
  'wcg_marketing_config_v1',
  'wcg_growth_config_v1',
  'wcg_admin_store_products_v4',
  'wcg_admin_store_categories_v4',
  'wcg_admin_store_categories_v1',
  'wcg_deleted_store_products',
];

const DEFAULT_BYPASS_KEYS = [
  'wcg_news_articles_v1',
  'wcg_admin_upcoming_games_v1',
  'wcg_marketing_config_v1',
  'wcg_game_events_v1',
];

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Requested-With, Cache-Control, cache-control, Pragma, pragma, If-None-Match, if-none-match, Apikey, apikey, x-api-key, X-Api-Key',
  'Access-Control-Expose-Headers': 'ETag, X-Catalog-Epoch, X-Cache-Status, X-Server-Time, X-Build-Id',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: CORS_HEADERS });
};

/**
 * GET /api/sync-lite (Lightweight Homepage Data Sync)
 * Cung cấp gói dữ liệu tinh gọn cho trang chủ (dung lượng nén ~49KB, TTFB < 100ms)
 * Chỉ chứa các trường thiết yếu để vẽ màn hình đầu tiên, banner, autocomplete và tin mới nhất.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const reqStart = Date.now();
  const { env, request } = context;
  const colo = String((request as any).cf?.colo || 'unknown');
  const url = new URL(request.url);

  const hasIfNoneMatch = Boolean(request.headers.get('If-None-Match'));
  const explicitBypass = url.searchParams.has('nocache') || url.searchParams.has('fresh');
  const isNoCache = explicitBypass ||
                    (!hasIfNoneMatch && (
                      request.headers.get('Cache-Control')?.includes('no-cache') ||
                      request.headers.get('Pragma')?.includes('no-cache')
                    ));

  const globalScope = globalThis as any;
  const nowMs = Date.now();
  const cfCache = typeof caches !== 'undefined' ? (caches as any).default : null;

  // 0. Đọc Catalog Epoch chung từ SQL D1 (1 row PK lookup duy nhất) để đồng bộ tức thì giữa Admin & Khách
  const epochStart = Date.now();
  const currentEpoch = env.DB ? await getCatalogEpoch(env.DB) : '0';
  const epochMs = Date.now() - epochStart;
  const buildTag = typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : '';
  const etag = buildTag ? `W/"sync-lite-${buildTag}-${currentEpoch}"` : `W/"sync-lite-${currentEpoch}"`;
  const epochCacheKey = new Request(
    `${url.origin}${url.pathname}?_epoch=${encodeURIComponent(currentEpoch)}${buildTag ? `&_b=${encodeURIComponent(buildTag)}` : ''}`,
    {
      method: 'GET',
    }
  );

  // 0b. ETag / If-None-Match -> Trả 304 Not Modified tức thì (0 KB body, 0 query bảng sản phẩm)
  if (!isNoCache && matchesIfNoneMatch(request.headers.get('If-None-Match'), etag)) {
    const totalMs = Date.now() - reqStart;
    return new Response(null, {
      status: 304,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'ETag': etag,
        'X-Catalog-Epoch': currentEpoch,
        'X-Server-Time': new Date().toISOString(),
        'X-Cache-Status': 'NOT-MODIFIED',
        'X-Timing-D1-Ms': String(epochMs),
        'X-Timing-Total-Ms': String(totalMs),
        'Server-Timing': `epoch;dur=${epochMs},d1_total;dur=${epochMs},total;dur=${totalMs};desc="colo=${colo}"`,
      },
    });
  }

  // 1. In-Memory Isolate Cache (CHỈ HIT khi epoch khớp 100% và < 5 phút lưới an toàn)
  if (!isNoCache && globalScope.__wcg_sync_lite_cache) {
    if (
      globalScope.__wcg_sync_lite_cache.epoch === currentEpoch &&
      nowMs - globalScope.__wcg_sync_lite_cache.cachedAt < 300000
    ) {
      const totalMs = Date.now() - reqStart;
      return new Response(globalScope.__wcg_sync_lite_cache.bodyStr, {
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': 'public, max-age=0, must-revalidate',
          'CDN-Cache-Control': 'no-store',
          'ETag': etag,
          'X-Catalog-Epoch': currentEpoch,
          'X-Server-Time': new Date().toISOString(),
          'X-Cache-Status': 'HIT-ISOLATE',
          'cf-cache-status': 'HIT',
          'X-Timing-D1-Ms': String(epochMs),
          'X-Timing-Total-Ms': String(totalMs),
          'Server-Timing': `epoch;dur=${epochMs},d1_total;dur=${epochMs},total;dur=${totalMs};desc="colo=${colo}"`,
        },
      });
    }
  }

  // 2. Cloudflare Edge Cache API theo khóa bất biến ?_epoch=<currentEpoch> (< 15ms khi isolate lạnh)
  if (!isNoCache && cfCache) {
    try {
      const cached = await cfCache.match(epochCacheKey);
      if (cached) {
        const edgeHeaders = new Headers(cached.headers);
        edgeHeaders.set('Cache-Control', 'public, max-age=0, must-revalidate');
        edgeHeaders.set('CDN-Cache-Control', 'no-store');
        edgeHeaders.set('ETag', etag);
        edgeHeaders.set('X-Catalog-Epoch', currentEpoch);
        edgeHeaders.set('X-Cache-Status', 'HIT-EDGE');
        edgeHeaders.set('X-Server-Time', new Date().toISOString());
        return new Response(cached.body, { status: cached.status, headers: edgeHeaders });
      }
    } catch {}
  }

  try {
    let d1Settings: Record<string, any> = {};
    let tombstonesMap = new Map();
    let spList: any[] = [];
    let d1DurationMs = 0;
    let tombstonesMs = 0;
    let settingsMs = 0;
    let productsMs = 0;

    if (env.DB) {
      const d1Start = Date.now();
      const timed = async <T>(fn: () => Promise<T>): Promise<{ val: T; ms: number }> => {
        const t0 = Date.now();
        const val = await fn();
        return { val, ms: Date.now() - t0 };
      };
      const settingsTimedPromise = timed(() =>
        getMultipleSettingsD1(
          env.DB,
          SYNC_LITE_SETTING_KEYS,
          isNoCache ? new Set(SYNC_LITE_SETTING_KEYS) : new Set(DEFAULT_BYPASS_KEYS)
        )
      );
      const [tombstonesRes, settingsRes, storeProdsRes] = await Promise.all([
        timed(() => getActiveTombstonesMap(env.DB)),
        settingsTimedPromise,
        timed(() =>
          loadAllStoreProductsD1(env.DB, {
            skipSchemaCheck: true,
            preloadedMetaSettingPromise: settingsTimedPromise.then((r) => r.val?.['wcg_admin_store_products_v4']),
          })
        ),
      ]);
      d1DurationMs = Date.now() - d1Start;
      tombstonesMs = tombstonesRes.ms;
      settingsMs = settingsRes.ms;
      productsMs = storeProdsRes.ms;
      tombstonesMap = tombstonesRes.val || new Map();
      d1Settings = settingsRes.val || {};
      spList = storeProdsRes.val || [];
    }

    // 1. Games (Essential fields only: slug, name, icon, publisher, category, codes_count, rating, flags)
    const rawGames = (Array.isArray(d1Settings['wcg_admin_games_v5']) && d1Settings['wcg_admin_games_v5'].length > 0)
      ? d1Settings['wcg_admin_games_v5']
      : (Array.isArray(d1Settings['wcg_admin_games_v4']) && d1Settings['wcg_admin_games_v4'].length > 0)
        ? d1Settings['wcg_admin_games_v4']
        : (fallbackGamesData as any[]);

    const filteredGames = filterOutTombstones(rawGames, 'game', tombstonesMap, (g: any) => ({ id: g?.id, slug: g?.slug }));
    const liteGames = filteredGames.map((g: any) => {
      const slug = String(g.slug || g.id || '').trim().toLowerCase();
      let icon = g.icon_url || g.iconUrl || '';
      if (!icon || icon.includes('codemoi.net') || icon.includes('googleusercontent.com') || icon.startsWith('/game-icons')) {
        icon = `/game_icons/${slug}.webp`;
      }
      const codesCount = typeof g.codes_count === 'number' ? g.codes_count : (typeof g.active_codes_count === 'number' ? g.active_codes_count : 0);
      return {
        id: g.id || slug,
        name: g.name || slug,
        slug: slug,
        publisher: g.publisher || g.developer || '',
        category: g.category || '',
        rating: typeof g.rating === 'number' ? g.rating : 5,
        icon_url: icon,
        codes_count: codesCount,
        is_hot: Boolean(g.is_hot),
        is_new: Boolean(g.is_new),
        is_featured: Boolean(g.is_featured),
        platform: g.platform && g.platform !== 'Android, iOS, PC' ? g.platform : undefined,
      };
    });

    // 2. Upcoming Games (Lean Homepage Projection)
    const rawUpcoming = d1Settings['wcg_admin_upcoming_games_v1'];
    const upcomingList = (Array.isArray(rawUpcoming) && rawUpcoming.length > 0) ? rawUpcoming : fallbackUpcomingGames;
    const filteredUpcoming = filterOutTombstones(upcomingList, 'upcoming_game', tombstonesMap, (g: any) => ({ id: g?.id, slug: g?.slug }));
    const upcomingGames = filteredUpcoming.map((ug: any) => ({
      id: ug.id,
      name: ug.name || '',
      slug: ug.slug || '',
      publisher: ug.publisher || '',
      releaseDate: ug.releaseDate || '',
      category: ug.category || '',
      platform: ug.platform || 'PC, Mobile',
      icon_url: ug.icon_url || ug.iconUrl || `/game_icons/${ug.slug || ug.id}.webp`,
      bannerUrl: ug.bannerUrl || '',
      description: ug.description || '',
      subscribersCount: Number(ug.subscribersCount || 0),
      status: ug.status || 'UPCOMING',
      displayOrder: Number(ug.displayOrder || 0),
      isLaunched: Boolean(ug.isLaunched),
      isRolledOver: Boolean(ug.isRolledOver),
    }));

    // 3. Active Game Events
    const rawEvents = d1Settings['wcg_game_events_v1'];
    const eventsList = (Array.isArray(rawEvents) && rawEvents.length > 0) ? rawEvents : SEED_GAME_EVENTS;
    const delEventsSet = new Set(Array.isArray(d1Settings['wcg_deleted_game_events_v1']) ? d1Settings['wcg_deleted_game_events_v1'] : []);
    const gameEvents = eventsList.filter((e: any) => e && e.id && !delEventsSet.has(e.id));

    // 4. Giveaways (Sanitized, Active, In-Stock First - Lean Projection)
    const rawGws = d1Settings['wcg_admin_giveaways_v4'];
    const delGwSet = new Set(Array.isArray(d1Settings['wcg_deleted_giveaways']) ? d1Settings['wcg_deleted_giveaways'] : []);
    const gwCandidates = (Array.isArray(rawGws) && rawGws.length > 0) ? rawGws : (fallbackGiveawaysData as any[]);
    const giveaways = gwCandidates
      .filter((g: any) => g && g.id && !delGwSet.has(g.id) && g.id !== 'gw_alienware_vaultbreakers' && g.id !== 'gw_garena_delta_force')
      .map((gw: any) => {
        const isClosed = gw.is_active === false || gw.is_active === 0 || gw.status === 'PAUSED' || gw.status === 'CLOSED';
        const rem = gw.remaining_codes !== undefined && gw.remaining_codes !== null ? Number(gw.remaining_codes) : (Array.isArray(gw.codes_pool) ? gw.codes_pool.length : 0);
        return {
          id: gw.id,
          title: gw.title || '',
          game_slug: gw.game_slug || '',
          game_name: gw.game_name || '',
          description: gw.description || '',
          rewards: gw.rewards || 'Giftcode',
          total_codes: Number(gw.total_codes || 0),
          remaining_codes: isClosed ? 0 : rem,
          claimed_codes: Number(gw.claimed_codes || 0),
          virtual_claimed_offset: Number(gw.virtual_claimed_offset || 0),
          show_claimed_count: gw.show_claimed_count !== false,
          show_remaining_count: gw.show_remaining_count !== false,
          start_time: gw.start_time || '',
          end_time: gw.end_time || '',
          is_active: !isClosed,
          status: gw.status === 'ENDED' ? 'ENDED' : (isClosed ? 'PAUSED' : 'ACTIVE'),
          cover_image_url: gw.cover_image_url || gw.game_icon_url || '',
          game_icon_url: gw.game_icon_url || gw.cover_image_url || '',
          fomo_anchor_time: gw.fomo_anchor_time || null,
          custom_banner_enabled: Boolean(gw.custom_banner_enabled),
          custom_banner_link: gw.custom_banner_link || '',
          custom_banner_text: gw.custom_banner_text || '',
          last_claimer_name: gw.last_claimer_name || '',
        };
      })
      .sort((a: any, b: any) => (Number(b.remaining_codes) || 0) - (Number(a.remaining_codes) || 0));

    // 5. News Articles (Only latest 6 articles, summary fields without heavy markdown body)
    const rawNews = d1Settings['wcg_news_articles_v1'];
    const newsCandidates = (Array.isArray(rawNews) && rawNews.length > 0) ? rawNews : fallbackNewsArticles;
    const delNewsSet = new Set(Array.isArray(d1Settings['wcg_deleted_news_articles_v1']) ? d1Settings['wcg_deleted_news_articles_v1'] : []);
    const newsArticles = newsCandidates
      .filter((a: any) => a && a.id && !delNewsSet.has(a.id) && a.status !== 'DRAFT')
      .slice(0, 6)
      .map((a: any) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        cover_url: a.cover_url || a.cover_image || a.cover_image_url || '',
        cover_image: a.cover_image || a.cover_image_url || a.cover_url || '',
        game_slug: a.game_slug || '',
        game_name: a.game_name || '',
        excerpt: a.excerpt || (a.content ? String(a.content).slice(0, 150) + '...' : ''),
        category: a.category || 'Tin tức',
        tag: a.tag || 'Hot',
        published_at: a.published_at || a.created_at || new Date().toISOString(),
        status: a.status || 'PUBLISHED',
      }));

    // 6. Content (Branding, announcements) + Unified Brand Identity SSOT
    const content = Array.isArray(d1Settings['wcg_admin_content_v4']) && d1Settings['wcg_admin_content_v4'].length > 0
      ? d1Settings['wcg_admin_content_v4']
      : ((canonicalBackupState as any).content || []);
    const brandIdentity = extractBrandFromSettingsMap({
      ...d1Settings,
      wcg_admin_content_v4: content,
    });

    // 7. Configs & Stats
    const marketingConfig = (d1Settings['wcg_marketing_config_v1'] && typeof d1Settings['wcg_marketing_config_v1'] === 'object')
      ? d1Settings['wcg_marketing_config_v1']
      : DEFAULT_MARKETING_CONFIG;

    const growthConfig = (d1Settings['wcg_growth_config_v1'] && typeof d1Settings['wcg_growth_config_v1'] === 'object')
      ? d1Settings['wcg_growth_config_v1']
      : ((canonicalBackupState as any).growthConfig || null);

    const elapsedMs = Math.max(0, Date.now() - 1793181600000);
    const masterCopyClicks = 93910 + Math.floor((elapsedMs / 60000) * 0.5);

    // 8. Store Products & Categories
    const delStoreSet = new Set(Array.isArray(d1Settings['wcg_deleted_store_products']) ? d1Settings['wcg_deleted_store_products'] : []);
    delStoreSet.add('sp_idle-cat-gunner_mw5yrnka');
    const savedStoreProductsRaw = d1Settings['wcg_admin_store_products_v4'];
    const savedStoreMap = new Map<string, any>();
    if (Array.isArray(savedStoreProductsRaw)) {
      savedStoreProductsRaw.forEach((sp: any) => {
        if (sp && sp.id) savedStoreMap.set(sp.id, sp);
      });
    }

    const storeProducts = (spList || [])
      .filter((p: any) => p && p.id && p.is_active !== 0 && p.is_active !== false && (p as any).is_active !== '0' && !delStoreSet.has(p.id))
      .map((p: any) => {
        const meta = savedStoreMap.get(p.id) || {};
        const finalStock = p.stock_quantity !== undefined
          ? Math.max(0, Number(p.stock_quantity) || 0)
          : Math.max(0, Number(meta.stock_quantity) || 0);
        return {
          id: p.id,
          sku: p.sku || meta.sku || undefined,
          title: p.title || meta.title || '',
          game_slug: p.game_slug || meta.game_slug || '',
          game_name: p.game_name || meta.game_name || '',
          original_price: Number(p.original_price ?? meta.original_price ?? 0),
          discount_percent: Number(p.discount_percent ?? meta.discount_percent ?? 0),
          current_price: Number(p.current_price ?? meta.current_price ?? 0),
          stock_quantity: finalStock,
          sold_count: Number(p.sold_count ?? meta.sold_count ?? 0),
          is_active: 1,
          package_type: (p.package_type && p.package_type !== 'pack') ? p.package_type : (meta.package_type || p.package_type || 'pack'),
          category: (p.category && p.category !== 'pack') ? p.category : (meta.category || p.category || meta.package_type || 'pack'),
          category_label: p.category_label || meta.category_label || '',
          cover_image_url: p.cover_image_url || meta.cover_image_url || meta.game_icon_url || '',
          game_icon_url: p.game_icon_url || meta.game_icon_url || meta.cover_image_url || '',
          description: p.description || meta.description || '',
          badge: p.badge || meta.badge || '',
          virtual_sold_count: p.virtual_sold_count !== undefined ? Number(p.virtual_sold_count) : Number(meta.virtual_sold_count ?? 0),
          show_sold_count: p.show_sold_count !== undefined ? Boolean(p.show_sold_count) : (meta.show_sold_count !== false),
          show_stock_count: p.show_stock_count !== undefined ? Boolean(p.show_stock_count) : (meta.show_stock_count !== false),
          product_images: (Array.isArray(p.product_images) && p.product_images.length > 0)
            ? p.product_images
            : (Array.isArray(meta.product_images) && meta.product_images.length > 0 ? meta.product_images : undefined),
          fomo_anchor_time: meta.fomo_anchor_time || (p as any).fomo_anchor_time || null,
          created_at: p.created_at || meta.created_at || undefined,
          show_warranty: p.show_warranty !== undefined ? Boolean(p.show_warranty) : Boolean(meta.show_warranty),
          warranty_text: p.warranty_text || meta.warranty_text || '',
          sale_mode: p.sale_mode || meta.sale_mode || 'normal',
          escalating_base_price: p.escalating_base_price !== undefined && p.escalating_base_price !== null ? Number(p.escalating_base_price) : (meta.escalating_base_price !== undefined && meta.escalating_base_price !== null ? Number(meta.escalating_base_price) : null),
          escalating_step: p.escalating_step !== undefined && p.escalating_step !== null ? Number(p.escalating_step) : (meta.escalating_step !== undefined && meta.escalating_step !== null ? Number(meta.escalating_step) : null),
          escalating_max_price: p.escalating_max_price !== undefined && p.escalating_max_price !== null ? Number(p.escalating_max_price) : (meta.escalating_max_price !== undefined && meta.escalating_max_price !== null ? Number(meta.escalating_max_price) : null),
          first_purchase_enabled: p.first_purchase_enabled !== undefined && p.first_purchase_enabled !== null
            ? (p.first_purchase_enabled === 1 || p.first_purchase_enabled === true || String(p.first_purchase_enabled) === '1')
            : (meta.first_purchase_enabled !== undefined ? Boolean(meta.first_purchase_enabled) : true),
          first_purchase_price: p.first_purchase_price !== undefined && p.first_purchase_price !== null
            ? Number(p.first_purchase_price)
            : (meta.first_purchase_price !== undefined && meta.first_purchase_price !== null ? Number(meta.first_purchase_price) : null),
          first_purchase_max_price: p.first_purchase_max_price !== undefined && p.first_purchase_max_price !== null
            ? Number(p.first_purchase_max_price)
            : (meta.first_purchase_max_price !== undefined && meta.first_purchase_max_price !== null ? Number(meta.first_purchase_max_price) : null),
          product_type: p.product_type || meta.product_type || 'digital',
          ...(p.weight_grams !== undefined && p.weight_grams !== null
            ? { weight_grams: Number(p.weight_grams) }
            : (meta.weight_grams !== undefined && meta.weight_grams !== null ? { weight_grams: Number(meta.weight_grams) } : {})),
          ...(p.warehouse_address || meta.warehouse_address ? { warehouse_address: p.warehouse_address || meta.warehouse_address } : {}),
          ...(p.warranty_hours !== undefined && p.warranty_hours !== null
            ? { warranty_hours: Number(p.warranty_hours) }
            : (meta.warranty_hours !== undefined && meta.warranty_hours !== null ? { warranty_hours: Number(meta.warranty_hours) } : {})),
          ...(p.seller_name || meta.seller_name ? { seller_name: p.seller_name || meta.seller_name } : {}),
          ...(p.seller_id
            ? {
                seller_id: p.seller_id,
                seller_slug: p.seller_slug || '',
                is_affiliate: Boolean(p.is_affiliate),
                seller_qr_available: Boolean(p.seller_qr_available),
              }
            : {}),
          brand: p.brand || p.seller_name || meta.seller_name || '',
          origin: p.origin || p.warehouse_address || meta.warehouse_address || '',
        };
      });

    const rawStoreCats = d1Settings['wcg_admin_store_categories_v4'] || d1Settings['wcg_admin_store_categories_v1'];
    const storeCategories = Array.isArray(rawStoreCats) && rawStoreCats.length > 0
      ? rawStoreCats
      : [
          { id: 'pack', label: 'Gói nạp', icon: '📦', isSystem: true },
          { id: 'monthly', label: 'Thẻ tháng / Pass', icon: '🎫', isSystem: true },
          { id: 'gift', label: 'Code VIP', icon: '🎁', isSystem: true },
          { id: 'account', label: 'Tài khoản', icon: '🎮', isSystem: true },
        ];
    const deletedStoreProducts = Array.from(delStoreSet);

    const payload = {
      success: true,
      catalogEpoch: currentEpoch,
      timestamp: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      games: liteGames,
      totalGames: liteGames.length,
      upcomingGames,
      gameEvents,
      giveaways,
      newsArticles,
      content,
      brandIdentity,
      marketingConfig,
      growthConfig,
      masterCopyClicks,
      storeProducts,
      storeCategories,
      deletedStoreProducts,
    };

    const bodyStr = JSON.stringify(payload);

    if (!isNoCache) {
      globalScope.__wcg_sync_lite_cache = {
        epoch: currentEpoch,
        bodyStr,
        cachedAt: nowMs,
      };
    }

    const totalMs = Date.now() - reqStart;
    const totalD1Ms = d1DurationMs + epochMs;
    const response = new Response(bodyStr, {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': isNoCache
          ? 'no-cache, no-store, must-revalidate'
          : 'public, max-age=0, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'ETag': etag,
        'X-Catalog-Epoch': currentEpoch,
        'X-Server-Time': new Date().toISOString(),
        'X-Cache-Status': isNoCache ? 'BYPASS' : 'DYNAMIC',
        'X-Timing-D1-Ms': String(totalD1Ms),
        'X-Timing-Total-Ms': String(totalMs),
        'Server-Timing': `epoch;dur=${epochMs},tombstones;dur=${tombstonesMs},settings;dur=${settingsMs},products;dur=${productsMs},d1_total;dur=${totalD1Ms},total;dur=${totalMs};desc="colo=${colo}"`,
      },
    });

    if (!isNoCache && cfCache && context.waitUntil) {
      try {
        const edgeHeaders = new Headers(response.headers);
        edgeHeaders.set('Cache-Control', 'public, max-age=300');
        edgeHeaders.delete('CDN-Cache-Control');
        const edgeClone = new Response(bodyStr, { status: 200, headers: edgeHeaders });
        context.waitUntil(cfCache.put(epochCacheKey, edgeClone));
      } catch {}
    }

    return response;
  } catch (err: any) {
    console.error('[API /api/sync-lite] Error:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Sync-lite error',
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
