/**
 * Cloudflare Edge Google OAuth2 Authentication Service
 * Xác thực Google ID Token, tự động liên kết hoặc tạo tài khoản trong CSDL D1 members.
 */

import { createSignedToken, getSigningSecret } from './auth_service';

export interface GoogleTokenPayload {
  sub: string;
  email: string;
  email_verified: string | boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  aud?: string;
}

export interface GoogleAuthResult {
  success: boolean;
  message: string;
  token?: string;
  member?: any;
  code?: string;
}

/**
 * Xác thực Google ID Token trực tiếp với Google tokeninfo endpoint
 */
export async function verifyGoogleCredential(
  credential: string,
  expectedClientId?: string
): Promise<{ valid: boolean; payload?: GoogleTokenPayload; error?: string }> {
  if (!credential || typeof credential !== 'string') {
    return { valid: false, error: 'Thiếu Google Credential Token.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const googleUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
    const res = await fetch(googleUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errData: any = await res.json().catch(() => ({}));
      return {
        valid: false,
        error: errData?.error_description || 'Xác thực Google ID Token thất bại từ Google.',
      };
    }

    const payload: GoogleTokenPayload = await res.json();

    // 1. Kiểm tra email đã được Google xác minh
    const isEmailVerified = payload.email_verified === 'true' || payload.email_verified === true;
    if (!isEmailVerified || !payload.email) {
      return { valid: false, error: 'Email Google chưa được xác minh hoặc không hợp lệ.' };
    }

    // 2. Kiểm tra Client ID nếu có cấu hình
    if (expectedClientId && expectedClientId.length >= 10 && payload.aud) {
      if (payload.aud !== expectedClientId.trim()) {
        console.warn(`[Google OAuth warning] Client ID mismatch: expected ${expectedClientId}, got ${payload.aud}`);
      }
    }

    return { valid: true, payload };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { valid: false, error: 'Thời gian xác thực với Google quá lâu (hơn 8 giây).' };
    }
    return { valid: false, error: 'Lỗi mạng khi kết nối tới máy chủ Google: ' + (err?.message || String(err)) };
  }
}

/**
 * Xử lý đăng nhập / liên kết tài khoản Google với D1
 */
export async function authenticateWithGoogle(
  db: D1Database,
  credential: string,
  envSecret?: string,
  expectedClientId?: string
): Promise<GoogleAuthResult> {
  const verifyRes = await verifyGoogleCredential(credential, expectedClientId);
  if (!verifyRes.valid || !verifyRes.payload) {
    return {
      success: false,
      message: verifyRes.error || 'Xác thực Google thất bại.',
      code: 'GOOGLE_VERIFY_FAILED',
    };
  }

  const { sub: googleId, email, name, picture } = verifyRes.payload;
  const cleanEmail = email.toLowerCase().trim();
  const nowIso = new Date().toISOString();

  // 1. Tìm thành viên đã liên kết google_id
  let member = await db
    .prepare('SELECT * FROM members WHERE google_id = ? LIMIT 1')
    .bind(googleId)
    .first<any>();

  // 2. Nếu chưa có google_id, tìm theo email để liên kết
  if (!member) {
    member = await db
      .prepare('SELECT * FROM members WHERE LOWER(email) = ? LIMIT 1')
      .bind(cleanEmail)
      .first<any>();

    if (member) {
      // Đã có tài khoản theo email -> Liên kết google_id và cập nhật avatar nếu chưa có
      await db
        .prepare(`
          UPDATE members SET
            google_id = ?,
            auth_provider = COALESCE(auth_provider, 'google'),
            avatar_url = COALESCE(avatar_url, ?),
            updated_at = ?
          WHERE id = ?
        `)
        .bind(googleId, picture || null, nowIso, member.id)
        .run();

      member = await db.prepare('SELECT * FROM members WHERE id = ?').bind(member.id).first<any>();
    }
  }

  // 3. Nếu chưa từng tồn tại -> Tạo mới thành viên
  if (!member) {
    const userId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const baseUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
    const randSuffix = Math.random().toString(36).substring(2, 5);
    const username = `${baseUsername}_${randSuffix}`;
    const displayName = name || baseUsername || 'Thành viên';

    await db
      .prepare(`
        INSERT INTO members (
          id, username, display_name, email, phone, role,
          balance, total_spent, status, avatar_url, auth_provider,
          google_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, '', 'MEMBER', 0, 0, 'ACTIVE', ?, 'google', ?, ?, ?)
      `)
      .bind(
        userId,
        username,
        displayName,
        cleanEmail,
        picture || null,
        googleId,
        nowIso,
        nowIso
      )
      .run();

    member = await db.prepare('SELECT * FROM members WHERE id = ?').bind(userId).first<any>();
  }

  if (!member || member.status === 'BANNED') {
    return {
      success: false,
      message: 'Tài khoản của bạn đã bị khóa hoặc không khả dụng. Vui lòng liên hệ ban quản trị.',
      code: 'ACCOUNT_BANNED',
    };
  }

  // 4. Sinh signed token JWT cho phiên đăng nhập (Fail-closed nếu thiếu JWT_SECRET)
  if (!envSecret || envSecret.length < 16) {
    return {
      success: false,
      message: 'Máy chủ chưa cấu hình JWT_SECRET an toàn (tối thiểu 16 ký tự). Vui lòng liên hệ ban quản trị.',
      code: 'JWT_SECRET_INVALID',
    };
  }
  const token = await createSignedToken(member.id, envSecret);

  const cleanMember = {
    id: member.id,
    username: member.username,
    display_name: member.display_name,
    email: member.email,
    avatar_url: member.avatar_url,
    role: member.role || 'MEMBER',
    balance: member.balance || 0,
    total_spent: member.total_spent || 0,
    auth_provider: member.auth_provider || 'google',
  };

  return {
    success: true,
    message: 'Đăng nhập Google thành công!',
    token,
    member: cleanMember,
  };
}
