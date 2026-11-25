import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { authenticateCaller, getSigningSecret } from '../../../services/auth_service';
import { listAddressesForUser, createAddress, CreateAddressParams } from '../../../services/address_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/user/addresses: Lấy danh sách địa chỉ nhận hàng của user
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
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
        JSON.stringify({ success: false, message: 'Yêu cầu đăng nhập để xem sổ địa chỉ.' }),
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

    const addresses = await listAddressesForUser(env.DB, authRes.member.id);

    return new Response(JSON.stringify({ success: true, addresses }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi lấy sổ địa chỉ.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};

/**
 * POST /api/user/addresses: Thêm địa chỉ nhận hàng mới
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
        JSON.stringify({ success: false, message: 'Yêu cầu đăng nhập để thêm địa chỉ.' }),
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

    const body: CreateAddressParams = await request.json();
    const result = await createAddress(env.DB, authRes.member.id, body);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi thêm địa chỉ.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
