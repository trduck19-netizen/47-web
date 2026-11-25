import { ensureSchemaUpgrades } from '../../../../services/d1_service';
import { authenticateCaller, getSigningSecret } from '../../../../services/auth_service';
import { getProductReviews, createProductReview } from '../../../../services/review_service';

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
 * GET /api/products/[id]/reviews: Xem danh sách đánh giá đã duyệt và thống kê sao
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, message: 'D1 Database chưa cấu hình.' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    await ensureSchemaUpgrades(env.DB);

    const productId = String(params.id);

    // Kiểm tra xem người dùng hiện tại có đăng nhập không (để tính canReview, hasPurchased, hasReviewed)
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    let currentUserId: string | undefined = undefined;

    if (token) {
      try {
        const signingSecret = getSigningSecret(env);
        const authRes = await authenticateCaller(env.DB, token, signingSecret);
        if (authRes.authenticated && authRes.member) {
          currentUserId = authRes.member.id;
        }
      } catch {
        // Khách vãng lai, bỏ qua
      }
    }

    const summary = await getProductReviews(env.DB, productId, currentUserId);

    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi lấy đánh giá sản phẩm.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};

/**
 * POST /api/products/[id]/reviews: Gửi đánh giá sản phẩm (yêu cầu đã mua hàng thành công)
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

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, message: 'Vui lòng đăng nhập để gửi đánh giá sản phẩm.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const signingSecret = getSigningSecret(env);
    const authRes = await authenticateCaller(env.DB, token, signingSecret);

    if (!authRes.authenticated || !authRes.member) {
      return new Response(
        JSON.stringify({ success: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const productId = String(params.id);
    const body: { rating: number; comment?: string } = await request.json();

    const member = authRes.member;
    const userName = member.full_name || member.username || 'Khách hàng';

    const result = await createProductReview(env.DB, {
      productId,
      userId: member.id,
      userName,
      rating: Number(body.rating) || 5,
      comment: (body.comment || '').trim(),
    });

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi gửi đánh giá sản phẩm.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
