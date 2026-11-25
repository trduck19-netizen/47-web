import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { authenticateAdmin } from '../../../services/auth_service';
import { listAdminReviews } from '../../../services/review_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_API_KEY?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/admin/reviews: Quản trị viên lấy danh sách đánh giá sản phẩm (lọc theo status)
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

    const authAdmin = await authenticateAdmin(env.DB, token, env);
    if (!authAdmin.authenticated) {
      return new Response(
        JSON.stringify({ success: false, message: 'Yêu cầu quyền Quản trị viên để truy cập.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || undefined;

    const result = await listAdminReviews(env.DB, status);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi lấy danh sách đánh giá.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
