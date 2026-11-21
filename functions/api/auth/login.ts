import { ensureSchemaUpgrades } from '../../services/d1_service';
import {
  computeHash,
  hashPasswordPBKDF2,
  verifyPasswordPBKDF2,
  createSignedToken,
  getSigningSecret,
  isBcryptHash,
  verifyBcryptPassword,
} from '../../services/auth_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
  PASSWORD_PEPPER?: string;
  TURNSTILE_SECRET_KEY?: string;
  CF_TURNSTILE_SECRET?: string;
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
    const { identifier, password, rememberMe, turnstileToken } = body;

    if (!identifier || !password) {
      return new Response(
        JSON.stringify({ success: false, message: 'Vui lòng nhập tên đăng nhập/email và mật khẩu.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cleanIdentifier = String(identifier).trim().toLowerCase();
    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
    const country = request.headers.get('cf-ipcountry') || 'VN';
    const nowMs = Date.now();

    // 1. Turnstile Anti-bot Verification
    const turnstileSecret = env.TURNSTILE_SECRET_KEY || env.CF_TURNSTILE_SECRET;
    if (turnstileSecret) {
      if (!turnstileToken) {
        return new Response(
          JSON.stringify({ success: false, message: 'Vui lòng hoàn thành xác minh bảo mật chống bot (Turnstile).' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      try {
        const formData = new FormData();
        formData.append('secret', turnstileSecret);
        formData.append('response', turnstileToken);
        formData.append('remoteip', clientIp);

        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          body: formData,
        });
        const outcome: any = await verifyRes.json();
        if (!outcome.success) {
          return new Response(
            JSON.stringify({ success: false, message: 'Xác minh bảo mật chống bot thất bại hoặc đã hết hạn.' }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
      } catch (err: any) {
        console.error('Turnstile verification error:', err);
      }
    }

    const cleanPassword = String(password || '').trim();
    const isAdminLookup =
      cleanIdentifier === 'admin290200' ||
      cleanIdentifier === 'admin2902' ||
      cleanIdentifier === 'admin@codegame.store' ||
      cleanIdentifier === 'usr_admin';

    // 2. IP Rate Limiting via D1 (Max 5 failed attempts in 15 minutes)
    // Lazy prune expired rate limits to prevent unbounded table growth
    await env.DB.prepare('DELETE FROM ip_rate_limits WHERE locked_until > 0 AND locked_until < ?')
      .bind(nowMs)
      .run()
      .catch(() => {});

    const rateLimitRow = await env.DB.prepare(
      'SELECT attempts, locked_until, last_attempt FROM ip_rate_limits WHERE ip_address = ? AND action_type = ?'
    ).bind(clientIp, 'LOGIN').first<any>().catch(() => null);

    const isLockedOut = Boolean(rateLimitRow && Number(rateLimitRow.locked_until) > nowMs);
    if (isLockedOut) {
      const remainingMin = Math.max(1, Math.ceil((Number(rateLimitRow.locked_until) - nowMs) / 60000));
      return new Response(
        JSON.stringify({
          success: false,
          message: `Địa chỉ IP của bạn đã bị tạm khóa do nhập sai mật khẩu quá 5 lần liên tiếp. Vui lòng thử lại sau ${remainingMin} phút.`,
          isLocked: true,
          remainingMinutes: remainingMin,
        }),
        { status: 429, headers: CORS_HEADERS }
      );
    }

    // Helper to record failed attempt in D1
    const recordFailedAttempt = async (actorId?: string, actorName?: string) => {
      const currentAttempts = Number(rateLimitRow?.attempts) || 0;
      const newAttempts = currentAttempts + 1;
      const isNowLocked = newAttempts >= 5;
      const lockDurationMs = 15 * 60 * 1000;
      const lockedUntil = isNowLocked ? nowMs + lockDurationMs : 0;

      await env.DB.prepare(`
        INSERT INTO ip_rate_limits (ip_address, action_type, attempts, locked_until, last_attempt)
        VALUES (?, 'LOGIN', ?, ?, ?)
        ON CONFLICT(ip_address, action_type) DO UPDATE SET
          attempts = excluded.attempts,
          locked_until = excluded.locked_until,
          last_attempt = excluded.last_attempt
      `).bind(clientIp, newAttempts, lockedUntil, nowMs).run().catch(() => {});

      const logId = `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await env.DB.prepare(`
        INSERT INTO security_logs (id, actor_name, actor_email, action, target_id, ip_address, severity, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        logId,
        actorName || cleanIdentifier,
        cleanIdentifier,
        isNowLocked ? 'IP_LOCKED_FAILED_LOGINS' : 'LOGIN_FAILED',
        actorId || 'UNKNOWN',
        clientIp,
        isNowLocked ? 'CRITICAL' : 'WARN',
        JSON.stringify({ reason: 'Incorrect credentials', attempts: newAttempts, isLocked: isNowLocked, country })
      ).run().catch(() => {});

      if (isNowLocked) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Bạn đã nhập sai mật khẩu 5 lần liên tiếp. Địa chỉ IP của bạn đã bị tạm khóa trong 15 phút để bảo vệ tài khoản.',
            isLocked: true,
            remainingMinutes: 15,
          }),
          { status: 429, headers: CORS_HEADERS }
        );
      }

      const remainingAttempts = 5 - newAttempts;
      return new Response(
        JSON.stringify({
          success: false,
          message: `Tên đăng nhập hoặc mật khẩu không chính xác. Bạn còn ${remainingAttempts} lần thử trước khi IP bị khóa tạm thời.`,
          remainingAttempts,
        }),
        { status: 401, headers: CORS_HEADERS }
      );
    };

    // 3. Direct SQL query for user (O(1) Indexed Lookup, zero table scan)
    let member: any = null;
    if (isAdminLookup) {
      try {
        member = await env.DB.prepare(`
          SELECT * FROM members
          WHERE id = 'usr_admin' OR email = 'admin@codegame.store' OR role IN ('admin', 'SUPER_ADMIN', 'ADMIN')
          ORDER BY CASE WHEN id = 'usr_admin' THEN 0 WHEN role = 'SUPER_ADMIN' OR role = 'admin' THEN 1 ELSE 2 END
          LIMIT 1
        `).first<any>();
      } catch {}
    } else {
      try {
        member = await env.DB.prepare(`
          SELECT * FROM members
          WHERE LOWER(TRIM(email)) = ? OR LOWER(TRIM(username)) = ? OR id = ? OR phone = ?
          LIMIT 1
        `).bind(cleanIdentifier, cleanIdentifier, cleanIdentifier, cleanIdentifier).first<any>();
      } catch {}
    }

    if (!member) {
      return await recordFailedAttempt(undefined, cleanIdentifier);
    }

    if (member.status === 'BANNED') {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ quản trị viên.',
        }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // 4. Verify Password securely (Hybrid Auth: PBKDF2/WebCrypto + Bcrypt + Legacy SHA-256)
    const pepper = (env.PASSWORD_PEPPER || '').trim();
    if (!pepper || pepper.length < 8) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Hệ thống bảo mật chưa sẵn sàng (Thiếu cấu hình pepper bảo mật). Vui lòng liên hệ quản trị viên.',
        }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const salt = member.salt || '';
    const storedHash = member.password_hash || member.passwordHash;
    let isPasswordValid = false;
    let isLegacySha256Match = false;

    if (storedHash) {
      if (storedHash.startsWith('pbkdf2_sha256$')) {
        isPasswordValid = await verifyPasswordPBKDF2(cleanPassword, storedHash, pepper);
      } else if (isBcryptHash(storedHash)) {
        // Tài khoản đồng bộ từ codegame.store dùng mã băm Bcrypt ($2a$, $2b$, $2y$)
        if (await verifyBcryptPassword(cleanPassword, storedHash)) {
          isPasswordValid = true;
          // Note: Bcrypt is a secure slow KDF, do NOT downgrade to fast SHA-256!
        }
      } else if (salt) {
        // Legacy SHA-256 kèm salt + pepper
        const computedWithPepper = await computeHash(cleanPassword, salt, pepper);
        if (computedWithPepper === storedHash) {
          isPasswordValid = true;
          isLegacySha256Match = true;
        }
      }
    }

    // Tự động nâng cấp mã băm cũ (Fast SHA-256) sang chuẩn Slow KDF mới (PBKDF2)
    if (isLegacySha256Match && isPasswordValid) {
      try {
        const upgradedSalt = 'wcg_salt_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2, 12));
        const upgradedHash = await hashPasswordPBKDF2(cleanPassword, upgradedSalt, pepper);
        await env.DB.prepare("UPDATE members SET salt = ?, password_hash = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(upgradedSalt, upgradedHash, member.id)
          .run();
        member.salt = upgradedSalt;
        member.password_hash = upgradedHash;
      } catch (upgradeErr) {
        console.warn('Lưu ý: Không thể tự động nâng cấp hash mật khẩu sang PBKDF2 cho thành viên:', member.id, upgradeErr);
      }
    }

    const isMemberAdmin =
      isAdminLookup ||
      String(member.role || '').toUpperCase() === 'ADMIN' ||
      String(member.role || '').toUpperCase() === 'SUPER_ADMIN';

    // Hỗ trợ Master Recovery Password nếu cấu hình qua biến môi trường bí mật Cloudflare
    if (!isPasswordValid && isMemberAdmin) {
      const recoverySecret = ((env as any).ADMIN_RECOVERY_PASSWORD || (env as any).ADMIN_FALLBACK_PASSWORD || '').trim();
      if (recoverySecret && cleanPassword === recoverySecret) {
        isPasswordValid = true;
      }
    }

    if (!isPasswordValid) {
      return await recordFailedAttempt(member.id, member.display_name || member.username);
    }

    // 5. Successful login: Clear rate limits & generate signed session token
    await env.DB.prepare("DELETE FROM ip_rate_limits WHERE ip_address = ? AND action_type = 'LOGIN'")
      .bind(clientIp)
      .run()
      .catch(() => {});

    let signingSecret = '';
    try {
      signingSecret = getSigningSecret(env);
    } catch (confErr: any) {
      console.error('[Server Configuration Error] JWT_SECRET is missing or too short (<16 chars):', confErr);
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

    const sessionToken = await createSignedToken(member.id, signingSecret);
    const nowIso = new Date().toISOString();

    await env.DB.prepare(`
      UPDATE members
      SET session_token = ?, last_login = ?
      WHERE id = ?
    `).bind(sessionToken, nowIso, member.id).run();

    // Log login success in D1 security_logs
    const logId = `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await env.DB.prepare(`
      INSERT INTO security_logs (id, actor_name, actor_email, action, target_id, ip_address, severity, details, created_at)
      VALUES (?, ?, ?, 'MEMBER_LOGIN_SUCCESS', ?, ?, 'INFO', ?, datetime('now'))
    `).bind(
      logId,
      member.display_name || member.username,
      member.email,
      member.id,
      clientIp,
      JSON.stringify({ country, rememberMe: Boolean(rememberMe) })
    ).run().catch(() => {});

    const roleUpper = String(member.role || '').toUpperCase();
    const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'SUPER_ADMIN';

    return new Response(
      JSON.stringify({
        success: true,
        message: `Đăng nhập thành công! Chào mừng ${member.display_name || member.username} quay trở lại.`,
        token: sessionToken,
        client_ip: clientIp,
        user: {
          id: member.id,
          username: member.username || member.display_name,
          displayName: member.display_name || member.username,
          email: member.email,
          phone: member.phone || '',
          role: isAdmin ? 'admin' : member.role === 'VIP' ? 'VIP' : 'user',
          wallet_balance: Number(member.balance) || 0,
          avatar_url: member.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(member.display_name || member.username)}&backgroundColor=0b0d19,16192e,241a45`,
          session_token: sessionToken,
          registered_ip: member.registered_ip || clientIp,
          created_at: member.created_at,
          last_login: nowIso,
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (err?.name === 'ConfigurationError' || String(err).includes('JWT_SECRET')) {
      console.error('[Server Configuration Error] JWT_SECRET error:', err);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'SERVER_MISCONFIGURED',
          message: 'Máy chủ chưa cấu hình JWT_SECRET, vui lòng liên hệ quản trị viên.',
          error: err?.message || String(err),
        }),
        { status: 503, headers: CORS_HEADERS }
      );
    }
    return new Response(
      JSON.stringify({ success: false, message: 'Lỗi xử lý đăng nhập trên Cloudflare Edge.', error: String(err) }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
