import { ensureSchemaUpgrades } from '../../../../services/d1_service';
import { authenticateAdmin } from '../../../../services/auth_service';
import { approveReview } from '../../../../services/review_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_API_KEY?: string;
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
 * POST /api/admin/reviews/[id]/approve: Quản trị viên duyệt đánh giá hiển thị công khai
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

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
        JSON.stringify({ success: false, message: 'Yêu cầu quyền Quản trị viên.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const reviewId = String(params.id);
    const result = await approveReview(env.DB, reviewId);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi duyệt đánh giá.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
