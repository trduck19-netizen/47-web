import { authenticateCaller } from '../../../services/auth_service';
import { ensureSchemaUpgrades } from '../../../services/d1_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/user/ai-keys/revoke-all
 * Nút "Ngắt tất cả kết nối" khẩn cấp: Thu hồi toàn bộ khóa của tài khoản trong 1 lần bấm (Nhóm 1)
 */
export async function onRequestPost(context: { request: Request; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    await ensureSchemaUpgrades(env.DB);

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token.startsWith('wcg_ai_usr_')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Khóa API AI không có quyền tự thu hồi các khóa khác.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
    if (!auth.authenticated || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập.' }), { status: 401, headers: CORS_HEADERS });
    }

    const memberId = auth.member.id;
    const nowIso = new Date().toISOString();

    const res: any = await env.DB
      .prepare(`
        UPDATE user_ai_api_keys
        SET is_active = 0, revoked_at = ?, updated_at = ?
        WHERE member_id = ? AND is_active = 1
      `)
      .bind(nowIso, nowIso, memberId)
      .run();

    const revokedCount = res?.meta?.changes || 0;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Đã ngắt toàn bộ kết nối khẩn cấp! Đã thu hồi thành công ${revokedCount} khóa API của tài khoản.`,
        revokedCount,
      }),
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: CORS_HEADERS });
  }
}
