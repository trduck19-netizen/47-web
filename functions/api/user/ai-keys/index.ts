import { authenticateCaller } from '../../../services/auth_service';
import { ensureSchemaUpgrades } from '../../../services/d1_service';
import {
  generateUserAiApiKey,
  ALL_USER_AI_SCOPES,
  UserAiApiKeyRecord,
  UserAiWalletPermissions,
} from '../../../services/user_ai_api_service';

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
 * GET /api/user/ai-keys
 * Lấy danh sách khóa API của người dùng đã đăng nhập (Nhóm 1)
 * CHỈ dùng trong phiên web đã đăng nhập (session), không dùng khóa API để xem
 */
export async function onRequestGet(context: { request: Request; env: { DB: D1Database; JWT_SECRET?: string } }) {
  const { request, env } = context;
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), { status: 500, headers: CORS_HEADERS });
    }

    await ensureSchemaUpgrades(env.DB);

    // Xác thực phiên đăng nhập web
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // CHỐNG CỬA SAU: Không cho phép gọi qua chính khóa API (wcg_ai_usr_)
    if (token.startsWith('wcg_ai_usr_')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Khóa API AI không có quyền tự truy vấn hoặc quản lý các khóa khác.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
    if (!auth.authenticated || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập để xem danh sách Khóa API.' }), { status: 401, headers: CORS_HEADERS });
    }

    const memberId = auth.member.id;

    // Lấy danh sách khóa
    const rows = await env.DB
      .prepare(`
        SELECT id, member_id, name, key_prefix, scopes, wallet_permissions,
               daily_spend_limit, daily_spent_today, daily_spent_date, daily_withdraw_limit,
               max_devices, is_active, call_count, expires_at, revoked_at,
               last_used_at, last_used_endpoint, last_used_ip, created_at, updated_at
        FROM user_ai_api_keys
        WHERE member_id = ?
        ORDER BY created_at DESC
      `)
      .bind(memberId)
      .all<UserAiApiKeyRecord>();

    const keysList = rows.results || [];

    // Bổ sung số thiết bị kết nối và cảnh báo an ninh chưa xác nhận cho từng khóa
    const enrichedKeys = await Promise.all(
      keysList.map(async (k) => {
        let parsedScopes: string[] = [];
        try { parsedScopes = JSON.parse(k.scopes || '[]'); } catch {}

        let parsedWallet: UserAiWalletPermissions = {
          wallet_view: false,
          wallet_deposit: false,
          wallet_pay: false,
          seller_withdraw: false,
        };
        try { parsedWallet = JSON.parse(k.wallet_permissions || '{}'); } catch {}

        const devCountRes = await env.DB
          .prepare('SELECT COUNT(*) as count FROM user_ai_api_devices WHERE key_id = ?')
          .bind(k.id)
          .first<{ count: number }>()
          .catch(() => ({ count: 0 }));

        const alertCountRes = await env.DB
          .prepare("SELECT COUNT(*) as count FROM user_ai_api_security_alerts WHERE key_id = ? AND status = 'UNACKNOWLEDGED'")
          .bind(k.id)
          .first<{ count: number }>()
          .catch(() => ({ count: 0 }));

        return {
          id: k.id,
          name: k.name,
          key_prefix: k.key_prefix,
          scopes: parsedScopes,
          wallet_permissions: parsedWallet,
          daily_spend_limit: k.daily_spend_limit,
          daily_spent_today: k.daily_spent_today,
          daily_spent_date: k.daily_spent_date,
          daily_withdraw_limit: k.daily_withdraw_limit,
          max_devices: k.max_devices,
          connected_devices: devCountRes?.count || 0,
          unacknowledged_alerts: alertCountRes?.count || 0,
          is_active: Boolean(k.is_active),
          call_count: k.call_count,
          expires_at: k.expires_at,
          revoked_at: k.revoked_at,
          last_used_at: k.last_used_at,
          last_used_endpoint: k.last_used_endpoint,
          last_used_ip: k.last_used_ip,
          created_at: k.created_at,
        };
      })
    );

    return new Response(JSON.stringify({ success: true, keys: enrichedKeys }), { headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: CORS_HEADERS });
  }
}

/**
 * POST /api/user/ai-keys
 * Tạo mới một Khóa AI (Nhóm 1)
 * Trả về rawKey DUY NHẤT 1 LẦN NGAY SAU KHI TẠO
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

    // CHỐNG CỬA SAU: Không cho phép tạo khóa bằng khóa API
    if (token.startsWith('wcg_ai_usr_')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Khóa API AI không có quyền tự tạo thêm khóa mới.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const auth = await authenticateCaller(env.DB, token, env.JWT_SECRET);
    if (!auth.authenticated || !auth.member) {
      return new Response(JSON.stringify({ success: false, error: 'Yêu cầu đăng nhập để tạo Khóa API.' }), { status: 401, headers: CORS_HEADERS });
    }

    const memberId = auth.member.id;
    const body: any = await request.json().catch(() => ({}));

    const name = String(body.name || '').trim();
    if (!name || name.length < 2 || name.length > 60) {
      return new Response(JSON.stringify({ success: false, error: 'Tên gợi ý của khóa phải từ 2 đến 60 ký tự (ví dụ: Muse của tôi).' }), { status: 400, headers: CORS_HEADERS });
    }

    // Ngày hết hạn: không bắt buộc, mặc định null = không hết hạn
    let expiresAt: string | null = null;
    if (body.expires_at) {
      const parsedDate = new Date(body.expires_at);
      if (!isNaN(parsedDate.getTime()) && parsedDate.getTime() > Date.now()) {
        expiresAt = parsedDate.toISOString();
      } else {
        return new Response(JSON.stringify({ success: false, error: 'Ngày hết hạn phải ở thời điểm tương lai hợp lệ.' }), { status: 400, headers: CORS_HEADERS });
      }
    }

    // Phạm vi quyền: mặc định bật hết 7 quyền thành viên hợp pháp (Nhóm 2)
    let requestedScopes: string[] = ALL_USER_AI_SCOPES.slice();
    if (Array.isArray(body.scopes)) {
      requestedScopes = body.scopes.filter((s: string) => (ALL_USER_AI_SCOPES as readonly string[]).includes(s));
    }

    // Quyền ví (Nhóm 3): Mặc định TẮT HOÀN TOÀN
    const walletInput = body.wallet_permissions || {};
    const walletPermissions: UserAiWalletPermissions = {
      wallet_view: Boolean(walletInput.wallet_view),
      wallet_deposit: Boolean(walletInput.wallet_deposit),
      wallet_pay: Boolean(walletInput.wallet_pay),
      seller_withdraw: Boolean(walletInput.seller_withdraw),
    };

    // Hạn mức chi tiêu theo ngày (BẮT BUỘC nếu bật wallet_pay)
    let dailySpendLimit = Math.max(0, parseInt(body.daily_spend_limit, 10) || 0);
    if (walletPermissions.wallet_pay && dailySpendLimit <= 0) {
      dailySpendLimit = 500000; // Gợi ý mặc định 500.000đ/ngày
    }

    // Hạn mức rút tiền bán hàng theo ngày
    let dailyWithdrawLimit = Math.max(0, parseInt(body.daily_withdraw_limit, 10) || 0);
    if (walletPermissions.seller_withdraw && dailyWithdrawLimit <= 0) {
      dailyWithdrawLimit = 1000000;
    }

    // Giới hạn số thiết bị / kết nối (Nhóm 4): mặc định 3, tối thiểu 1
    const maxDevices = Math.max(1, parseInt(body.max_devices, 10) || 3);

    // Sinh khóa ngẫu nhiên
    const { rawKey, keyPrefix, keyHash } = await generateUserAiApiKey(memberId);
    const keyId = `uak_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    // Lưu vào D1 (CHỈ LƯU HASH, KHÔNG BAO GIỜ LƯU RAW KEY)
    await env.DB
      .prepare(`
        INSERT INTO user_ai_api_keys (
          id, member_id, name, key_hash, key_prefix, scopes, wallet_permissions,
          daily_spend_limit, daily_spent_today, daily_spent_date, daily_withdraw_limit, daily_withdrawn_today,
          max_devices, is_active, call_count, expires_at, revoked_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, 0, '', ?, 0,
          ?, 1, 0, ?, NULL, ?, ?
        )
      `)
      .bind(
        keyId,
        memberId,
        name,
        keyHash,
        keyPrefix,
        JSON.stringify(requestedScopes),
        JSON.stringify(walletPermissions),
        dailySpendLimit,
        dailyWithdrawLimit,
        maxDevices,
        expiresAt,
        nowIso,
        nowIso
      )
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tạo Khóa API cho AI thành công! Khóa đầy đủ chỉ hiển thị DUY NHẤT một lần này. Vui lòng sao chép và lưu trữ an toàn ngay bây giờ.',
        key: {
          id: keyId,
          name,
          rawKey, // Chỉ trả về duy nhất lần này
          key_prefix: keyPrefix,
          scopes: requestedScopes,
          wallet_permissions: walletPermissions,
          daily_spend_limit: dailySpendLimit,
          daily_withdraw_limit: dailyWithdrawLimit,
          max_devices: maxDevices,
          expires_at: expiresAt,
          created_at: nowIso,
        },
      }),
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: CORS_HEADERS });
  }
}
