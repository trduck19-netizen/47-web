import { authenticateCaller } from '../../../../services/auth_service';
import { UserAiApiDeviceRecord } from '../../../../services/user_ai_api_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/user/ai-keys/:id/devices
 * Xem danh sách thiết bị / IP kết nối đã ghi nhận (Nhóm 4)
 */
export async function onRequestGet(context: { request: Request; params: any; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, params, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    const keyId = params.id as string;
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token.startsWith('wcg_ai_usr_')) {
      return new Response(JSON.stringify({ success: false, error: 'Khóa API AI không có quyền tự xem thiết bị.' }), { status: 403, headers: CORS_HEADERS });
    }

    const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
    if (!auth.authenticated || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập.' }), { status: 401, headers: CORS_HEADERS });
    }

    const memberId = auth.member.id;
    const key = await env.DB
      .prepare('SELECT id, name, key_prefix, max_devices FROM user_ai_api_keys WHERE id = ? AND member_id = ? LIMIT 1')
      .bind(keyId, memberId)
      .first<{ id: string; name: string; key_prefix: string; max_devices: number }>();

    if (!key) {
      return new Response(JSON.stringify({ success: false, error: 'Khóa không tồn tại.' }), { status: 404, headers: CORS_HEADERS });
    }

    const rows = await env.DB
      .prepare(`
        SELECT id, ip_address, device_id, first_seen_at, last_seen_at, is_blocked
        FROM user_ai_api_devices
        WHERE key_id = ? AND member_id = ?
        ORDER BY last_seen_at DESC
      `)
      .bind(keyId, memberId)
      .all<UserAiApiDeviceRecord>();

    return new Response(
      JSON.stringify({
        success: true,
        key: { id: key.id, name: key.name, key_prefix: key.key_prefix, max_devices: key.max_devices },
        devices: rows.results || [],
      }),
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: CORS_HEADERS });
  }
}

/**
 * DELETE /api/user/ai-keys/:id/devices
 * Xóa 1 thiết bị / IP kết nối để giải phóng slot cho khóa
 */
export async function onRequestDelete(context: { request: Request; params: any; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, params, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    const keyId = params.id as string;
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token.startsWith('wcg_ai_usr_')) {
      return new Response(JSON.stringify({ success: false, error: 'Khóa API AI không có quyền tự xóa thiết bị.' }), { status: 403, headers: CORS_HEADERS });
    }

    const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
    if (!auth.authenticated || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập.' }), { status: 401, headers: CORS_HEADERS });
    }

    const memberId = auth.member.id;
    const body: any = await request.json().catch(() => ({}));
    const deviceRowId = String(body.deviceRowId || '').trim();

    if (!deviceRowId) {
      return new Response(JSON.stringify({ success: false, error: 'Thiếu deviceRowId cần xóa.' }), { status: 400, headers: CORS_HEADERS });
    }

    const res: any = await env.DB
      .prepare('DELETE FROM user_ai_api_devices WHERE id = ? AND key_id = ? AND member_id = ?')
      .bind(deviceRowId, keyId, memberId)
      .run();

    const changes = res?.meta?.changes || 0;
    if (changes === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy thiết bị kết nối cần xóa.' }), { status: 404, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ success: true, message: 'Đã xóa kết nối thiết bị thành công. Slot kết nối đã được giải phóng!' }), { headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: CORS_HEADERS });
  }
}
