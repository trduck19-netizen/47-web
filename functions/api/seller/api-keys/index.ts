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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Danh sách khóa API của gian hàng + nhật ký gọi gần đây
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

    // Lấy danh sách khóa API (Tuyệt đối không trả về key_hash)
    const keysRes = await env.DB
      .prepare(`
        SELECT id, seller_id, name, key_prefix, scope, is_active, call_count, last_used_at, last_used_endpoint, created_at, revoked_at
        FROM seller_api_keys
        WHERE seller_id = ?
        ORDER BY created_at DESC
      `)
      .bind(sellerId)
      .all<any>();

    // Lấy 30 bản ghi nhật ký gọi API gần nhất
    const logsRes = await env.DB
      .prepare(`
        SELECT id, key_id, auth_type, endpoint, method, status_code, ip_address, created_at
        FROM seller_api_call_logs
        WHERE seller_id = ?
        ORDER BY created_at DESC
        LIMIT 30
      `)
      .bind(sellerId)
      .all<any>();

    return new Response(
      JSON.stringify({
        success: true,
        seller: {
          id: auth.seller.id,
          name: auth.seller.name,
          slug: auth.seller.slug,
        },
        keys: keysRes.results || [],
        logs: logsRes.results || [],
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

// POST: Tạo khóa API mới cho gian hàng
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSchemaUpgrades(env.DB);
    const auth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!auth.authorized || !auth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Vui lòng đăng nhập bằng tài khoản chủ gian hàng.' }),
        { status: auth.status || 401, headers: CORS_HEADERS }
      );
    }

    // Token bên thứ ba KHÔNG ĐƯỢC PHÉP tạo khóa API mới cho chủ gian hàng
    if (auth.authType === 'THIRD_PARTY_TOKEN') {
      return new Response(
        JSON.stringify({ success: false, error: 'Ứng dụng bên thứ ba không có quyền tạo khóa API cho gian hàng.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // Khóa API phân quyền (PRODUCTS/ORDERS/CODES/READ_ONLY) KHÔNG ĐƯỢC PHÉP tạo khóa API mới (chống leo thang đặc quyền)
    if (auth.authType === 'STORE_API_KEY' && auth.scope !== 'FULL') {
      return new Response(
        JSON.stringify({ success: false, error: 'Khóa API phân quyền không có quyền quản lý hoặc tạo khóa API mới. Yêu cầu quyền FULL hoặc phiên đăng nhập của Chủ gian hàng.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const sellerId = auth.seller.id;
    const body = (await request.json().catch(() => ({}))) as any;
    const keyName = String(body.name || '').trim();
    const rawScope = String(body.scope || 'FULL').toUpperCase().trim();
    const scope = ['FULL', 'READ_ONLY', 'PRODUCTS', 'ORDERS', 'CODES'].includes(rawScope) ? rawScope : 'FULL';

    if (!keyName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Vui lòng nhập tên nhận diện cho khóa API (ví dụ: Khóa Quản Lý Kho AI).' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const keyId = `sak_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { rawKey, keyPrefix } = generateStoreApiKey(sellerId);
    const keyHash = await computeSha256(rawKey);
    const nowIso = new Date().toISOString();

    await env.DB
      .prepare(`
        INSERT INTO seller_api_keys (id, seller_id, name, key_hash, key_prefix, scope, is_active, call_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)
      `)
      .bind(keyId, sellerId, keyName, keyHash, keyPrefix, scope, nowIso)
      .run();

    // rawKey chỉ hiển thị ĐÚNG 1 LẦN DUY NHẤT trong phản hồi tạo mới
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Khóa API gian hàng đã được tạo thành công. Vui lòng sao chép và lưu trữ an toàn, khóa thô sẽ không bao giờ hiển thị lại.',
        key: {
          id: keyId,
          seller_id: sellerId,
          name: keyName,
          key_prefix: keyPrefix,
          raw_key: rawKey,
          scope,
          created_at: nowIso,
        },
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
