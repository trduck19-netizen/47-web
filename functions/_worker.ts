import * as syncApi from './api/sync';
import { confirmReceivedAndRelease, fileOrderDispute, autoReleaseDueEscrow, resolveAdminDispute } from './services/escrow_service';
import { verifyUserAiApiAccess } from './services/user_ai_api_service';
import { getProductReviews, createProductReview, approveReview, rejectReview, deleteReview, listAdminReviews } from './services/review_service';
import { authenticateCaller, authenticateAdmin } from './services/auth_service';
import * as syncLiteApi from './api/sync-lite';
import * as statsApi from './api/stats';
import * as voteApi from './api/vote';
import * as loginApi from './api/auth/login';
import * as registerApi from './api/auth/register';
import * as turnstileConfigApi from './api/auth/turnstile-config';
import * as meApi from './api/auth/me';
import * as resetPasswordApi from './api/auth/reset-password';
import * as verifyEmailApi from './api/auth/verify-email';
import * as ordersCreateApi from './api/orders/create';
import * as ordersCreateQrApi from './api/orders/create-qr';
import * as ordersStatusApi from './api/orders/status';
import * as sepayWebhookApi from './api/webhooks/sepay';
import * as giveawaysClaimApi from './api/giveaways/claim';
import * as giveawaysSimulateApi from './api/giveaways/simulate';
import * as giveawaysManageApi from './api/giveaways/manage';
import * as storeManageApi from './api/store/manage';
import { runGiveawaySimulation } from './services/giveaway_simulation_service';
import { initializeD1, ensureMarketplaceSchema, ensureSchemaUpgrades } from './services/d1_service';
import * as adminMigrateApi from './api/admin/migrate';
import * as adminAuditCountersApi from './api/admin/audit-counters';
import * as adminSepayCreditApi from './api/admin/sepay-credit';
import * as adminTemporaryTokenApi from './api/admin/temporary-token';
import * as adminHistoryApi from './api/admin/history';
import * as realtimeEventsApi from './api/realtime-events';
import * as metricsSyncedApi from './api/metrics/synced';
import * as gamesApi from './api/games';
import * as crawlArticleApi from './api/crawl-article';
import * as gameIconApi from './api/game-icon';
import * as uploadIconApi from './api/games/upload-icon';
import * as ingestCodesApi from './api/crawler/ingest-codes';
import * as ingestUpcomingGamesApi from './api/crawler/ingest-upcoming-games';
import * as marketingApi from './api/crawler/marketing';
import * as notifSubscribeApi from './api/notifications/subscribe';
import * as notifUnsubscribeApi from './api/notifications/unsubscribe';
import * as notifSubscribersApi from './api/notifications/subscribers';
import * as notifSettingsApi from './api/notifications/settings';
import * as notifSendApi from './api/notifications/send';
import * as notifLogsApi from './api/notifications/logs';
import * as trackDownloadApi from './api/track-download';
import * as newsIndexApi from './api/news/index';
import * as newsIdApi from './api/news/[id]';
import * as eventsIndexApi from './api/events/index';
import * as eventsIdApi from './api/events/[id]';
import * as missionsIndexApi from './api/missions/index';
import * as cartIndexApi from './api/cart/index';
import * as cartSyncApi from './api/cart/sync';
import * as cartItemsApi from './api/cart/items/index';
import * as cartItemsIdApi from './api/cart/items/[id]';
import * as userAddressesIndexApi from './api/user/addresses/index';
import * as userAddressesIdApi from './api/user/addresses/[id]/index';
import * as userAddressesDefaultApi from './api/user/addresses/[id]/default';
import * as googleAuthApi from './api/auth/oauth/google';
import * as searchIndexApi from './api/search/index';
import * as wishlistIndexApi from './api/user/wishlist/index';
import * as adminAutomationStatusApi from './api/admin/automation/status';
import * as adminAutomationTestApi from './api/admin/automation/test';
import * as adminAutomationConfigApi from './api/admin/automation/config';
import * as adminSuppliersIndexApi from './api/admin/suppliers/index';
import * as adminSuppliersIdApi from './api/admin/suppliers/[id]';
import * as adminSupplierWebhooksApi from './api/admin/suppliers/webhooks';
import * as adminAffiliateApi from './api/admin/affiliate/index';
import * as sellerWebhooksApi from './api/seller/webhooks/index';
import * as sellerAffiliateOrdersApi from './api/seller/affiliate/orders';
import * as sellerAffiliateInventoryPushApi from './api/seller/affiliate/inventory-push';
import * as affiliatePostbackWebhookApi from './api/webhooks/affiliate-postback';
import * as wishlistToggleApi from './api/user/wishlist/toggle';
import * as wishlistSyncApi from './api/user/wishlist/sync';
import * as missionsIdApi from './api/missions/[id]';
import * as missionsSubmitApi from './api/missions/submit';
import * as missionsMySubmissionsApi from './api/missions/my-submissions';
import * as missionsSubmissionsApi from './api/missions/submissions';
import * as missionsPoolsApi from './api/missions/pools';
import * as missionsAiPendingApi from './api/missions/ai/pending';
import * as missionsAiReviewApi from './api/missions/ai/review';
import * as missionsAiKeysApi from './api/missions/ai-keys';
import * as missionsAuditLogsApi from './api/missions/audit-logs';
import * as apiKeysIndexApi from './api/api-keys/index';
import * as apiKeysIdApi from './api/api-keys/[id]';
import * as apiKeysSetPermissionsApi from './api/api-keys/set-permissions';
import * as eventSchedulerApi from './api/event-scheduler/index';
import * as telegramConfigApi from './api/telegram/config';
import * as telegramNotifyApi from './api/telegram/notify';
import * as telegramWebhookApi from './api/telegram/webhook';
import * as telegramAdminApi from './api/telegram/admin';
import * as telegramManageApi from './api/telegram/manage';
import * as telegramUserApi from './api/telegram/user';
import * as telegramNotifyFollowersApi from './api/telegram/notify-followers';
import * as telegramSendPendingDigestApi from './api/telegram/send-pending-digest';
import * as firstPurchaseAdminApi from './api/admin/first-purchase';
import * as adminUtilitiesFirstPurchaseApi from './api/admin/utilities/first-purchase';
import * as adminStoreFirstPurchaseApi from './api/admin/store/first-purchase';
import * as auditLogAdminApi from './api/admin/audit-log';
import * as adminMembersAdjustBalanceApi from './api/admin/members/adjust-balance';
import * as storeMyOfferApi from './api/store/my-offer';
import * as escalatingApi from './api/store/escalating';

// 3 New Features (10/11/2026): Code Reports, Game Comments, Today Codes
import * as codeReportsApi from './api/code-reports';
import * as adminCodeReportsApi from './api/admin/code-reports/index';
import * as adminCodeReportsResolveApi from './api/admin/code-reports/[id]/resolve';
import * as gameCommentsApi from './api/games/[slug]/comments/index';
import * as gameCommentsIdApi from './api/games/[slug]/comments/[id]';
import * as adminCommentsApi from './api/admin/comments/index';
import * as adminCommentsApproveApi from './api/admin/comments/[id]/approve';
import * as adminCommentsRejectApi from './api/admin/comments/[id]/reject';
import * as codesTodayApi from './api/codes/today';

// Marketplace Phase 1 (11/11/2026): Seller Center, Stores, Orders, Admin Moderation
import * as sellerIndexApi from './api/seller/index';
import * as sellerPortalConfigApi from './api/seller/portal-config';
import * as sellerProductsIndexApi from './api/seller/products/index';
import * as sellerProductsIdApi from './api/seller/products/[id]';
import * as sellerProductsCodesApi from './api/seller/products/[id]/codes';
import * as sellerCodesRevealApi from './api/seller/codes/[id]/reveal';
import * as sellerCodesIdApi from './api/seller/codes/[id]';
import * as sellerOrdersIndexApi from './api/seller/orders/index';
import * as sellerOrdersIdApi from './api/seller/orders/[id]';
import * as sellerOrdersResolveReportApi from './api/seller/orders/[id]/resolve-report';
import * as sellerSubaccountsIndexApi from './api/seller/subaccounts/index';
import * as sellerSubaccountsIdApi from './api/seller/subaccounts/[id]';
import * as sellerApiKeysIndexApi from './api/seller/api-keys/index';
import * as sellerApiKeysIdApi from './api/seller/api-keys/[id]';
import * as sellerAppsIndexApi from './api/seller/apps/index';
import * as sellerAppsIdApi from './api/seller/apps/[id]';
import * as sellerProductsResellApi from './api/seller/products/[id]/resell';
import * as sellerAffiliateRequestsApi from './api/seller/affiliate/requests';
import * as sellerAffiliateApproveApi from './api/seller/affiliate/requests/[id]/approve';
import * as sellerAffiliateRejectApi from './api/seller/affiliate/requests/[id]/reject';
import * as sellerAffiliatePartnersApi from './api/seller/affiliate/partners/index';
import * as sellerAffiliatePartnerIdApi from './api/seller/affiliate/partners/[id]';
import * as sellerAffiliateCatalogApi from './api/seller/affiliate/catalog';
import * as sellerAffiliateListingsApi from './api/seller/affiliate/listings/index';
import * as sellerAffiliateListingIdApi from './api/seller/affiliate/listings/[id]';
import * as userAiKeysIndexApi from './api/user/ai-keys/index';
import * as userAiKeysIdApi from './api/user/ai-keys/[id]';
import * as userAiKeysRevokeAllApi from './api/user/ai-keys/revoke-all';
import * as userAiKeysLogsApi from './api/user/ai-keys/[id]/logs';
import * as userAiKeysDevicesApi from './api/user/ai-keys/[id]/devices';
import * as userAiKeysAlertsApi from './api/user/ai-keys/alerts';
import * as storesSlugIndexApi from './api/stores/[slug]/index';
import * as storesSlugProductsApi from './api/stores/[slug]/products';
import * as sellerOrdersCreateApi from './api/seller-orders/index';
import * as sellerOrdersReportApi from './api/seller-orders/[id]/report';
import * as mySellerOrdersApi from './api/my-seller-orders';
import * as adminSellersIndexApi from './api/admin/sellers/index';
import * as adminSellersApproveApi from './api/admin/sellers/[id]/approve';
import * as adminSellersRejectApi from './api/admin/sellers/[id]/reject';
import * as adminSellersRequestInfoApi from './api/admin/sellers/[id]/request-info';
import * as adminSellersSuspendApi from './api/admin/sellers/[id]/suspend';
import * as adminSellersUnsuspendApi from './api/admin/sellers/[id]/unsuspend';
import * as adminSellerProductsIndexApi from './api/admin/seller-products/index';
import * as adminSellerProductsApproveApi from './api/admin/seller-products/[id]/approve';
import * as adminSellerProductsRejectApi from './api/admin/seller-products/[id]/reject';
import * as adminSellerConfigApi from './api/admin/seller-config';

// Marketplace Phase 2 (11/11/2026): Multi-store Orders, 3-tier Ledger, Reconciliation, Withdrawals
import * as sellerOrdersMultiApi from './api/seller-orders/multi';
import * as sellerOrdersMultiIdApi from './api/seller-orders/multi/[id]';
import * as sellerOrdersMultiPayCoreApi from './api/seller-orders/multi/[id]/pay-core';
import * as sellerOrdersMultiVerifySepayApi from './api/seller-orders/multi/[id]/verify-sepay';
import * as sellerSepayIndexApi from './api/seller/sepay/index';
import * as sellerSepayRotateKeyApi from './api/seller/sepay/rotate-key';
import * as sellerSepayTestConnApi from './api/seller/sepay/test-connection';
import * as sellerSepayTxApi from './api/seller/sepay/transactions';
import * as sellerSepayPayDebtApi from './api/seller/sepay/pay-debt';
import * as sellerSepayWebhookApi from './api/webhooks/sepay/seller/[sellerId]';
import * as adminSellerSepayApi from './api/admin/seller-sepay/index';
import * as sellerFinanceIndexApi from './api/seller/finance/index';
import * as sellerFinanceWithdrawApi from './api/seller/finance/withdraw';
import * as sellerFinanceWithdrawalsApi from './api/seller/finance/withdrawals';
import * as adminSellerFinanceIndexApi from './api/admin/seller-finance/index';
import * as adminSellerFinanceReleaseHeldApi from './api/admin/seller-finance/release-held';
import * as adminSellerFinanceReconciliationApi from './api/admin/seller-finance/reconciliation';
import * as adminSellerFinanceReconciliationRunApi from './api/admin/seller-finance/reconciliation/run';
import * as adminWithdrawalsIndexApi from './api/admin/withdrawals/index';
import * as adminWithdrawalsApproveApi from './api/admin/withdrawals/[id]/approve';
import * as adminWithdrawalsRejectApi from './api/admin/withdrawals/[id]/reject';
import * as adminWithdrawalsMarkPaidApi from './api/admin/withdrawals/[id]/mark-paid';

// Marketplace Ratings & Automated Disputes (12/11/2026)
import * as sellerOrdersRateApi from './api/seller-orders/[id]/rate';
import * as storesSlugRatingsApi from './api/stores/[slug]/ratings';
import * as adminSellerRatingsIndexApi from './api/admin/seller-ratings/index';
import * as adminSellerRatingsModerateApi from './api/admin/seller-ratings/[id]/moderate';
import * as sellerOrdersDisputeApi from './api/seller-orders/[id]/dispute';
import * as sellerDisputesIndexApi from './api/seller/disputes/index';
import * as sellerDisputesRespondApi from './api/seller/disputes/[id]/respond';
import * as adminSellerDisputesIndexApi from './api/admin/seller-disputes/index';
import * as adminSellerDisputesResolveApi from './api/admin/seller-disputes/[id]/resolve';

// Dedicated Admin APIs for 9 Modules
import * as adminMembersIndexApi from './api/admin/members/index';
import * as adminMembersIdApi from './api/admin/members/[id]';
import * as adminMembersBanApi from './api/admin/members/[id]/ban';
import * as adminMembersUnbanApi from './api/admin/members/[id]/unban';

import * as adminWalletsTransactionsApi from './api/admin/wallets/transactions';
import * as adminWalletsMemberIdApi from './api/admin/wallets/[memberId]';

import * as adminOrdersIndexApi from './api/admin/orders/index';
import * as adminOrdersIdApi from './api/admin/orders/[id]';
import * as adminOrdersRefundApi from './api/admin/orders/[id]/refund';

import * as adminSepayTransactionsApi from './api/admin/sepay/transactions';
import * as adminSepayConfigApi from './api/admin/sepay/config';

import * as adminFreeCodesIndexApi from './api/admin/free-codes/index';
import * as adminFreeCodesIdApi from './api/admin/free-codes/[id]';

import * as adminSubmissionsIndexApi from './api/admin/submissions/index';
import * as adminSubmissionsApproveApi from './api/admin/submissions/[id]/approve';
import * as adminSubmissionsRejectApi from './api/admin/submissions/[id]/reject';

import * as adminContentIndexApi from './api/admin/content/index';
import * as adminContentKeyApi from './api/admin/content/[key]';

import * as adminUtilitiesIndexApi from './api/admin/utilities/index';
import * as adminUtilitiesIdApi from './api/admin/utilities/[id]';
import * as adminUtilitiesStockApi from './api/admin/utilities/[id]/stock';

import * as adminGrowthApi from './api/admin/growth';
// 7 Remote Admin Modules
import * as adminDashboardStatsApi from './api/admin/dashboard/stats';
import * as adminStoreProductCodesApi from './api/admin/store/products/[id]/codes';
import * as adminMarketingConfigApi from './api/admin/marketing/config';
import * as adminMarketingTriggerApi from './api/admin/marketing/trigger';
import * as adminCrawlerSourcesApi from './api/admin/crawler/sources';
import * as adminCrawlerSourcesIdApi from './api/admin/crawler/sources/[id]';
import * as adminCrawlerTriggerApi from './api/admin/crawler/trigger';
import * as adminNotificationsSubscribersApi from './api/admin/notifications/subscribers';
import * as adminNotificationsBroadcastApi from './api/admin/notifications/broadcast';
import * as adminNotificationsSettingsApi from './api/admin/notifications/settings';
import * as adminSecurityLogsIndexApi from './api/admin/security-logs/index';
import * as adminSettingsIndexApi from './api/admin/settings/index';
import * as homepageSectionsAdminApi from './api/admin/homepage-sections';
import * as homepageSectionsUploadImageApi from './api/admin/homepage-sections/upload-image';
import * as homepageSectionsAiSuggestApi from './api/admin/homepage-sections/ai-suggest';
import * as homepageSectionsAiGenerateImageApi from './api/admin/homepage-sections/ai-generate-image';
import * as homepageImagesApi from './api/homepage-images/[file]';
import * as homepageImagesProbeApi from './api/homepage-images/probe';
import * as productMediaApi from './api/product-media/[file]';
import * as sellerMediaUploadApi from './api/seller/media/upload';
import * as sellerVouchersIndexApi from './api/seller/vouchers/index';
import * as sellerVouchersIdApi from './api/seller/vouchers/[id]';
import * as homepageSectionsPublicApi from './api/homepage-sections';
// Universal Commerce Platform RESTful APIs
import * as productsIndexApi from './api/products/index';
import * as productsIdApi from './api/products/[id]';
import * as categoriesIndexApi from './api/categories/index';
import * as categoriesIdApi from './api/categories/[id]';
import * as vouchersIndexApi from './api/vouchers/index';
import * as vouchersVerifyApi from './api/vouchers/verify';
import * as vouchersRedeemApi from './api/vouchers/redeem';
import * as vouchersIdApi from './api/vouchers/[id]';
import * as shippingIndexApi from './api/shipping/index';
import * as shippingCalculateFeeApi from './api/shipping/calculate-fee';
import * as shippingIdApi from './api/shipping/[id]';
import * as platformLeadsIndexApi from './api/platform-leads/index';
import * as platformLeadsIdApi from './api/platform-leads/[id]';
import * as brandPublicApi from './api/brand';
import * as adminBrandApi from './api/admin/brand';
import {
  getBrandIdentity,
  buildDynamicManifestJson,
  serializeBrandForInlineScript,
} from './services/brand_service';
import { getMultipleSettingsD1 } from './services/d1_service';
import {
  invalidateCatalogEdgeCache,
  getCatalogEpoch,
  matchesIfNoneMatch,
  shouldBumpCatalogEpoch,
  wasEpochBumpedForRequest,
} from './services/cache_service';
import fallbackGiveawaysData from '../src/data/giveaways.json';
import fallbackGamesData from './data/compact_games_fallback.json';
import fallbackCodesData from './data/compact_fallback_codes.json';

function attachBuildHeaders(res: Response): Response {
  try {
    const headers = new Headers(res.headers);
    if (typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__) {
      headers.set('X-Build-Id', __BUILD_ID__);
      headers.set('X-Version', `1.0.0-${__BUILD_ID__}`);
    }
    if (typeof __BUILD_TIME__ !== 'undefined' && __BUILD_TIME__) {
      headers.set('X-Build-Time', __BUILD_TIME__);
    }
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch {
    return res;
  }
}

interface Env {
  DB?: D1Database;
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  SYNC_SECRET?: string;
  ADMIN_API_KEY?: string;
  CRON_SECRET?: string;
  JWT_SECRET?: string;
  PASSWORD_PEPPER?: string;
  ENVIRONMENT?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_GROUP_ID?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_GROUP_LINK?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ADMIN_CHAT_ID?: string;
  TELEGRAM_NOTIFY_KEY?: string;
}

let lastGiveawaySimulationTick = 0;

const SAMPLE_UPCOMING_ICON_SLUGS = new Set([
  'azur-promilia',
  'elancia-mobile',
  'temppal',
  'crownstone',
  'overwatch-rush',
  'plants-vs-zombies-3',
  'garena-free-city',
  'arad-idle-rpg',
]);

function normalizeSyncUpcomingGamesJson(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object') return rawBody;
    const normalizeList = (list: any[]) =>
      list.map((ug: any) => {
        if (!ug || typeof ug !== 'object') return ug;
        const slugLower = String(ug.slug || '').trim().toLowerCase();
        const isSample = SAMPLE_UPCOMING_ICON_SLUGS.has(slugLower);
        const iconVerified = isSample ? false : Boolean(ug.icon_verified);
        const rawSource = typeof ug.icon_source === 'string' ? ug.icon_source.trim() : '';
        const iconSource =
          isSample && (!rawSource || rawSource === 'store chính thức')
            ? 'icon mẫu (chờ xác minh)'
            : rawSource || (iconVerified ? 'store chính thức' : 'chưa xác minh');
        return {
          ...ug,
          icon_verified: iconVerified,
          icon_source: iconSource,
        };
      });
    if (Array.isArray(parsed.upcomingGames)) {
      parsed.upcomingGames = normalizeList(parsed.upcomingGames);
      return JSON.stringify(parsed);
    }
    if (parsed.key === 'wcg_admin_upcoming_games_v1' && Array.isArray(parsed.data)) {
      parsed.data = normalizeList(parsed.data);
      return JSON.stringify(parsed);
    }
    return rawBody;
  } catch {
    return rawBody;
  }
}

async function handleWorkerRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    // Block sensitive dotfiles and configuration probe attacks (.env, .git, .aws, etc.)
    const lowerPath = pathname.toLowerCase();
    if (
      lowerPath.startsWith('/.env') ||
      lowerPath.startsWith('/.git') ||
      lowerPath.startsWith('/.svn') ||
      lowerPath.startsWith('/.hg') ||
      lowerPath.startsWith('/.bzr') ||
      lowerPath.startsWith('/.aws') ||
      lowerPath.startsWith('/.ssh') ||
      lowerPath.startsWith('/.wrangler') ||
      lowerPath === '/.ds_store' ||
      lowerPath === '/thumbs.db'
    ) {
      return new Response('Not Found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // Route handler for mobile APK download: redirect to official GitHub Release
    if (
      pathname === '/download/codegame.apk' ||
      pathname === '/download/Pine Universal Mall-v1.0.apk' ||
      lowerPath === '/download/codegame.apk' ||
      lowerPath === '/download/codegame-v1.0.apk'
    ) {
      return Response.redirect(
        'https://github.com/synqpe-jpg/web-code-game/releases/download/v1.0.0/Pine Universal Mall-v1.0.apk',
        302
      );
    }

    // Canonical primary domain redirect: web-code-game.pages.dev & www.codegame.shop -> codegame.shop (for browser page navigation)
    if (
      (url.hostname === 'web-code-game.pages.dev' || url.hostname === 'www.codegame.shop') &&
      method === 'GET' &&
      !pathname.startsWith('/api') &&
      !pathname.startsWith('/sync-bridge') &&
      !pathname.match(/\.(js|css|json|webp|png|jpg|jpeg|svg|ico|txt|xml|woff2?|map|apk)$/i)
    ) {
      const redirectUrl = new URL(request.url);
      redirectUrl.hostname = 'codegame.shop';
      redirectUrl.protocol = 'https:';
      return Response.redirect(redirectUrl.toString(), 301);
    }

    // Dynamic PWA /manifest.json driven by Cloudflare D1 Brand Identity SSOT
    if (pathname === '/manifest.json' && (method === 'GET' || method === 'HEAD')) {
      const brand = await getBrandIdentity(env.DB);
      const epoch = env.DB ? await getCatalogEpoch(env.DB) : '0';
      const manifestBody = JSON.stringify(buildDynamicManifestJson(brand), null, 2);
      return new Response(method === 'HEAD' ? null : manifestBody, {
        status: 200,
        headers: {
          'Content-Type': 'application/manifest+json; charset=utf-8',
          'Cache-Control': 'public, max-age=0, must-revalidate',
          'CDN-Cache-Control': 'no-store',
          'X-Catalog-Epoch': epoch,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // Dedicated Admin Domain & Route: redirect root to /admin, and serve /admin/index.html with live Brand injection
    const isAdminHost = url.hostname.includes('admin-universal-mall') || url.hostname.includes('admin-code-game-shop') || url.hostname.includes('admin-test-code-game-shop') || url.hostname.startsWith('admin.');
    if (isAdminHost && (pathname === '/' || pathname === '')) {
      const adminRedirect = new URL('/admin', request.url);
      return Response.redirect(adminRedirect.toString(), 302);
    }

    if (
      (isAdminHost || pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/en/admin' || pathname.startsWith('/en/admin/')) &&
      method === 'GET' &&
      !pathname.startsWith('/api') &&
      !pathname.startsWith('/sync-bridge') &&
      !pathname.match(/\.(js|css|json|webp|png|jpg|jpeg|svg|ico|txt|xml|woff2?|map|apk)$/i)
    ) {
      const adminUrl = new URL('/admin/index.html', request.url);
      const res = await env.ASSETS.fetch(new Request(adminUrl.toString()));
      if (res.status === 200) {
        try {
          const brand = await getBrandIdentity(env.DB);
          const epoch = env.DB ? await getCatalogEpoch(env.DB) : '0';
          const brandScript = `<script>window.__WCG_BRAND__=${serializeBrandForInlineScript(brand)};</script>`;
          let adminHtml = await res.text();
          adminHtml = adminHtml.replace(
            /<title>.*?<\/title>/i,
            `<title>Trang Quản Trị | ${brand.adminPortalName}</title>`
          );
          if (adminHtml.includes('</head>')) {
            adminHtml = adminHtml.replace('</head>', `  ${brandScript}\n</head>`);
          }
          return new Response(adminHtml, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'CDN-Cache-Control': 'no-store',
              'X-Catalog-Epoch': epoch,
              'X-Content-Type-Options': 'nosniff',
            },
          });
        } catch {
          return res;
        }
      }
    }

    // CORS Preflight for all API endpoints
    if (method === 'OPTIONS' && pathname.startsWith('/api')) {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Requested-With, X-Forwarded-Sync, Idempotency-Key, idempotency-key, Apikey, apikey, x-api-key, X-Api-Key, Cache-Control, cache-control, Pragma, pragma',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const context: any = {
      request,
      env,
      params: {},
      waitUntil: ctx.waitUntil.bind(ctx),
      next: () => env.ASSETS.fetch(request),
      data: {},
    };

    try {
      // Global Enforcement of Scopes & Device Limits for User AI API Keys (wcg_ai_usr_...)
      const rawAuthHeader = request.headers.get('Authorization') || '';
      const rawAiKeyHeader = request.headers.get('X-User-AI-Key') || request.headers.get('x-user-ai-key') || '';
      const aiTokenCandidate = (rawAiKeyHeader || rawAuthHeader.replace(/^Bearer\s+/i, '')).trim();

      if (aiTokenCandidate.startsWith('wcg_ai_usr_') && pathname.startsWith('/api') && method !== 'OPTIONS') {
        let requiredScope = '';
        if (pathname.match(/^\/api\/orders\/[^\/]+\/dispute/) || pathname.match(/^\/api\/seller-orders\/[^\/]+\/dispute/)) {
          requiredScope = 'disputes';
        } else if (pathname.startsWith('/api/reviews') || pathname.match(/\/rate$/)) {
          requiredScope = 'reviews';
        } else if (pathname.startsWith('/api/seller')) {
          requiredScope = 'seller';
        } else if (
          pathname.startsWith('/api/orders') ||
          pathname.startsWith('/api/seller-orders') ||
          pathname.startsWith('/api/cart') ||
          pathname.startsWith('/api/checkout') ||
          pathname.startsWith('/api/my-seller-orders') ||
          pathname.startsWith('/api/user/wishlist')
        ) {
          requiredScope = 'shopping';
        } else if (pathname.startsWith('/api/rewards') || pathname.startsWith('/api/giveaways')) {
          requiredScope = 'rewards';
        } else if (pathname.startsWith('/api/notifications')) {
          requiredScope = 'notifications';
        } else if (pathname === '/api/me' || pathname.startsWith('/api/user/profile') || pathname.startsWith('/api/telegram')) {
          requiredScope = 'profile';
        }

        if (requiredScope && env.DB) {
          const aiAccess = await verifyUserAiApiAccess(request, env, { requiredScope });
          if (!aiAccess.authorized) {
            return new Response(JSON.stringify({
              success: false,
              error: aiAccess.error || 'Khóa API không có quyền truy cập phạm vi này',
              required_scope: requiredScope,
              code: aiAccess.errorCode || 'FORBIDDEN_SCOPE',
            }), {
              status: aiAccess.status || 403,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
        }
      }

      // 0. /api/db-status
      if (pathname === '/api/db-status') {
        if (!env.DB) {
          return new Response(JSON.stringify({ success: false, connected: false, message: 'D1 binding DB is missing' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        const dbStatusToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim() ||
                              (request.headers.get('X-Sync-Key') || '').trim() ||
                              (request.headers.get('X-Api-Key') || '').trim();
        const adminAuth = await authenticateAdmin(env.DB, dbStatusToken, env);
        if (!adminAuth.authenticated) {
          return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Yêu cầu quyền quản trị viên' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        try {
          const res = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<any>();
          const tables = (res.results || []).map((r: any) => r.name);
          const counts: Record<string, number> = {};
          for (const t of tables) {
            try {
              const c = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM "${t}"`).first<any>();
              counts[t] = Number(c?.cnt ?? 0);
            } catch {
              counts[t] = -1;
            }
          }

          let apiKeysSummary: any[] = [];
          try {
            const keysRes = await env.DB.prepare('SELECT id, key_name, key_prefix, scope, is_active, expires_at FROM mission_ai_api_keys').all<any>();
            apiKeysSummary = (keysRes.results || []).map((k: any) => ({
              id: k.id,
              name: k.key_name,
              prefix: k.key_prefix,
              scope: k.scope,
              active: k.is_active,
              expires: k.expires_at || 'Permanent',
            }));
          } catch {}

          return new Response(JSON.stringify({
            success: true,
            connected: true,
            databaseId: 'f1c32d22-9ad3-41a7-93a4-e9025240c6b2',
            totalTables: tables.length,
            tables,
            counts,
            apiKeys: apiKeysSummary,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ success: false, connected: false, error: e?.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      // 0.1. /api/init-database (Full Database Migration & Multi-industry Schema)
      if (pathname === '/api/init-database') {
        if (!env.DB) {
          return new Response(JSON.stringify({ success: false, message: 'D1 binding DB is missing' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        const initToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim() ||
                          (request.headers.get('X-Sync-Key') || '').trim() ||
                          (request.headers.get('X-Api-Key') || '').trim();
        const adminAuth = await authenticateAdmin(env.DB, initToken, env);
        if (!adminAuth.authenticated) {
          return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Yêu cầu quyền quản trị viên' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        try {
          await initializeD1(env.DB);
          await ensureMarketplaceSchema(env.DB);
          await ensureSchemaUpgrades(env.DB);
          // Việc 3: Dọn sạch vĩnh viễn sản phẩm test khỏi store_products & inventory_codes
          await env.DB.prepare("DELETE FROM store_products WHERE id = 'sp_test_1' OR LOWER(id) LIKE '%test%' OR LOWER(title) LIKE '%test%';").run().catch(() => {});
          await env.DB.prepare("DELETE FROM inventory_codes WHERE product_id = 'sp_test_1' OR LOWER(product_id) LIKE '%test%';").run().catch(() => {});

          // Extra multi-industry tables
          const extraStmts = [
            `CREATE TABLE IF NOT EXISTS categories (
              id TEXT PRIMARY KEY,
              industry_id TEXT NOT NULL,
              name TEXT NOT NULL,
              slug TEXT UNIQUE NOT NULL,
              icon TEXT,
              description TEXT,
              sort_order INTEGER NOT NULL DEFAULT 0,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS products (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              slug TEXT UNIQUE NOT NULL,
              industry_id TEXT NOT NULL,
              category_id TEXT,
              product_type TEXT NOT NULL DEFAULT 'physical',
              original_price INTEGER NOT NULL DEFAULT 0,
              current_price INTEGER NOT NULL DEFAULT 0,
              discount_percent INTEGER NOT NULL DEFAULT 0,
              stock_quantity INTEGER NOT NULL DEFAULT 0,
              thumbnail_url TEXT,
              images_json TEXT,
              description TEXT,
              specifications_json TEXT,
              brand_name TEXT,
              rating_avg REAL NOT NULL DEFAULT 5.0,
              rating_count INTEGER NOT NULL DEFAULT 0,
              sold_count INTEGER NOT NULL DEFAULT 0,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS product_variants (
              id TEXT PRIMARY KEY,
              product_id TEXT NOT NULL,
              sku TEXT UNIQUE NOT NULL,
              variant_name TEXT NOT NULL,
              attributes_json TEXT,
              price INTEGER NOT NULL,
              original_price INTEGER,
              stock_quantity INTEGER NOT NULL DEFAULT 0,
              image_url TEXT,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS vouchers (
              id TEXT PRIMARY KEY,
              code TEXT UNIQUE NOT NULL,
              title TEXT NOT NULL,
              description TEXT,
              discount_type TEXT NOT NULL DEFAULT 'fixed',
              discount_value INTEGER NOT NULL DEFAULT 0,
              min_order_value INTEGER NOT NULL DEFAULT 0,
              max_discount_amount INTEGER,
              voucher_scope TEXT NOT NULL DEFAULT 'platform',
              applicable_industry_ids TEXT,
              start_time TEXT,
              end_time TEXT,
              usage_limit INTEGER NOT NULL DEFAULT 1000,
              used_count INTEGER NOT NULL DEFAULT 0,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS shipping_orders (
              id TEXT PRIMARY KEY,
              order_id TEXT UNIQUE NOT NULL,
              carrier_code TEXT NOT NULL,
              tracking_code TEXT NOT NULL,
              shipping_fee INTEGER NOT NULL DEFAULT 0,
              sender_name TEXT,
              sender_phone TEXT,
              sender_address TEXT,
              recipient_name TEXT NOT NULL,
              recipient_phone TEXT NOT NULL,
              recipient_address TEXT NOT NULL,
              weight_grams INTEGER NOT NULL DEFAULT 500,
              shipping_status TEXT NOT NULL DEFAULT 'created',
              status_timeline_json TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS platform_leads (
              id TEXT PRIMARY KEY,
              full_name TEXT NOT NULL,
              phone TEXT NOT NULL,
              email TEXT,
              service_type TEXT NOT NULL,
              estimated_budget TEXT,
              notes TEXT,
              status TEXT NOT NULL DEFAULT 'new',
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )`
          ];

          for (const stmt of extraStmts) {
            await env.DB.prepare(stmt).run().catch(() => {});
          }

          const res = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<any>();
          const tables = (res.results || []).map((r: any) => r.name);

          return new Response(JSON.stringify({
            success: true,
            message: 'Toàn bộ 47+ bảng D1 đã được khởi tạo thành công!',
            totalTables: tables.length,
            tables,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ success: false, error: e?.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      // 1. /api/sync with Cloudflare Edge Cache API (caches.default)
      if (pathname === '/api/sync') {
        if (method === 'GET') {
          const authHeader = request.headers.get('Authorization') || '';
          const syncKeyHeader = request.headers.get('X-Sync-Key') || '';
          const hasIfNoneMatch = Boolean(request.headers.get('If-None-Match'));
          const explicitBypass = url.searchParams.has('nocache') || url.searchParams.has('fresh');
          const isNoCache = explicitBypass ||
                            (!hasIfNoneMatch && (
                              request.headers.get('Cache-Control')?.includes('no-cache') ||
                              request.headers.get('Pragma')?.includes('no-cache')
                            ));
          const isPublic = !authHeader && !syncKeyHeader && !isNoCache && !url.searchParams.has('key');
          const currentEpoch = env.DB ? await getCatalogEpoch(env.DB) : '0';
          const etag = `W/"sync-${currentEpoch}"`;
          const buildTag = typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : 'live';

          const reqHeaders = new Headers(request.headers);
          reqHeaders.set('X-Internal-Catalog-Epoch', currentEpoch);
          const epochCtx = { ...context, request: new Request(request, { headers: reqHeaders }) };

          // Đồng bộ tức thì qua Catalog Epoch + ETag / 304 + Edge Cache theo khóa epoch cho public GET /api/sync
          if (isPublic) {
            if (matchesIfNoneMatch(request.headers.get('If-None-Match'), etag)) {
              return new Response(null, {
                status: 304,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Expose-Headers': 'ETag, X-Catalog-Epoch, X-Cache-Status, X-Build-Id',
                  'Cache-Control': 'public, max-age=0, must-revalidate',
                  'CDN-Cache-Control': 'no-store',
                  'ETag': etag,
                  'X-Catalog-Epoch': currentEpoch,
                  'X-Cache-Status': 'NOT-MODIFIED',
                },
              });
            }

            const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
            const cacheUrl = new URL(request.url);
            const cacheKey = cache
              ? new Request(
                  `${cacheUrl.origin}${cacheUrl.pathname}?_epoch=${encodeURIComponent(currentEpoch)}&_b=${encodeURIComponent(buildTag)}`,
                  { method: 'GET' }
                )
              : null;

            if (cache && cacheKey) {
              const cached = await cache.match(cacheKey);
              if (cached) {
                const resHeaders = new Headers(cached.headers);
                resHeaders.set('Cache-Control', 'public, max-age=0, must-revalidate');
                resHeaders.set('CDN-Cache-Control', 'no-store');
                resHeaders.set('ETag', etag);
                resHeaders.set('X-Catalog-Epoch', currentEpoch);
                resHeaders.set('CF-Edge-Cache-Status', 'HIT');
                return new Response(cached.body, { status: cached.status, headers: resHeaders });
              }
            }

            const response = await syncApi.onRequestGet(epochCtx);
            if (response.status === 200) {
              const responseText = normalizeSyncUpcomingGamesJson(await response.text());
              const headers = new Headers(response.headers);
              headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
              headers.set('CDN-Cache-Control', 'no-store');
              headers.set('ETag', etag);
              headers.set('X-Catalog-Epoch', currentEpoch);
              headers.set('Access-Control-Expose-Headers', 'ETag, X-Catalog-Epoch, X-Cache-Status, X-Server-Time, X-Build-Id');

              if (cache && cacheKey) {
                const edgeHeaders = new Headers(headers);
                edgeHeaders.set('Cache-Control', 'public, max-age=300');
                edgeHeaders.delete('CDN-Cache-Control');
                ctx.waitUntil(cache.put(cacheKey, new Response(responseText, { status: response.status, headers: edgeHeaders })));
              }

              const resOut = new Response(responseText, {
                status: response.status,
                headers,
              });
              resOut.headers.set('CF-Edge-Cache-Status', 'MISS');
              return resOut;
            }
            return response;
          }

          const bypassRes = await syncApi.onRequestGet(epochCtx);
          if (bypassRes.status === 200) {
            const normalizedBody = normalizeSyncUpcomingGamesJson(await bypassRes.text());
            const headers = new Headers(bypassRes.headers);
            if (isNoCache || authHeader || syncKeyHeader) {
              headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
              headers.set('X-Cache-Status', 'BYPASS');
            }
            headers.set('CDN-Cache-Control', 'no-store');
            headers.set('ETag', etag);
            headers.set('X-Catalog-Epoch', currentEpoch);
            headers.set('Access-Control-Expose-Headers', 'ETag, X-Catalog-Epoch, X-Cache-Status, X-Server-Time, X-Build-Id');
            return new Response(normalizedBody, {
              status: bypassRes.status,
              headers,
            });
          }
          return bypassRes;
        }

        if (method === 'POST') {
          const postRes = await syncApi.onRequestPost(context);
          // Purge Edge Cache toàn cầu (Global REST API + PoP cục bộ)
          await invalidateCatalogEdgeCache(ctx, request, env);
          return postRes;
        }
      }

      // 1b. /api/sync-lite (Lightweight Homepage Data Sync - ~49KB, TTFB < 100ms)
      if (pathname === '/api/sync-lite') {
        if (method === 'OPTIONS') {
          return await syncLiteApi.onRequestOptions(context);
        }
        if (method === 'GET') {
          return await syncLiteApi.onRequestGet(context);
        }
      }

      // 1b. /api/realtime-events (CDN edge cached real events & stats endpoint with 15s Edge Cache)
      if (pathname === '/api/realtime-events') {
        if (method === 'GET') {
          if (typeof caches !== 'undefined' && (caches as any).default) {
            const reqUrl = new URL(request.url);
            const ccHeader = request.headers.get('cache-control') || '';
            const isFreshRequested = reqUrl.searchParams.has('fresh') || reqUrl.searchParams.has('force') || reqUrl.searchParams.has('_t') || ccHeader.includes('no-cache') || ccHeader.includes('no-store');

            const cache = (caches as any).default;
            const cacheUrl = new URL(request.url);
            cacheUrl.search = '';
            const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

            if (!isFreshRequested) {
              const cached = await cache.match(cacheKey);
              if (cached) {
                const res = new Response(cached.body, cached);
                res.headers.set('CF-Edge-Cache-Status', 'HIT');
                return res;
              }
            }

            const response = await realtimeEventsApi.onRequestGet(context);
            if (response.status === 200) {
              const responseText = await response.text();
              const headers = new Headers(response.headers);
              headers.set('Cache-Control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=15');

              const cacheToPut = new Response(responseText, {
                status: response.status,
                headers,
              });
              ctx.waitUntil(cache.put(cacheKey, cacheToPut));

              const resOut = new Response(responseText, {
                status: response.status,
                headers,
              });
              resOut.headers.set('CF-Edge-Cache-Status', 'MISS');
              return resOut;
            }
            return response;
          }

          if (realtimeEventsApi.onRequestGet) return await realtimeEventsApi.onRequestGet(context);
        }
        if (method === 'OPTIONS' && realtimeEventsApi.onRequestOptions) return await realtimeEventsApi.onRequestOptions(context);
      }

      // 1c. /api/metrics/synced (Global deterministic snapshot with 30s Edge Cache)
      if (pathname === '/api/metrics/synced') {
        if (method === 'GET') {
          if (typeof caches !== 'undefined' && (caches as any).default) {
            const reqUrl = new URL(request.url);
            const ccHeader = request.headers.get('cache-control') || '';
            const isFreshRequested = reqUrl.searchParams.has('fresh') || reqUrl.searchParams.has('force') || reqUrl.searchParams.has('_t') || reqUrl.searchParams.has('t') || ccHeader.includes('no-cache') || ccHeader.includes('no-store');

            const cache = (caches as any).default;
            const cacheUrl = new URL(request.url);
            cacheUrl.search = '';
            const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

            if (!isFreshRequested) {
              const cached = await cache.match(cacheKey);
              if (cached) {
                const res = new Response(cached.body, cached);
                res.headers.set('CF-Edge-Cache-Status', 'HIT');
                return res;
              }
            }

            const response = await metricsSyncedApi.onRequestGet(context);
            if (response.status === 200) {
              const responseText = await response.text();
              const headers = new Headers(response.headers);
              headers.set('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=30');

              const cacheToPut = new Response(responseText, {
                status: response.status,
                headers,
              });
              ctx.waitUntil(cache.put(cacheKey, cacheToPut));

              const resOut = new Response(responseText, {
                status: response.status,
                headers,
              });
              resOut.headers.set('CF-Edge-Cache-Status', 'MISS');
              return resOut;
            }
            return response;
          }

          return await metricsSyncedApi.onRequestGet(context);
        }
      }

      // 1d. /api/games (Server-Side Pagination, Edge Cache API with Full Query String)
      if (pathname === '/api/games') {
        if (method === 'GET' && gamesApi.onRequestGet) {
          const reqUrl = new URL(request.url);
          const isNoCache = reqUrl.searchParams.has('nocache') ||
                            reqUrl.searchParams.has('fresh') ||
                            request.headers.get('Cache-Control')?.includes('no-cache') ||
                            request.headers.get('Pragma')?.includes('no-cache');

          // Edge Cache API: caches.default with cache key by full query string
          if (!isNoCache && typeof caches !== 'undefined' && (caches as any).default) {
            const cache = (caches as any).default;
            const cacheKey = new Request(request.url, { method: 'GET' });

            const cached = await cache.match(cacheKey);
            if (cached) {
              const res = new Response(cached.body, cached);
              res.headers.set('CF-Edge-Cache-Status', 'HIT');
              return res;
            }

            const response = await gamesApi.onRequestGet(context);
            if (response.status === 200) {
              const responseText = await response.text();
              const headers = new Headers(response.headers);
              // Cache at edge for 120s, stale-while-revalidate for 600s
              headers.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=600');

              const cacheToPut = new Response(responseText, {
                status: response.status,
                headers,
              });
              ctx.waitUntil(cache.put(cacheKey, cacheToPut));

              const resOut = new Response(responseText, {
                status: response.status,
                headers,
              });
              resOut.headers.set('CF-Edge-Cache-Status', 'MISS');
              return resOut;
            }
            return response;
          }

          return await gamesApi.onRequestGet(context);
        }
        if (method === 'OPTIONS' && gamesApi.onRequestOptions) return await gamesApi.onRequestOptions(context);
      }

      // 2. /api/stats
      if (pathname === '/api/stats') {
        if (method === 'GET' && statsApi.onRequestGet) return await statsApi.onRequestGet(context);
      }

      // 3. /api/vote
      if (pathname === '/api/vote') {
        if (method === 'POST' && voteApi.onRequestPost) return await voteApi.onRequestPost(context);
      }

      // 4. /api/auth/*
      if (pathname === '/api/auth/login') {
        if (method === 'POST') return await loginApi.onRequestPost(context);
      }
      if (pathname === '/api/auth/register') {
        if (method === 'POST') return await registerApi.onRequestPost(context);
      }
      if (pathname === '/api/auth/me') {
        if (method === 'GET') return await meApi.onRequestGet(context);
        if (method === 'POST' && meApi.onRequestPost) return await meApi.onRequestPost(context);
        if (method === 'PUT' && meApi.onRequestPut) return await meApi.onRequestPut(context);
      }
      if (pathname === '/api/auth/reset-password') {
        if (method === 'POST') return await resetPasswordApi.onRequestPost(context);
      }
      if (pathname === '/api/auth/verify-email') {
        if (method === 'OPTIONS' && verifyEmailApi.onRequestOptions) return await verifyEmailApi.onRequestOptions(context);
        if (method === 'POST' && verifyEmailApi.onRequestPost) return await verifyEmailApi.onRequestPost(context);
      }
      if (pathname === '/api/auth/turnstile-config') {
        if (method === 'OPTIONS') return await turnstileConfigApi.onRequestOptions(context);
        if (method === 'GET') return await turnstileConfigApi.onRequestGet(context);
      }

      // 5. /api/orders/*
      if (pathname === '/api/orders/create-qr') {
        if (method === 'OPTIONS' && ordersCreateQrApi.onRequestOptions) return await ordersCreateQrApi.onRequestOptions(context);
        if (method === 'POST') {
          const res = await ordersCreateQrApi.onRequestPost(context);
          if (res.status === 200) {
            await invalidateCatalogEdgeCache(ctx, request, env);
          }
          return res;
        }
      }
      if (pathname === '/api/orders/status') {
        if (method === 'OPTIONS' && ordersStatusApi.onRequestOptions) return await ordersStatusApi.onRequestOptions(context);
        if (method === 'GET' && ordersStatusApi.onRequestGet) return await ordersStatusApi.onRequestGet(context);
      }
      if (pathname === '/api/orders/create' || pathname === '/api/orders') {
        if (method === 'POST') {
          const res = await ordersCreateApi.onRequestPost(context);
          if (res.status === 200) {
            await invalidateCatalogEdgeCache(ctx, request, env);
          }
          return res;
        }
      }

      // 5b. /api/orders/:id/confirm-received (Bảo chứng 168h: Khách xác nhận đã nhận hàng -> Giải ngân cho người bán)
      if (pathname.match(/^\/api\/orders\/([^\/]+)\/confirm-received$/)) {
        if (method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
        }
        if (method === 'POST') {
          if (!env.DB) return new Response(JSON.stringify({ success: false, message: 'D1 binding DB is missing' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          const authHeader = request.headers.get('Authorization') || '';
          const token = authHeader.replace(/^Bearer\s+/i, '').trim();
          const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
          if (!auth.authenticated || !auth.member) {
            return new Response(JSON.stringify({ success: false, message: 'Yêu cầu đăng nhập hợp lệ để xác nhận nhận hàng.', code: 'UNAUTHORIZED' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
          const match = pathname.match(/^\/api\/orders\/([^\/]+)\/confirm-received$/);
          const orderId = match ? match[1] : '';
          const userId = auth.member.id;
          const isAdmin = auth.member.role === 'admin' || auth.member.role === 'SUPER_ADMIN';
          const result = await confirmReceivedAndRelease(env.DB, orderId, userId, `user_${userId}`, isAdmin);
          return new Response(JSON.stringify(result), {
            status: result.success ? 200 : 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      // 5c. /api/orders/:id/dispute (Bảo chứng 168h: Khách khiếu nại trong 168h -> Đóng băng tiền, chờ Admin xử lý)
      if (pathname.match(/^\/api\/orders\/([^\/]+)\/dispute$/)) {
        if (method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
        }
        if (method === 'POST') {
          if (!env.DB) return new Response(JSON.stringify({ success: false, message: 'D1 binding DB is missing' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          const authHeader = request.headers.get('Authorization') || '';
          const token = authHeader.replace(/^Bearer\s+/i, '').trim();
          const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
          if (!auth.authenticated || !auth.member) {
            return new Response(JSON.stringify({ success: false, message: 'Yêu cầu đăng nhập hợp lệ để khiếu nại đơn hàng.', code: 'UNAUTHORIZED' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
          const match = pathname.match(/^\/api\/orders\/([^\/]+)\/dispute$/);
          const orderId = match ? match[1] : '';
          const userId = auth.member.id;
          const body: any = await request.json().catch(() => ({}));
          const reason = body?.reason || 'Hàng lỗi hoặc không nhận được hàng';
          const detail = body?.detail || '';
          const result = await fileOrderDispute(env.DB, { orderId, userId, reason, detail });
          return new Response(JSON.stringify(result), {
            status: result.success ? 200 : 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      // 5d. /api/orders/auto-release-escrow (Bảo chứng 168h: Tự động giải ngân sau 168h không khiếu nại)
      if (pathname === '/api/orders/auto-release-escrow') {
        if (method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
        }
        if (!env.DB) return new Response(JSON.stringify({ success: false, message: 'D1 binding DB is missing' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const isCronSecret = Boolean(env.CRON_SECRET && env.CRON_SECRET.length >= 16 && token === env.CRON_SECRET.trim());
        const adminAuth = await authenticateAdmin(env.DB, token, env);
        if (!isCronSecret && !adminAuth.authenticated) {
          return new Response(JSON.stringify({ success: false, message: 'Yêu cầu quyền Quản trị viên hoặc Cron Secret hợp lệ để chạy giải ngân tự động.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        const result = await autoReleaseDueEscrow(env.DB, 'system_auto_release_168h');
        return new Response(JSON.stringify({ success: true, ...result }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      // 5e. /api/admin/orders/:id/resolve-dispute (Admin xử lý khiếu nại: RELEASE hoặc REFUND)
      if (pathname.match(/^\/api\/admin\/orders\/([^\/]+)\/resolve-dispute$/)) {
        if (method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
        }
        if (method === 'POST') {
          if (!env.DB) return new Response(JSON.stringify({ success: false, message: 'D1 binding DB is missing' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          const authHeader = request.headers.get('Authorization') || '';
          const token = authHeader.replace(/^Bearer\s+/i, '').trim();
          const adminAuth = await authenticateAdmin(env.DB, token, env);
          if (!adminAuth.authenticated) {
            return new Response(JSON.stringify({ success: false, message: 'Yêu cầu quyền Quản trị viên để xử lý khiếu nại đơn hàng.' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
          const match = pathname.match(/^\/api\/admin\/orders\/([^\/]+)\/resolve-dispute$/);
          const orderId = match ? match[1] : '';
          const adminId = adminAuth.adminId || 'admin';
          const body: any = await request.json().catch(() => ({}));
          const resolution = body?.resolution === 'REFUND' ? 'REFUND' : 'RELEASE';
          const note = body?.note || '';
          const result = await resolveAdminDispute(env.DB, { orderId, resolution, adminId, note });
          return new Response(JSON.stringify(result), {
            status: result.success ? 200 : 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      // 5f. /api/products/:id/reviews & /api/reviews (Public reviews & ratings)
      if (pathname.match(/^\/api\/products\/([^\/]+)\/reviews$/) || pathname === '/api/reviews') {
        const prodMatch = pathname.match(/^\/api\/products\/([^\/]+)\/reviews$/);
        const productId = prodMatch ? prodMatch[1] : url.searchParams.get('productId');
        if (method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
        }
        if (!env.DB) return new Response(JSON.stringify({ success: false, message: 'D1 binding DB is missing' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        if (method === 'GET') {
          if (!productId) {
            return new Response(JSON.stringify({ success: false, message: 'Thiếu productId' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }
          const authHeader = request.headers.get('Authorization') || '';
          const token = authHeader.replace(/^Bearer\s+/i, '').trim();
          let currentUserId: string | undefined = undefined;
          if (token) {
            const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
            if (auth.authenticated && auth.member) {
              currentUserId = auth.member.id;
            }
          }
          const reviewsData = await getProductReviews(env.DB, productId, currentUserId);
          return new Response(JSON.stringify({ success: true, ...reviewsData }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        if (method === 'POST') {
          const authHeader = request.headers.get('Authorization') || '';
          const token = authHeader.replace(/^Bearer\s+/i, '').trim();
          const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
          if (!auth.authenticated || !auth.member) {
            return new Response(JSON.stringify({ success: false, message: 'Vui lòng đăng nhập để gửi đánh giá sản phẩm.', code: 'UNAUTHORIZED' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
          const userId = auth.member.id;
          const body: any = await request.json().catch(() => ({}));
          const targetProductId = productId || body?.productId;
          const rating = Number(body?.rating);
          const comment = String(body?.comment || '');
          const userName = auth.member.display_name || auth.member.username || 'Khách hàng';

          if (!targetProductId) {
            return new Response(JSON.stringify({ success: false, message: 'Thiếu productId', code: 'MISSING_PRODUCT_ID' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }

          const result = await createProductReview(env.DB, {
            productId: targetProductId,
            userId,
            userName,
            rating,
            comment,
          });

          return new Response(JSON.stringify(result), {
            status: result.success ? 200 : (result.code === 'NOT_PURCHASED' ? 403 : 400),
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      // 5g. /api/admin/reviews (Admin review moderation: list, approve, reject, delete)
      if (pathname === '/api/admin/reviews' || pathname.startsWith('/api/admin/reviews/')) {
        if (method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
        }
        if (!env.DB) return new Response(JSON.stringify({ success: false, message: 'D1 binding DB is missing' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const adminAuth = await authenticateAdmin(env.DB, token, env);
        if (!adminAuth.authenticated) {
          return new Response(JSON.stringify({ success: false, message: 'Yêu cầu quyền Quản trị viên để kiểm duyệt đánh giá.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        if (pathname === '/api/admin/reviews' && method === 'GET') {
          const status = url.searchParams.get('status') || undefined;
          const listRes = await listAdminReviews(env.DB, status);
          return new Response(JSON.stringify(listRes), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        const approveMatch = pathname.match(/^\/api\/admin\/reviews\/([^\/]+)\/approve$/);
        if (approveMatch && method === 'POST') {
          const res = await approveReview(env.DB, approveMatch[1]);
          return new Response(JSON.stringify(res), {
            status: res.success ? 200 : 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        const rejectMatch = pathname.match(/^\/api\/admin\/reviews\/([^\/]+)\/reject$/);
        if (rejectMatch && method === 'POST') {
          const body: any = await request.json().catch(() => ({}));
          const res = await rejectReview(env.DB, rejectMatch[1], body?.adminNote);
          return new Response(JSON.stringify(res), {
            status: res.success ? 200 : 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        const deleteMatch = pathname.match(/^\/api\/admin\/reviews\/([^\/]+)$/);
        if (deleteMatch && method === 'DELETE') {
          const res = await deleteReview(env.DB, deleteMatch[1]);
          return new Response(JSON.stringify(res), {
            status: res.success ? 200 : 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      // 6a. /api/webhooks/sepay/seller/:sellerId (Per-Seller Direct SePay Webhook — DIRECT_SEPAY)
      const matchSellerSepayWebhook = pathname.match(/^\/api\/webhooks\/sepay\/seller\/([^/]+)$/);
      if (matchSellerSepayWebhook) {
        context.params = { ...(context.params || {}), sellerId: matchSellerSepayWebhook[1] };
        if (method === 'OPTIONS') return await sellerSepayWebhookApi.onRequestOptions(context);
        if (method === 'GET') return await sellerSepayWebhookApi.onRequestGet(context);
        if (method === 'POST') return await sellerSepayWebhookApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 6. /api/webhooks/sepay
      if (pathname === '/api/webhooks/sepay' || pathname === '/api/webhooks') {
        if (method === 'POST') return await sepayWebhookApi.onRequestPost(context);
        if (method === 'GET' && sepayWebhookApi.onRequestGet) return await sepayWebhookApi.onRequestGet(context);
      }

      // 6b. /api/webhooks/affiliate-postback (PA1 Affiliate Postback HMAC)
      if (pathname === '/api/webhooks/affiliate-postback') {
        if (method === 'OPTIONS') return await affiliatePostbackWebhookApi.onRequestOptions(context);
        if (method === 'POST') return await affiliatePostbackWebhookApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 7. /api/giveaways/claim (epoch bumped once inside claim.ts when a new code is claimed)
      if (pathname === '/api/giveaways/claim') {
        if (method === 'OPTIONS') return await giveawaysClaimApi.onRequestOptions(context);
        if (method === 'POST') {
          return await giveawaysClaimApi.onRequestPost(context);
        }
      }

      // 7b. /api/giveaways/simulate (epoch bumped once inside simulate.ts only when simulatedCount > 0)
      if (pathname === '/api/giveaways/simulate') {
        if (method === 'OPTIONS') return await giveawaysSimulateApi.onRequestOptions(context);
        if (method === 'GET') return await giveawaysSimulateApi.onRequestGet(context);
        if (method === 'POST') {
          return await giveawaysSimulateApi.onRequestPost(context);
        }
      }

      // 7c. /api/giveaways/manage & /api/giveaways (Giveaway Full Management Edge API)
      if (pathname === '/api/giveaways/manage' || pathname === '/api/giveaways') {
        if (method === 'OPTIONS') return await giveawaysManageApi.onRequestOptions();
        if (method === 'POST') return await giveawaysManageApi.onRequestPost(context);
        if (method === 'PUT') return await giveawaysManageApi.onRequestPut(context);
        if (method === 'DELETE') return await giveawaysManageApi.onRequestDelete(context);
        return await giveawaysManageApi.onRequestGet(context);
      }

      // 7d. /api/event-scheduler & /api/events/schedule (Event Scheduler & Countdown Full Management Edge API)
      if (pathname === '/api/event-scheduler' || pathname === '/api/events/schedule') {
        if (method === 'OPTIONS') return await eventSchedulerApi.onRequestOptions(context);
        if (method === 'POST') return await eventSchedulerApi.onRequestPost(context);
        if (method === 'PUT') return await eventSchedulerApi.onRequestPut(context);
        if (method === 'DELETE') return await eventSchedulerApi.onRequestDelete(context);
        return await eventSchedulerApi.onRequestGet(context);
      }

      // 7e. /api/store/manage & /api/store & /api/products/manage (Store & Inventory Full Management API)
      if (pathname === '/api/store/manage' || pathname === '/api/store' || pathname === '/api/products/manage') {
        if (method === 'OPTIONS') return await storeManageApi.onRequestOptions(context);
        if (method === 'POST') return await storeManageApi.onRequestPost(context);
        return await storeManageApi.onRequestGet(context);
      }

      // 7f. /api/store/my-offer (First Purchase Offer Eligibility Check API)
      if (pathname === '/api/store/my-offer') {
        if (method === 'OPTIONS') return await storeMyOfferApi.onRequestOptions();
        return await storeMyOfferApi.onRequestGet(context);
      }

      // 7g. /api/store/escalating (Escalating Price Query API)
      if (pathname === '/api/store/escalating') {
        if (method === 'OPTIONS') return await escalatingApi.onRequestOptions();
        return await escalatingApi.onRequestGet(context);
      }

      // 7h. Universal Mall Commerce Platform RESTful APIs
      // Products API (/api/products & /api/products/:id)
      if (pathname === '/api/products') {
        if (method === 'OPTIONS') return await productsIndexApi.onRequestOptions(context);
        if (method === 'POST') return await productsIndexApi.onRequestPost(context);
        return await productsIndexApi.onRequestGet(context);
      }
      if (pathname.startsWith('/api/products/') && pathname !== '/api/products') {
        const prodId = pathname.replace('/api/products/', '').trim();
        const customContext = { ...context, params: { id: prodId } };
        if (method === 'OPTIONS') return await productsIdApi.onRequestOptions(customContext);
        if (method === 'PUT' || method === 'PATCH') return await productsIdApi.onRequestPut(customContext);
        if (method === 'DELETE') return await productsIdApi.onRequestDelete(customContext);
        return await productsIdApi.onRequestGet(customContext);
      }

      // Categories API (/api/categories & /api/categories/:id)
      if (pathname === '/api/categories') {
        if (method === 'OPTIONS') return await categoriesIndexApi.onRequestOptions(context);
        if (method === 'POST') return await categoriesIndexApi.onRequestPost(context);
        return await categoriesIndexApi.onRequestGet(context);
      }
      if (pathname.startsWith('/api/categories/') && pathname !== '/api/categories') {
        const catId = pathname.replace('/api/categories/', '').trim();
        const customContext = { ...context, params: { id: catId } };
        if (method === 'OPTIONS') return await categoriesIdApi.onRequestOptions(customContext);
        if (method === 'PUT' || method === 'PATCH') return await categoriesIdApi.onRequestPut(customContext);
        if (method === 'DELETE') return await categoriesIdApi.onRequestDelete(customContext);
      }

      // Brand Identity Public & Admin APIs (/api/brand, /api/admin/brand)
      if (pathname === '/api/brand') {
        if (method === 'OPTIONS') return await brandPublicApi.onRequestOptions(context);
        return await brandPublicApi.onRequestGet(context);
      }
      if (pathname === '/api/admin/brand') {
        if (method === 'OPTIONS') return await adminBrandApi.onRequestOptions(context);
        if (method === 'PUT' || method === 'PATCH') return await adminBrandApi.onRequestPut(context);
        if (method === 'POST') return await adminBrandApi.onRequestPost(context);
        return await adminBrandApi.onRequestGet(context);
      }

      // Homepage Sections Public API (/api/homepage-sections)
      if (pathname === '/api/homepage-sections') {
        if (method === 'OPTIONS') return await homepageSectionsPublicApi.onRequestOptions();
        if (method === 'GET') return await homepageSectionsPublicApi.onRequestGet(context);
        if (method === 'PUT') return await homepageSectionsPublicApi.onRequestPut(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // Vouchers API (/api/vouchers, /api/admin/vouchers, /api/vouchers/verify, /api/vouchers/redeem & /api/vouchers/:id)
      if (pathname === '/api/vouchers/redeem' || pathname === '/api/admin/vouchers/redeem') {
        if (method === 'OPTIONS') return await vouchersRedeemApi.onRequestOptions();
        if (method === 'POST') return await vouchersRedeemApi.onRequestPost(context);
      }
      if (pathname === '/api/vouchers/verify' || pathname === '/api/admin/vouchers/verify') {
        if (method === 'OPTIONS') return await vouchersVerifyApi.onRequestOptions(context);
        if (method === 'POST') return await vouchersVerifyApi.onRequestPost(context);
      }
      if (pathname === '/api/vouchers' || pathname === '/api/admin/vouchers') {
        if (method === 'OPTIONS') return await vouchersIndexApi.onRequestOptions(context);
        if (method === 'POST') return await vouchersIndexApi.onRequestPost(context);
        return await vouchersIndexApi.onRequestGet(context);
      }
      if ((pathname.startsWith('/api/vouchers/') && pathname !== '/api/vouchers') ||
          (pathname.startsWith('/api/admin/vouchers/') && pathname !== '/api/admin/vouchers')) {
        const voucherId = pathname.replace(/^\/api\/(?:admin\/)?vouchers\//, '').trim();
        const customContext = { ...context, params: { id: voucherId } };
        if (method === 'OPTIONS') return await vouchersIdApi.onRequestOptions(customContext);
        if (method === 'PUT' || method === 'PATCH') return await vouchersIdApi.onRequestPut(customContext);
        if (method === 'DELETE') return await vouchersIdApi.onRequestDelete(customContext);
        return await vouchersIdApi.onRequestGet(customContext);
      }

      // Shipping Fee Calculation API (/api/shipping/calculate-fee)
      if (pathname === '/api/shipping/calculate-fee') {
        if (method === 'OPTIONS') return await shippingCalculateFeeApi.onRequestOptions(context);
        if (method === 'POST') return await shippingCalculateFeeApi.onRequestPost(context);
        return await shippingCalculateFeeApi.onRequestGet(context);
      }

      // Shipping Orders API (/api/shipping & /api/shipping/:id)
      if (pathname === '/api/shipping') {
        if (method === 'OPTIONS') return await shippingIndexApi.onRequestOptions(context);
        if (method === 'POST') return await shippingIndexApi.onRequestPost(context);
        return await shippingIndexApi.onRequestGet(context);
      }
      if (pathname.startsWith('/api/shipping/') && pathname !== '/api/shipping') {
        const shipId = pathname.replace('/api/shipping/', '').trim();
        const customContext = { ...context, params: { id: shipId } };
        if (method === 'OPTIONS') return await shippingIdApi.onRequestOptions(customContext);
        if (method === 'DELETE') return await shippingIdApi.onRequestDelete(customContext);
        if (method === 'PATCH' || method === 'PUT') return await shippingIdApi.onRequestPatch(customContext);
        return await shippingIdApi.onRequestGet(customContext);
      }

      // Platform Leads API (/api/platform-leads, /api/tenant-leads & /api/platform-leads/:id)
      if (pathname === '/api/platform-leads' || pathname === '/api/tenant-leads') {
        if (method === 'OPTIONS') return await platformLeadsIndexApi.onRequestOptions(context);
        if (method === 'POST') return await platformLeadsIndexApi.onRequestPost(context);
        return await platformLeadsIndexApi.onRequestGet(context);
      }
      if ((pathname.startsWith('/api/platform-leads/') || pathname.startsWith('/api/tenant-leads/')) && pathname !== '/api/platform-leads' && pathname !== '/api/tenant-leads') {
        const leadId = pathname.replace(/^\/api\/(platform-leads|tenant-leads)\//, '').trim();
        const customContext = { ...context, params: { id: leadId } };
        if (method === 'OPTIONS') return await platformLeadsIdApi.onRequestOptions(customContext);
        if (method === 'PATCH' || method === 'PUT') return await platformLeadsIdApi.onRequestPatch(customContext);
      }

      // Passive Tick: Tự động chạy quét mô phỏng mỗi 5 phút một cách nhẹ nhàng
      if (env.DB && (Date.now() - lastGiveawaySimulationTick > 300000)) {
        lastGiveawaySimulationTick = Date.now();
        ctx.waitUntil(
          runGiveawaySimulation(env.DB).catch((e: any) => console.warn('[AutoSimTick error]', e?.message))
        );
      }

      // 8. /api/admin/migrate (PERMANENTLY LOCKED & DISABLED)
      if (pathname === '/api/admin/migrate') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'ENDPOINT_PERMANENTLY_LOCKED',
            message: 'Tuyến đường /api/admin/migrate đã được khóa vĩnh viễn sau khi hoàn tất di chuyển dữ liệu sang D1.',
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      // 8b. /api/admin/audit-counters (Counter Cache Audit & Drift Recovery)
      if (pathname === '/api/admin/audit-counters') {
        if (method === 'GET') return await adminAuditCountersApi.onRequestGet(context);
        if (method === 'POST') return await adminAuditCountersApi.onRequestPost(context);
        if (method === 'OPTIONS') return await adminAuditCountersApi.onRequestOptions(context);
      }

      // 8c. /api/admin/sepay-credit (Manual SePay Credit & Compensation)
      if (pathname === '/api/admin/sepay-credit') {
        if (method === 'POST') return await adminSepayCreditApi.onRequestPost(context);
        if (method === 'OPTIONS') return await adminSepayCreditApi.onRequestOptions(context);
      }

      // 8c-2. /api/admin/temporary-token (Temporary Audit Token Management)
      if (pathname === '/api/admin/temporary-token') {
        if (method === 'GET') return await adminTemporaryTokenApi.onRequestGet(context);
        if (method === 'POST') return await adminTemporaryTokenApi.onRequestPost(context);
        if (method === 'OPTIONS') return await adminTemporaryTokenApi.onRequestOptions(context);
      }

      // 8c-3. /api/admin/history (Soft-Delete History & Recovery API)
      if (pathname === '/api/admin/history') {
        if (method === 'GET') return await adminHistoryApi.onRequestGet(context);
        if (method === 'POST') return await adminHistoryApi.onRequestPost(context);
        if (method === 'OPTIONS') return await adminHistoryApi.onRequestOptions(context);
      }

      // 8c-4. /api/admin/first-purchase (First Purchase Offer Campaign Management API)
      if (pathname === '/api/admin/first-purchase') {
        if (method === 'OPTIONS') return await firstPurchaseAdminApi.onRequestOptions(context);
        if (method === 'POST') return await firstPurchaseAdminApi.onRequestPost(context);
        return await firstPurchaseAdminApi.onRequestGet(context);
      }

      // 8c-5. /api/admin/escalating/* (Escalating Price History, Packages & Reset API)
      if (
        pathname === '/api/admin/escalating/history' ||
        pathname === '/api/admin/escalating/reset' ||
        pathname === '/api/admin/escalating/packages'
      ) {
        if (method === 'OPTIONS') return await escalatingApi.onRequestOptions();
        if (method === 'POST') return await escalatingApi.onRequestPost(context);
        return await escalatingApi.onRequestGet(context);
      }

      // 8c-6. /api/admin/audit-log (Security & Audit Logs API)
      if (pathname === '/api/admin/audit-log') {
        if (method === 'OPTIONS') return await auditLogAdminApi.onRequestOptions();
        return await auditLogAdminApi.onRequestGet(context);
      }

      // 8c-7. /api/admin/members/adjust-balance (Admin Member Balance Adjustment API)
      if (
        pathname === '/api/admin/members/adjust-balance' ||
        pathname === '/api/admin/members/adjust'
      ) {
        if (method === 'OPTIONS') return await adminMembersAdjustBalanceApi.onRequestOptions();
        if (method === 'POST') return await adminMembersAdjustBalanceApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 8c-8. /api/admin/utilities/first-purchase (Utilities First Purchase Offer Config API)
      if (
        pathname === '/api/admin/utilities/first-purchase' ||
        pathname.startsWith('/api/admin/utilities/first-purchase/')
      ) {
        if (method === 'OPTIONS') return await adminUtilitiesFirstPurchaseApi.onRequestOptions(context);
        if (method === 'PUT') return await adminUtilitiesFirstPurchaseApi.onRequestPut(context);
        if (method === 'GET') return await adminUtilitiesFirstPurchaseApi.onRequestGet(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 8c-9. /api/admin/store/first-purchase (Store Products First Purchase Offer Config API)
      if (
        pathname === '/api/admin/store/first-purchase' ||
        pathname.startsWith('/api/admin/store/first-purchase/')
      ) {
        if (method === 'OPTIONS') return await adminStoreFirstPurchaseApi.onRequestOptions(context);
        if (method === 'PUT') return await adminStoreFirstPurchaseApi.onRequestPut(context);
        if (method === 'GET') return await adminStoreFirstPurchaseApi.onRequestGet(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 8c-10. /api/admin/members (Dedicated Members Management API)
      if (pathname === '/api/admin/members') {
        if (method === 'OPTIONS') return await adminMembersIndexApi.onRequestOptions();
        if (method === 'GET') return await adminMembersIndexApi.onRequestGet(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname.startsWith('/api/admin/members/')) {
        // Skip adjust-balance handled by 8c-7
        if (pathname === '/api/admin/members/adjust-balance' || pathname === '/api/admin/members/adjust') {
          // Handled in 8c-7
        } else if (pathname.endsWith('/ban')) {
          if (method === 'OPTIONS') return await adminMembersBanApi.onRequestOptions();
          if (method === 'POST') return await adminMembersBanApi.onRequestPost(context);
          return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
        } else if (pathname.endsWith('/unban')) {
          if (method === 'OPTIONS') return await adminMembersUnbanApi.onRequestOptions();
          if (method === 'POST') return await adminMembersUnbanApi.onRequestPost(context);
          return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
        } else {
          // /api/admin/members/:id
          if (method === 'OPTIONS') return await adminMembersIdApi.onRequestOptions();
          if (method === 'GET') return await adminMembersIdApi.onRequestGet(context);
          if (method === 'PUT') return await adminMembersIdApi.onRequestPut(context);
          return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
        }
      }

      // 8c-11. /api/admin/wallets (Dedicated Wallet & Ledger API)
      if (pathname === '/api/admin/wallets/transactions') {
        if (method === 'OPTIONS') return await adminWalletsTransactionsApi.onRequestOptions();
        if (method === 'GET') return await adminWalletsTransactionsApi.onRequestGet(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname.startsWith('/api/admin/wallets/')) {
        if (method === 'OPTIONS') return await adminWalletsMemberIdApi.onRequestOptions();
        if (method === 'GET') return await adminWalletsMemberIdApi.onRequestGet(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-12. /api/admin/orders (Dedicated Orders API)
      if (pathname === '/api/admin/orders') {
        if (method === 'OPTIONS') return await adminOrdersIndexApi.onRequestOptions();
        if (method === 'GET') return await adminOrdersIndexApi.onRequestGet(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname.startsWith('/api/admin/orders/')) {
        if (pathname.endsWith('/refund')) {
          if (method === 'OPTIONS') return await adminOrdersRefundApi.onRequestOptions();
          if (method === 'POST') return await adminOrdersRefundApi.onRequestPost(context);
          return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'OPTIONS') return await adminOrdersIdApi.onRequestOptions();
        if (method === 'GET') return await adminOrdersIdApi.onRequestGet(context);
        if (method === 'DELETE' && (adminOrdersIdApi as any).onRequestDelete) return await (adminOrdersIdApi as any).onRequestDelete(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-13. /api/admin/sepay (Dedicated SePay Transactions & Config API)
      if (pathname === '/api/admin/sepay/transactions') {
        if (method === 'OPTIONS') return await adminSepayTransactionsApi.onRequestOptions();
        if (method === 'GET') return await adminSepayTransactionsApi.onRequestGet(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname === '/api/admin/sepay/config') {
        if (method === 'OPTIONS') return await adminSepayConfigApi.onRequestOptions();
        if (method === 'GET') return await adminSepayConfigApi.onRequestGet(context);
        if (method === 'PUT') return await adminSepayConfigApi.onRequestPut(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-14. /api/admin/free-codes (Dedicated Free Giftcodes API)
      if (pathname === '/api/admin/free-codes') {
        if (method === 'OPTIONS') return await adminFreeCodesIndexApi.onRequestOptions();
        if (method === 'GET') return await adminFreeCodesIndexApi.onRequestGet(context);
        if (method === 'POST') return await adminFreeCodesIndexApi.onRequestPost(context);
        if (method === 'DELETE') return await adminFreeCodesIndexApi.onRequestDelete(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname.startsWith('/api/admin/free-codes/')) {
        if (method === 'OPTIONS') return await adminFreeCodesIdApi.onRequestOptions();
        if (method === 'PUT') return await adminFreeCodesIdApi.onRequestPut(context);
        if (method === 'DELETE') return await adminFreeCodesIdApi.onRequestDelete(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-15. /api/admin/submissions (Dedicated Giftcode Submissions API)
      if (pathname === '/api/admin/submissions') {
        if (method === 'OPTIONS') return await adminSubmissionsIndexApi.onRequestOptions();
        if (method === 'GET') return await adminSubmissionsIndexApi.onRequestGet(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname.startsWith('/api/admin/submissions/')) {
        if (pathname.endsWith('/approve')) {
          if (method === 'OPTIONS') return await adminSubmissionsApproveApi.onRequestOptions();
          if (method === 'POST') return await adminSubmissionsApproveApi.onRequestPost(context);
          return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
        }
        if (pathname.endsWith('/reject')) {
          if (method === 'OPTIONS') return await adminSubmissionsRejectApi.onRequestOptions();
          if (method === 'POST') return await adminSubmissionsRejectApi.onRequestPost(context);
          return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
        }
      }

      // 8c-16. /api/admin/content (Dedicated Web CMS Content API)
      if (pathname === '/api/admin/content') {
        if (method === 'OPTIONS') return await adminContentIndexApi.onRequestOptions();
        if (method === 'GET') return await adminContentIndexApi.onRequestGet(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname.startsWith('/api/admin/content/')) {
        if (method === 'OPTIONS') return await adminContentKeyApi.onRequestOptions();
        if (method === 'GET') return await adminContentKeyApi.onRequestGet(context);
        if (method === 'PUT') return await adminContentKeyApi.onRequestPut(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-17. /api/admin/utilities (Dedicated Utilities Management API)
      if (pathname === '/api/admin/utilities') {
        if (method === 'OPTIONS') return await adminUtilitiesIndexApi.onRequestOptions();
        if (method === 'GET') return await adminUtilitiesIndexApi.onRequestGet(context);
        if (method === 'POST') return await adminUtilitiesIndexApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname.startsWith('/api/admin/utilities/')) {
        // Skip first-purchase handled in 8c-8
        if (pathname === '/api/admin/utilities/first-purchase' || pathname.startsWith('/api/admin/utilities/first-purchase/')) {
          // Handled in 8c-8
        } else if (pathname.endsWith('/stock')) {
          if (method === 'OPTIONS') return await adminUtilitiesStockApi.onRequestOptions();
          if (method === 'PUT' || method === 'POST') return await adminUtilitiesStockApi.onRequestPut(context);
          return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
        } else {
          // /api/admin/utilities/:id
          if (method === 'OPTIONS') return await adminUtilitiesIdApi.onRequestOptions();
          if (method === 'GET') return await adminUtilitiesIdApi.onRequestGet(context);
          if (method === 'PUT') return await adminUtilitiesIdApi.onRequestPut(context);
          if (method === 'DELETE') return await adminUtilitiesIdApi.onRequestDelete(context);
          return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
        }
      }

      // 8c-18. /api/admin/growth (Dedicated Growth & Viral API)
      if (pathname === '/api/admin/growth') {
        if (method === 'OPTIONS') return await adminGrowthApi.onRequestOptions();
        if (method === 'GET') return await adminGrowthApi.onRequestGet(context);
        if (method === 'PUT') return await adminGrowthApi.onRequestPut(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-19. /api/admin/dashboard/stats (Dashboard Stats API)
      if (pathname === '/api/admin/dashboard/stats') {
        if (method === 'OPTIONS') return await adminDashboardStatsApi.onRequestOptions();
        if (method === 'GET') return await adminDashboardStatsApi.onRequestGet(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-20. /api/admin/store/products/:id/codes (Inventory Codes Manage API)
      if (pathname.startsWith('/api/admin/store/products/') && pathname.endsWith('/codes')) {
        const productId = pathname.replace('/api/admin/store/products/', '').replace('/codes', '').trim();
        const customContext = { ...context, params: { id: productId } };
        if (method === 'OPTIONS') return await adminStoreProductCodesApi.onRequestOptions();
        if (method === 'GET') return await adminStoreProductCodesApi.onRequestGet(customContext);
        if (method === 'POST') return await adminStoreProductCodesApi.onRequestPost(customContext);
        if (method === 'DELETE') return await adminStoreProductCodesApi.onRequestDelete(customContext);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-21. /api/admin/marketing (Marketing Config & Realtime Trigger API)
      if (pathname === '/api/admin/marketing/config') {
        if (method === 'OPTIONS') return await adminMarketingConfigApi.onRequestOptions();
        if (method === 'GET') return await adminMarketingConfigApi.onRequestGet(context);
        if (method === 'PUT') return await adminMarketingConfigApi.onRequestPut(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname === '/api/admin/marketing/trigger') {
        if (method === 'OPTIONS') return await adminMarketingTriggerApi.onRequestOptions();
        if (method === 'POST') return await adminMarketingTriggerApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-22. /api/admin/crawler (Crawler Sources & Trigger API)
      if (pathname === '/api/admin/crawler/sources') {
        if (method === 'OPTIONS') return await adminCrawlerSourcesApi.onRequestOptions();
        if (method === 'GET') return await adminCrawlerSourcesApi.onRequestGet(context);
        if (method === 'POST') return await adminCrawlerSourcesApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname.startsWith('/api/admin/crawler/sources/') && pathname !== '/api/admin/crawler/sources') {
        const sourceId = pathname.replace('/api/admin/crawler/sources/', '').trim();
        const customContext = { ...context, params: { id: sourceId } };
        if (method === 'OPTIONS') return await adminCrawlerSourcesIdApi.onRequestOptions();
        if (method === 'PUT') return await adminCrawlerSourcesIdApi.onRequestPut(customContext);
        if (method === 'DELETE') return await adminCrawlerSourcesIdApi.onRequestDelete(customContext);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname === '/api/admin/crawler/trigger') {
        if (method === 'OPTIONS') return await adminCrawlerTriggerApi.onRequestOptions();
        if (method === 'POST') return await adminCrawlerTriggerApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-23. /api/admin/notifications (Subscribers, Broadcast & Settings API)
      if (pathname === '/api/admin/notifications/subscribers') {
        if (method === 'OPTIONS') return await adminNotificationsSubscribersApi.onRequestOptions();
        if (method === 'GET') return await adminNotificationsSubscribersApi.onRequestGet(context);
        if (method === 'DELETE') return await adminNotificationsSubscribersApi.onRequestDelete(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname === '/api/admin/notifications/broadcast') {
        if (method === 'OPTIONS') return await adminNotificationsBroadcastApi.onRequestOptions();
        if (method === 'POST') return await adminNotificationsBroadcastApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname === '/api/admin/notifications/settings') {
        if (method === 'OPTIONS') return await adminNotificationsSettingsApi.onRequestOptions();
        if (method === 'GET') return await adminNotificationsSettingsApi.onRequestGet(context);
        if (method === 'PUT') return await adminNotificationsSettingsApi.onRequestPut(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-24. /api/admin/security-logs (Security Logs & Audit API)
      if (pathname === '/api/admin/security-logs') {
        if (method === 'OPTIONS') return await adminSecurityLogsIndexApi.onRequestOptions();
        if (method === 'GET') return await adminSecurityLogsIndexApi.onRequestGet(context);
        if (method === 'POST') return await adminSecurityLogsIndexApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-25. /api/admin/settings (System Settings & Maintenance API)
      if (pathname === '/api/admin/settings') {
        if (method === 'OPTIONS') return await adminSettingsIndexApi.onRequestOptions();
        if (method === 'GET') return await adminSettingsIndexApi.onRequestGet(context);
        if (method === 'PUT') return await adminSettingsIndexApi.onRequestPut(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-26. /api/admin/homepage-sections (Homepage Sections Layout & Visibility API)
      if (pathname === '/api/admin/homepage-sections') {
        if (method === 'OPTIONS') return await homepageSectionsAdminApi.onRequestOptions();
        if (method === 'GET') return await homepageSectionsAdminApi.onRequestGet(context);
        if (method === 'PUT') return await homepageSectionsAdminApi.onRequestPut(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-27. /api/admin/homepage-sections/upload-image (Section Image Upload & WebP Compressor)
      if (pathname === '/api/admin/homepage-sections/upload-image') {
        if (method === 'OPTIONS') return await homepageSectionsUploadImageApi.onRequestOptions();
        if (method === 'POST') return await homepageSectionsUploadImageApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-28. /api/admin/homepage-sections/ai-suggest (AI Copywriting Suggestions)
      if (pathname === '/api/admin/homepage-sections/ai-suggest') {
        if (method === 'OPTIONS') return await homepageSectionsAiSuggestApi.onRequestOptions();
        if (method === 'POST') return await homepageSectionsAiSuggestApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-29. /api/admin/homepage-sections/ai-generate-image (AI Image Generation)
      if (pathname === '/api/admin/homepage-sections/ai-generate-image') {
        if (method === 'OPTIONS') return await homepageSectionsAiGenerateImageApi.onRequestOptions();
        if (method === 'POST') return await homepageSectionsAiGenerateImageApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-30. /api/admin/automation (Automation Center Hub API)
      if (pathname === '/api/admin/automation/status') {
        if (method === 'OPTIONS') return await adminAutomationStatusApi.onRequestOptions();
        if (method === 'GET') return await adminAutomationStatusApi.onRequestGet(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname === '/api/admin/automation/test') {
        if (method === 'OPTIONS') return await adminAutomationTestApi.onRequestOptions();
        if (method === 'POST') return await adminAutomationTestApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname === '/api/admin/automation/config') {
        if (method === 'OPTIONS') return await adminAutomationConfigApi.onRequestOptions();
        if (method === 'GET') return await adminAutomationConfigApi.onRequestGet(context);
        if (method === 'POST' || method === 'PUT') return await adminAutomationConfigApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }

      // 8c-31. /api/admin/suppliers/* (External Supplier Connector PA1 & Supplier Fulfillment Webhook PA2)
      if (pathname === '/api/admin/suppliers/webhooks' || pathname.startsWith('/api/admin/suppliers/webhooks/')) {
        const subSegs = pathname
          .slice('/api/admin/suppliers/webhooks'.length)
          .split('/')
          .filter(Boolean)
          .map((s) => decodeURIComponent(s));
        return await adminSupplierWebhooksApi.handleAdminSupplierWebhooksRequest(context as any, subSegs);
      }
      if (pathname === '/api/admin/suppliers') {
        if (method === 'OPTIONS') return await adminSuppliersIndexApi.onRequestOptions(context);
        if (method === 'GET') return await adminSuppliersIndexApi.onRequestGet(context);
        if (method === 'POST') return await adminSuppliersIndexApi.onRequestPost(context);
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname.startsWith('/api/admin/suppliers/')) {
        const subSegs = pathname
          .slice('/api/admin/suppliers/'.length)
          .split('/')
          .filter(Boolean)
          .map((s) => decodeURIComponent(s));
        context.params = { ...(context.params || {}), id: subSegs[0] || '' };
        return await adminSuppliersIdApi.handleAdminSupplierByIdRequest(context as any, subSegs);
      }

      // 8c-32. /api/admin/affiliate/* (Quản trị Liên Kết Gian Hàng Nội Bộ — Mảnh 2)
      if (pathname === '/api/admin/affiliate' || pathname.startsWith('/api/admin/affiliate/')) {
        const subSegs = pathname
          .slice('/api/admin/affiliate'.length)
          .split('/')
          .filter(Boolean)
          .map((s) => decodeURIComponent(s));
        return await adminAffiliateApi.handleAdminAffiliateRequest(context as any, subSegs);
      }

      // 8d. /api/crawl-article (AI Article Crawler & Extractor)
      if (pathname === '/api/crawl-article') {
        return await crawlArticleApi.onRequest(context);
      }

      // 8e. /api/game-icon (Edge Game Icon Proxy & Caching)
      if (pathname === '/api/game-icon') {
        if (method === 'OPTIONS') return await gameIconApi.onRequestOptions();
        return await gameIconApi.onRequestGet(context);
      }

      // 8e.1. /api/games/upload-icon (Official Game Icon Binary Upload & Store Verifier)
      if (pathname === '/api/games/upload-icon') {
        if (method === 'OPTIONS') return await uploadIconApi.onRequestOptions();
        if (method === 'POST') return await uploadIconApi.onRequestPost(context);
        return await uploadIconApi.onRequestGet(context);
      }

      // 8f. /api/crawler/ingest-codes (Muse Bot & External Giftcode Ingestion API)
      if (pathname === '/api/crawler/ingest-codes') {
        if (method === 'OPTIONS') return await ingestCodesApi.onRequestOptions();
        if (method === 'POST') return await ingestCodesApi.onRequestPost(context);
        return await ingestCodesApi.onRequestGet(context);
      }

      // 8g. /api/crawler/ingest-upcoming-games (Muse Bot Upcoming Games Ingestion API)
      if (pathname === '/api/crawler/ingest-upcoming-games') {
        if (method === 'OPTIONS') return await ingestUpcomingGamesApi.onRequestOptions();
        if (method === 'POST') return await ingestUpcomingGamesApi.onRequestPost(context);
        return await ingestUpcomingGamesApi.onRequestGet(context);
      }

      // 8h. /api/crawler/marketing (Muse Bot Marketing & FOMO Independent Audit API)
      if (pathname === '/api/crawler/marketing') {
        if (method === 'OPTIONS') return await marketingApi.onRequestOptions();
        if (method === 'POST') return await marketingApi.onRequestPost(context);
        return await marketingApi.onRequestGet(context);
      }

      // 9. /api/notifications/* (Email Notification Hub)
      if (pathname === '/api/notifications/subscribe') {
        if (method === 'OPTIONS') return await notifSubscribeApi.onRequestOptions();
        if (method === 'POST') return await notifSubscribeApi.onRequestPost(context);
        return await notifSubscribeApi.onRequestGet(context);
      }

      if (pathname === '/api/notifications/unsubscribe') {
        if (method === 'OPTIONS') return await notifUnsubscribeApi.onRequestOptions();
        if (method === 'GET') return await notifUnsubscribeApi.onRequestGet(context);
        if (method === 'POST') return await notifUnsubscribeApi.onRequestPost(context);
      }

      if (pathname === '/api/notifications/subscribers') {
        if (method === 'OPTIONS') return await notifSubscribersApi.onRequestOptions();
        if (method === 'GET') return await notifSubscribersApi.onRequestGet(context);
        if (method === 'DELETE') return await notifSubscribersApi.onRequestDelete(context);
      }

      if (pathname === '/api/notifications/settings') {
        if (method === 'OPTIONS') return await notifSettingsApi.onRequestOptions();
        if (method === 'GET') return await notifSettingsApi.onRequestGet(context);
        if (method === 'POST') return await notifSettingsApi.onRequestPost(context);
      }

      if (pathname === '/api/notifications/send') {
        if (method === 'OPTIONS') return await notifSendApi.onRequestOptions();
        if (method === 'POST') return await notifSendApi.onRequestPost(context);
      }

      if (pathname === '/api/notifications/logs') {
        if (method === 'OPTIONS') return await notifLogsApi.onRequestOptions();
        return await notifLogsApi.onRequestGet(context);
      }

      // 12. /api/track-download (Download click tracking & stats)
      if (pathname === '/api/track-download') {
        if (method === 'OPTIONS') return await trackDownloadApi.onRequestOptions();
        if (method === 'POST') return await trackDownloadApi.onRequestPost(context);
        if (method === 'GET') return await trackDownloadApi.onRequestGet(context);
      }

      // 13. Missions System APIs
      if (pathname === '/api/missions') {
        if (method === 'OPTIONS') return await missionsIndexApi.onRequestOptions();
        if (method === 'POST') return await missionsIndexApi.onRequestPost(context);
        return await missionsIndexApi.onRequestGet(context);
      }

      if (pathname.startsWith('/api/missions/') && !pathname.startsWith('/api/missions/ai') && !['submit', 'my-submissions', 'submissions', 'pools', 'ai-keys', 'audit-logs'].includes(pathname.replace('/api/missions/', ''))) {
        const missionId = pathname.replace('/api/missions/', '');
        const customContext = { ...context, params: { id: missionId } };
        if (method === 'OPTIONS') return await missionsIdApi.onRequestOptions();
        if (method === 'PUT' || method === 'PATCH') return await missionsIdApi.onRequestPut(customContext);
        if (method === 'DELETE') return await missionsIdApi.onRequestDelete(customContext);
        return await missionsIdApi.onRequestGet(customContext);
      }

      if (pathname === '/api/missions/submit') {
        if (method === 'OPTIONS') return await missionsSubmitApi.onRequestOptions();
        if (method === 'POST') return await missionsSubmitApi.onRequestPost(context);
      }

      if (pathname === '/api/missions/my-submissions') {
        if (method === 'OPTIONS') return await missionsMySubmissionsApi.onRequestOptions();
        return await missionsMySubmissionsApi.onRequestGet(context);
      }

      if (pathname === '/api/missions/submissions') {
        if (method === 'OPTIONS') return await missionsSubmissionsApi.onRequestOptions();
        if (method === 'POST') return await missionsSubmissionsApi.onRequestPost(context);
        return await missionsSubmissionsApi.onRequestGet(context);
      }

      if (pathname === '/api/missions/pools') {
        if (method === 'OPTIONS') return await missionsPoolsApi.onRequestOptions();
        if (method === 'POST') return await missionsPoolsApi.onRequestPost(context);
        if (method === 'DELETE') return await missionsPoolsApi.onRequestDelete(context);
        return await missionsPoolsApi.onRequestGet(context);
      }

      if (pathname === '/api/missions/ai/pending') {
        if (method === 'OPTIONS') return await missionsAiPendingApi.onRequestOptions();
        return await missionsAiPendingApi.onRequestGet(context);
      }

      if (pathname === '/api/missions/ai/review') {
        if (method === 'OPTIONS') return await missionsAiReviewApi.onRequestOptions();
        if (method === 'POST') return await missionsAiReviewApi.onRequestPost(context);
      }

      if (pathname === '/api/missions/ai-keys') {
        if (method === 'OPTIONS') return await missionsAiKeysApi.onRequestOptions();
        if (method === 'POST') return await missionsAiKeysApi.onRequestPost(context);
        if (method === 'PUT') return await missionsAiKeysApi.onRequestPut(context);
        if (method === 'DELETE') return await missionsAiKeysApi.onRequestDelete(context);
        return await missionsAiKeysApi.onRequestGet(context);
      }

      if (pathname === '/api/missions/audit-logs') {
        if (method === 'OPTIONS') return await missionsAuditLogsApi.onRequestOptions();
        return await missionsAuditLogsApi.onRequestGet(context);
      }

      // 14. News Articles CRUD & Scheduling APIs
      if (pathname === '/api/news') {
        if (method === 'OPTIONS') return await newsIndexApi.onRequestOptions();
        if (method === 'POST') return await newsIndexApi.onRequestPost(context);
        return await newsIndexApi.onRequestGet(context);
      }

      if (pathname.startsWith('/api/news/') && pathname !== '/api/news') {
        const newsId = pathname.replace('/api/news/', '').trim();
        const customContext = { ...context, params: { id: newsId } };
        if (method === 'OPTIONS') return await newsIdApi.onRequestOptions();
        if (method === 'PUT' || method === 'PATCH') return await newsIdApi.onRequestPut(customContext);
        if (method === 'DELETE') return await newsIdApi.onRequestDelete(customContext);
        return await newsIdApi.onRequestGet(customContext);
      }

      // 14.1. Game Events CRUD & Review APIs (Sự Kiện Game)
      if (pathname === '/api/events') {
        if (method === 'OPTIONS') return await eventsIndexApi.onRequestOptions();
        if (method === 'POST') return await eventsIndexApi.onRequestPost(context);
        return await eventsIndexApi.onRequestGet(context);
      }

      if (pathname.startsWith('/api/events/') && pathname !== '/api/events') {
        const eventId = pathname.replace('/api/events/', '').trim();
        const customContext = { ...context, params: { id: eventId } };
        if (method === 'OPTIONS') return await eventsIdApi.onRequestOptions();
        if (method === 'PUT' || method === 'PATCH') return await eventsIdApi.onRequestPut(customContext);
        if (method === 'DELETE') return await eventsIdApi.onRequestDelete(customContext);
        return await eventsIdApi.onRequestGet(customContext);
      }

      // 15. System API Keys & Permissions Management
      if (pathname === '/api/api-keys') {
        if (method === 'OPTIONS') return await apiKeysIndexApi.onRequestOptions();
        if (method === 'POST') return await apiKeysIndexApi.onRequestPost(context);
        return await apiKeysIndexApi.onRequestGet(context);
      }

      if (pathname === '/api/api-keys/set-permissions') {
        if (method === 'OPTIONS') return await apiKeysSetPermissionsApi.onRequestOptions(context);
        if (method === 'POST') return await apiKeysSetPermissionsApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname.startsWith('/api/api-keys/') && pathname !== '/api/api-keys') {
        const keyId = pathname.replace('/api/api-keys/', '').trim();
        const customContext = { ...context, params: { id: keyId } };
        if (method === 'OPTIONS') return await apiKeysIdApi.onRequestOptions();
        if (method === 'PATCH' || method === 'PUT') return await apiKeysIdApi.onRequestPatch(customContext);
        if (method === 'POST') return await apiKeysIdApi.onRequestPost(customContext);
        if (method === 'DELETE') return await apiKeysIdApi.onRequestDelete(customContext);
      }

      // 16. Telegram Bot Integration APIs
      if (pathname === '/api/telegram/config') {
        if (method === 'OPTIONS') return await telegramConfigApi.onRequestOptions();
        return await telegramConfigApi.onRequestGet(context);
      }

      if (pathname === '/api/telegram/notify') {
        if (method === 'OPTIONS') return await telegramNotifyApi.onRequestOptions();
        if (method === 'POST') return await telegramNotifyApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/telegram/webhook') {
        if (method === 'OPTIONS') return await telegramWebhookApi.onRequestOptions();
        if (method === 'POST') return await telegramWebhookApi.onRequestPost(context);
        return await telegramWebhookApi.onRequestGet();
      }

      if (pathname === '/api/telegram/admin') {
        if (method === 'OPTIONS') return await telegramAdminApi.onRequestOptions();
        if (method === 'GET') return await telegramAdminApi.onRequestGet(context);
        if (method === 'POST') return await telegramAdminApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/telegram/manage') {
        if (method === 'OPTIONS') return await telegramManageApi.onRequestOptions();
        if (method === 'POST') return await telegramManageApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/telegram/user') {
        if (method === 'OPTIONS') return await telegramUserApi.onRequestOptions();
        if (method === 'GET') return await telegramUserApi.onRequestGet(context);
        if (method === 'POST') return await telegramUserApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/telegram/notify-followers') {
        if (method === 'OPTIONS') return await telegramNotifyFollowersApi.onRequestOptions();
        if (method === 'POST') return await telegramNotifyFollowersApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/telegram/send-pending-digest') {
        if (method === 'OPTIONS') return await telegramSendPendingDigestApi.onRequestOptions();
        if (method === 'POST') return await telegramSendPendingDigestApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 17. Feature 1: Code Reports API (1-Tap Giftcode Error Reports)
      if (pathname === '/api/code-reports') {
        if (method === 'OPTIONS') return await codeReportsApi.onRequestOptions();
        if (method === 'POST') return await codeReportsApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/admin/code-reports') {
        if (method === 'OPTIONS') return await adminCodeReportsApi.onRequestOptions();
        if (method === 'GET') return await adminCodeReportsApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchCodeReportResolve = pathname.match(/^\/api\/admin\/code-reports\/([^/]+)\/resolve$/);
      if (matchCodeReportResolve) {
        context.params = { ...(context.params || {}), id: matchCodeReportResolve[1] };
        if (method === 'OPTIONS') return await adminCodeReportsResolveApi.onRequestOptions();
        if (method === 'POST') return await adminCodeReportsResolveApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 18. Feature 2: Game Comments & Community Reviews API
      const matchGameComments = pathname.match(/^\/api\/games\/([^/]+)\/comments$/);
      if (matchGameComments) {
        context.params = { ...(context.params || {}), slug: matchGameComments[1] };
        if (method === 'OPTIONS') return await gameCommentsApi.onRequestOptions();
        if (method === 'GET') return await gameCommentsApi.onRequestGet(context);
        if (method === 'POST') return await gameCommentsApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchGameCommentsId = pathname.match(/^\/api\/games\/([^/]+)\/comments\/([^/]+)$/);
      if (matchGameCommentsId) {
        context.params = { ...(context.params || {}), slug: matchGameCommentsId[1], id: matchGameCommentsId[2] };
        if (method === 'OPTIONS') return await gameCommentsIdApi.onRequestOptions();
        if (method === 'PUT') return await gameCommentsIdApi.onRequestPut(context);
        if (method === 'DELETE') return await gameCommentsIdApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/admin/comments') {
        if (method === 'OPTIONS') return await adminCommentsApi.onRequestOptions();
        if (method === 'GET') return await adminCommentsApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchCommentApprove = pathname.match(/^\/api\/admin\/comments\/([^/]+)\/approve$/);
      if (matchCommentApprove) {
        context.params = { ...(context.params || {}), id: matchCommentApprove[1] };
        if (method === 'OPTIONS') return await adminCommentsApproveApi.onRequestOptions();
        if (method === 'POST') return await adminCommentsApproveApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchCommentReject = pathname.match(/^\/api\/admin\/comments\/([^/]+)\/reject$/);
      if (matchCommentReject) {
        context.params = { ...(context.params || {}), id: matchCommentReject[1] };
        if (method === 'OPTIONS') return await adminCommentsRejectApi.onRequestOptions();
        if (method === 'POST') return await adminCommentsRejectApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 19. Feature 3: Daily Codes API (Mã Hôm Nay)
      if (pathname === '/api/codes/today') {
        if (method === 'OPTIONS') return await codesTodayApi.onRequestOptions();
        if (method === 'GET') return await codesTodayApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // ==========================================
      // 20. Marketplace Phase 1 (Sàn TMĐT Số) APIs
      // ==========================================

      // 20.1. Seller Center Profile, Registration & Public Portal Config
      if (pathname === '/api/seller/portal-config') {
        if (method === 'OPTIONS') return await sellerPortalConfigApi.onRequestOptions(context);
        if (method === 'GET') return await sellerPortalConfigApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller') {
        if (method === 'OPTIONS') return await sellerIndexApi.onRequestOptions();
        if (method === 'GET') return await sellerIndexApi.onRequestGet(context);
        if (method === 'POST') return await sellerIndexApi.onRequestPost(context);
        if (method === 'PUT') return await sellerIndexApi.onRequestPut(context);
        if (method === 'PATCH') return await sellerIndexApi.onRequestPatch(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.1b. Seller Product Media Upload & Shop Vouchers
      if (pathname === '/api/seller/media/upload') {
        if (method === 'OPTIONS') return await sellerMediaUploadApi.onRequestOptions(context);
        if (method === 'POST') return await sellerMediaUploadApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/vouchers') {
        if (method === 'OPTIONS') return await sellerVouchersIndexApi.onRequestOptions(context);
        if (method === 'GET') return await sellerVouchersIndexApi.onRequestGet(context);
        if (method === 'POST') return await sellerVouchersIndexApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerVoucherId = pathname.match(/^\/api\/seller\/vouchers\/([^/]+)$/);
      if (matchSellerVoucherId) {
        context.params = { ...(context.params || {}), id: matchSellerVoucherId[1] };
        if (method === 'OPTIONS') return await sellerVouchersIdApi.onRequestOptions(context);
        if (method === 'PATCH') return await sellerVouchersIdApi.onRequestPatch(context);
        if (method === 'DELETE') return await sellerVouchersIdApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.2. Seller Products Management
      if (pathname === '/api/seller/products') {
        if (method === 'OPTIONS') return await sellerProductsIndexApi.onRequestOptions();
        if (method === 'GET') return await sellerProductsIndexApi.onRequestGet(context);
        if (method === 'POST') return await sellerProductsIndexApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerProdCodes = pathname.match(/^\/api\/seller\/products\/([^/]+)\/codes$/);
      if (matchSellerProdCodes) {
        context.params = { ...(context.params || {}), id: matchSellerProdCodes[1] };
        if (method === 'OPTIONS') return await sellerProductsCodesApi.onRequestOptions();
        if (method === 'GET') return await sellerProductsCodesApi.onRequestGet(context);
        if (method === 'POST') return await sellerProductsCodesApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerProdResell = pathname.match(/^\/api\/seller\/products\/([^/]+)\/resell$/);
      if (matchSellerProdResell) {
        context.params = { ...(context.params || {}), id: matchSellerProdResell[1] };
        if (method === 'OPTIONS') return await sellerProductsResellApi.onRequestOptions();
        if (method === 'PUT') return await sellerProductsResellApi.onRequestPut(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerProdId = pathname.match(/^\/api\/seller\/products\/([^/]+)$/);
      if (matchSellerProdId) {
        context.params = { ...(context.params || {}), id: matchSellerProdId[1] };
        if (method === 'OPTIONS') return await sellerProductsIdApi.onRequestOptions();
        if (method === 'GET') return await sellerProductsIdApi.onRequestGet(context);
        if (method === 'PUT') return await sellerProductsIdApi.onRequestPut(context);
        if (method === 'PATCH') return await sellerProductsIdApi.onRequestPatch(context);
        if (method === 'DELETE') return await sellerProductsIdApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.3. Seller Codes Actions (Reveal & Delete)
      const matchSellerCodeReveal = pathname.match(/^\/api\/seller\/codes\/([^/]+)\/reveal$/);
      if (matchSellerCodeReveal) {
        context.params = { ...(context.params || {}), id: matchSellerCodeReveal[1] };
        if (method === 'OPTIONS') return await sellerCodesRevealApi.onRequestOptions();
        if (method === 'POST') return await sellerCodesRevealApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerCodeId = pathname.match(/^\/api\/seller\/codes\/([^/]+)$/);
      if (matchSellerCodeId) {
        context.params = { ...(context.params || {}), id: matchSellerCodeId[1] };
        if (method === 'OPTIONS') return await sellerCodesIdApi.onRequestOptions();
        if (method === 'DELETE') return await sellerCodesIdApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.4. Seller Orders & Report Resolution
      if (pathname === '/api/seller/orders') {
        if (method === 'OPTIONS') return await sellerOrdersIndexApi.onRequestOptions();
        if (method === 'GET') return await sellerOrdersIndexApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerOrderResolve = pathname.match(/^\/api\/seller\/orders\/([^/]+)\/resolve-report$/);
      if (matchSellerOrderResolve) {
        context.params = { ...(context.params || {}), id: matchSellerOrderResolve[1] };
        if (method === 'OPTIONS') return await sellerOrdersResolveReportApi.onRequestOptions();
        if (method === 'POST') return await sellerOrdersResolveReportApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerOrderId = pathname.match(/^\/api\/seller\/orders\/([^/]+)$/);
      if (matchSellerOrderId) {
        context.params = { ...(context.params || {}), id: matchSellerOrderId[1] };
        if (method === 'OPTIONS') return await sellerOrdersIdApi.onRequestOptions();
        if (method === 'GET') return await sellerOrdersIdApi.onRequestGet(context);
        if (method === 'POST') return await sellerOrdersIdApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.4b. Seller API Keys & Rotations
      if (pathname === '/api/seller/api-keys') {
        if (method === 'OPTIONS') return await sellerApiKeysIndexApi.onRequestOptions();
        if (method === 'GET') return await sellerApiKeysIndexApi.onRequestGet(context);
        if (method === 'POST') return await sellerApiKeysIndexApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerApiKeyRotate = pathname.match(/^\/api\/seller\/api-keys\/([^/]+)\/rotate$/);
      if (matchSellerApiKeyRotate) {
        context.params = { ...(context.params || {}), id: matchSellerApiKeyRotate[1] };
        if (method === 'OPTIONS') return await sellerApiKeysIdApi.onRequestOptions();
        if (method === 'POST') return await sellerApiKeysIdApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerApiKeyId = pathname.match(/^\/api\/seller\/api-keys\/([^/]+)$/);
      if (matchSellerApiKeyId) {
        context.params = { ...(context.params || {}), id: matchSellerApiKeyId[1] };
        if (method === 'OPTIONS') return await sellerApiKeysIdApi.onRequestOptions();
        if (method === 'POST') return await sellerApiKeysIdApi.onRequestPost(context);
        if (method === 'DELETE') return await sellerApiKeysIdApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.4b-2. User AI API Keys (API Riêng Cho AI Của Từng Người Dùng)
      if (pathname === '/api/user/ai-keys') {
        if (method === 'OPTIONS') return await userAiKeysIndexApi.onRequestOptions();
        if (method === 'GET') return await userAiKeysIndexApi.onRequestGet(context);
        if (method === 'POST') return await userAiKeysIndexApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/user/ai-keys/revoke-all') {
        if (method === 'OPTIONS') return await userAiKeysRevokeAllApi.onRequestOptions();
        if (method === 'POST') return await userAiKeysRevokeAllApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/user/ai-keys/alerts') {
        if (method === 'OPTIONS') return await userAiKeysAlertsApi.onRequestOptions();
        if (method === 'GET') return await userAiKeysAlertsApi.onRequestGet(context);
        if (method === 'POST') return await userAiKeysAlertsApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchUserAiKeyLogs = pathname.match(/^\/api\/user\/ai-keys\/([^/]+)\/logs$/);
      if (matchUserAiKeyLogs) {
        context.params = { ...(context.params || {}), id: matchUserAiKeyLogs[1] };
        if (method === 'OPTIONS') return await userAiKeysLogsApi.onRequestOptions();
        if (method === 'GET') return await userAiKeysLogsApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchUserAiKeyDevices = pathname.match(/^\/api\/user\/ai-keys\/([^/]+)\/devices$/);
      if (matchUserAiKeyDevices) {
        context.params = { ...(context.params || {}), id: matchUserAiKeyDevices[1] };
        if (method === 'OPTIONS') return await userAiKeysDevicesApi.onRequestOptions();
        if (method === 'GET') return await userAiKeysDevicesApi.onRequestGet(context);
        if (method === 'DELETE') return await userAiKeysDevicesApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchUserAiKeyId = pathname.match(/^\/api\/user\/ai-keys\/([^/]+)$/);
      if (matchUserAiKeyId) {
        context.params = { ...(context.params || {}), id: matchUserAiKeyId[1] };
        if (method === 'OPTIONS') return await userAiKeysIdApi.onRequestOptions();
        if (method === 'PUT') return await userAiKeysIdApi.onRequestPut(context);
        if (method === 'DELETE') return await userAiKeysIdApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.4c. Seller Third-Party Apps & Authorizations
      if (pathname === '/api/seller/apps') {
        if (method === 'OPTIONS') return await sellerAppsIndexApi.onRequestOptions();
        if (method === 'GET') return await sellerAppsIndexApi.onRequestGet(context);
        if (method === 'POST') return await sellerAppsIndexApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerAppApprove = pathname.match(/^\/api\/seller\/apps\/([^/]+)\/approve$/);
      if (matchSellerAppApprove) {
        context.params = { ...(context.params || {}), id: matchSellerAppApprove[1] };
        if (method === 'OPTIONS') return await sellerAppsIdApi.onRequestOptions();
        if (method === 'POST') return await sellerAppsIdApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerAppRevoke = pathname.match(/^\/api\/seller\/apps\/([^/]+)\/revoke$/);
      if (matchSellerAppRevoke) {
        context.params = { ...(context.params || {}), id: matchSellerAppRevoke[1] };
        if (method === 'OPTIONS') return await sellerAppsIdApi.onRequestOptions();
        if (method === 'DELETE') return await sellerAppsIdApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerAppId = pathname.match(/^\/api\/seller\/apps\/([^/]+)$/);
      if (matchSellerAppId) {
        context.params = { ...(context.params || {}), id: matchSellerAppId[1] };
        if (method === 'OPTIONS') return await sellerAppsIdApi.onRequestOptions();
        if (method === 'POST') return await sellerAppsIdApi.onRequestPost(context);
        if (method === 'DELETE') return await sellerAppsIdApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.4d. Cross-Shop Reseller / Affiliate API (Gán Shop & Bán Lại Liên Shop GĐ1)
      if (pathname === '/api/seller/affiliate/requests') {
        if (method === 'OPTIONS') return await sellerAffiliateRequestsApi.onRequestOptions();
        if (method === 'GET') return await sellerAffiliateRequestsApi.onRequestGet(context);
        if (method === 'POST') return await sellerAffiliateRequestsApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAffiliateApprove = pathname.match(/^\/api\/seller\/affiliate\/requests\/([^/]+)\/approve$/);
      if (matchAffiliateApprove) {
        context.params = { ...(context.params || {}), id: matchAffiliateApprove[1] };
        if (method === 'OPTIONS') return await sellerAffiliateApproveApi.onRequestOptions();
        if (method === 'POST') return await sellerAffiliateApproveApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAffiliateReject = pathname.match(/^\/api\/seller\/affiliate\/requests\/([^/]+)\/reject$/);
      if (matchAffiliateReject) {
        context.params = { ...(context.params || {}), id: matchAffiliateReject[1] };
        if (method === 'OPTIONS') return await sellerAffiliateRejectApi.onRequestOptions();
        if (method === 'POST') return await sellerAffiliateRejectApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/affiliate/partners') {
        if (method === 'OPTIONS') return await sellerAffiliatePartnersApi.onRequestOptions();
        if (method === 'GET') return await sellerAffiliatePartnersApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAffiliatePartnerId = pathname.match(/^\/api\/seller\/affiliate\/partners\/([^/]+)$/);
      if (matchAffiliatePartnerId) {
        context.params = { ...(context.params || {}), id: matchAffiliatePartnerId[1] };
        if (method === 'OPTIONS') return await sellerAffiliatePartnerIdApi.onRequestOptions();
        if (method === 'DELETE') return await sellerAffiliatePartnerIdApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/affiliate/catalog') {
        if (method === 'OPTIONS') return await sellerAffiliateCatalogApi.onRequestOptions();
        if (method === 'GET') return await sellerAffiliateCatalogApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/affiliate/inventory-push') {
        if (method === 'OPTIONS') return await sellerAffiliateInventoryPushApi.onRequestOptions(context);
        if (method === 'POST') return await sellerAffiliateInventoryPushApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/affiliate/orders') {
        if (method === 'OPTIONS') return await sellerAffiliateOrdersApi.onRequestOptions();
        if (method === 'GET') return await sellerAffiliateOrdersApi.onRequestGet(context as any);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/webhooks' || pathname.startsWith('/api/seller/webhooks/')) {
        const subSegs = pathname
          .slice('/api/seller/webhooks'.length)
          .split('/')
          .filter(Boolean)
          .map((s) => decodeURIComponent(s));
        return await sellerWebhooksApi.handleSellerWebhooksRequest(context as any, subSegs);
      }

      if (pathname === '/api/seller/affiliate/listings') {
        if (method === 'OPTIONS') return await sellerAffiliateListingsApi.onRequestOptions();
        if (method === 'GET') return await sellerAffiliateListingsApi.onRequestGet(context);
        if (method === 'POST') return await sellerAffiliateListingsApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAffiliateListingId = pathname.match(/^\/api\/seller\/affiliate\/listings\/([^/]+)$/);
      if (matchAffiliateListingId) {
        context.params = { ...(context.params || {}), id: matchAffiliateListingId[1] };
        if (method === 'OPTIONS') return await sellerAffiliateListingIdApi.onRequestOptions();
        if (method === 'PUT') return await sellerAffiliateListingIdApi.onRequestPut(context);
        if (method === 'DELETE') return await sellerAffiliateListingIdApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.5. Seller Subaccounts
      if (pathname === '/api/seller/subaccounts') {
        if (method === 'OPTIONS') return await sellerSubaccountsIndexApi.onRequestOptions();
        if (method === 'GET') return await sellerSubaccountsIndexApi.onRequestGet(context);
        if (method === 'POST') return await sellerSubaccountsIndexApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerSubId = pathname.match(/^\/api\/seller\/subaccounts\/([^/]+)$/);
      if (matchSellerSubId) {
        context.params = { ...(context.params || {}), id: matchSellerSubId[1] };
        if (method === 'OPTIONS') return await sellerSubaccountsIdApi.onRequestOptions();
        if (method === 'PUT') return await sellerSubaccountsIdApi.onRequestPut(context);
        if (method === 'DELETE') return await sellerSubaccountsIdApi.onRequestDelete(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.6. Public Store Front (/api/stores/:slug)
      const matchStoreProducts = pathname.match(/^\/api\/stores\/([^/]+)\/products$/);
      if (matchStoreProducts) {
        context.params = { ...(context.params || {}), slug: matchStoreProducts[1] };
        if (method === 'OPTIONS') return await storesSlugProductsApi.onRequestOptions();
        if (method === 'GET') return await storesSlugProductsApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchStoreIndex = pathname.match(/^\/api\/stores\/([^/]+)$/);
      if (matchStoreIndex) {
        context.params = { ...(context.params || {}), slug: matchStoreIndex[1] };
        if (method === 'OPTIONS') return await storesSlugIndexApi.onRequestOptions();
        if (method === 'GET') return await storesSlugIndexApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.7. Core Wallet Purchase & Dispute Reporting
      if (pathname === '/api/seller-orders') {
        if (method === 'OPTIONS') return await sellerOrdersCreateApi.onRequestOptions();
        if (method === 'POST') return await sellerOrdersCreateApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerOrderReport = pathname.match(/^\/api\/seller-orders\/([^/]+)\/report$/);
      if (matchSellerOrderReport) {
        context.params = { ...(context.params || {}), id: matchSellerOrderReport[1] };
        if (method === 'OPTIONS') return await sellerOrdersReportApi.onRequestOptions();
        if (method === 'POST') return await sellerOrdersReportApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.8. Buyer's Purchased Codes Vault
      if (pathname === '/api/my-seller-orders') {
        if (method === 'OPTIONS') return await mySellerOrdersApi.onRequestOptions();
        if (method === 'GET') return await mySellerOrdersApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 20.9. Admin Marketplace Moderation APIs
      if (pathname === '/api/admin/sellers') {
        if (method === 'OPTIONS') return await adminSellersIndexApi.onRequestOptions();
        if (method === 'GET') return await adminSellersIndexApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAdminSellerApprove = pathname.match(/^\/api\/admin\/sellers\/([^/]+)\/approve$/);
      if (matchAdminSellerApprove) {
        context.params = { ...(context.params || {}), id: matchAdminSellerApprove[1] };
        if (method === 'OPTIONS') return await adminSellersApproveApi.onRequestOptions();
        if (method === 'POST') return await adminSellersApproveApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAdminSellerReject = pathname.match(/^\/api\/admin\/sellers\/([^/]+)\/reject$/);
      if (matchAdminSellerReject) {
        context.params = { ...(context.params || {}), id: matchAdminSellerReject[1] };
        if (method === 'OPTIONS') return await adminSellersRejectApi.onRequestOptions();
        if (method === 'POST') return await adminSellersRejectApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAdminSellerReqInfo = pathname.match(/^\/api\/admin\/sellers\/([^/]+)\/request-info$/);
      if (matchAdminSellerReqInfo) {
        context.params = { ...(context.params || {}), id: matchAdminSellerReqInfo[1] };
        if (method === 'OPTIONS') return await adminSellersRequestInfoApi.onRequestOptions();
        if (method === 'POST') return await adminSellersRequestInfoApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAdminSellerSuspend = pathname.match(/^\/api\/admin\/sellers\/([^/]+)\/suspend$/);
      if (matchAdminSellerSuspend) {
        context.params = { ...(context.params || {}), id: matchAdminSellerSuspend[1] };
        if (method === 'OPTIONS') return await adminSellersSuspendApi.onRequestOptions();
        if (method === 'POST') return await adminSellersSuspendApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAdminSellerUnsuspend = pathname.match(/^\/api\/admin\/sellers\/([^/]+)\/unsuspend$/);
      if (matchAdminSellerUnsuspend) {
        context.params = { ...(context.params || {}), id: matchAdminSellerUnsuspend[1] };
        if (method === 'OPTIONS') return await adminSellersUnsuspendApi.onRequestOptions();
        if (method === 'POST') return await adminSellersUnsuspendApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/admin/seller-products') {
        if (method === 'OPTIONS') return await adminSellerProductsIndexApi.onRequestOptions();
        if (method === 'GET') return await adminSellerProductsIndexApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAdminProdApprove = pathname.match(/^\/api\/admin\/seller-products\/([^/]+)\/approve$/);
      if (matchAdminProdApprove) {
        context.params = { ...(context.params || {}), id: matchAdminProdApprove[1] };
        if (method === 'OPTIONS') return await adminSellerProductsApproveApi.onRequestOptions();
        if (method === 'POST') return await adminSellerProductsApproveApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAdminProdReject = pathname.match(/^\/api\/admin\/seller-products\/([^/]+)\/reject$/);
      if (matchAdminProdReject) {
        context.params = { ...(context.params || {}), id: matchAdminProdReject[1] };
        if (method === 'OPTIONS') return await adminSellerProductsRejectApi.onRequestOptions();
        if (method === 'POST') return await adminSellerProductsRejectApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/admin/seller-config') {
        if (method === 'OPTIONS') return await adminSellerConfigApi.onRequestOptions();
        if (method === 'GET') return await adminSellerConfigApi.onRequestGet(context);
        if (method === 'PUT') return await adminSellerConfigApi.onRequestPut(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // =========================================================================
      // 20.10. Marketplace Phase 2: Multi-Store Orders & Payments
      // =========================================================================
      if (pathname === '/api/seller-orders/multi') {
        if (method === 'OPTIONS') return await sellerOrdersMultiApi.onRequestOptions();
        if (method === 'POST') return await sellerOrdersMultiApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerOrderMultiPay = pathname.match(/^\/api\/seller-orders\/multi\/([^/]+)\/pay-core$/);
      if (matchSellerOrderMultiPay) {
        context.params = { ...(context.params || {}), id: matchSellerOrderMultiPay[1] };
        if (method === 'OPTIONS') return await sellerOrdersMultiPayCoreApi.onRequestOptions();
        if (method === 'POST') return await sellerOrdersMultiPayCoreApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerOrderMultiVerify = pathname.match(/^\/api\/seller-orders\/multi\/([^/]+)\/verify-sepay$/);
      if (matchSellerOrderMultiVerify) {
        context.params = { ...(context.params || {}), id: matchSellerOrderMultiVerify[1] };
        if (method === 'OPTIONS') return await sellerOrdersMultiVerifySepayApi.onRequestOptions(context);
        if (method === 'POST') return await sellerOrdersMultiVerifySepayApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerOrderMultiId = pathname.match(/^\/api\/seller-orders\/multi\/([^/]+)$/);
      if (matchSellerOrderMultiId) {
        context.params = { ...(context.params || {}), id: matchSellerOrderMultiId[1] };
        if (method === 'OPTIONS') return await sellerOrdersMultiIdApi.onRequestOptions();
        if (method === 'GET') return await sellerOrdersMultiIdApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // =========================================================================
      // 20.11. Marketplace Phase 2: Seller Finance & Withdrawals (Store Owner)
      // =========================================================================
      if (pathname === '/api/seller/finance') {
        if (method === 'OPTIONS') return await sellerFinanceIndexApi.onRequestOptions();
        if (method === 'GET') return await sellerFinanceIndexApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/finance/withdraw') {
        if (method === 'OPTIONS') return await sellerFinanceWithdrawApi.onRequestOptions();
        if (method === 'POST') return await sellerFinanceWithdrawApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/finance/withdrawals') {
        if (method === 'OPTIONS') return await sellerFinanceWithdrawalsApi.onRequestOptions();
        if (method === 'GET') return await sellerFinanceWithdrawalsApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // =========================================================================
      // 20.11b. Seller Direct SePay Gateway (Store Owner Self-Managed SePay)
      // =========================================================================
      if (pathname === '/api/seller/sepay') {
        if (method === 'OPTIONS') return await sellerSepayIndexApi.onRequestOptions(context);
        if (method === 'GET') return await sellerSepayIndexApi.onRequestGet(context);
        if (method === 'PUT') return await sellerSepayIndexApi.onRequestPut(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/sepay/rotate-key') {
        if (method === 'OPTIONS') return await sellerSepayRotateKeyApi.onRequestOptions(context);
        if (method === 'POST') return await sellerSepayRotateKeyApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/sepay/test-connection') {
        if (method === 'OPTIONS') return await sellerSepayTestConnApi.onRequestOptions(context);
        if (method === 'POST') return await sellerSepayTestConnApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/sepay/pay-debt') {
        if (method === 'OPTIONS') return await sellerSepayPayDebtApi.onRequestOptions(context);
        if (method === 'POST') return await sellerSepayPayDebtApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchSellerSepayResolve = pathname.match(/^\/api\/seller\/sepay\/transactions\/([^/]+)\/resolve$/);
      if (matchSellerSepayResolve) {
        if (method === 'OPTIONS') return await sellerSepayTxApi.onRequestOptions(context);
        if (method === 'POST') return await sellerSepayTxApi.handleResolveSellerSepayTx(context as any, matchSellerSepayResolve[1]);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/seller/sepay/transactions') {
        if (method === 'OPTIONS') return await sellerSepayTxApi.onRequestOptions(context);
        if (method === 'GET') return await sellerSepayTxApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Admin Seller Direct SePay Oversight (/api/admin/seller-sepay/*)
      if (pathname === '/api/admin/seller-sepay' || pathname.startsWith('/api/admin/seller-sepay/')) {
        const segs = pathname
          .replace(/^\/api\/admin\/seller-sepay\/?/, '')
          .split('/')
          .filter(Boolean);
        return await adminSellerSepayApi.handleAdminSellerSepayRequest(context as any, segs);
      }

      // =========================================================================
      // 20.12. Marketplace Phase 2: Admin Seller Finance & Ledger
      // =========================================================================
      if (pathname === '/api/admin/seller-finance') {
        if (method === 'OPTIONS') return await adminSellerFinanceIndexApi.onRequestOptions();
        if (method === 'GET') return await adminSellerFinanceIndexApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/admin/seller-finance/release-held') {
        if (method === 'OPTIONS') return await adminSellerFinanceReleaseHeldApi.onRequestOptions();
        if (method === 'POST') return await adminSellerFinanceReleaseHeldApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // =========================================================================
      // 20.13. Marketplace Phase 2: Admin Reconciliation (3 Sources)
      // =========================================================================
      if (pathname === '/api/admin/seller-finance/reconciliation/run') {
        if (method === 'OPTIONS') return await adminSellerFinanceReconciliationRunApi.onRequestOptions();
        if (method === 'POST') return await adminSellerFinanceReconciliationRunApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (pathname === '/api/admin/seller-finance/reconciliation') {
        if (method === 'OPTIONS') return await adminSellerFinanceReconciliationApi.onRequestOptions();
        if (method === 'GET') return await adminSellerFinanceReconciliationApi.onRequestGet(context);
        if (method === 'POST') return await adminSellerFinanceReconciliationApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // =========================================================================
      // 20.14. Marketplace Phase 2: Admin Withdrawals Management
      // =========================================================================
      if (pathname === '/api/admin/withdrawals') {
        if (method === 'OPTIONS') return await adminWithdrawalsIndexApi.onRequestOptions();
        if (method === 'GET') return await adminWithdrawalsIndexApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAdminWithdrawApprove = pathname.match(/^\/api\/admin\/withdrawals\/([^/]+)\/approve$/);
      if (matchAdminWithdrawApprove) {
        context.params = { ...(context.params || {}), id: matchAdminWithdrawApprove[1] };
        if (method === 'OPTIONS') return await adminWithdrawalsApproveApi.onRequestOptions();
        if (method === 'POST') return await adminWithdrawalsApproveApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAdminWithdrawReject = pathname.match(/^\/api\/admin\/withdrawals\/([^/]+)\/reject$/);
      if (matchAdminWithdrawReject) {
        context.params = { ...(context.params || {}), id: matchAdminWithdrawReject[1] };
        if (method === 'OPTIONS') return await adminWithdrawalsRejectApi.onRequestOptions();
        if (method === 'POST') return await adminWithdrawalsRejectApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAdminWithdrawMarkPaid = pathname.match(/^\/api\/admin\/withdrawals\/([^/]+)\/mark-paid$/);
      if (matchAdminWithdrawMarkPaid) {
        context.params = { ...(context.params || {}), id: matchAdminWithdrawMarkPaid[1] };
        if (method === 'OPTIONS') return await adminWithdrawalsMarkPaidApi.onRequestOptions();
        if (method === 'POST') return await adminWithdrawalsMarkPaidApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // =========================================================================
      // 20.15. Marketplace Ratings & Automated Disputes (12/11/2026)
      // =========================================================================
      // Đánh giá gian hàng từ đơn con
      const matchSellerOrderRate = pathname.match(/^\/api\/seller-orders\/([^/]+)\/rate$/);
      if (matchSellerOrderRate) {
        context.params = { ...(context.params || {}), id: matchSellerOrderRate[1] };
        if (method === 'OPTIONS') return await sellerOrdersRateApi.onRequestOptions();
        if (method === 'POST') return await sellerOrdersRateApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Đánh giá công khai của gian hàng
      const matchStoreRatings = pathname.match(/^\/api\/stores\/([^/]+)\/ratings$/);
      if (matchStoreRatings) {
        context.params = { ...(context.params || {}), slug: matchStoreRatings[1] };
        if (method === 'OPTIONS') return await storesSlugRatingsApi.onRequestOptions();
        if (method === 'GET') return await storesSlugRatingsApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Quản trị kiểm duyệt đánh giá
      if (pathname === '/api/admin/seller-ratings') {
        if (method === 'OPTIONS') return await adminSellerRatingsIndexApi.onRequestOptions();
        if (method === 'GET') return await adminSellerRatingsIndexApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      const matchAdminRatingModerate = pathname.match(/^\/api\/admin\/seller-ratings\/([^/]+)\/moderate$/);
      if (matchAdminRatingModerate) {
        context.params = { ...(context.params || {}), id: matchAdminRatingModerate[1] };
        if (method === 'OPTIONS') return await adminSellerRatingsModerateApi.onRequestOptions();
        if (method === 'POST') return await adminSellerRatingsModerateApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Khiếu nại từ người mua (Gửi khiếu nại hoặc xem chi tiết khiếu nại của đơn)
      const matchSellerOrderDispute = pathname.match(/^\/api\/seller-orders\/([^/]+)\/dispute$/);
      if (matchSellerOrderDispute) {
        context.params = { ...(context.params || {}), id: matchSellerOrderDispute[1] };
        if (method === 'OPTIONS') return await sellerOrdersDisputeApi.onRequestOptions();
        if (method === 'GET') return await sellerOrdersDisputeApi.onRequestGet(context);
        if (method === 'POST') return await sellerOrdersDisputeApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Danh sách khiếu nại phía người bán
      if (pathname === '/api/seller/disputes') {
        if (method === 'OPTIONS') return await sellerDisputesIndexApi.onRequestOptions();
        if (method === 'GET') return await sellerDisputesIndexApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Người bán phản hồi khiếu nại
      const matchSellerDisputeRespond = pathname.match(/^\/api\/seller\/disputes\/([^/]+)\/respond$/);
      if (matchSellerDisputeRespond) {
        context.params = { ...(context.params || {}), id: matchSellerDisputeRespond[1] };
        if (method === 'OPTIONS') return await sellerDisputesRespondApi.onRequestOptions();
        if (method === 'POST') return await sellerDisputesRespondApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Quản trị viên quản lý danh sách khiếu nại
      if (pathname === '/api/admin/seller-disputes') {
        if (method === 'OPTIONS') return await adminSellerDisputesIndexApi.onRequestOptions();
        if (method === 'GET') return await adminSellerDisputesIndexApi.onRequestGet(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Quản trị viên xử lý khiếu nại (REFUND / REPLACE / REJECT)
      const matchAdminDisputeResolve = pathname.match(/^\/api\/admin\/seller-disputes\/([^/]+)\/resolve$/);
      if (matchAdminDisputeResolve) {
        context.params = { ...(context.params || {}), id: matchAdminDisputeResolve[1] };
        if (method === 'OPTIONS') return await adminSellerDisputesResolveApi.onRequestOptions();
        if (method === 'POST') return await adminSellerDisputesResolveApi.onRequestPost(context);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Probe trạng thái lưu trữ & nén ảnh mục trang chủ
      if (pathname === '/api/homepage-images/probe') {
        if (method === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        }
        if (method === 'GET') return await homepageImagesProbeApi.onRequestGet(context as any);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Phục vụ ảnh mục trang chủ tại /api/homepage-images/<file>
      if (pathname.startsWith('/api/homepage-images/')) {
        const fileParam = pathname.replace(/^\/api\/homepage-images\//, '');
        const imageContext = {
          ...context,
          params: { file: fileParam },
        };
        if (method === 'OPTIONS') return await homepageImagesApi.onRequestOptions();
        if (method === 'GET' || method === 'HEAD') return await homepageImagesApi.onRequestGet(imageContext);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Phục vụ ảnh sản phẩm gian hàng (tối đa 10 ảnh WebP/SP) tại /api/product-media/<file>
      if (pathname.startsWith('/api/product-media/')) {
        const fileParam = pathname.replace(/^\/api\/product-media\//, '');
        const mediaContext = {
          ...context,
          params: { file: fileParam },
        };
        if (method === 'OPTIONS') return await productMediaApi.onRequestOptions();
        if (method === 'GET' || method === 'HEAD') return await productMediaApi.onRequestGet(mediaContext);
        return new Response('Method Not Allowed', { status: 405 });
      }

            // 21. Cart API (Customer Experience)
      if (pathname === '/api/cart') {
        if (method === 'OPTIONS' && cartIndexApi.onRequestOptions) return await cartIndexApi.onRequestOptions(context);
        if (method === 'GET' && cartIndexApi.onRequestGet) return await cartIndexApi.onRequestGet(context);
        if (method === 'DELETE' && cartIndexApi.onRequestDelete) return await cartIndexApi.onRequestDelete(context);
      }
      if (pathname === '/api/cart/sync') {
        if (method === 'OPTIONS' && cartSyncApi.onRequestOptions) return await cartSyncApi.onRequestOptions(context);
        if (method === 'POST' && cartSyncApi.onRequestPost) return await cartSyncApi.onRequestPost(context);
      }
      if (pathname === '/api/cart/items') {
        if (method === 'OPTIONS' && cartItemsApi.onRequestOptions) return await cartItemsApi.onRequestOptions(context);
        if (method === 'POST' && cartItemsApi.onRequestPost) return await cartItemsApi.onRequestPost(context);
      }
      if (pathname.startsWith('/api/cart/items/')) {
        const itemId = pathname.replace('/api/cart/items/', '').trim();
        const itemContext = { ...context, params: { id: itemId } };
        if (method === 'OPTIONS' && cartItemsIdApi.onRequestOptions) return await cartItemsIdApi.onRequestOptions(itemContext);
        if (method === 'PUT' && cartItemsIdApi.onRequestPut) return await cartItemsIdApi.onRequestPut(itemContext);
        if (method === 'DELETE' && cartItemsIdApi.onRequestDelete) return await cartItemsIdApi.onRequestDelete(itemContext);
      }

      // 22. User Addresses API (Customer Experience)
      if (pathname === '/api/user/addresses') {
        if (method === 'OPTIONS' && userAddressesIndexApi.onRequestOptions) return await userAddressesIndexApi.onRequestOptions(context);
        if (method === 'GET' && userAddressesIndexApi.onRequestGet) return await userAddressesIndexApi.onRequestGet(context);
        if (method === 'POST' && userAddressesIndexApi.onRequestPost) return await userAddressesIndexApi.onRequestPost(context);
      }
      if (pathname.match(/^\/api\/user\/addresses\/([^/]+)\/default$/)) {
        const addrMatch = pathname.match(/^\/api\/user\/addresses\/([^/]+)\/default$/);
        const addrContext = { ...context, params: { id: addrMatch ? addrMatch[1] : '' } };
        if (method === 'OPTIONS' && userAddressesDefaultApi.onRequestOptions) return await userAddressesDefaultApi.onRequestOptions(addrContext);
        if (method === 'POST' && userAddressesDefaultApi.onRequestPost) return await userAddressesDefaultApi.onRequestPost(addrContext);
      }
      if (pathname.startsWith('/api/user/addresses/') && !pathname.endsWith('/default')) {
        const addrId = pathname.replace('/api/user/addresses/', '').trim();
        const addrContext = { ...context, params: { id: addrId } };
        if (method === 'OPTIONS' && userAddressesIdApi.onRequestOptions) return await userAddressesIdApi.onRequestOptions(addrContext);
        if (method === 'PUT' && userAddressesIdApi.onRequestPut) return await userAddressesIdApi.onRequestPut(addrContext);
        if (method === 'DELETE' && userAddressesIdApi.onRequestDelete) return await userAddressesIdApi.onRequestDelete(addrContext);
      }

      // 23. Google OAuth API
      if (pathname === '/api/auth/oauth/google') {
        if (method === 'OPTIONS' && googleAuthApi.onRequestOptions) return await googleAuthApi.onRequestOptions(context);
        if (method === 'POST' && googleAuthApi.onRequestPost) return await googleAuthApi.onRequestPost(context);
      }

      // 24. Search API
      if (pathname === '/api/search') {
        if (method === 'OPTIONS' && searchIndexApi.onRequestOptions) return await searchIndexApi.onRequestOptions(context);
        if (method === 'GET' && searchIndexApi.onRequestGet) return await searchIndexApi.onRequestGet(context);
      }

      // 25. User Wishlist API
      if (pathname === '/api/user/wishlist') {
        if (method === 'OPTIONS' && wishlistIndexApi.onRequestOptions) return await wishlistIndexApi.onRequestOptions(context);
        if (method === 'GET' && wishlistIndexApi.onRequestGet) return await wishlistIndexApi.onRequestGet(context);
        if (method === 'DELETE' && wishlistIndexApi.onRequestDelete) return await wishlistIndexApi.onRequestDelete(context);
      }
      if (pathname === '/api/user/wishlist/toggle') {
        if (method === 'OPTIONS' && wishlistToggleApi.onRequestOptions) return await wishlistToggleApi.onRequestOptions(context);
        if (method === 'POST' && wishlistToggleApi.onRequestPost) return await wishlistToggleApi.onRequestPost(context);
      }
      if (pathname === '/api/user/wishlist/sync') {
        if (method === 'OPTIONS' && wishlistSyncApi.onRequestOptions) return await wishlistSyncApi.onRequestOptions(context);
        if (method === 'POST' && wishlistSyncApi.onRequestPost) return await wishlistSyncApi.onRequestPost(context);
      }

      // Fallback for any unknown /api route
      if (pathname.startsWith('/api')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Endpoint not found', path: pathname }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      // Static assets fallback (SPA routing with Edge SEO & Social Meta Injection)
      const userAgent = request.headers.get('User-Agent') || '';
      const isCrawler = /facebookexternalhit|ZaloBot|TelegramBot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|Viber/i.test(userAgent);
      const isGiveawayShareQuery = (
        url.searchParams.has('gw') ||
        url.searchParams.has('giveaway') ||
        url.searchParams.has('event') ||
        url.searchParams.has('id')
      ) && (pathname === '/giveaways' || pathname === '/giveaway');

      const isStoreShareQuery = (
        url.searchParams.has('pkg') ||
        url.searchParams.has('package') ||
        url.searchParams.has('product') ||
        url.searchParams.has('prod') ||
        url.searchParams.has('game') ||
        url.searchParams.has('g')
      ) && (pathname === '/store' || pathname.startsWith('/store/'));

      if (request.method === 'GET' && (isStoreShareQuery || (isCrawler && isGiveawayShareQuery))) {
        return await renderSeoHtml(request, env, pathname);
      }

      // Dynamic Server-Side Sitemap (XML) with real-time lastmod calculation
      if ((pathname === '/sitemap.xml' || pathname === '/sitemap') && (request.method === 'GET' || request.method === 'HEAD')) {
        return await handleDynamicSitemap(request, env, ctx);
      }

      // Root Homepage, Bilingual /en, Standalone Seller Portal & Public Partner Storefronts — Dynamic Brand SSR + Epoch-Keyed Worker Cache
      const isDynamicShellPath =
        pathname === '/' ||
        pathname === '/index.html' ||
        pathname === '/vi' ||
        pathname === '/vi/' ||
        pathname === '/en' ||
        pathname === '/en/' ||
        pathname === '/seller' ||
        pathname.startsWith('/seller/') ||
        pathname === '/en/seller' ||
        pathname.startsWith('/en/seller/') ||
        pathname.startsWith('/gian-hang/') ||
        pathname.startsWith('/en/gian-hang/');

      if ((request.method === 'GET' || request.method === 'HEAD') && isDynamicShellPath) {
        const reqStart = performance.now();
        // Tự động chuyển hướng 301 về Trang Chủ Sàn Universal Mall nếu người dùng hoặc bot truy cập qua ?game= hoặc ?g=
        if (pathname === '/' || pathname === '/index.html') {
          const gameQueryParam = url.searchParams.get('game') || url.searchParams.get('g');
          if (gameQueryParam) {
            return Response.redirect(`${url.origin}/`, 301);
          }
          const pageParam = url.searchParams.get('page');
          const pageNum = pageParam ? parseInt(pageParam, 10) : 1;
          if (pageNum > 1) {
            return await renderSeoHtml(request, env, pathname);
          }
        }

        const isFresh = url.searchParams.has('fresh') || url.searchParams.has('nocache') || url.searchParams.has('_t');
        const cfCache = (typeof caches !== 'undefined' && !isFresh) ? (caches as any).default : null;
        const buildTag = typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : 'live';
        const shellEpoch = env.DB ? await getCatalogEpoch(env.DB) : '0';
        const cacheKey = new Request(`${url.origin}/__edge_cache_v/${buildTag}/${shellEpoch}${pathname}`, { method: 'GET' });
        const isHead = request.method === 'HEAD';
        if (cfCache) {
          try {
            const cached = await cfCache.match(cacheKey);
            if (cached) {
              const cachedBuildId = cached.headers.get('x-build-id');
              const cachedEpoch = cached.headers.get('x-catalog-epoch');
              if ((!cachedBuildId || cachedBuildId === buildTag) && (!cachedEpoch || cachedEpoch === shellEpoch)) {
                const edgeDur = (performance.now() - reqStart).toFixed(1);
                const res = new Response(isHead ? null : cached.body, cached);
                res.headers.set('cf-cache-status', 'HIT');
                res.headers.set('X-Edge-Cache', 'HIT');
                res.headers.set('Server-Timing', `edge;dur=${edgeDur}, cache;desc="HIT"`);
                return res;
              }
            }
          } catch {}
        }

        const seoRes = await renderSeoHtml(request, env, pathname);
        if (seoRes.status === 200) {
          const edgeDur = (performance.now() - reqStart).toFixed(1);
          const bodyText = await seoRes.text();
          const baseHeaders = new Headers(seoRes.headers);
          baseHeaders.set('Cache-Control', 'public, max-age=0, must-revalidate');
          baseHeaders.set('CDN-Cache-Control', 'no-store');
          baseHeaders.set('X-Catalog-Epoch', shellEpoch);
          baseHeaders.set('X-Build-Id', buildTag);
          baseHeaders.delete('Pragma');
          baseHeaders.delete('Expires');

          if (cfCache && bodyText.length > 50 && ctx.waitUntil) {
            try {
              const toCacheHeaders = new Headers(baseHeaders);
              toCacheHeaders.set('cf-cache-status', 'HIT');
              toCacheHeaders.set('X-Edge-Cache', 'HIT');
              toCacheHeaders.set('Server-Timing', `edge;dur=0.1, cache;desc="HIT"`);
              ctx.waitUntil(cfCache.put(cacheKey, new Response(bodyText, { status: 200, headers: toCacheHeaders })));
            } catch {}
          }

          const clientHeaders = new Headers(baseHeaders);
          const cacheStatus = isFresh ? 'BYPASS' : 'MISS';
          clientHeaders.set('cf-cache-status', cacheStatus);
          clientHeaders.set('X-Edge-Cache', cacheStatus);
          clientHeaders.set('Server-Timing', `edge;dur=${edgeDur}, cache;desc="${cacheStatus}"`);

          if (isHead) {
            return new Response(null, { status: 200, headers: clientHeaders });
          }
          return new Response(bodyText, { status: 200, headers: clientHeaders });
        }
        return seoRes;
      }

      // Chuyển hướng 301 đường dẫn Kênh Người Bán cũ (/ban-hang*, /seller-center*) sang Cổng Quản Trị Gian Hàng độc lập (/seller & /en/seller)
      if (request.method === 'GET' || request.method === 'HEAD') {
        const lp = pathname.toLowerCase();
        if (
          lp === '/ban-hang' ||
          lp.startsWith('/ban-hang/') ||
          lp === '/seller-center' ||
          lp.startsWith('/seller-center/') ||
          lp === '/vi/ban-hang' ||
          lp.startsWith('/vi/ban-hang/') ||
          lp === '/vi/seller-center' ||
          lp.startsWith('/vi/seller-center/')
        ) {
          return Response.redirect(`${url.origin}/seller${url.search}`, 301);
        }
        if (
          lp === '/en/ban-hang' ||
          lp.startsWith('/en/ban-hang/') ||
          lp === '/en/seller-center' ||
          lp.startsWith('/en/seller-center/')
        ) {
          return Response.redirect(`${url.origin}/en/seller${url.search}`, 301);
        }
      }

      // Chuyển hướng 301 mọi URL legacy (/test1*, /game/*, /g/*) về Trang Chủ Sàn Universal Mall (phủ cả GET & HEAD)
      if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        (pathname === '/test1' ||
          pathname.startsWith('/test1/') ||
          pathname === '/game' ||
          pathname.startsWith('/game/') ||
          pathname === '/g' ||
          pathname.startsWith('/g/'))
      ) {
        return Response.redirect(`${url.origin}/`, 301);
      }

      // Luôn phục vụ tin tức, danh mục A-Z, chuyên mục thể loại, nhiệm vụ & sự kiện giveaway qua renderSeoHtml (Kèm Edge Cache TTL 3600s)
      if ((request.method === 'GET' || request.method === 'HEAD') && (
        pathname === '/news' ||
        pathname.startsWith('/news/') ||
        pathname.startsWith('/giveaways/') ||
        pathname.startsWith('/giveaway/') ||
        pathname.startsWith('/the-loai/') ||
        pathname === '/the-loai' ||
        pathname === '/danh-sach-game-a-z' ||
        pathname === '/ma-hom-nay' ||
        pathname.startsWith('/ma-hom-nay/') ||
        pathname === '/nhiem-vu' ||
        pathname.startsWith('/nhiem-vu/') ||
        pathname === '/missions' ||
        pathname.startsWith('/missions/')
      )) {
        const reqStart = performance.now();
        const isFresh = url.searchParams.has('fresh') || url.searchParams.has('nocache') || url.searchParams.has('_t');
        const cfCache = (typeof caches !== 'undefined' && !isFresh) ? (caches as any).default : null;
        const buildTag = typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : 'live';
        const seoEpoch = env.DB ? await getCatalogEpoch(env.DB) : '0';
        const cacheKey = new Request(`${url.origin}/__edge_cache_v/${buildTag}/${seoEpoch}${url.pathname}`, { method: 'GET' });
        const isHead = request.method === 'HEAD';
        if (cfCache) {
          try {
            const cached = await cfCache.match(cacheKey);
            if (cached) {
              const cachedBuildId = cached.headers.get('x-build-id');
              if (!cachedBuildId || cachedBuildId === buildTag) {
                const cachedText = isHead ? null : await cached.text();
                // Phòng vệ: Nếu cached body bị rỗng (< 50 bytes) do lỗi race condition hoặc HEAD request trước đó
                if (!isHead && (!cachedText || cachedText.length < 50)) {
                  try { ctx.waitUntil(cfCache.delete(cacheKey)); } catch {}
                } else {
                  const edgeDur = (performance.now() - reqStart).toFixed(1);
                  const res = new Response(isHead ? null : cachedText, cached);
                  res.headers.set('cf-cache-status', 'HIT');
                  res.headers.set('X-Edge-Cache', 'HIT');
                  res.headers.set('Server-Timing', `edge;dur=${edgeDur}, cache;desc="HIT"`);
                  return res;
                }
              }
            }
          } catch {}
        }

        const seoRes = await renderSeoHtml(request, env, pathname);
        const seoHtml = await seoRes.text();
        const edgeDur = (performance.now() - reqStart).toFixed(1);
        const d1Dur = (globalThis as any).__wcg_last_d1_dur || 0;
        const cacheStatus = isFresh ? 'BYPASS' : 'MISS';

        if (cfCache && seoRes.status === 200 && seoHtml.length > 50 && ctx.waitUntil) {
          try {
            const toCacheHeaders = new Headers(seoRes.headers);
            toCacheHeaders.set('Cache-Control', 'public, max-age=0, must-revalidate, s-maxage=3600, stale-while-revalidate=86400');
            toCacheHeaders.set('cf-cache-status', 'HIT');
            toCacheHeaders.set('X-Edge-Cache', 'HIT');
            toCacheHeaders.set('X-Build-Id', buildTag);
            toCacheHeaders.set('Server-Timing', `edge;dur=0.1, cache;desc="HIT"`);
            const toCacheRes = new Response(seoHtml, {
              status: seoRes.status,
              statusText: seoRes.statusText,
              headers: toCacheHeaders,
            });
            ctx.waitUntil(cfCache.put(cacheKey, toCacheRes));
          } catch {}
        }

        const clientHeaders = new Headers(seoRes.headers);
        clientHeaders.set('cf-cache-status', cacheStatus);
        clientHeaders.set('X-Edge-Cache', cacheStatus);
        const timingParts = [`edge;dur=${edgeDur}`];
        if (d1Dur > 0) {
          timingParts.push(`d1;dur=${d1Dur}`);
        }
        timingParts.push(`cache;desc="${cacheStatus}"`);
        clientHeaders.set('Server-Timing', timingParts.join(', '));

        if (isHead) {
          return new Response(null, {
            status: seoRes.status,
            statusText: seoRes.statusText,
            headers: clientHeaders,
          });
        }
        return new Response(seoHtml, {
          status: seoRes.status,
          statusText: seoRes.statusText,
          headers: clientHeaders,
        });
      }

      // Phục vụ icon game động và tĩnh tại /game_icons/<slug>.<ext>
      if (pathname.startsWith('/game_icons/') && (method === 'GET' || method === 'HEAD')) {
        return await handleGameIconRequest(request, env, ctx, pathname);
      }

      // Server-side resilience layer for missing JS chunks (Stale deployments)
      if (request.method === 'GET' && pathname.startsWith('/assets/') && pathname.endsWith('.js')) {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status === 404) {
          console.warn(`[Worker] Stale JS chunk requested: ${pathname}. Returning auto-recovery stub.`);
          return new Response(
            `/* Stale deployment chunk auto-recovery stub */
console.warn('[AutoRecovery] Stale chunk requested: ${pathname}. Reloading page to load latest build...');
if (typeof window !== 'undefined') {
  const retryKey = 'wcg_edge_chunk_reload';
  const last = sessionStorage.getItem(retryKey);
  const now = Date.now();
  if (!last || now - parseInt(last, 10) > 8000) {
    sessionStorage.setItem(retryKey, String(now));
    window.location.reload();
  }
}
export default {};
`,
            {
              status: 200,
              headers: {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
              },
            }
          );
        }
        return assetResponse;
      }

      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status === 404 && request.method === 'GET' && !pathname.match(/\.[a-zA-Z0-9]+$/)) {
        return await renderSeoHtml(request, env, pathname);
      }
      return assetResponse;
    } catch (err: any) {
      console.error('Worker API error:', err);
      return new Response(
        JSON.stringify({ success: false, error: err?.message || 'Server Internal Error' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
}

export { shouldBumpCatalogEpoch };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const res = await handleWorkerRequest(request, env, ctx);
    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/$/, '') || '/';
      const method = request.method.toUpperCase();
      if (
        res.status >= 200 &&
        res.status < 300 &&
        pathname !== '/api/giveaways/claim' &&
        pathname !== '/api/giveaways/simulate' &&
        shouldBumpCatalogEpoch(pathname, method) &&
        !wasEpochBumpedForRequest(request)
      ) {
        await invalidateCatalogEdgeCache(ctx, request, env);
      }
    } catch (e: any) {
      console.warn('[CatalogEpochHook] non-fatal warning:', e?.message);
    }
    return attachBuildHeaders(res);
  },
};

/**
 * Danh sách bí danh (aliases) chuẩn hóa về Slug chính để tránh Google index trùng lặp
 */
const GAME_CANONICAL_ALIASES: Record<string, string> = {
  'dau-truong-chan-ly-mobile': 'dau-truong-chan-ly',
  'ta-la-hac-ngo-khong-vplay': 'ta-la-hac-ngo-khong',
  'tam-quoc-huyen-tuong': 'tam-quoc-huyen-tuong-vng',
  'x-wukong-dai-chien-tam-gioi': 'x-wukong',
  'huyen-thoai-hai-tac': 'pirate-legends',
  'seven-deadly-sins-grand-cross': 'the-seven-deadly-sins-grand-cross',
  'where-winds-meet-mobile': 'yen-van-thap-luc-thanh',
  'loan-the-3q': 'loan-the-3q-than-ma-lenh-oeg',
};

const TOPIC_CLUSTERS = [
  {
    slug: 'kiem-hiep-tien-hiep',
    name: 'Kiếm Hiệp & Tiên Hiệp',
    match: (c: string) => /kiếm hiệp|tiên hiệp|võ hiệp|tu tiên/i.test(c),
  },
  {
    slug: 'nhap-vai-gacha-anime',
    name: 'Nhập Vai Gacha & Anime',
    match: (c: string) => /anime|gacha|waifu/i.test(c),
  },
  {
    slug: 'ban-sung-sinh-ton',
    name: 'Bắn Súng & Sinh Tồn',
    match: (c: string) => /bắn súng|sinh tồn|battle royale/i.test(c),
  },
  {
    slug: 'tam-quoc-chien-thuat',
    name: 'Tam Quốc & Chiến Thuật',
    match: (c: string) => /tam quốc|chiến thuật|chiến lược|slg|đế chế|thẻ tướng/i.test(c),
  },
  {
    slug: 'roblox-mini-game',
    name: 'Roblox & Mini Game',
    match: (c: string) => /roblox|mini game/i.test(c),
  },
  {
    slug: 'nhap-vai-mmorpg',
    name: 'Nhập Vai & MMORPG',
    match: (c: string) => /mmorpg|nhập vai|arpg/i.test(c),
  },
];

function getClusterSlug(category: string = ''): string {
  const c = String(category || '').toLowerCase();
  for (const cluster of TOPIC_CLUSTERS) {
    if (cluster.match(c)) return cluster.slug;
  }
  return 'nhap-vai-mmorpg';
}

function parseDateMs(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') {
    return val > 0 && val < 3000000000000 ? val : 0;
  }
  const str = String(val).trim();
  if (!str) return 0;
  const normalized = str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') + 'Z' : str;
  const t = new Date(normalized).getTime();
  return isNaN(t) ? 0 : t;
}

function formatDate(ms: number, todayStr: string): string {
  if (!ms || ms <= 0) return '2026-10-22';
  const dStr = new Date(ms).toISOString().slice(0, 10);
  return dStr > todayStr ? todayStr : dStr;
}

/**
 * Xử lý request sitemap.xml động với chiến lược bộ đệm đa tầng (RAM Isolate + Edge Cache)
 */
async function handleDynamicSitemap(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const isHead = request.method === 'HEAD';
  const forceFresh = url.searchParams.get('fresh') === '1' || url.searchParams.has('_t');

  const cfCache = typeof caches !== 'undefined' ? (caches as any).default : null;
  const buildTag = typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : 'live';
  const cacheKey = new Request(`https://universal-mall-shop.pages.dev/__edge_cache_v/${buildTag}/sitemap.xml`, { method: 'GET' });

  // 1. Kiểm tra Cloudflare Edge Cache nếu không yêu cầu fresh
  if (cfCache && !forceFresh) {
    try {
      const cached = await cfCache.match(cacheKey);
      if (cached) {
        const res = new Response(isHead ? null : cached.body, cached);
        res.headers.set('cf-cache-status', 'HIT');
        return res;
      }
    } catch {}
  }

  // 2. Kiểm tra bộ nhớ Worker isolate (RAM cache)
  const gScope = globalThis as any;
  const now = Date.now();
  if (!forceFresh && gScope.__wcg_sitemap_xml && (now - (gScope.__wcg_sitemap_time || 0) < 30 * 60 * 1000)) {
    const res = new Response(isHead ? null : gScope.__wcg_sitemap_xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
        'X-Sitemap-Source': 'isolate-cache',
      },
    });
    if (cfCache && ctx.waitUntil && xml && xml.length > 50) {
      try {
        const toCacheSitemap = new Response(xml, {
          status: 200,
          headers: res.headers,
        });
        ctx.waitUntil(cfCache.put(cacheKey, toCacheSitemap));
      } catch {}
    }
    return res;
  }

  // 3. Tái tạo sitemap XML thời gian thực từ D1 + Fallback State
  try {
    const xml = await generateDynamicSitemapXml(env);
    gScope.__wcg_sitemap_xml = xml;
    gScope.__wcg_sitemap_time = now;

    const res = new Response(isHead ? null : xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
        'X-Sitemap-Source': 'live-d1',
      },
    });

    if (cfCache && ctx.waitUntil && xml && xml.length > 50) {
      try {
        const toCacheSitemap = new Response(xml, {
          status: 200,
          headers: res.headers,
        });
        ctx.waitUntil(cfCache.put(cacheKey, toCacheSitemap));
      } catch {}
    }
    return res;
  } catch (err: any) {
    console.error('[Worker] Lỗi tạo sitemap động:', err);
    return await env.ASSETS.fetch(request);
  }
}

/**
 * Tạo nội dung sitemap XML động với lastmod thực tế từ D1 và fallbacks
 */
async function generateDynamicSitemapXml(env: Env): Promise<string> {
  const BASE_URL = (env?.SITE_URL || 'https://universal-mall-shop.pages.dev').replace(/\/$/, '');
  const todayStr = new Date().toISOString().slice(0, 10);

  const maxCodeTimeBySlug = new Map<string, number>();

  // 1. Nạp timestamp ban đầu từ fallbackCodesData
  if (Array.isArray(fallbackCodesData)) {
    for (const c of fallbackCodesData as any[]) {
      if (!c) continue;
      const slug = String(c.gameSlug || c.slug || c.gameId || '').trim().toLowerCase();
      if (!slug) continue;
      const t = parseDateMs(c.added_at || c.updated_at || c.created_at);
      if (t > 0 && t > (maxCodeTimeBySlug.get(slug) || 0)) {
        maxCodeTimeBySlug.set(slug, t);
      }
    }
  }

  let d1Games: any[] = [];
  let d1Giveaways: any[] = [];
  let newsArticles: any[] = [];

  if (env.DB) {
    try {
      const [codesRes, settingsRes, gamesRes, gwRes] = await Promise.allSettled([
        env.DB.prepare(
          'SELECT game_slug, MAX(COALESCE(added_at, created_at)) as max_time FROM codes GROUP BY game_slug'
        ).all<any>(),

        getMultipleSettingsD1(env.DB, [
          'wcg_admin_custom_free_codes_v1',
          'wcg_admin_free_codes_v5',
          'wcg_admin_free_codes_v4',
          'wcg_news_articles_v1',
          'wcg_admin_games_v5',
          'wcg_games_catalog_v2',
        ]),

        env.DB.prepare(
          "SELECT id, name, slug, publisher, category, is_active, status, created_at, updated_at, last_code_at FROM games WHERE is_active = 1 AND (status IS NULL OR UPPER(status) IN ('ACTIVE', 'PUBLISHED', 'APPROVED'))"
        ).all<any>(),

        env.DB.prepare(
          "SELECT id, created_at, updated_at, start_time FROM giveaways WHERE status != 'DELETED'"
        ).all<any>(),
      ]);

      if (codesRes.status === 'fulfilled' && codesRes.value?.results) {
        for (const row of codesRes.value.results) {
          const s = String(row.game_slug || '').trim().toLowerCase();
          const t = parseDateMs(row.max_time);
          if (s && t > 0 && t > (maxCodeTimeBySlug.get(s) || 0)) {
            maxCodeTimeBySlug.set(s, t);
          }
        }
      }

      if (settingsRes.status === 'fulfilled' && settingsRes.value) {
        const settings = settingsRes.value;
        const customCodes = settings['wcg_admin_custom_free_codes_v1'];
        if (Array.isArray(customCodes)) {
          for (const item of customCodes) {
            const s = String(item.gameSlug || item.game_slug || item.slug || '').trim().toLowerCase();
            const t = parseDateMs(item.added_at || item.added || item.updatedAt || item.updated_at || item.createdAt || item.created_at || item.timestamp);
            if (s && t > 0 && t > (maxCodeTimeBySlug.get(s) || 0)) {
              maxCodeTimeBySlug.set(s, t);
            }
          }
        }

        const d1CrawlerCodes = settings['wcg_admin_free_codes_v5'] || settings['wcg_admin_free_codes_v4'];
        if (Array.isArray(d1CrawlerCodes)) {
          for (const item of d1CrawlerCodes) {
            const s = String(item.gameSlug || item.game_slug || item.slug || '').trim().toLowerCase();
            const t = parseDateMs(item.added_at || item.added || item.updatedAt || item.updated_at || item.createdAt || item.created_at || item.timestamp);
            if (s && t > 0 && t > (maxCodeTimeBySlug.get(s) || 0)) {
              maxCodeTimeBySlug.set(s, t);
            }
          }
        }

        if (Array.isArray(settings['wcg_news_articles_v1'])) {
          newsArticles = settings['wcg_news_articles_v1'];
        }

        const d1AdminGames = settings['wcg_admin_games_v5'];
        if (Array.isArray(d1AdminGames)) {
          for (const ag of d1AdminGames) {
            if (ag && (ag.slug || ag.id)) {
              d1Games.push(ag);
            }
          }
        }
      }

      if (gamesRes.status === 'fulfilled' && gamesRes.value?.results) {
        d1Games.push(...gamesRes.value.results);
      }

      if (gwRes.status === 'fulfilled' && gwRes.value?.results) {
        d1Giveaways = gwRes.value.results;
      }
    } catch (dbErr) {
      console.warn('[generateDynamicSitemapXml] Lỗi truy vấn D1:', dbErr);
    }
  }

  const getEffectiveCodeTime = (rawSlug: string, rawId?: string): number => {
    const s1 = String(rawSlug || '').trim().toLowerCase();
    const s2 = s1.replace(/-mobile$/i, '');
    const s3 = String(rawId || '').trim().toLowerCase();
    const canon = GAME_CANONICAL_ALIASES[s1] || s1;
    const isWwm = s1 === 'yen-van-thap-luc-thanh' || s1 === 'where-winds-meet' || s1 === 'where-winds-meet-mobile';
    const isTienNghich = s1 === 'tien-nghich' || s1 === 'tien-nghich-mobile';
    const isKiemDe = s1 === 'kiem-de' || s1 === 'kiem-de-origin';
    const isDttl = s1 === 'dau-truong-chan-ly' || s1 === 'dau-truong-chan-ly-mobile';
    const isSds = s1 === 'the-seven-deadly-sins-grand-cross' || s1 === 'seven-deadly-sins-grand-cross';
    const isTqht = s1 === 'tam-quoc-huyen-tuong-vng' || s1 === 'tam-quoc-huyen-tuong';
    const isWukong = s1 === 'x-wukong' || s1 === 'x-wukong-dai-chien-tam-gioi';
    const isHkht = s1 === 'pirate-legends' || s1 === 'huyen-thoai-hai-tac';
    const isHnk = s1 === 'ta-la-hac-ngo-khong' || s1 === 'ta-la-hac-ngo-khong-vplay';

    return Math.max(
      maxCodeTimeBySlug.get(s1) || 0,
      maxCodeTimeBySlug.get(s2) || 0,
      maxCodeTimeBySlug.get(s3) || 0,
      maxCodeTimeBySlug.get(canon) || 0,
      isWwm ? (maxCodeTimeBySlug.get('where-winds-meet-mobile') || maxCodeTimeBySlug.get('yen-van-thap-luc-thanh') || maxCodeTimeBySlug.get('where-winds-meet') || 0) : 0,
      isTienNghich ? (maxCodeTimeBySlug.get('tien-nghich-mobile') || maxCodeTimeBySlug.get('tien-nghich') || 0) : 0,
      isKiemDe ? (maxCodeTimeBySlug.get('kiem-de-origin') || maxCodeTimeBySlug.get('kiem-de') || 0) : 0,
      isDttl ? (maxCodeTimeBySlug.get('dau-truong-chan-ly-mobile') || maxCodeTimeBySlug.get('dau-truong-chan-ly') || 0) : 0,
      isSds ? (maxCodeTimeBySlug.get('seven-deadly-sins-grand-cross') || maxCodeTimeBySlug.get('the-seven-deadly-sins-grand-cross') || 0) : 0,
      isTqht ? (maxCodeTimeBySlug.get('tam-quoc-huyen-tuong') || maxCodeTimeBySlug.get('tam-quoc-huyen-tuong-vng') || 0) : 0,
      isWukong ? (maxCodeTimeBySlug.get('x-wukong-dai-chien-tam-gioi') || maxCodeTimeBySlug.get('x-wukong') || 0) : 0,
      isHkht ? (maxCodeTimeBySlug.get('huyen-thoai-hai-tac') || maxCodeTimeBySlug.get('pirate-legends') || 0) : 0,
      isHnk ? (maxCodeTimeBySlug.get('ta-la-hac-ngo-khong-vplay') || maxCodeTimeBySlug.get('ta-la-hac-ngo-khong') || 0) : 0
    );
  };

  // Hợp nhất danh sách game (D1 + fallback)
  const gamesBySlug = new Map<string, any>();
  if (Array.isArray(fallbackGamesData)) {
    for (const g of fallbackGamesData as any[]) {
      if (g && (g.slug || g.id)) {
        const slug = String(g.slug || g.id).trim().toLowerCase();
        gamesBySlug.set(slug, g);
      }
    }
  }
  for (const g of d1Games) {
    if (g && (g.slug || g.id)) {
      const slug = String(g.slug || g.id).trim().toLowerCase();
      gamesBySlug.set(slug, { ...(gamesBySlug.get(slug) || {}), ...g });
    }
  }

  let latestGlobalGameOrCodeTime = 0;
  const clusterMaxTimes = new Map<string, number>();

  for (const [slug, game] of gamesBySlug.entries()) {
    if (!slug || GAME_CANONICAL_ALIASES[slug]) continue;
    if (game.is_active === 0 || game.is_active === false || game.status === 'DELETED' || game.status === 'INACTIVE') continue;

    const codeTime = getEffectiveCodeTime(slug, game.id);
    const maxTime = Math.max(
      codeTime,
      parseDateMs(game.updated_at),
      parseDateMs(game.created_at),
      parseDateMs(game.last_code_at)
    ) || new Date('2026-10-22T00:00:00Z').getTime();

    if (maxTime > latestGlobalGameOrCodeTime) {
      latestGlobalGameOrCodeTime = maxTime;
    }

    const clusterSlug = getClusterSlug(game.category);
    const prevClusterTime = clusterMaxTimes.get(clusterSlug) || 0;
    if (maxTime > prevClusterTime) {
      clusterMaxTimes.set(clusterSlug, maxTime);
    }
  }

  let latestNewsTime = 0;
  const newsUrls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = [];
  const nowMs = Date.now();
  for (const a of newsArticles) {
    if (!a) continue;
    const aSlug = a.slug || a.id;
    if (!aSlug) continue;
    if (a.status === 'SCHEDULED' && a.scheduled_publish_at && parseDateMs(a.scheduled_publish_at) > nowMs) {
      continue;
    }
    const aTime = Math.max(parseDateMs(a.updated_at), parseDateMs(a.published_at), parseDateMs(a.created_at));
    if (aTime > latestNewsTime) latestNewsTime = aTime;
    const aLastmod = formatDate(aTime || new Date('2026-10-13T00:00:00Z').getTime(), todayStr);
    newsUrls.push({
      loc: `${BASE_URL}/news/${encodeURIComponent(aSlug)}`,
      lastmod: aLastmod,
      changefreq: 'weekly',
      priority: '0.8',
    });
  }

  let latestGwTime = 0;
  const gwMap = new Map<string, any>();
  if (Array.isArray(fallbackGiveawaysData)) {
    for (const gw of fallbackGiveawaysData as any[]) {
      if (gw && gw.id) gwMap.set(String(gw.id), gw);
    }
  }
  for (const gw of d1Giveaways) {
    if (gw && gw.id) gwMap.set(String(gw.id), { ...(gwMap.get(String(gw.id)) || {}), ...gw });
  }

  const giveawayUrls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = [];
  for (const [gwId, gw] of gwMap.entries()) {
    if (!gwId || gw.status === 'DELETED') continue;
    const gwTime = Math.max(parseDateMs(gw.updated_at), parseDateMs(gw.start_time), parseDateMs(gw.created_at));
    if (gwTime > latestGwTime) latestGwTime = gwTime;
    const gwLastmod = formatDate(gwTime || new Date('2026-10-25T00:00:00Z').getTime(), todayStr);
    giveawayUrls.push({
      loc: `${BASE_URL}/giveaways/${encodeURIComponent(gwId)}`,
      lastmod: gwLastmod,
      changefreq: 'daily',
      priority: '0.8',
    });
  }

  const homeLastmod = formatDate(
    Math.max(latestGlobalGameOrCodeTime, latestNewsTime, latestGwTime),
    todayStr
  );
  const azLastmod = formatDate(latestGlobalGameOrCodeTime, todayStr);
  const newsIndexLastmod = formatDate(latestNewsTime || latestGlobalGameOrCodeTime, todayStr);
  const suKienLastmod = formatDate(latestGwTime || latestGlobalGameOrCodeTime, todayStr);
  const gwIndexLastmod = formatDate(latestGwTime || latestGlobalGameOrCodeTime, todayStr);

  const sitemapMap = new Map<string, { loc: string; lastmod: string; changefreq: string; priority: string }>();

  const addEntry = (item: { loc: string; lastmod: string; changefreq: string; priority: string }) => {
    if (!item || !item.loc) return;
    sitemapMap.set(item.loc, item);
  };

  // 1. Static Core Pages
  addEntry({ loc: `${BASE_URL}/`, priority: '1.0', changefreq: 'daily', lastmod: homeLastmod });
  addEntry({ loc: `${BASE_URL}/danh-sach-game-a-z`, priority: '0.9', changefreq: 'daily', lastmod: azLastmod });
  addEntry({ loc: `${BASE_URL}/ma-hom-nay`, priority: '0.9', changefreq: 'daily', lastmod: todayStr });
  addEntry({ loc: `${BASE_URL}/news/`, priority: '0.9', changefreq: 'daily', lastmod: newsIndexLastmod });
  addEntry({ loc: `${BASE_URL}/su-kien`, priority: '0.9', changefreq: 'daily', lastmod: suKienLastmod });
  addEntry({ loc: `${BASE_URL}/giveaways`, priority: '0.9', changefreq: 'daily', lastmod: gwIndexLastmod });
  addEntry({ loc: `${BASE_URL}/store`, priority: '0.9', changefreq: 'daily', lastmod: '2026-11-06' });
  addEntry({ loc: `${BASE_URL}/utilities`, priority: '0.9', changefreq: 'daily', lastmod: '2026-10-27' });

  // 2. Chuyên Mục Thể Loại (Topic Clusters)
  for (const c of TOPIC_CLUSTERS) {
    const clusterTime = clusterMaxTimes.get(c.slug) || latestGlobalGameOrCodeTime;
    const clusterLastmod = formatDate(clusterTime, todayStr);
    addEntry({
      loc: `${BASE_URL}/the-loai/${c.slug}`,
      priority: '0.85',
      changefreq: 'daily',
      lastmod: clusterLastmod,
    });
  }

  // 3. Games URLs removed (routes /game/:slug redirect 301 to /)

  // 4. News Articles
  for (const nUrl of newsUrls) addEntry(nUrl);

  // 5. Giveaways
  for (const gwUrl of giveawayUrls) addEntry(gwUrl);

  const allEntries = Array.from(sitemapMap.values());
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    allEntries.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n') +
    `\n</urlset>`;
}

/**
 * Cloudflare Edge SEO Engine: Injects dynamic Open Graph, Twitter Cards,
 * Page Titles, Canonical URLs, and Schema.org JSON-LD for individual game pages
 * and major sections before returning HTML to crawlers & users.
 */
async function renderSeoHtml(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const origin = (env?.SITE_URL || 'https://universal-mall-shop.pages.dev').replace(/\/$/, '');
  const url = new URL(request.url);

  // 1.5. Phục vụ trực tiếp các trang tĩnh chuyên mục thể loại, nhiệm vụ và mục lục A-Z từ prerender
  if (
    pathname.startsWith('/the-loai') ||
    pathname === '/danh-sach-game-a-z' ||
    pathname === '/nhiem-vu' ||
    pathname.startsWith('/nhiem-vu/') ||
    pathname === '/missions' ||
    pathname.startsWith('/missions/') ||
    pathname === '/su-kien' ||
    pathname.startsWith('/su-kien/') ||
    pathname === '/events' ||
    pathname.startsWith('/events/') ||
    pathname === '/ma-hom-nay' ||
    pathname.startsWith('/ma-hom-nay/') ||
    pathname === '/telegram' ||
    pathname.startsWith('/telegram/') ||
    pathname === '/news' ||
    pathname === '/news/'
  ) {
    const cleanPath = pathname.replace(/\/$/, '');
    const assetUrl = new URL(`${cleanPath}.html`, request.url);
    const assetRes = await env.ASSETS.fetch(new Request(assetUrl.toString()));
    if (assetRes.status === 200) {
      const headers = new Headers(assetRes.headers);
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate, s-maxage=3600, stale-while-revalidate=86400');
      headers.set('Content-Type', 'text/html; charset=utf-8');
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(assetRes.body, { status: 200, headers });
    }
    const idxUrl = new URL(`${cleanPath}/index.html`, request.url);
    const idxRes = await env.ASSETS.fetch(new Request(idxUrl.toString()));
    if (idxRes.status === 200) {
      const headers = new Headers(idxRes.headers);
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate, s-maxage=3600, stale-while-revalidate=86400');
      headers.set('Content-Type', 'text/html; charset=utf-8');
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(idxRes.body, { status: 200, headers });
    }
  }

  const gScope = globalThis as any;
  const brand = await getBrandIdentity(env.DB);
  const brandEpoch = env.DB ? await getCatalogEpoch(env.DB) : '0';
  const brandName = brand.brandName;
  const shortName = brand.shortName;
  const coreUnit = brand.coreUnitName;
  const buildTag = typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : 'live';
  let html = gScope.__wcg_base_html;
  if (!html || gScope.__wcg_base_html_build !== buildTag) {
    const indexUrl = new URL('/', request.url);
    const baseRes = await env.ASSETS.fetch(new Request(indexUrl, request));
    if (baseRes.status !== 200) {
      return baseRes;
    }
    html = await baseRes.text();
    gScope.__wcg_base_html = html;
    gScope.__wcg_base_html_build = buildTag;
  }

  // Always update static shell brand tags & inject Zero-FOUC window.__WCG_BRAND__
  html = html
    .replace(/<meta\s+name="apple-mobile-web-app-title"\s+content=".*?"\s*\/?>/i, `<meta name="apple-mobile-web-app-title" content="${shortName}" />`)
    .replace(/<meta\s+property="og:site_name"\s+content=".*?"\s*\/?>/i, `<meta property="og:site_name" content="${brandName}" />`)
    .replace(/alt="Pine Universal Mall Logo"/gi, `alt="${brandName} Logo"`);

  const inlineBrandScript = `<script>window.__WCG_BRAND__=${serializeBrandForInlineScript(brand)};</script>`;
  if (html.includes('</head>')) {
    html = html.replace('</head>', `    ${inlineBrandScript}\n  </head>`);
  }

  const replaceTitleAndMeta = (
    title: string,
    description: string,
    canonicalPath: string,
    ogImage: string,
    extraLdJson?: any
  ) => {
    const fullCanonical = `${origin}${canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`}`;
    const fullOgImage = ogImage.startsWith('http') ? ogImage : `${origin}${ogImage.startsWith('/') ? ogImage : `/${ogImage}`}`;

    // 1. Title
    html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);

    // 2. Meta description
    html = html.replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/i, `<meta name="description" content="${description}">`);

    // 3. Canonical
    html = html.replace(/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i, `<link rel="canonical" href="${fullCanonical}">`);

    // 4. Clean up ALL existing Open Graph image & Twitter image tags first to prevent duplicate width/height conflicts
    html = html.replace(/<meta\s+property="og:image[^>]*\/?>\s*/gi, '');
    html = html.replace(/<meta\s+name="twitter:image[^>]*\/?>\s*/gi, '');

    // 5. Open Graph tags
    html = html.replace(/<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i, `<meta property="og:title" content="${title}">`);
    html = html.replace(/<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i, `<meta property="og:description" content="${description}">`);
    html = html.replace(/<meta\s+property="og:url"\s+content=".*?"\s*\/?>/i, `<meta property="og:url" content="${fullCanonical}">`);

    const ogImageBlock = `<meta property="og:image" content="${fullOgImage}">\n` +
      `    <meta property="og:image:secure_url" content="${fullOgImage}">\n` +
      `    <meta property="og:image:type" content="image/jpeg">\n` +
      `    <meta property="og:image:width" content="1200">\n` +
      `    <meta property="og:image:height" content="630">\n` +
      `    <meta property="og:image:alt" content="${title}">`;
    html = html.replace(/(<meta\s+property="og:url"[^>]*>)/i, `$1\n    ${ogImageBlock}`);

    // 6. Twitter tags
    html = html.replace(/<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:title" content="${title}">`);
    html = html.replace(/<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:description" content="${description}">`);
    html = html.replace(/<meta\s+name="twitter:url"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:url" content="${fullCanonical}">`);

    const twitterImageBlock = `<meta name="twitter:image" content="${fullOgImage}">\n` +
      `    <meta name="twitter:image:alt" content="${title}">`;
    html = html.replace(/(<meta\s+name="twitter:url"[^>]*>)/i, `$1\n    ${twitterImageBlock}`);

    // 6. Inject Schema.org JSON-LD (Đảm bảo dọn sạch schema cũ để tránh trùng lặp WebSite/Organization)
    if (extraLdJson) {
      html = html.replace(/<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>\s*/gi, '');
      const schemas = Array.isArray(extraLdJson) ? extraLdJson : [extraLdJson];
      const ldStr = `\n    <!-- Page-Specific Schema.org JSON-LD -->\n` +
        schemas.map(s => `    <script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n    </script>`).join('\n') +
        `\n  </head>`;
      html = html.replace('</head>', ldStr);
    }
  };

  if (pathname === '/news' || pathname.startsWith('/news/')) {
    const newsSlug = pathname.replace(/^\/news\//i, '').replace(/\/$/, '').trim().toLowerCase();
    let article: any = null;
    if (newsSlug && env.DB) {
      try {
        const stmt = env.DB.prepare("SELECT value FROM system_settings WHERE key = 'wcg_news_articles_v1' LIMIT 1");
        const row: any = await stmt.first();
        const delStmt = env.DB.prepare("SELECT value FROM system_settings WHERE key = 'wcg_deleted_news_articles_v1' LIMIT 1");
        const delRow: any = await delStmt.first();
        const delSet = new Set(delRow?.value ? JSON.parse(delRow.value) : []);

        if (row?.value) {
          const list = JSON.parse(row.value);
          const found = list.find((a: any) => a.slug?.toLowerCase() === newsSlug || a.id?.toLowerCase() === newsSlug);
          if (found && !delSet.has(found.id) && !delSet.has(found.slug)) {
            article = found;
          }
        }
      } catch {}
    }

    if (article) {
      const title = `${article.title} | ${brandName}`;
      const description = article.summary || article.content?.slice(0, 160) || 'Tin tức game và sự kiện giftcode mới nhất.';
      const thumb = (article.cover_url && article.cover_url.trim()) || article.thumbnail_url || (article.game_slug ? `/game_icons/${article.game_slug}-thumb.webp` : '/og-image-thumb.webp');
      const artCover = thumb.startsWith('http') ? thumb : `${origin}${thumb.startsWith('/') ? thumb : `/${thumb}`}`;

      const newsSchema = [
        {
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          "headline": article.title,
          "description": description,
          "image": [artCover],
          "datePublished": article.published_at || article.created_at || "2026-10-13T00:00:00.000Z",
          "dateModified": article.updated_at || article.published_at || article.created_at || "2026-10-13T00:00:00.000Z",
          "author": {
            "@type": "Person",
            "name": article.author || `Ban Biên Tập ${brandName}`
          },
          "publisher": {
            "@type": "Organization",
            "name": brandName,
            "logo": {
              "@type": "ImageObject",
              "url": `${origin}/logo.webp`
            }
          },
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": `${origin}/news/${article.slug || article.id}`
          }
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": `${origin}/` },
            { "@type": "ListItem", "position": 2, "name": "Tin Tức Game", "item": `${origin}/news` },
            { "@type": "ListItem", "position": 3, "name": article.title, "item": `${origin}/news/${article.slug || article.id}` }
          ]
        }
      ];

      replaceTitleAndMeta(title, description, `/news/${article.slug || article.id}`, thumb, newsSchema);
    } else {
      const title = `Tin Tức Game & Sự Kiện Giftcode Mới Nhất 2026 | ${brandName}`;
      const description = `Cập nhật tin tức game mobile, giftcode tân thủ và sự kiện nhận quà hot nhất 2026 tại ${brandName}.`;
      const newsListSchema = [
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": `${origin}/` },
            { "@type": "ListItem", "position": 2, "name": "Tin Tức Game", "item": `${origin}/news` }
          ]
        }
      ];
      replaceTitleAndMeta(title, description, '/news', '/og-image.jpg', newsListSchema);
    }
  } else if (
    pathname === '/su-kien' ||
    pathname.startsWith('/su-kien/') ||
    pathname === '/events' ||
    pathname.startsWith('/events/')
  ) {
    const title = `Sự Kiện Game & Lịch Khởi Tranh Mới Nhất 2026 | ${brandName}`;
    const description = 'Tổng hợp sự kiện game mobile, giải đấu, lịch khởi tranh và quà tặng chính thức từ Fanpage, Group, Web game 2026.';
    const eventsListSchema = [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": `${origin}/` },
          { "@type": "ListItem", "position": 2, "name": "Sự Kiện Game", "item": `${origin}/su-kien` }
        ]
      }
    ];
    replaceTitleAndMeta(title, description, '/su-kien', '/og-image.jpg', eventsListSchema);
  } else if (
    pathname === '/telegram' ||
    pathname.startsWith('/telegram/')
  ) {
    const title = `Cộng Đồng Telegram & Nhận Giftcode Tự Động | ${brandName}`;
    const description = `Tham gia nhóm Telegram ${brandName} để nhận Giftcode mới nhất, sự kiện hot và theo dõi mã quà tặng tự động.`;
    const telegramSchema = [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": `${origin}/` },
          { "@type": "ListItem", "position": 2, "name": "Cộng Đồng Telegram", "item": `${origin}/telegram` }
        ]
      }
    ];
    replaceTitleAndMeta(title, description, '/telegram', '/og-image.jpg', telegramSchema);
  } else if (
    pathname === '/ma-hom-nay' ||
    pathname.startsWith('/ma-hom-nay/')
  ) {
    const todayVNFormatted = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());
    const title = `Mã Giftcode Hôm Nay ${todayVNFormatted} — Tổng Hợp Code Ngày Mới Nhất | ${brandName}`;
    const description = `Tổng hợp toàn bộ mã giftcode còn hạn phát hành và có hiệu lực hôm nay ${todayVNFormatted} của các tựa game hot tại Việt Nam. Cập nhật liên tục, kiểm tra thực tế, lấy mã nhanh trong ngày.`;
    const todaySchema = [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": `${origin}/` },
          { "@type": "ListItem", "position": 2, "name": "Mã Hôm Nay", "item": `${origin}/ma-hom-nay` },
        ],
      },
    ];
    replaceTitleAndMeta(title, description, '/ma-hom-nay', '/og-image.jpg', todaySchema);
  } else if (
    pathname === '/giveaways' ||
    pathname.startsWith('/giveaways/') ||
    pathname === '/giveaway' ||
    pathname.startsWith('/giveaway/')
  ) {
    const urlObj = new URL(request.url);
    const rawGwId =
      pathname.replace(/^\/(?:giveaways|giveaway)\/?/i, '').split('/')[0].trim() ||
      urlObj.searchParams.get('gw') ||
      urlObj.searchParams.get('giveaway') ||
      urlObj.searchParams.get('event') ||
      urlObj.searchParams.get('id') ||
      urlObj.searchParams.get('game');

    let campaign: any = null;
    if (rawGwId) {
      const cleanGwId = decodeURIComponent(rawGwId).trim().toLowerCase();
      // 1. Thử lấy từ Cloudflare D1
      if (env.DB) {
        try {
          const stmt = env.DB.prepare("SELECT value FROM system_settings WHERE key = 'wcg_admin_giveaways_v4' LIMIT 1");
          const row: any = await stmt.first();
          if (row?.value) {
            const list = JSON.parse(row.value);
            if (Array.isArray(list)) {
              campaign = list.find((g: any) => g && (g.id?.toLowerCase() === cleanGwId || g.game_slug?.toLowerCase() === cleanGwId));
            }
          }
        } catch {}
      }

      // 2. Fallback sang danh sách tĩnh fallbackGiveawaysData
      if (!campaign && Array.isArray(fallbackGiveawaysData)) {
        campaign = (fallbackGiveawaysData as any[]).find(
          (g) => g && (g.id?.toLowerCase() === cleanGwId || g.game_slug?.toLowerCase() === cleanGwId)
        );
      }
    }

    if (campaign) {
      const gameName = campaign.game_name || 'Game Mobile';
      const gameSlug = campaign.game_slug || '';
      const title = `🎁 Nhận Code: ${campaign.title} - ${gameName} | ${brandName}`;
      const description = campaign.description
        ? `${campaign.description} Nhận mã quà tặng độc quyền ${gameName} miễn phí tại ${brandName}.`
        : `Nhận ngay ${campaign.title} cho tựa game ${gameName}. Số lượng có hạn, kiểm tra điều kiện tài khoản và nhận mã tức thì!`;

      // Thuật toán xác định ảnh đại diện chính xác 100% cho Giveaway
      let rawImage = campaign.cover_image_url || campaign.game_icon_url || '';
      if (!rawImage && gameSlug) {
        const matchedGame = (fallbackGamesData as any[]).find(
          (g) => g && (g.slug?.toLowerCase() === gameSlug.toLowerCase() || g.id?.toLowerCase() === gameSlug.toLowerCase())
        );
        if (matchedGame?.icon_url) {
          rawImage = matchedGame.icon_url;
        } else {
          rawImage = `/game_icons/${gameSlug}.jpg`;
        }
      }
      if (!rawImage) rawImage = '/og-image.jpg';
      const jpgImage = rawImage.replace(/\.webp$/i, '.jpg');
      const iconUrl = jpgImage.startsWith('http') ? jpgImage : `${origin}${jpgImage.startsWith('/') ? jpgImage : `/${jpgImage}`}`;

      const giveawaySchema = [
        {
          "@context": "https://schema.org",
          "@type": "Event",
          "name": `Săn Mã: ${campaign.title} - ${gameName}`,
          "description": description,
          "image": iconUrl,
          "startDate": campaign.start_time || "2026-01-01",
          "endDate": campaign.end_time || "2026-12-31",
          "eventStatus": "https://schema.org/EventScheduled",
          "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
          "location": { "@type": "VirtualLocation", "url": `${origin}/giveaways/${campaign.id}` },
          "organizer": { "@type": "Organization", "name": brandName, "url": origin },
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "VND", "availability": "https://schema.org/InStock" }
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": `${origin}/` },
            { "@type": "ListItem", "position": 2, "name": "Đợt Phát Code", "item": `${origin}/giveaways` },
            { "@type": "ListItem", "position": 3, "name": gameName, "item": `${origin}/giveaways/${campaign.id}` }
          ]
        }
      ];

      replaceTitleAndMeta(title, description, `/giveaways/${campaign.id}`, iconUrl, giveawaySchema);
    } else {
      const title = `Sự Kiện Giveaway Nhận Giftcode Game Miễn Phí 2026 | ${brandName}`;
      const description = `Tham gia sự kiện giveaway nhận quà tân thủ, giftcode VIP độc quyền và thẻ game miễn phí mỗi ngày tại ${brandName}.`;
      const giveawayListSchema = [
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": `${origin}/` },
            { "@type": "ListItem", "position": 2, "name": "Đợt Phát Code", "item": `${origin}/giveaways` }
          ]
        }
      ];
      replaceTitleAndMeta(title, description, '/giveaways', '/og-image.jpg', giveawayListSchema);
    }
  } else if (pathname === '/store' || pathname.startsWith('/store/')) {
    const gameSlugParam = (url.searchParams.get('game') || url.searchParams.get('g') || '').trim();
    const pkgIdParam = (url.searchParams.get('pkg') || url.searchParams.get('package') || url.searchParams.get('product') || url.searchParams.get('prod') || '').trim();

    let title = `Cửa Hàng Đa Ngành & Giao Dịch Tự Động 24/7 | ${brandName}`;
    let description = 'Mua bán giftcode VIP, sản phẩm đa ngành và tiện ích số chính hãng. Giao dịch tự động 24/7 qua VietQR / SePay.';
    let canonical = '/store';
    let ogImage = '/og-image.jpg';

    if (env.DB && (pkgIdParam || gameSlugParam)) {
      try {
        let matchedPkg: any = null;
        if (pkgIdParam) {
          matchedPkg = await env.DB.prepare(
            'SELECT id, title, game_slug, game_name, current_price, original_price, discount_percent, stock_quantity, cover_image_url, game_icon_url FROM store_products WHERE id = ? LIMIT 1'
          ).bind(pkgIdParam).first<any>().catch(() => null);
        }

        if (matchedPkg) {
          const priceStr = matchedPkg.current_price ? `${Number(matchedPkg.current_price).toLocaleString('vi-VN')} ${coreUnit}` : 'Giá tốt';
          const gName = matchedPkg.game_name || '';
          title = `${matchedPkg.title} — ${priceStr} | ${gName} | ${brandName}`;
          description = `Mua ngay gói ${matchedPkg.title} ${gName} giá chỉ ${priceStr}${matchedPkg.discount_percent ? ` (giảm ${matchedPkg.discount_percent}%)` : ''}. Tình trạng: ${matchedPkg.stock_quantity > 0 ? 'Còn hàng' : 'Hết hàng'}. Nhận mã tự động 100% tại ${brandName}.`;
          canonical = `/store?game=${encodeURIComponent(gameSlugParam || matchedPkg.game_slug || '')}&pkg=${encodeURIComponent(matchedPkg.id)}`;
          ogImage = matchedPkg.game_icon_url || (matchedPkg.game_slug ? `/game_icons/${matchedPkg.game_slug}.webp` : '') || matchedPkg.cover_image_url || '/og-image.jpg';
        } else if (gameSlugParam) {
          const matchedGame = await env.DB.prepare(
            'SELECT slug, name, icon_url FROM games WHERE slug = ? OR id = ? LIMIT 1'
          ).bind(gameSlugParam, gameSlugParam).first<any>().catch(() => null);

          if (matchedGame) {
            title = `Gói Nạp & Code VIP ${matchedGame.name} | ${brandName}`;
            description = `Danh sách gói nạp, code VIP và mã quà tặng game ${matchedGame.name} chiết khấu tốt nhất. Nhận mã tự động 100% tại ${brandName}.`;
            canonical = `/store?game=${encodeURIComponent(matchedGame.slug)}`;
            ogImage = matchedGame.icon_url || `/game_icons/${matchedGame.slug}.webp` || '/og-image.jpg';
          }
        }
      } catch (e) {
        console.warn('[Edge Worker] Error resolving store package OG meta:', e);
      }
    }

    const storeSchema = [
      {
        "@context": "https://schema.org",
        "@type": "Store",
        "name": `Cửa Hàng - ${brandName}`,
        "description": "Cửa hàng giao dịch đa ngành và tiện ích số tự động 24/7 qua SePay.",
        "url": `${origin}/store`,
        "priceRange": "10.000 VND - 500.000 VND",
        "paymentAccepted": "Chuyển khoản Ngân hàng (SePay), Ví điện tử",
        "currenciesAccepted": "VND"
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": `${origin}/` },
          { "@type": "ListItem", "position": 2, "name": "Cửa Hàng", "item": `${origin}/store` }
        ]
      }
    ];
    replaceTitleAndMeta(title, description, canonical, ogImage, storeSchema);
  } else if (pathname === '/utilities' || pathname.startsWith('/utilities/')) {
    const title = `Tiện Ích & Dịch Vụ Số Chính Hãng | ${brandName}`;
    const description = `Dịch vụ tiện ích số, tài khoản bản quyền và hỗ trợ tối ưu trải nghiệm an toàn, tốc độ cao tại ${brandName}.`;
    const utilSchema = [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": `${origin}/` },
          { "@type": "ListItem", "position": 2, "name": "Tiện Ích", "item": `${origin}/utilities` }
        ]
      }
    ];
    replaceTitleAndMeta(title, description, '/utilities', '/og-image.jpg', utilSchema);
  } else if (pathname.startsWith('/gian-hang/') || pathname.startsWith('/en/gian-hang/')) {
    const isEnStore = pathname.startsWith('/en/');
    const rawStoreSlug = pathname
      .replace(/^\/(?:en\/)?gian-hang\//i, '')
      .replace(/\/+$/, '')
      .trim()
      .toLowerCase();
    let storeRow: any = null;
    if (env.DB && rawStoreSlug) {
      try {
        storeRow = await env.DB.prepare(
          "SELECT name, description, avatar_url, cover_url FROM sellers WHERE slug = ? AND status IN ('TRIAL', 'ACTIVE') AND deleted_at IS NULL LIMIT 1"
        )
          .bind(rawStoreSlug)
          .first<any>();
      } catch {}
    }
    const storeDisplayName = storeRow?.name || rawStoreSlug || (isEnStore ? 'Official Partner Store' : 'Gian Hàng Đối Tác');
    const title = isEnStore
      ? `${storeDisplayName} - Official Store | ${brandName}`
      : `Gian Hàng ${storeDisplayName} Chính Hãng | ${brandName}`;
    const description =
      (storeRow?.description && String(storeRow.description).trim().slice(0, 160)) ||
      (isEnStore
        ? `Shop verified digital giftcodes & products from ${storeDisplayName} on ${brandName} with instant 0s delivery & Escrow protection.`
        : `Mua sắm giftcode & sản phẩm chính hãng tại Gian hàng ${storeDisplayName} trên ${brandName} — giao tự động 0s và bảo chứng người mua.`);
    const ogImg =
      (storeRow?.cover_url && /^https?:\/\/|^\//.test(String(storeRow.cover_url)))
        ? String(storeRow.cover_url)
        : (storeRow?.avatar_url && /^https?:\/\/|^\//.test(String(storeRow.avatar_url)))
        ? String(storeRow.avatar_url)
        : '/og-image.jpg';
    const canonicalStorePath = isEnStore ? `/en/gian-hang/${rawStoreSlug}` : `/gian-hang/${rawStoreSlug}`;
    replaceTitleAndMeta(title, description, canonicalStorePath, ogImg);
  } else if (pathname === '/en/seller' || pathname.startsWith('/en/seller/')) {
    const title = `Seller Portal & Store Management | ${brand.sellerPortalName}`;
    const description = `Manage your storefront, digital & physical products, instant code vault, and payouts directly on ${brandName}.`;
    replaceTitleAndMeta(title, description, '/en/seller', '/og-image.jpg');
  } else if (pathname === '/seller' || pathname.startsWith('/seller/')) {
    const title = `Kênh Người Bán & Quản Lý Gian Hàng | ${brand.sellerPortalName}`;
    const description = `Quản trị gian hàng, sản phẩm, kho mã tự động và doanh thu trực tiếp trên ${brandName}.`;
    replaceTitleAndMeta(title, description, '/seller', '/og-image.jpg');
  } else if (pathname === '/en' || pathname === '/en/') {
    const title = `${brandName} - ${brand.taglineEn}`;
    const description = `${brandName} — ${brand.taglineEn}. Verified multi-industry shopping, digital services, instant 0s VietQR & ${coreUnit} wallet checkout.`;
    const enHomeSchema = [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${origin}/en/#website`,
        "url": `${origin}/en/`,
        "name": brandName,
        "description": brand.taglineEn,
        "inLanguage": "en-US"
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        "name": brandName,
        "url": `${origin}/en/`,
        "logo": {
          "@type": "ImageObject",
          "url": brand.logoUrl?.startsWith('http') ? brand.logoUrl : `${origin}${brand.logoUrl?.startsWith('/') ? brand.logoUrl : '/logo.webp'}`,
          "width": 512,
          "height": 512
        }
      }
    ];
    replaceTitleAndMeta(title, description, '/en/', '/og-image.jpg', enHomeSchema);
  } else if (pathname === '/' || pathname === '' || pathname === '/index.html' || pathname === '/vi' || pathname === '/vi/') {
    const urlObj = new URL(request.url);
    const pageParam = urlObj.searchParams.get('page');
    const pageNum = pageParam ? parseInt(pageParam, 10) : 1;
    const canonicalPath = pageNum > 1 ? `/?page=${pageNum}` : '/';
    const title = `${brandName} - ${brand.taglineVi}`;
    const description = `${brandName} — ${brand.taglineVi}. Mua sắm trực tuyến đa ngành, tiện ích số chính hãng, thanh toán VietQR tự động 0s.`;
    const homeSchema = [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        "url": `${origin}/`,
        "name": brandName,
        "description": brand.taglineVi,
        "potentialAction": {
          "@type": "SearchAction",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": `${origin}/?search={search_term_string}`
          },
          "query-input": "required name=search_term_string"
        },
        "inLanguage": "vi-VN"
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        "name": brandName,
        "url": `${origin}/`,
        "logo": {
          "@type": "ImageObject",
          "url": brand.logoUrl?.startsWith('http') ? brand.logoUrl : `${origin}${brand.logoUrl?.startsWith('/') ? brand.logoUrl : '/logo.webp'}`,
          "width": 512,
          "height": 512
        },
        "sameAs": [
          brand.telegramUrl || "https://t.me/webcodegame_vn",
          "https://zalo.me/g/qdtlmj2tebfa0baraedg",
          brand.zaloUrl || "https://zalo.me/0386767888"
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": brand.supportHotline || "+84-386-767-888",
          "contactType": "customer service",
          "availableLanguage": ["Vietnamese", "English"]
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": `Giftcode trên ${brandName} có miễn phí không?`,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Tất cả mã giftcode trong mục Mã Miễn Phí và Đợt Phát Code đều hoàn toàn miễn phí 100%, được tổng hợp và kiểm duyệt từ các Nhà phát hành chính thức tại Việt Nam."
            }
          },
          {
            "@type": "Question",
            "name": "Làm thế nào để sao chép mã code nhanh chóng?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Bạn chỉ cần nhấp vào nút Sao Chép bên cạnh mỗi mã giftcode hoặc chọn Sao Chép Toàn Bộ Mã Còn Hạn để lưu tất cả giftcode vào bộ nhớ tạm trong 1 giây."
            }
          },
          {
            "@type": "Question",
            "name": `Mua sắm trên ${brandName} có được bảo chứng không?`,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": `Hệ thống áp dụng cơ chế bảo chứng thanh toán và giữ tiền đa tầng (24h - 168h) bảo vệ người mua toàn diện trên ${brandName}.`
            }
          }
        ]
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": `${origin}/` },
          { "@type": "ListItem", "position": 2, "name": shortName, "item": `${origin}/` }
        ]
      }
    ];
    replaceTitleAndMeta(title, description, canonicalPath, '/og-image.jpg', homeSchema);
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'X-Catalog-Epoch': brandEpoch,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Phục vụ trực tiếp file icon game từ static asset của Cloudflare Pages hoặc Cloudflare D1
 * Route: /game_icons/<slug>.<ext>
 * Đảm bảo 100% hình ảnh hiển thị ngay sau khi upload mà không cần redeploy.
 * Hỗ trợ Edge Cache 30 ngày (zero D1 reads cho các request lặp lại).
 */
async function handleGameIconRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string
): Promise<Response> {
  const filename = pathname.replace(/^\/game_icons\//, '').trim();

  // Chống path traversal: từ chối .., /, \, %2f, %5c
  if (
    !filename ||
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('%2e') ||
    filename.includes('%2f') ||
    filename.includes('%5c')
  ) {
    return new Response('Not Found', { status: 404 });
  }

  const dotIndex = filename.lastIndexOf('.');
  const slug = (dotIndex >= 0 ? filename.slice(0, dotIndex) : filename).toLowerCase().trim();
  const isThumb = slug.includes('-thumb');
  const baseSlug = slug.replace(/-thumb(?:-256)?$/i, '');

  // 1. Kiểm tra Cloudflare Edge Cache (gắn khóa theo __BUILD_ID__ để tự động cách ly cache cũ sau mỗi đợt deploy)
  const buildTag = typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : 'live';
  const urlObj = new URL(request.url);
  const bypassCache = urlObj.searchParams.has('nocache') ||
                      urlObj.searchParams.has('fresh') ||
                      request.headers.get('Cache-Control')?.includes('no-cache');
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('b', buildTag);
  const cacheKey = cache ? new Request(cacheUrl.toString(), { method: 'GET' }) : null;
  const isValidImageResponse = (res: Response | null | undefined): res is Response => {
    if (!res || res.status !== 200) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    return ct.startsWith('image/');
  };

  if (cache && cacheKey && !bypassCache) {
    try {
      const cached = await cache.match(cacheKey);
      if (isValidImageResponse(cached)) {
        return cached;
      }
    } catch {}
  }

  // 2. Tra cứu D1 bảng uploaded_game_icons trước (ƯU TIÊN TUYỆT ĐỐI icon upload mới nhất override file tĩnh cũ)
  // Ngoại lệ phòng thủ: idle-cat-gunner đã có bản nén tĩnh tối ưu 24.4 KiB trong Edge Assets, bỏ qua bản D1 cũ nặng 275 KiB
  if (env.DB && baseSlug !== 'idle-cat-gunner') {
    try {
      // Nếu là thumb, CHỈ tìm chính xác slug thumbnail trong D1, KHÔNG fallback sang file gốc baseSlug
      const row: any = isThumb
        ? await env.DB.prepare('SELECT content_type, image_base64, size_bytes FROM uploaded_game_icons WHERE slug = ? LIMIT 1').bind(slug).first()
        : await env.DB.prepare('SELECT content_type, image_base64, size_bytes FROM uploaded_game_icons WHERE slug = ? OR slug = ? LIMIT 1').bind(slug, baseSlug).first();

      if (row && row.image_base64) {
        const cleanB64 = String(row.image_base64).replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
        const binaryStr = atob(cleanB64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const cacheControl = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';

        const rawRowContentType =
          typeof row.content_type === 'string' ? row.content_type.split(';')[0].trim().toLowerCase() : '';
        const safeRowContentType = /^image\/[a-z0-9.+-]+$/.test(rawRowContentType)
          ? rawRowContentType
          : 'image/webp';
        const contentType = filename.toLowerCase().endsWith('.webp') ? 'image/webp' : safeRowContentType;
        const headers = new Headers({
          'Content-Type': contentType,
          'Content-Length': len.toString(),
          'Cache-Control': cacheControl,
          'Access-Control-Allow-Origin': '*',
          'X-Content-Type-Options': 'nosniff',
          'X-Icon-Source': 'd1-uploaded',
          'X-Build-Id': buildTag,
        });

        const iconResponse = new Response(bytes, { status: 200, headers });

        if (cache && cacheKey) {
          ctx.waitUntil(cache.put(cacheKey, iconResponse.clone()));
        }

        return iconResponse;
      }
    } catch (err) {
      console.warn('[GameIconRoute] Lỗi đọc uploaded_game_icons từ D1:', err);
    }
  }

  // 3. Fallback static assets (BẮT BUỘC kiểm content-type image/* để chặn SPA fallback 200 text/html)
  try {
    const assetRes = await env.ASSETS.fetch(request);
    if (isValidImageResponse(assetRes)) {
      return assetRes;
    }
    // Nếu yêu cầu -thumb-256.webp mà chưa có trong assets, thử -thumb.webp (128px nhẹ) thay vì file gốc
    if (filename.toLowerCase().endsWith('-thumb-256.webp')) {
      const origUrl = new URL(request.url);
      origUrl.pathname = `/game_icons/${baseSlug}-thumb.webp`;
      const origRes = await env.ASSETS.fetch(new Request(origUrl, request));
      if (isValidImageResponse(origRes)) {
        return origRes;
      }
    }
    // Nếu yêu cầu .jpg mà không có trong assets, thử .webp trong assets trước khi 404
    if (filename.toLowerCase().endsWith('.jpg')) {
      const webpUrl = new URL(request.url);
      webpUrl.pathname = `/game_icons/${baseSlug}.webp`;
      const webpRes = await env.ASSETS.fetch(new Request(webpUrl, request));
      if (isValidImageResponse(webpRes)) {
        return webpRes;
      }
    }
  } catch {}

  return new Response('Icon not found', {
    status: 404,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
}
