import { ensureSchemaUpgrades, getSettingD1 } from '../../services/d1_service';
import { hashOtp, hashPasswordPBKDF2, computeHash } from '../../services/auth_service';
import { getBrandIdentity, DEFAULT_BRAND_IDENTITY } from '../../services/brand_service';

interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
  SENDGRID_API_KEY?: string;
  BREVO_API_KEY?: string;
  EMAIL_FROM?: string;
  PASSWORD_PEPPER?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface SendEmailOptions {
  toEmail: string;
  displayName: string;
  otpCode: string;
  env: Env;
  emailConfig?: any;
  brandName?: string;
  copyrightHolder?: string;
}

async function sendOtpEmail(options: SendEmailOptions): Promise<{ success: boolean; provider?: string; error?: string }> {
  const { toEmail, displayName, otpCode, env, emailConfig } = options;
  const brandName = options.brandName || DEFAULT_BRAND_IDENTITY.brandName;
  const copyrightHolder = options.copyrightHolder || brandName;

  const resendKey = env.RESEND_API_KEY || emailConfig?.resendApiKey || emailConfig?.apiKey || '';
  const brevoKey = env.BREVO_API_KEY || emailConfig?.brevoApiKey || '';
  const sendgridKey = env.SENDGRID_API_KEY || emailConfig?.sendgridApiKey || '';
  const fromEmail = env.EMAIL_FROM || emailConfig?.fromEmail || 'no-reply@webcodegame.vn';
  const fromName = `${brandName} Security`;

  const subject = `[${brandName}] Mã OTP xác nhận khôi phục mật khẩu: ${otpCode}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9;">
      <div style="max-width: 520px; margin: 0 auto; background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 28px 24px; text-align: center;">
          <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">${brandName}</h1>
          <p style="margin: 6px 0 0 0; color: #e0e7ff; font-size: 13px;">Hệ Thống Xác Thực & Khôi Phục Tài Khoản</p>
        </div>
        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #cbd5e1;">Xin chào <strong>${displayName || 'bạn'}</strong>,</p>
          <p style="margin: 0 0 24px 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
            Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản liên kết với địa chỉ email này trên hệ thống <strong>${brandName}</strong>.
          </p>
          <div style="background: #0f172a; border: 2px dashed #6366f1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="display: block; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Mã xác thực OTP của bạn là:</span>
            <span style="font-family: monospace; font-size: 32px; font-weight: 800; color: #38bdf8; letter-spacing: 6px;">${otpCode}</span>
            <span style="display: block; font-size: 12px; color: #f59e0b; margin-top: 8px;">⏱️ Có hiệu lực trong vòng 10 phút</span>
          </div>
          <p style="margin: 0 0 16px 0; font-size: 13px; color: #94a3b8; line-height: 1.6;">
            Vui lòng nhập mã này vào trang web để hoàn tất quá trình thiết lập mật khẩu mới.
          </p>
          <div style="border-top: 1px solid #1e293b; padding-top: 16px; margin-top: 24px;">
            <p style="margin: 0; font-size: 12px; color: #ef4444; line-height: 1.5;">
              ⚠️ <strong>Lưu ý bảo mật:</strong> Tuyệt đối không chia sẻ mã OTP này cho bất kỳ ai, kể cả nhân viên quản trị website. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.
            </p>
          </div>
        </div>
        <div style="background: #090d16; padding: 16px 24px; text-align: center; border-top: 1px solid #1e293b;">
          <p style="margin: 0; font-size: 11px; color: #64748b;">© 2026 ${copyrightHolder}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // 1. Try Resend API
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail.includes('@') ? fromEmail : 'onboarding@resend.dev'}>`,
          to: [toEmail],
          subject,
          html: htmlContent,
        }),
      });
      if (res.ok) {
        return { success: true, provider: 'Resend' };
      }
    } catch (e: any) {
      console.warn('[Email] Resend error:', e?.message);
    }
  }

  // 2. Try Brevo API
  if (brevoKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: toEmail, name: displayName }],
          subject,
          htmlContent,
        }),
      });
      if (res.ok) {
        return { success: true, provider: 'Brevo' };
      }
    } catch (e: any) {
      console.warn('[Email] Brevo error:', e?.message);
    }
  }

  // 3. Try SendGrid API
  if (sendgridKey) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: toEmail, name: displayName }] }],
          from: { email: fromEmail, name: fromName },
          subject,
          content: [{ type: 'text/html', value: htmlContent }],
        }),
      });
      if (res.ok || res.status === 202) {
        return { success: true, provider: 'SendGrid' };
      }
    } catch (e: any) {
      console.warn('[Email] SendGrid error:', e?.message);
    }
  }

  // 4. Try Cloudflare Native MailChannels
  try {
    const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail, name: displayName }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: htmlContent }],
      }),
    });
    if (res.ok || res.status === 202) {
      return { success: true, provider: 'MailChannels' };
    }
  } catch (e: any) {
    console.warn('[Email] MailChannels error:', e?.message);
  }

  return { success: false, error: 'No active email provider succeeded' };
}

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
    const { action, identifier, otpCode, newPassword, newPasswordHash, salt } = body;

    const cleanIdentifier = String(identifier || '').trim().toLowerCase();
    if (!cleanIdentifier) {
      return new Response(
        JSON.stringify({ success: false, message: 'Vui lòng nhập tên đăng nhập hoặc email.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const member = await env.DB.prepare(`
      SELECT * FROM members
      WHERE LOWER(username) = ? OR LOWER(display_name) = ? OR LOWER(email) = ? OR id = ?
      LIMIT 1
    `).bind(cleanIdentifier, cleanIdentifier, cleanIdentifier, cleanIdentifier).first<any>();

    if (!member) {
      return new Response(
        JSON.stringify({ success: false, message: 'Không tìm thấy tài khoản phù hợp với thông tin đã nhập.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const emailConfig = await getSettingD1(env.DB, 'wcg_admin_email_config_v4').catch(() => null);
    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
    const nowMs = Date.now();

    // Step 1: Request OTP Code
    if (action === 'request_otp') {
      const accountKey = `acct:${member.id}`;
      let otpRateLimit: any = null;
      let accountOtpRateLimit: any = null;

      try {
        otpRateLimit = await env.DB.prepare(
          'SELECT attempts, locked_until, last_attempt FROM ip_rate_limits WHERE ip_address = ? AND action_type = ?'
        ).bind(clientIp, 'REQUEST_OTP').first<any>();

        accountOtpRateLimit = await env.DB.prepare(
          'SELECT attempts, locked_until, last_attempt FROM ip_rate_limits WHERE ip_address = ? AND action_type = ?'
        ).bind(accountKey, 'REQUEST_OTP_ACCOUNT').first<any>();
      } catch (rateLimitReadErr) {
        console.error('[RateLimit Read Error]', rateLimitReadErr);
        return new Response(
          JSON.stringify({ success: false, message: 'Lỗi hệ thống kiểm tra giới hạn yêu cầu. Vui lòng thử lại sau.' }),
          { status: 503, headers: CORS_HEADERS }
        );
      }

      if (otpRateLimit && Number(otpRateLimit.locked_until) > nowMs) {
        const remainingMin = Math.max(1, Math.ceil((Number(otpRateLimit.locked_until) - nowMs) / 60000));
        return new Response(
          JSON.stringify({
            success: false,
            message: `Bạn đã yêu cầu gửi mã OTP quá nhiều lần từ IP này. Vui lòng thử lại sau ${remainingMin} phút.`,
            remainingMinutes: remainingMin,
          }),
          { status: 429, headers: CORS_HEADERS }
        );
      }

      if (accountOtpRateLimit && Number(accountOtpRateLimit.locked_until) > nowMs) {
        const remainingMin = Math.max(1, Math.ceil((Number(accountOtpRateLimit.locked_until) - nowMs) / 60000));
        return new Response(
          JSON.stringify({
            success: false,
            message: `Tài khoản này đã yêu cầu gửi mã OTP quá 5 lần trong 1 giờ. Vui lòng thử lại sau ${remainingMin} phút.`,
            remainingMinutes: remainingMin,
          }),
          { status: 429, headers: CORS_HEADERS }
        );
      }

      // Reset attempt counters if window has elapsed or previous lockout has expired
      const ipWindowMs = 15 * 60 * 1000;
      const isIpLockExpired = otpRateLimit?.locked_until && Number(otpRateLimit.locked_until) > 0 && nowMs >= Number(otpRateLimit.locked_until);
      const isIpWindowExpired = isIpLockExpired || !otpRateLimit?.last_attempt || (nowMs - Number(otpRateLimit.last_attempt) > ipWindowMs);
      const currentOtpAttempts = isIpWindowExpired ? 1 : ((Number(otpRateLimit?.attempts) || 0) + 1);
      const isLocked = currentOtpAttempts >= 3;
      const lockedUntil = isLocked ? nowMs + ipWindowMs : 0;

      const accountWindowMs = 60 * 60 * 1000;
      const isAccountLockExpired = accountOtpRateLimit?.locked_until && Number(accountOtpRateLimit.locked_until) > 0 && nowMs >= Number(accountOtpRateLimit.locked_until);
      const isAccountWindowExpired = isAccountLockExpired || !accountOtpRateLimit?.last_attempt || (nowMs - Number(accountOtpRateLimit.last_attempt) > accountWindowMs);
      const currentAccountAttempts = isAccountWindowExpired ? 1 : ((Number(accountOtpRateLimit?.attempts) || 0) + 1);
      const isAccountLocked = currentAccountAttempts >= 5;
      const accountLockedUntil = isAccountLocked ? nowMs + accountWindowMs : 0; // 1 hour lockout

      // Fail-closed on rate limit recording errors
      try {
        await env.DB.prepare(`
          INSERT INTO ip_rate_limits (ip_address, action_type, attempts, locked_until, last_attempt)
          VALUES (?, 'REQUEST_OTP', ?, ?, ?)
          ON CONFLICT(ip_address, action_type) DO UPDATE SET
            attempts = excluded.attempts,
            locked_until = excluded.locked_until,
            last_attempt = excluded.last_attempt
        `).bind(clientIp, currentOtpAttempts, lockedUntil, nowMs).run();

        await env.DB.prepare(`
          INSERT INTO ip_rate_limits (ip_address, action_type, attempts, locked_until, last_attempt)
          VALUES (?, 'REQUEST_OTP_ACCOUNT', ?, ?, ?)
          ON CONFLICT(ip_address, action_type) DO UPDATE SET
            attempts = excluded.attempts,
            locked_until = excluded.locked_until,
            last_attempt = excluded.last_attempt
        `).bind(accountKey, currentAccountAttempts, accountLockedUntil, nowMs).run();
      } catch (rateLimitErr) {
        console.error('[RateLimit D1 Error]', rateLimitErr);
        return new Response(
          JSON.stringify({ success: false, message: 'Lỗi hệ thống giới hạn tần suất yêu cầu. Vui lòng thử lại sau.' }),
          { status: 500, headers: CORS_HEADERS }
        );
      }

      let generatedOtp: string;
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const otpArray = new Uint32Array(1);
        crypto.getRandomValues(otpArray);
        generatedOtp = String(100000 + (otpArray[0] % 900000));
      } else {
        return new Response(
          JSON.stringify({ success: false, message: 'WebCrypto không khả dụng để tạo mã OTP an toàn.' }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 mins
      const otpHashVal = await hashOtp(generatedOtp, member.salt || 'wcg_otp_salt');

      // Never store plaintext OTP; store only the cryptographic hash
      await env.DB.prepare(`
        UPDATE members
        SET recovery_otp = NULL,
            recovery_otp_hash = ?,
            otp_expires_at = ?,
            otp_attempts = 0
        WHERE id = ?
      `).bind(otpHashVal, expiresAt, member.id).run();

      // Log OTP request into security_logs
      const randBytes = new Uint8Array(4);
      if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
        throw new Error('WebCrypto API (crypto.getRandomValues) is required to generate secure log ID. Failing closed.');
      }
      crypto.getRandomValues(randBytes);
      const randSuffix = Array.from(randBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const logId = `sec_${Date.now()}_${randSuffix}`;
      await env.DB.prepare(`
        INSERT INTO security_logs (id, actor_name, actor_email, action, target_id, ip_address, severity, details, created_at)
        VALUES (?, ?, ?, 'REQUEST_PASSWORD_OTP', ?, ?, 'INFO', ?, datetime('now'))
      `).bind(
        logId,
        member.display_name || member.username,
        member.email,
        member.id,
        request.headers.get('cf-connecting-ip') || '127.0.0.1',
        JSON.stringify({ email: member.email })
      ).run().catch(() => {});

      // Mask email for user privacy
      const emailParts = (member.email || '').split('@');
      const namePart = emailParts[0] || '';
      const domainPart = emailParts[1] || '';
      const maskedEmail = namePart.length > 2
        ? `${namePart.slice(0, 2)}****@${domainPart}`
        : `${namePart}****@${domainPart}`;

      // Dispatch Email via integrated provider
      const brand = await getBrandIdentity(env.DB);
      const emailResult = await sendOtpEmail({
        toEmail: member.email,
        displayName: member.display_name || member.username,
        otpCode: generatedOtp,
        env,
        emailConfig,
        brandName: brand.brandName,
        copyrightHolder: brand.copyrightHolder,
      });

      if (emailResult.success) {
        return new Response(
          JSON.stringify({
            success: true,
            emailSent: true,
            provider: emailResult.provider,
            message: `Mã xác minh OTP đã được gửi đến email ${maskedEmail}. Vui lòng kiểm tra hộp thư đến (hoặc thư rác).`,
            maskedEmail,
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            emailSent: false,
            message: 'Hệ thống gửi thư tự động đang bảo trì hoặc chưa cấu hình API gửi email. Vui lòng liên hệ Quản trị viên để được hỗ trợ.',
            maskedEmail,
          }),
          { status: 503, headers: CORS_HEADERS }
        );
      }
    }

    // Step 2: Verify OTP and Set New Password
    if (action === 'reset_password') {
      const inputOtp = String(otpCode || '').trim();
      if (!inputOtp) {
        return new Response(
          JSON.stringify({ success: false, message: 'Vui lòng nhập mã xác minh OTP.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const currentAttempts = (Number(member.otp_attempts) || 0) + 1;
      if (currentAttempts > 5) {
        await env.DB.prepare(`
          UPDATE members
          SET recovery_otp = NULL, recovery_otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0
          WHERE id = ?
        `).bind(member.id).run();

        return new Response(
          JSON.stringify({
            success: false,
            message: 'Bạn đã nhập sai mã OTP quá 5 lần. Mã xác thực đã bị vô hiệu hóa vì lý do bảo mật. Vui lòng gửi yêu cầu mã mới.',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const isOtpExpired = !member.otp_expires_at || Date.now() > Number(member.otp_expires_at);
      const computedInputHash = await hashOtp(inputOtp, member.salt || 'wcg_otp_salt');
      const isOtpInvalid = !member.recovery_otp_hash || computedInputHash !== member.recovery_otp_hash;

      if (isOtpExpired || isOtpInvalid) {
        await env.DB.prepare('UPDATE members SET otp_attempts = ? WHERE id = ?')
          .bind(currentAttempts, member.id)
          .run();

        return new Response(
          JSON.stringify({
            success: false,
            message: isOtpExpired
              ? 'Mã xác minh OTP đã hết hạn (quá 10 phút). Vui lòng yêu cầu mã mới.'
              : `Mã xác minh OTP không chính xác (Lần thử ${currentAttempts}/5).`,
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      // Reject client-provided hashes to prevent arbitrary hash injection
      if (newPasswordHash || salt) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Yêu cầu không hợp lệ: Không chấp nhận hash mật khẩu từ máy khách. Mật khẩu thô phải được gửi qua HTTPS và băm bảo mật trên máy chủ.',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return new Response(
          JSON.stringify({ success: false, message: 'Mật khẩu mới phải có độ dài tối thiểu 8 ký tự.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const pepper = (env.PASSWORD_PEPPER || '').trim();
      if (!pepper || pepper.length < 8) {
        return new Response(
          JSON.stringify({ success: false, message: 'Hệ thống bảo mật chưa sẵn sàng (Thiếu pepper cấu hình). Vui lòng liên hệ quản trị viên.' }),
          { status: 500, headers: CORS_HEADERS }
        );
      }

      if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
        return new Response(
          JSON.stringify({ success: false, message: 'WebCrypto không khả dụng để sinh salt an toàn.' }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
      const saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);
      const finalSalt = 'wcg_salt_' + Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const finalPasswordHash = await hashPasswordPBKDF2(newPassword, finalSalt, pepper);

      await env.DB.prepare(`
        UPDATE members
        SET password_hash = ?,
            salt = ?,
            session_token = NULL,
            recovery_otp = NULL,
            recovery_otp_hash = NULL,
            otp_expires_at = NULL,
            otp_attempts = 0
        WHERE id = ?
      `).bind(finalPasswordHash, finalSalt, member.id).run();

      const randBytes2 = new Uint8Array(4);
      if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
        throw new Error('WebCrypto API (crypto.getRandomValues) is required to generate secure log ID. Failing closed.');
      }
      crypto.getRandomValues(randBytes2);
      const randSuffix2 = Array.from(randBytes2).map(b => b.toString(16).padStart(2, '0')).join('');
      const logId = `sec_${Date.now()}_${randSuffix2}`;
      await env.DB.prepare(`
        INSERT INTO security_logs (id, actor_name, actor_email, action, target_id, ip_address, severity, details, created_at)
        VALUES (?, ?, ?, 'RESET_PASSWORD_SUCCESS', ?, ?, 'WARN', ?, datetime('now'))
      `).bind(
        logId,
        member.display_name || member.username,
        member.email,
        member.id,
        request.headers.get('cf-connecting-ip') || '127.0.0.1',
        JSON.stringify({ email: member.email })
      ).run().catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới ngay bây giờ.',
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: 'Hành động không hợp lệ.' }),
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: 'Lỗi xử lý khôi phục mật khẩu trên Edge.', error: String(err) }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
