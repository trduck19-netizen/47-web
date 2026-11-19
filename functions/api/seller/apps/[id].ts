import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyStoreApiAccess, generateAppToken } from '../../../services/store_api_service';
import { computeSha256 } from '../../../services/mission_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST: Duyệt ứng dụng bên thứ ba (APPROVE) và sinh Token ủy quyền
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureSchemaUpgrades(env.DB);
    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!auth.authorized || !auth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Vui lòng đăng nhập bằng tài khoản chủ gian hàng.' }),
        { status: auth.status || 401, headers: CORS_HEADERS }
      );
    }

    // Token bên thứ ba KHÔNG ĐƯỢC PHÉP tự duyệt hoặc duyệt ứng dụng khác
    if (auth.authType === 'THIRD_PARTY_TOKEN') {
      return new Response(
        JSON.stringify({ success: false, error: 'Ứng dụng bên thứ ba không có quyền xét duyệt ủy quyền.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const authId = params.id as string;
    const sellerId = auth.seller.id;
    const body = (await request.json().catch(() => ({}))) as any;
    const rawScope = String(body.scope || 'FULL').toUpperCase().trim();
    const scope = ['FULL', 'READ_ONLY', 'PRODUCTS_ONLY', 'ORDERS_ONLY'].includes(rawScope) ? rawScope : 'FULL';

    // Tìm bản ghi yêu cầu ủy quyền
    let record = await env.DB
      .prepare('SELECT * FROM seller_app_authorizations WHERE id = ? AND seller_id = ? LIMIT 1')
      .bind(authId, sellerId)
      .first<any>();

    // Nếu truyền app_id trực tiếp để duyệt nhanh
    if (!record) {
      record = await env.DB
        .prepare('SELECT * FROM seller_app_authorizations WHERE app_id = ? AND seller_id = ? LIMIT 1')
        .bind(authId, sellerId)
        .first<any>();
    }

    // Nếu chưa có record nhưng có app_id trong hệ thống
    if (!record) {
      const app = await env.DB
        .prepare('SELECT id, app_name FROM seller_third_party_apps WHERE id = ? LIMIT 1')
        .bind(authId)
        .first<any>();

      if (app) {
        record = {
          id: `auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          seller_id: sellerId,
          app_id: app.id,
          app_name: app.app_name,
        };
      }
    }

    if (!record) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không tìm thấy thông tin ứng dụng hoặc yêu cầu liên kết này.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const { rawToken, tokenPrefix } = generateAppToken(record.app_id);
    const tokenHash = await computeSha256(rawToken);
    const nowIso = new Date().toISOString();

    await env.DB
      .prepare(`
        INSERT INTO seller_app_authorizations (id, seller_id, app_id, app_name, token_hash, token_prefix, scope, status, call_count, approved_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED', 0, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          token_hash = excluded.token_hash,
          token_prefix = excluded.token_prefix,
          scope = excluded.scope,
          status = 'APPROVED',
          approved_at = excluded.approved_at,
          revoked_at = NULL
      `)
      .bind(record.id, sellerId, record.app_id, record.app_name, tokenHash, tokenPrefix, scope, nowIso, nowIso)
      .run();

    // rawToken chỉ hiển thị 1 LẦN DUY NHẤT lúc duyệt
    return new Response(
      JSON.stringify({
        success: true,
        message: `Đã cấp quyền thành công cho ứng dụng "${record.app_name}". Token ủy quyền đã được kích hoạt.`,
        authorization: {
          id: record.id,
          seller_id: sellerId,
          app_id: record.app_id,
          app_name: record.app_name,
          token_prefix: tokenPrefix,
          raw_token: rawToken,
          scope,
          status: 'APPROVED',
          approved_at: nowIso,
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

// DELETE: Thu hồi quyền của ứng dụng bên thứ ba (REVOKE)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await ensureSchemaUpgrades(env.DB);
    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!auth.authorized || !auth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Vui lòng đăng nhập bằng tài khoản chủ gian hàng.' }),
        { status: auth.status || 401, headers: CORS_HEADERS }
      );
    }

    if (auth.authType === 'THIRD_PARTY_TOKEN') {
      return new Response(
        JSON.stringify({ success: false, error: 'Ứng dụng bên thứ ba không có quyền thu hồi ủy quyền của gian hàng.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const authId = params.id as string;
    const sellerId = auth.seller.id;
    const nowIso = new Date().toISOString();

    const record = await env.DB
      .prepare('SELECT id, app_name FROM seller_app_authorizations WHERE (id = ? OR app_id = ?) AND seller_id = ? LIMIT 1')
      .bind(authId, authId, sellerId)
      .first<{ id: string; app_name: string }>();

    if (!record) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không tìm thấy bản ghi ủy quyền này trong gian hàng của bạn.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    await env.DB
      .prepare("UPDATE seller_app_authorizations SET status = 'REVOKED', revoked_at = ? WHERE id = ? AND seller_id = ?")
      .bind(nowIso, record.id, sellerId)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Đã thu hồi toàn bộ quyền truy cập của ứng dụng "${record.app_name}". Token của ứng dụng đã hết hiệu lực ngay lập tức.`,
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
