import { ensureSchemaUpgrades, logAdminAudit } from '../../../../services/d1_service';
import { verifyAdminAuth } from '../../../../services/mission_service';
import { hashPasswordPBKDF2 } from '../../../../services/auth_service';

interface Env {
  DB: D1Database;
  ADMIN_API_KEY?: string;
  ADMIN_SYNC_SECRET?: string;
  JWT_SECRET?: string;
  PASSWORD_PEPPER?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Admin-Key, X-Api-Key, x-admin-sync-key, X-Requested-With',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

function extractTargetId(params: any, url: URL): string {
  let targetId = String(params?.id || url.searchParams.get('id') || '').trim();
  if (!targetId) {
    const parts = url.pathname.split('/').filter(Boolean);
    const idIdx = parts.indexOf('members');
    if (idIdx !== -1 && parts[idIdx + 1] && parts[idIdx + 1] !== 'reset-password') {
      targetId = parts[idIdx + 1];
    }
  }
  return targetId;
}

/**
 * POST /api/admin/members/:id/reset-password
 * Admin resets a member's password using server-side PBKDF2 with environment pepper
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request, params } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: 'Database not available' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const auth = await verifyAdminAuth(request, env as any, 'MEMBERS_FULL');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Unauthorized' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);
    const targetId = extractTargetId(params, new URL(request.url));
    if (!targetId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Thiếu mã thành viên (:id).' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const newPassword = String(body.newPassword || body.password || '').trim();

    if (!newPassword || newPassword.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mật khẩu mới phải có độ dài tối thiểu 6 ký tự.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Fail-closed pepper check
    const pepper = (env.PASSWORD_PEPPER || '').trim();
    if (!pepper || pepper.length < 8) {
      return new Response(
        JSON.stringify({ success: false, error: 'Hệ thống bảo mật chưa sẵn sàng (Thiếu cấu hình pepper bảo mật).' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // Fail-closed WebCrypto check
    if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
      return new Response(
        JSON.stringify({ success: false, error: 'WebCrypto không khả dụng để sinh salt an toàn.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const member = await env.DB.prepare(`
      SELECT id, username, display_name, email, role, status FROM members
      WHERE id = ? OR username = ? OR email = ?
      LIMIT 1
    `).bind(targetId, targetId, targetId).first<any>();

    if (!member) {
      return new Response(
        JSON.stringify({ success: false, error: `Không tìm thấy thành viên "${targetId}".` }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Server generates salt via WebCrypto and hashes with PBKDF2 100,000 iterations
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const finalSalt = 'wcg_salt_' + Array.from(saltBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const finalPasswordHash = await hashPasswordPBKDF2(newPassword, finalSalt, pepper);

    // Update D1 and revoke existing session tokens
    await env.DB.prepare(`
      UPDATE members
      SET password_hash = ?,
          salt = ?,
          session_token = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(finalPasswordHash, finalSalt, member.id).run();

    await logAdminAudit(env.DB, {
      actorName: auth.adminName || 'Admin',
      action: 'ADMIN_RESET_MEMBER_PASSWORD',
      targetId: member.id,
      targetUser: member.username,
      details: {
        memberId: member.id,
        username: member.username,
        algorithm: 'PBKDF2-SHA256-100K',
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Đã đổi mật khẩu cho tài khoản ${member.display_name || member.username} thành công bằng chuẩn PBKDF2.`,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: 'Lỗi máy chủ khi đổi mật khẩu: ' + (err?.message || String(err)) }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
