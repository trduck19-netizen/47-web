import { verifyMemberAuth } from '../../../services/mission_service';
import { ensureMarketplaceSchema, logAdminAudit } from '../../../services/d1_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';
import { syncAffiliatePriceAndStock } from '../../../services/seller_affiliate_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// DELETE: Xóa mềm mã kho chưa bán (§5.2: cấm xóa/sửa mã đã bán)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'MANAGE_STOCK' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const codeId = params.id as string;
    const sellerId = storeAuth.seller.id;

    const codeRow = await env.DB
      .prepare(`
        SELECT sc.id, sc.seller_id, sc.product_id, sc.status
        FROM seller_codes sc
        WHERE sc.id = ? AND sc.seller_id = ? AND sc.deleted_at IS NULL
        LIMIT 1
      `)
      .bind(codeId, sellerId)
      .first<any>();

    if (!codeRow) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mã không tồn tại hoặc bạn không có quyền xóa.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (codeRow.status !== 'IN_STOCK' && codeRow.status !== 'RECALLED') {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Không thể xóa mã ở trạng thái ${codeRow.status}. Tuyệt đối không xóa mã đã bán hoặc đang tranh chấp.`,
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const nowIso = new Date().toISOString();
    await env.DB
      .prepare("UPDATE seller_codes SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .bind(nowIso, nowIso, codeId)
      .run();

    // Đồng bộ tức thời cập nhật lại tồn kho thực tế cho các listing gán liên shop
    const totalStockRes = await env.DB
      .prepare("SELECT COUNT(*) as cnt FROM seller_codes WHERE product_id = ? AND status = 'IN_STOCK' AND deleted_at IS NULL")
      .bind(codeRow.product_id)
      .first<{ cnt: number }>();
    const totalStock = Number(totalStockRes?.cnt) || 0;
    await syncAffiliatePriceAndStock(env.DB, codeRow.product_id, 'STOCK_CHANGE', { newStock: totalStock });

    const actorName = storeAuth.authType === 'STORE_API_KEY' 
      ? `API_KEY:${storeAuth.keyName || 'StoreKey'}`
      : storeAuth.authType === 'THIRD_PARTY_TOKEN'
      ? `APP:${storeAuth.keyName || 'AppToken'}`
      : (storeAuth.member?.username || storeAuth.seller?.name || 'Seller');
    const actorEmail = storeAuth.member?.email || (storeAuth.seller?.slug ? `${storeAuth.seller.slug}@store.local` : 'seller@store.local');

    await logAdminAudit(env.DB, {
      actorName,
      actorEmail,
      action: 'SELLER_DELETE_CODE',
      targetId: codeId,
      details: { product_id: codeRow.product_id },
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Đã xóa mã khỏi kho thành công.' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
