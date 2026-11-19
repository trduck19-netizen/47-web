import { verifyMemberAuth } from '../../../services/mission_service';
import { ensureMarketplaceSchema } from '../../../services/d1_service';
import { getMarketplaceConfig, SellerRecord } from '../../../services/marketplace_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: 'D1 Database chưa sẵn sàng.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    await ensureMarketplaceSchema(env.DB);

    // 1. Xác thực đăng nhập hoặc Khóa API gian hàng
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const seller = storeAuth.seller;
    const config = await getMarketplaceConfig(env.DB);

    // 3. Đọc 3 ngăn số dư
    const sellerRow = await env.DB.prepare(`
      SELECT pending_balance_core, available_balance_core, withdrawn_balance_core,
             bank_name, bank_account, bank_account_name
      FROM sellers
      WHERE id = ? LIMIT 1
    `).bind(seller.id).first<any>();

    const heldBalance = Number(sellerRow?.pending_balance_core) || 0;
    const availableBalance = Number(sellerRow?.available_balance_core) || 0;
    const withdrawnBalance = Number(sellerRow?.withdrawn_balance_core) || 0;

    // 4. Đọc lịch sử dòng sổ cái seller_ledger
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(10, parseInt(url.searchParams.get('limit') || '50', 10)));
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const offset = (page - 1) * limit;

    const ledgerRes = await env.DB.prepare(`
      SELECT * FROM seller_ledger
      WHERE seller_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(seller.id, limit, offset).all<any>();

    const totalCountRes = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM seller_ledger WHERE seller_id = ?
    `).bind(seller.id).first<{ total: number }>();

    // 5. Thống kê đơn đang giữ tiền
    const holdingOrdersRes = await env.DB.prepare(`
      SELECT COUNT(*) as count, SUM(price_core) as total_held
      FROM seller_orders
      WHERE seller_id = ? AND status = 'PAID' AND hold_until IS NOT NULL AND deleted_at IS NULL
    `).bind(seller.id).first<any>();

    return new Response(
      JSON.stringify({
        success: true,
        seller_id: seller.id,
        seller_name: seller.name,
        balances: {
          held_core: heldBalance,
          available_core: availableBalance,
          withdrawn_core: withdrawnBalance,
          total_revenue_core: heldBalance + availableBalance + withdrawnBalance,
        },
        bank_info: {
          bank_name: sellerRow?.bank_name || '',
          bank_account: sellerRow?.bank_account || '',
          bank_account_name: sellerRow?.bank_account_name || '',
        },
        config: {
          hold_hours: config.hold_hours,
          fee_rate: config.fee_rate,
          withdraw_approval_threshold_core: config.withdraw_approval_threshold_core,
        },
        holding_summary: {
          order_count: holdingOrdersRes?.count || 0,
          total_held: holdingOrdersRes?.total_held || 0,
        },
        ledger: ledgerRes?.results || [],
        pagination: {
          page,
          limit,
          total: totalCountRes?.total || 0,
          total_pages: Math.ceil((totalCountRes?.total || 0) / limit),
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error('[getSellerFinance error]', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi khi lấy thông tin tài chính.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
