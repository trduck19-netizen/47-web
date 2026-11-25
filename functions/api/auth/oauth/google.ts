import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { getSigningSecret } from '../../../services/auth_service';
import { authenticateWithGoogle } from '../../../services/google_auth_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
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
 * POST /api/auth/oauth/google: Đăng nhập hoặc liên kết tài khoản bằng Google Credential (ID Token)
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

    let body: { credential?: string } = {};
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: 'Dữ liệu yêu cầu không đúng định dạng JSON.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!body?.credential || typeof body.credential !== 'string') {
      return new Response(
        JSON.stringify({ success: false, message: 'Thiếu Google Credential Token để xác thực.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const signingSecret = getSigningSecret(env);
    const result = await authenticateWithGoogle(env.DB, body.credential, signingSecret, env.GOOGLE_CLIENT_ID);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 401,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi xử lý đăng nhập Google.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
