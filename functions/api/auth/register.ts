import { ensureSchemaUpgrades } from '../../services/d1_service';
import { verifyTurnstileRequest, isTurnstileCheckEnabled } from '../../services/turnstile_service';
import { createSignedToken, getSigningSecret, computeHash, hashPasswordPBKDF2 } from '../../services/auth_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
  PASSWORD_PEPPER?: string;
  TURNSTILE_SECRET_KEY?: string;
  CF_TURNSTILE_SECRET?: string;
  TURNSTILE_ENABLED?: string;
  REGISTER_TURNSTILE_ENABLED?: string;
  ENVIRONMENT?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);

    const body: any = await request.json().catch(() => ({}));
    const { username, email, displayName, phone, turnstileToken, password } = body;

    // 0. Chặn 100% việc gửi salt hoặc passwordHash từ client (Rule bảo mật bắt buộc băm tại máy chủ)
    if (body.passwordHash !== undefined || body.salt !== undefined) {
      return new Response(
        JSON.stringify({ success: false, message: 'Yêu cầu không hợp lệ: Không chấp nhận mã băm hoặc salt từ máy khách. Mật khẩu phải được băm bảo mật tại máy chủ.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 1. Validation
    if (!username || !email) {
      return new Response(
        JSON.stringify({ success: false, message: 'Vui lòng cung cấp đầy đủ tên đăng nhập và email.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return new Response(
        JSON.stringify({ success: false, message: 'Mật khẩu phải có độ dài tối thiểu 6 ký tự.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanEmail = String(email).trim().toLowerCase();

    // XSS & Script Tag Injection Prevention
    if (/<[^>]*>?/gm.test(cleanUsername) || cleanUsername.includes('<') || cleanUsername.includes('>')) {
      return new Response(
        JSON.stringify({ success: false, message: 'Tên đăng nhập không được chứa mã HTML hoặc thẻ script.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
    const country = request.headers.get('cf-ipcountry') || 'VN';

    // 2. Turnstile Anti-bot Token check (controlled by REGISTER_TURNSTILE_ENABLED / TURNSTILE_ENABLED)
    if (isTurnstileCheckEnabled(env)) {
      const turnstileCheck = await verifyTurnstileRequest(env, turnstileToken, clientIp, CORS_HEADERS);
      if (!turnstileCheck.ok) {
        return turnstileCheck.response;
      }
    }

    // 3. Check for duplicates in D1 (SSOT)
    const dup = await env.DB.prepare(`
      SELECT id FROM members
      WHERE LOWER(username) = ? OR LOWER(display_name) = ? OR LOWER(email) = ?
      LIMIT 1
    `).bind(cleanUsername, cleanUsername, cleanEmail).first();

    if (dup) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Tên đăng nhập hoặc email này đã được sử dụng trên hệ thống.',
        }),
        { status: 409, headers: CORS_HEADERS }
      );
    }

    // 4. IP Daily Registration Limit (Max 2 accounts / IP / day)
    const ipRow = await env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM members
      WHERE registered_ip = ? AND created_at >= date('now', 'start of day')
    `).bind(clientIp).first<any>();
    const ipCountToday = Number(ipRow?.cnt) || 0;

    if (ipCountToday >= 2) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Địa chỉ IP của bạn đã đạt giới hạn tạo tối đa 2 tài khoản trong 1 ngày. Vui lòng quay lại vào ngày mai.',
        }),
        { status: 429, headers: CORS_HEADERS }
      );
    }

    // 5. Create new Member record in D1
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let signingSecret = '';
    try {
      signingSecret = getSigningSecret(env);
    } catch (confErr: any) {
      console.error('[Server Configuration Error] JWT_SECRET missing or too short:', confErr);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'SERVER_MISCONFIGURED',
          message: 'Máy chủ chưa cấu hình JWT_SECRET, vui lòng liên hệ quản trị viên.',
          error: confErr?.message,
        }),
        { status: 503, headers: CORS_HEADERS }
      );
    }
    const sessionToken = await createSignedToken(userId, signingSecret);
    const nowIso = new Date().toISOString();
    const finalDisplayName = (displayName ? String(displayName).replace(/<[^>]*>?/gm, '').trim() : '') || cleanUsername;
    const finalFullName = finalDisplayName || cleanUsername;
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUsername)}&backgroundColor=0b0d19,16192e,241a45`;

    // Sinh salt an toàn bằng WebCrypto (fail-closed, 0% Math.random)
    if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
      return new Response(
        JSON.stringify({ success: false, message: 'Lỗi máy chủ: WebCrypto không khả dụng để sinh salt bảo mật.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const finalSalt = 'wcg_salt_' + Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const pepper = (env.PASSWORD_PEPPER || '').trim();
    if (!pepper || pepper.length < 8) {
      return new Response(
        JSON.stringify({ success: false, message: 'Hệ thống bảo mật chưa sẵn sàng (thiếu pepper cấu hình).' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }
    const finalPasswordHash = await hashPasswordPBKDF2(password, finalSalt, pepper);

    await env.DB.prepare(`
      INSERT INTO members (id, username, display_name, full_name, email, phone, role, balance, total_spent, status, salt, password_hash, avatar_url, session_token, last_login, created_at, registered_ip)
      VALUES (?, ?, ?, ?, ?, ?, 'MEMBER', 0, 0, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      cleanUsername,
      finalDisplayName,
      finalFullName,
      cleanEmail,
      phone?.trim() || '',
      finalSalt,
      finalPasswordHash || '',
      avatarUrl,
      sessionToken,
      nowIso,
      nowIso,
      clientIp
    ).run();

    // 6. Security Log
    const logId = `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await env.DB.prepare(`
      INSERT INTO security_logs (id, actor_name, actor_email, action, target_id, ip_address, severity, details, created_at)
      VALUES (?, ?, ?, 'MEMBER_REGISTER', ?, ?, 'INFO', ?, datetime('now'))
    `).bind(
      logId,
      finalDisplayName,
      cleanEmail,
      userId,
      clientIp,
      JSON.stringify({ country })
    ).run().catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đăng ký tài khoản thành công!',
        token: sessionToken,
        client_ip: clientIp,
        user: {
          id: userId,
          username: cleanUsername,
          displayName: finalDisplayName,
          fullName: finalFullName,
          email: cleanEmail,
          phone: phone?.trim() || '',
          role: 'user',
          wallet_balance: 0,
          avatar_url: avatarUrl,
          session_token: sessionToken,
          registered_ip: clientIp,
          created_at: nowIso,
        },
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: 'Lỗi xử lý đăng ký trên Cloudflare Edge.', error: String(err) }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
