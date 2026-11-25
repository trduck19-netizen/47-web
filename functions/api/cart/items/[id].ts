import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { authenticateCaller, getSigningSecret } from '../../../services/auth_service';
import { updateCartItemQuantity, removeCartItem } from '../../../services/cart_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * PUT /api/cart/items/[id]: Cập nhật số lượng sản phẩm trong giỏ
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
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
        JSON.stringify({ success: false, message: 'Yêu cầu đăng nhập.' }),
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

    const productId = String(params.id);
    const body: { quantity: number; variantId?: string } = await request.json();

    const summary = await updateCartItemQuantity(
      env.DB,
      authRes.member.id,
      productId,
      Number(body.quantity) || 0,
      body.variantId
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cập nhật giỏ hàng thành công.',
        ...summary,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi cập nhật giỏ hàng.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};

/**
 * DELETE /api/cart/items/[id]: Xóa sản phẩm khỏi giỏ
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
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
        JSON.stringify({ success: false, message: 'Yêu cầu đăng nhập.' }),
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

    const productId = String(params.id);
    const url = new URL(request.url);
    const variantId = url.searchParams.get('variantId') || undefined;

    const summary = await removeCartItem(env.DB, authRes.member.id, productId, variantId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đã xóa sản phẩm khỏi giỏ hàng.',
        ...summary,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi xóa khỏi giỏ hàng.' }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
