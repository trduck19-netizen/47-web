import { verifyMemberAuth } from '../../../services/mission_service';
import { ensureMarketplaceSchema, logAdminAudit } from '../../../services/d1_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// PUT: Cập nhật phân quyền cho tài khoản phụ
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const subId = params.id as string;
    const sellerId = storeAuth.seller.id;
    const body = (await request.json().catch(() => ({}))) as any;
    const newRole = body.role === 'MANAGE_STOCK' ? 'MANAGE_STOCK' : 'VIEW_ORDERS';

    const sub = await env.DB
      .prepare('SELECT id, member_email FROM seller_subaccounts WHERE id = ? AND seller_id = ? LIMIT 1')
      .bind(subId, sellerId)
      .first<any>();

    if (!sub) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không tìm thấy tài khoản phụ này trong gian hàng của bạn.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    await env.DB
      .prepare('UPDATE seller_subaccounts SET role = ? WHERE id = ? AND seller_id = ?')
      .bind(newRole, subId, sellerId)
      .run();

    return new Response(
      JSON.stringify({ success: true, message: `Đã cập nhật quyền thành "${newRole}".`, role: newRole }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

// DELETE: Xóa tài khoản phụ
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const subId = params.id as string;
    const sellerId = storeAuth.seller.id;

    // Tìm subaccount và kiểm tra thuộc gian hàng này
    const sub = await env.DB
      .prepare(`
        SELECT sa.id, sa.seller_id, sa.member_email
        FROM seller_subaccounts sa
        WHERE sa.id = ? AND sa.seller_id = ?
        LIMIT 1
      `)
      .bind(subId, sellerId)
      .first<any>();

    if (!sub) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không tìm thấy tài khoản phụ này trong gian hàng của bạn.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    await env.DB.prepare('DELETE FROM seller_subaccounts WHERE id = ? AND seller_id = ?').bind(subId, sellerId).run();

    return new Response(
      JSON.stringify({ success: true, message: 'Đã xóa quyền tài khoản phụ thành công.' }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
