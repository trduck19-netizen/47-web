import { authenticateCaller } from '../../../services/auth_service';
import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { ALL_USER_AI_SCOPES, UserAiApiKeyRecord, UserAiWalletPermissions } from '../../../services/user_ai_api_service';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * PUT /api/user/ai-keys/:id
 * Cập nhật tên, gia hạn ngày hết hạn, cấu hình quyền, hạn mức ví, giới hạn thiết bị
 */
export async function onRequestPut(context: { request: Request; params: any; env: { DB: D1Database; JWT_SECRET?: string } }) {
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
        JSON.stringify({ success: false, error: 'Khóa API AI không có quyền tự thay đổi cấu hình khóa.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
    if (!auth.authenticated || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập.' }), { status: 401, headers: CORS_HEADERS });
    }

    const memberId = auth.member.id;
    const current = await env.DB
      .prepare('SELECT * FROM user_ai_api_keys WHERE id = ? AND member_id = ? LIMIT 1')
      .bind(keyId, memberId)
      .first<UserAiApiKeyRecord>();

    if (!current) {
      return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy khóa hoặc bạn không có quyền thao tác.' }), { status: 404, headers: CORS_HEADERS });
    }

    if (!current.is_active || current.revoked_at) {
      return new Response(JSON.stringify({ success: false, error: 'Khóa này đã bị thu hồi trước đó, không thể chỉnh sửa.' }), { status: 400, headers: CORS_HEADERS });
    }

    const body: any = await request.json().catch(() => ({}));

    // Cập nhật tên nếu có
    let newName = current.name;
    if (typeof body.name === 'string' && body.name.trim().length >= 2) {
      newName = body.name.trim().slice(0, 60);
    }

    // Gia hạn nếu có
    let newExpiresAt = current.expires_at;
    if (body.expires_at !== undefined) {
      if (body.expires_at === null || body.expires_at === '') {
        newExpiresAt = null;
      } else {
        const d = new Date(body.expires_at);
        if (!isNaN(d.getTime()) && d.getTime() > Date.now()) {
          newExpiresAt = d.toISOString();
        }
      }
    }

    // Giới hạn thiết bị
    let newMaxDevices = current.max_devices;
    if (body.max_devices !== undefined) {
      newMaxDevices = Math.max(1, parseInt(body.max_devices, 10) || 3);
    }

    // Scopes
    let newScopes = current.scopes;
    if (Array.isArray(body.scopes)) {
      const validScopes = body.scopes.filter((s: string) => (ALL_USER_AI_SCOPES as readonly string[]).includes(s));
      newScopes = JSON.stringify(validScopes);
    }

    // Quyền ví
    let newWalletPerms = current.wallet_permissions;
    if (body.wallet_permissions && typeof body.wallet_permissions === 'object') {
      const w: UserAiWalletPermissions = {
        wallet_view: Boolean(body.wallet_permissions.wallet_view),
        wallet_deposit: Boolean(body.wallet_permissions.wallet_deposit),
        wallet_pay: Boolean(body.wallet_permissions.wallet_pay),
        seller_withdraw: Boolean(body.wallet_permissions.seller_withdraw),
      };
      newWalletPerms = JSON.stringify(w);
    }

    // Hạn mức chi tiêu
    let newDailySpendLimit = current.daily_spend_limit;
    if (body.daily_spend_limit !== undefined) {
      newDailySpendLimit = Math.max(0, parseInt(body.daily_spend_limit, 10) || 0);
    }

    // Hạn mức rút tiền
    let newDailyWithdrawLimit = current.daily_withdraw_limit;
    if (body.daily_withdraw_limit !== undefined) {
      newDailyWithdrawLimit = Math.max(0, parseInt(body.daily_withdraw_limit, 10) || 0);
    }

    await env.DB
      .prepare(`
        UPDATE user_ai_api_keys
        SET name = ?, expires_at = ?, max_devices = ?, scopes = ?, wallet_permissions = ?,
            daily_spend_limit = ?, daily_withdraw_limit = ?, updated_at = datetime('now')
        WHERE id = ? AND member_id = ?
      `)
      .bind(
        newName,
        newExpiresAt,
        newMaxDevices,
        newScopes,
        newWalletPerms,
        newDailySpendLimit,
        newDailyWithdrawLimit,
        keyId,
        memberId
      )
      .run();

    return new Response(JSON.stringify({ success: true, message: 'Cập nhật cấu hình Khóa AI thành công!' }), { headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: CORS_HEADERS });
  }
}

/**
 * DELETE /api/user/ai-keys/:id
 * Thu hồi khóa AI ngay lập tức (Nhóm 1)
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
      return new Response(
        JSON.stringify({ success: false, error: 'Khóa API AI không có quyền tự thu hồi khóa.' }),
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
        WHERE id = ? AND member_id = ? AND is_active = 1
      `)
      .bind(nowIso, nowIso, keyId, memberId)
      .run();

    const changes = res?.meta?.changes || 0;
    if (changes === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Khóa không tồn tại hoặc đã bị thu hồi trước đó.' }), { status: 404, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ success: true, message: 'Đã thu hồi Khóa API AI thành công. Khóa đã bị vô hiệu hóa tức thì!' }), { headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: CORS_HEADERS });
  }
}
