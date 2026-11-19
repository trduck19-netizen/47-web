import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyStoreApiAccess } from '../../../services/store_api_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Lấy danh sách ứng dụng đã cấp quyền và ứng dụng khả dụng
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSchemaUpgrades(env.DB);
    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!auth.authorized || !auth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API hợp lệ.' }),
        { status: auth.status || 401, headers: CORS_HEADERS }
      );
    }

    const sellerId = auth.seller.id;

    // Danh sách ứng dụng đã ủy quyền cho gian hàng này
    const authsRes = await env.DB
      .prepare(`
        SELECT id, seller_id, app_id, app_name, token_prefix, scope, status, call_count, last_used_at, last_used_endpoint, approved_at, revoked_at, created_at
        FROM seller_app_authorizations
        WHERE seller_id = ?
        ORDER BY created_at DESC
      `)
      .bind(sellerId)
      .all<any>();

    // Danh sách các ứng dụng đã đăng ký trong hệ sinh thái sàn
    const appsRes = await env.DB
      .prepare('SELECT id, app_name, app_url, description, developer_email, created_at FROM seller_third_party_apps ORDER BY app_name ASC LIMIT 50')
      .all<any>();

    return new Response(
      JSON.stringify({
        success: true,
        authorizations: authsRes.results || [],
        available_apps: appsRes.results || [],
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

// POST: Đăng ký ứng dụng mới hoặc tạo yêu cầu xin liên kết với gian hàng
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSchemaUpgrades(env.DB);
    const body = (await request.json().catch(() => ({}))) as any;
    const action = String(body.action || 'REGISTER_APP').toUpperCase().trim();

    // 1. Đăng ký ứng dụng bên thứ 3 vào hệ thống (Public endpoint for third-party developers)
    if (action === 'REGISTER_APP') {
      const appName = String(body.app_name || '').trim();
      const appUrl = String(body.app_url || '').trim();
      const description = String(body.description || '').trim();
      const developerEmail = String(body.developer_email || '').trim();

      if (!appName) {
        return new Response(
          JSON.stringify({ success: false, error: 'Vui lòng cung cấp tên ứng dụng (app_name).' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const appId = `app_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();

      await env.DB
        .prepare(`
          INSERT INTO seller_third_party_apps (id, app_name, app_url, description, developer_email, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(appId, appName, appUrl, description, developerEmail, nowIso)
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Ứng dụng "${appName}" đã được đăng ký thành công trên Universal Mall.`,
          app: {
            id: appId,
            app_name: appName,
            app_url: appUrl,
            description,
            developer_email: developerEmail,
            created_at: nowIso,
          },
        }),
        { status: 201, headers: CORS_HEADERS }
      );
    }

    // 2. Yêu cầu xin liên kết với 1 gian hàng cụ thể
    if (action === 'REQUEST_LINK') {
      const targetSellerSlug = String(body.seller_slug || '').trim();
      const targetSellerId = String(body.seller_id || '').trim();
      const appId = String(body.app_id || '').trim();
      const appName = String(body.app_name || '').trim();
      const requestedScope = String(body.scope || 'FULL').toUpperCase().trim();

      if (!appId || (!targetSellerSlug && !targetSellerId)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Vui lòng cung cấp app_id và seller_slug / seller_id để xin liên kết.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const seller = await env.DB
        .prepare('SELECT id, name, slug FROM sellers WHERE (id = ? OR slug = ?) AND deleted_at IS NULL LIMIT 1')
        .bind(targetSellerId || targetSellerSlug, targetSellerSlug || targetSellerId)
        .first<{ id: string; name: string; slug: string }>();

      if (!seller) {
        return new Response(
          JSON.stringify({ success: false, error: 'Gian hàng mục tiêu không tồn tại hoặc đã ngừng hoạt động.' }),
          { status: 404, headers: CORS_HEADERS }
        );
      }

      const authId = `auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();

      await env.DB
        .prepare(`
          INSERT INTO seller_app_authorizations (id, seller_id, app_id, app_name, token_hash, token_prefix, scope, status, call_count, created_at)
          VALUES (?, ?, ?, ?, '', '', ?, 'PENDING', 0, ?)
        `)
        .bind(authId, seller.id, appId, appName || 'Ứng Dụng Liên Kết', requestedScope, nowIso)
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Đã gửi yêu cầu liên kết tới gian hàng "${seller.name}". Yêu cầu đang chờ chủ gian hàng xét duyệt.`,
          authorization_id: authId,
          seller_id: seller.id,
          seller_name: seller.name,
          status: 'PENDING',
        }),
        { status: 201, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Action không hợp lệ. Vui lòng chọn REGISTER_APP hoặc REQUEST_LINK.' }),
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
