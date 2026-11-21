import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyStoreApiAccess, generateStoreApiKey } from '../../../services/store_api_service';
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

// DELETE: Thu hồi khóa API
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

    if (auth.authType === 'THIRD_PARTY_TOKEN' || (auth.authType === 'STORE_API_KEY' && auth.scope !== 'FULL')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Khóa API phân quyền hoặc token bên thứ ba không có quyền thu hồi khóa API của gian hàng.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const keyId = params.id as string;
    const sellerId = auth.seller.id;
    const nowIso = new Date().toISOString();

    const existingKey = await env.DB
      .prepare('SELECT id, name FROM seller_api_keys WHERE id = ? AND seller_id = ? LIMIT 1')
      .bind(keyId, sellerId)
      .first<{ id: string; name: string }>();

    if (!existingKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không tìm thấy khóa API này trong gian hàng của bạn.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    await env.DB
      .prepare('UPDATE seller_api_keys SET is_active = 0, revoked_at = ? WHERE id = ? AND seller_id = ?')
      .bind(nowIso, keyId, sellerId)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Đã thu hồi khóa API "${existingKey.name}". Khóa này đã hết hiệu lực ngay lập tức.`,
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

// POST: Xoay khóa API (Rotate Key)
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

    if (auth.authType === 'THIRD_PARTY_TOKEN' || (auth.authType === 'STORE_API_KEY' && auth.scope !== 'FULL')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Khóa API phân quyền hoặc token bên thứ ba không có quyền xoay khóa API của gian hàng.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const keyId = params.id as string;
    const sellerId = auth.seller.id;
    const nowIso = new Date().toISOString();

    const oldKey = await env.DB
      .prepare('SELECT * FROM seller_api_keys WHERE id = ? AND seller_id = ? LIMIT 1')
      .bind(keyId, sellerId)
      .first<any>();

    if (!oldKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không tìm thấy khóa API này trong gian hàng của bạn.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // 1. Thu hồi khóa cũ
    await env.DB
      .prepare('UPDATE seller_api_keys SET is_active = 0, revoked_at = ? WHERE id = ? AND seller_id = ?')
      .bind(nowIso, keyId, sellerId)
      .run();

    // 2. Cấp khóa mới với cùng tên và scope
    const newKeyId = `sak_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { rawKey, keyPrefix } = generateStoreApiKey(sellerId);
    const newKeyHash = await computeSha256(rawKey);

    await env.DB
      .prepare(`
        INSERT INTO seller_api_keys (id, seller_id, name, key_hash, key_prefix, scope, is_active, call_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)
      `)
      .bind(newKeyId, sellerId, oldKey.name, newKeyHash, keyPrefix, oldKey.scope, nowIso)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Khóa API đã được xoay thành công. Khóa cũ đã bị vô hiệu hóa và khóa mới đã được kích hoạt.',
        old_key_id: keyId,
        new_key: {
          id: newKeyId,
          seller_id: sellerId,
          name: oldKey.name,
          key_prefix: keyPrefix,
          raw_key: rawKey,
          scope: oldKey.scope,
          created_at: nowIso,
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
