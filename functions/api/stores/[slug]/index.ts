import { ensureMarketplaceSchema } from '../../../services/d1_service';
import { getMarketplaceConfig } from '../../../services/marketplace_service';
import { ensureSellerSepaySchema, evaluateSellerQrEligibility, SellerSepayConfigRow } from '../../../services/seller_sepay_service';

interface Env {
  DB: D1Database;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Thông tin gian hàng công khai (§6.1)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const slug = (params.slug as string || '').toLowerCase().trim();

    const seller = await env.DB
      .prepare(`
        SELECT 
          id, name, slug, avatar_url, cover_url, description,
          support_hours, warranty_policy, refund_policy, reputation_score,
          status, is_vacation, banner_preset, pinned_notice, shop_categories_json, created_at
        FROM sellers
        WHERE slug = ? AND deleted_at IS NULL
        LIMIT 1
      `)
      .bind(slug)
      .first<any>();

    if (!seller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Gian hàng không tồn tại hoặc đã ngừng hoạt động.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (seller.status !== 'TRIAL' && seller.status !== 'ACTIVE') {
      return new Response(
        JSON.stringify({ success: false, error: 'Gian hàng hiện chưa được công khai hoặc đang tạm khóa.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    await ensureSellerSepaySchema(env.DB);
    const [availableProdCount, totalProdCount, completedOrdersCount, sepayCfg, mConfig, vouchersRes] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(DISTINCT sp.id) as count
        FROM seller_products sp
        LEFT JOIN seller_codes sc ON sp.id = sc.product_id AND sc.status = 'IN_STOCK' AND sc.deleted_at IS NULL
        WHERE sp.seller_id = ? AND sp.status = 'APPROVED' AND COALESCE(sp.is_paused, 0) = 0 AND sp.deleted_at IS NULL
          AND (
            ((LOWER(COALESCE(sp.product_type, '')) = 'physical' OR UPPER(COALESCE(sp.fulfillment_mode, '')) = 'MANUAL_SERVICE') AND COALESCE(sp.stock_quantity, 0) > 0)
            OR sc.id IS NOT NULL
          )
      `)
        .bind(seller.id)
        .first<{ count: number }>(),
      env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM seller_products
        WHERE seller_id = ? AND status = 'APPROVED' AND COALESCE(sp.is_paused, 0) = 0 AND deleted_at IS NULL
      `)
        .bind(seller.id)
        .first<{ count: number }>()
        .catch(() => ({ count: 0 })),
      env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM seller_orders
        WHERE seller_id = ? AND status IN ('PAID', 'DELIVERED', 'COMPLETED')
      `)
        .bind(seller.id)
        .first<{ count: number }>()
        .catch(() => ({ count: 0 })),
      env.DB.prepare('SELECT * FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
        .bind(seller.id)
        .first<SellerSepayConfigRow>()
        .catch(() => null),
      getMarketplaceConfig(env.DB),
      env.DB.prepare(`
        SELECT id, code, title, discount_type, discount_value, max_discount_core,
               min_order_core, usage_limit, used_count, expires_at
        FROM seller_vouchers
        WHERE seller_id = ? AND is_active = 1 AND used_count < usage_limit
          AND (expires_at IS NULL OR expires_at = '' OR expires_at > datetime('now'))
        ORDER BY created_at DESC
        LIMIT 10
      `)
        .bind(seller.id)
        .all<any>()
        .catch(() => ({ results: [] })),
    ]);

    let shopCategories: string[] = [];
    try {
      if (seller.shop_categories_json) {
        const parsed = JSON.parse(seller.shop_categories_json);
        if (Array.isArray(parsed)) {
          shopCategories = parsed.filter((c: any) => typeof c === 'string' && c.trim()).slice(0, 15);
        }
      }
    } catch {}

    const hasAvailableProducts = (availableProdCount?.count || 0) > 0;
    const qrEligibility = evaluateSellerQrEligibility({
      sepayConfig: sepayCfg || null,
      marketplaceConfig: mConfig,
    });

    return new Response(
      JSON.stringify({
        success: true,
        store: {
          id: seller.id,
          name: seller.name,
          slug: seller.slug,
          status: seller.status,
          avatar_url: seller.avatar_url,
          cover_url: seller.cover_url,
          banner_preset: seller.banner_preset || 'aurora_indigo',
          pinned_notice: seller.pinned_notice || '',
          shop_categories: shopCategories,
          vouchers: vouchersRes?.results || [],
          description: seller.description,
          support_hours: seller.support_hours,
          warranty_policy: seller.warranty_policy,
          refund_policy: seller.refund_policy,
          reputation_score: seller.reputation_score,
          is_vacation: Boolean(seller.is_vacation),
          total_products: Number(totalProdCount?.count || 0),
          completed_orders_count: Number(completedOrdersCount?.count || 0),
          has_available_products: hasAvailableProducts,
          sepay_qr_available: qrEligibility.eligible,
          created_at: seller.created_at,
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
