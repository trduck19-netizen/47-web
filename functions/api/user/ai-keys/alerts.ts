import { authenticateCaller } from '../../../services/auth_service';
import { UserAiSecurityAlertRecord } from '../../../services/user_ai_api_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/user/ai-keys/alerts
 * Lấy danh sách cảnh báo bảo mật kết nối lạ (Nhóm 4)
 */
export async function onRequestGet(context: { request: Request; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token.startsWith('wcg_ai_usr_')) {
      return new Response(JSON.stringify({ success: false, error: 'Khóa API AI không có quyền tự xem cảnh báo.' }), { status: 403, headers: CORS_HEADERS });
    }

    const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
    if (!auth.authenticated || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập.' }), { status: 401, headers: CORS_HEADERS });
    }

    const memberId = auth.member.id;
    const rows = await env.DB
      .prepare(`
        SELECT a.*, k.name as key_name, k.key_prefix, k.max_devices
        FROM user_ai_api_security_alerts a
        LEFT JOIN user_ai_api_keys k ON a.key_id = k.id
        WHERE a.member_id = ? AND a.status = 'UNACKNOWLEDGED'
        ORDER BY a.first_alert_at DESC
      `)
      .bind(memberId)
      .all<any>();

    return new Response(JSON.stringify({ success: true, alerts: rows.results || [] }), { headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: CORS_HEADERS });
  }
}

/**
 * POST /api/user/ai-keys/alerts
 * Nút "Đã biết / Xác nhận" cảnh báo an ninh thiết bị lạ (Nhóm 4)
 */
export async function onRequestPost(context: { request: Request; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token.startsWith('wcg_ai_usr_')) {
      return new Response(JSON.stringify({ success: false, error: 'Khóa API AI không có quyền tự xác nhận cảnh báo.' }), { status: 403, headers: CORS_HEADERS });
    }

    const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
    if (!auth.authenticated || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập.' }), { status: 401, headers: CORS_HEADERS });
    }

    const memberId = auth.member.id;
    const body: any = await request.json().catch(() => ({}));
    const alertId = String(body.alertId || '').trim();
    const nowIso = new Date().toISOString();

    let res: any;
    if (alertId) {
      res = await env.DB
        .prepare("UPDATE user_ai_api_security_alerts SET status = 'ACKNOWLEDGED', acknowledged_at = ? WHERE id = ? AND member_id = ?")
        .bind(nowIso, alertId, memberId)
        .run();
    } else {
      // Xác nhận tất cả cảnh báo
      res = await env.DB
        .prepare("UPDATE user_ai_api_security_alerts SET status = 'ACKNOWLEDGED', acknowledged_at = ? WHERE member_id = ? AND status = 'UNACKNOWLEDGED'")
        .bind(nowIso, memberId)
        .run();
    }

    const count = res?.meta?.changes || 0;
    return new Response(
      JSON.stringify({
        success: true,
        message: `Đã xác nhận cảnh báo bảo mật thành công (${count} cảnh báo). Hệ thống đã dừng chu kỳ gửi email cảnh báo.`,
        acknowledgedCount: count,
      }),
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: CORS_HEADERS });
  }
}
