import { ensureSchemaUpgrades } from '../../services/d1_service';
import { authenticateCaller, getSigningSecret } from '../../services/auth_service';
import { syncCartForUser, ClientCartItem } from '../../services/cart_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * POST /api/cart/sync: Gộp giỏ hàng từ localStorage của khách vào D1 khi đăng nhập
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, message: 'D1 Database chưa cấu hình.' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    await ensureSchemaUpgrades(env.DB);

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, message: 'Yêu cầu đăng nhập để đồng bộ giỏ hàng.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const signingSecret = getSigningSecret(env);
    const authRes = await authenticateCaller(env.DB, token, signingSecret);

    if (!authRes.authenticated || !authRes.member) {
      return new Response(
        JSON.stringify({ success: false, message: 'Phiên đăng nhập không hợp lệ.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    let body: { items?: ClientCartItem[] } = {};
    try {
      body = await request.json();
    } catch {
      body = { items: [] };
    }

    const clientItems = Array.isArray(body.items) ? body.items : [];
    const summary = await syncCartForUser(env.DB, authRes.member.id, clientItems);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đồng bộ giỏ hàng thành công.',
        ...summary,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi đồng bộ giỏ hàng.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
