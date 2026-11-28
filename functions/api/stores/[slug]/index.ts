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
          status, is_vacation, created_at
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
    const [availableProdCount, sepayCfg, mConfig] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(DISTINCT sp.id) as count
        FROM seller_products sp
        LEFT JOIN seller_codes sc ON sp.id = sc.product_id AND sc.status = 'IN_STOCK' AND sc.deleted_at IS NULL
        WHERE sp.seller_id = ? AND sp.status = 'APPROVED' AND sp.deleted_at IS NULL
          AND (sp.product_type = 'physical' AND COALESCE(sp.stock_quantity, 0) > 0 OR sc.id IS NOT NULL)
      `)
        .bind(seller.id)
        .first<{ count: number }>(),
      env.DB.prepare('SELECT * FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
        .bind(seller.id)
        .first<SellerSepayConfigRow>()
        .catch(() => null),
      getMarketplaceConfig(env.DB),
    ]);

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
          avatar_url: seller.avatar_url,
          cover_url: seller.cover_url,
          description: seller.description,
          support_hours: seller.support_hours,
          warranty_policy: seller.warranty_policy,
          refund_policy: seller.refund_policy,
          reputation_score: seller.reputation_score,
          is_vacation: Boolean(seller.is_vacation),
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
