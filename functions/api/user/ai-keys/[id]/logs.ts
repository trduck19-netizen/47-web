import { authenticateCaller } from '../../../../services/auth_service';
import { UserAiApiCallLogRecord } from '../../../../services/user_ai_api_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/user/ai-keys/:id/logs
 * Xem nhật ký gọi API của khóa này (Nhóm 1 & Nhóm 5)
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
      return new Response(
        JSON.stringify({ success: false, error: 'Khóa API AI không có quyền tự xem nhật ký.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
    if (!auth.authenticated || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập.' }), { status: 401, headers: CORS_HEADERS });
    }

    const memberId = auth.member.id;

    // Xác nhận khóa thuộc về member này
    const key = await env.DB
      .prepare('SELECT id, name, key_prefix FROM user_ai_api_keys WHERE id = ? AND member_id = ? LIMIT 1')
      .bind(keyId, memberId)
      .first<{ id: string; name: string; key_prefix: string }>();

    if (!key) {
      return new Response(JSON.stringify({ success: false, error: 'Khóa không tồn tại hoặc bạn không có quyền xem.' }), { status: 404, headers: CORS_HEADERS });
    }

    const rows = await env.DB
      .prepare(`
        SELECT id, endpoint, method, status_code, ip_address, device_id, error_code, response_summary, created_at
        FROM user_ai_api_call_logs
        WHERE key_id = ? AND member_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `)
      .bind(keyId, memberId)
      .all<UserAiApiCallLogRecord>();

    return new Response(
      JSON.stringify({
        success: true,
        key: { id: key.id, name: key.name, key_prefix: key.key_prefix },
        logs: rows.results || [],
      }),
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: CORS_HEADERS });
  }
}
