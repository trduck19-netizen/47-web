import { ensureMarketplaceSchema } from '../../services/d1_service';
import { getMarketplaceConfig } from '../../services/marketplace_service';

interface Env {
  DB: D1Database;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * GET /api/seller/portal-config
 * Endpoint công khai siêu nhẹ cho trang Cổng Người Bán (/seller & /en/seller)
 * để nhận bộ màu chủ đạo, cài đặt Dark Mode, thông báo Admin và chính sách phí hiển thị trên Landing.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const config = await getMarketplaceConfig(env.DB);

    return new Response(
      JSON.stringify({
        success: true,
        portal_config: {
          theme_preset: config.seller_portal_theme_preset || 'shopee_orange',
          allow_dark_mode: config.seller_portal_allow_dark_mode !== false,
          banner_vi: config.seller_portal_banner_vi || '',
          banner_en: config.seller_portal_banner_en || '',
        },
        highlights: {
          direct_sepay_global_enabled: config.direct_sepay_global_enabled !== false,
          direct_sepay_fee_pct: Number(config.direct_sepay_fee_pct || 0),
          affiliate_enabled: config.affiliate_enabled !== false,
          hold_hours: Number(config.hold_hours || 168),
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Không thể tải cấu hình Cổng Người Bán.',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } }
    );
  }
};
