import { ensureSchemaUpgrades, getSettingD1 } from '../../services/d1_service';
import { verifyToken, hashOtp } from '../../services/auth_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
  SENDGRID_API_KEY?: string;
  EMAIL_FROM?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

async function sendVerificationEmail(options: {
  toEmail: string;
  displayName: string;
  code: string;
  env: Env;
  emailConfig?: any;
}): Promise<{ success: boolean; provider?: string }> {
  const { toEmail, displayName, code, env, emailConfig } = options;

  const resendKey = env.RESEND_API_KEY || emailConfig?.resendApiKey || emailConfig?.apiKey || '';
  const brevoKey = env.BREVO_API_KEY || emailConfig?.brevoApiKey || '';
  const sendgridKey = env.SENDGRID_API_KEY || emailConfig?.sendgridApiKey || '';
  const fromEmail = env.EMAIL_FROM || emailConfig?.fromEmail || 'no-reply@webcodegame.vn';
  const fromName = 'Universal Mall Security';

  const subject = `[Universal Mall] Mã xác minh email của bạn: ${code}`;
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0f19; color: #f1f5f9;">
      <div style="max-width: 520px; margin: 0 auto; background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 24px; text-align: center;">
          <h1 style="margin: 0; color: #ffffff; font-size: 20px;">Universal Mall</h1>
          <p style="margin: 6px 0 0 0; color: #e0e7ff; font-size: 13px;">Xác Minh Địa Chỉ Email</p>
        </div>
        <div style="padding: 28px 24px;">
          <p style="margin: 0 0 16px 0; font-size: 14px; color: #cbd5e1;">Xin chào <strong>${displayName || 'bạn'}</strong>,</p>
          <p style="margin: 0 0 20px 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
            Bạn vừa yêu cầu xác minh địa chỉ email trên hệ thống <strong>Universal Mall</strong>. Vui lòng nhập mã OTP bên dưới để xác nhận quyền sở hữu email:
          </p>
          <div style="background: #0f172a; border: 2px dashed #38bdf8; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0;">
            <span style="display: block; font-size: 12px; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px;">Mã xác minh OTP:</span>
            <span style="font-family: monospace; font-size: 32px; font-weight: 800; color: #38bdf8; letter-spacing: 6px;">${code}</span>
            <span style="display: block; font-size: 12px; color: #f59e0b; margin-top: 6px;">⏱️ Có hiệu lực trong vòng 10 phút</span>
          </div>
          <p style="margin: 0; font-size: 12px; color: #ef4444;">
            ⚠️ Tuyệt đối không chia sẻ mã này cho bất kỳ ai. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua thư.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail.includes('@') ? fromEmail : 'onboarding@resend.dev'}>`,
          to: [toEmail],
          subject,
          html: htmlContent,
        }),
      });
      if (res.ok) return { success: true, provider: 'Resend' };
    } catch {}
  }

  if (brevoKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: toEmail, name: displayName }],
          subject,
          htmlContent,
        }),
      });
      if (res.ok) return { success: true, provider: 'Brevo' };
    } catch {}
  }

  if (sendgridKey) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: toEmail, name: displayName }] }],
          from: { email: fromEmail, name: fromName },
          subject,
          content: [{ type: 'text/html', value: htmlContent }],
        }),
      });
      if (res.ok) return { success: true, provider: 'SendGrid' };
    } catch {}
  }

  return { success: false };
}

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

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, message: 'Yêu cầu đăng nhập để xác minh email.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // Strict authentication: verified cryptographic token or exact session_token in D1
    const { valid, userId: tokenUserId } = await verifyToken(token, [env.JWT_SECRET]);

    let member: any = await env.DB.prepare(
      'SELECT * FROM members WHERE session_token = ? LIMIT 1'
    ).bind(token).first<any>();

    if (!member && valid && tokenUserId) {
      member = await env.DB.prepare(
        'SELECT * FROM members WHERE id = ? OR username = ? OR email = ? LIMIT 1'
      ).bind(tokenUserId, tokenUserId, tokenUserId).first<any>();
    }

    if (!member) {
      return new Response(
        JSON.stringify({ success: false, message: 'Phiên đăng nhập không tồn tại hoặc đã hết hạn.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    if (member.status === 'BANNED') {
      return new Response(
        JSON.stringify({ success: false, message: 'Tài khoản của bạn đã bị khóa.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const email = String(member.email || '').trim();
    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ success: false, message: 'Tài khoản chưa có địa chỉ email hợp lệ để xác minh.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const action = String(body.action || '').trim().toLowerCase();
    const inputCode = String(body.code || '').trim();

    // Action 1: Send OTP verification code
    if (action === 'send_code' || action === 'send_otp' || action === 'request_code') {
      // Cooldown check (60s)
      if (member.email_verify_expires_at) {
        const remainingMs = Number(member.email_verify_expires_at) - Date.now();
        // If issued less than 60s ago (10m - 60s = 9m = 540000ms remaining)
        if (remainingMs > 9 * 60 * 1000) {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Vui lòng chờ 60 giây trước khi yêu cầu gửi lại mã xác minh mới.',
            }),
            { status: 429, headers: CORS_HEADERS }
          );
        }
      }

      if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'WebCrypto không khả dụng để tạo mã OTP xác minh an toàn.',
          }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
      const otpArray = new Uint32Array(1);
      crypto.getRandomValues(otpArray);
      const otpCode = String(100000 + (otpArray[0] % 900000));
      const codeHash = await hashOtp(otpCode, 'email_verify_' + (member.salt || 'wcg_email_salt'));
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      await env.DB.prepare(`
        UPDATE members
        SET email_verify_code_hash = ?,
            email_verify_expires_at = ?,
            email_verify_attempts = 0
        WHERE id = ?
      `).bind(codeHash, expiresAt, member.id).run();

      const emailConfig = await getSettingD1(env.DB, 'wcg_email_service_config').catch(() => null);
      const emailRes = await sendVerificationEmail({
        toEmail: email,
        displayName: member.display_name || member.username,
        code: otpCode,
        env,
        emailConfig,
      });

      const maskedEmail = email.replace(/^(.{2})(.*)(@.*)$/, (_, start, mid, end) => `${start}${'*'.repeat(Math.max(1, mid.length))}${end}`);

      if (emailRes.success) {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Mã xác minh đã được gửi đến email ${maskedEmail}. Vui lòng kiểm tra hộp thư đến (hoặc thư rác).`,
            emailSent: true,
            maskedEmail,
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Hệ thống gửi thư tự động đang bận hoặc chưa cấu hình API gửi email. Vui lòng liên hệ hỗ trợ.',
            emailSent: false,
            maskedEmail,
          }),
          { status: 503, headers: CORS_HEADERS }
        );
      }
    }

    // Action 2: Verify code
    if (inputCode) {
      const currentAttempts = (Number(member.email_verify_attempts) || 0) + 1;
      if (currentAttempts > 5) {
        await env.DB.prepare(`
          UPDATE members
          SET email_verify_code_hash = NULL, email_verify_expires_at = NULL, email_verify_attempts = 0
          WHERE id = ?
        `).bind(member.id).run();

        return new Response(
          JSON.stringify({
            success: false,
            message: 'Bạn đã nhập sai mã xác minh quá 5 lần. Mã đã bị hủy. Vui lòng yêu cầu mã mới.',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const isExpired = !member.email_verify_expires_at || Date.now() > Number(member.email_verify_expires_at);
      const computedHash = await hashOtp(inputCode, 'email_verify_' + (member.salt || 'wcg_email_salt'));
      const isInvalid = !member.email_verify_code_hash || computedHash !== member.email_verify_code_hash;

      if (isExpired || isInvalid) {
        await env.DB.prepare('UPDATE members SET email_verify_attempts = ? WHERE id = ?')
          .bind(currentAttempts, member.id)
          .run();

        return new Response(
          JSON.stringify({
            success: false,
            message: isExpired
              ? 'Mã xác minh đã hết hạn. Vui lòng yêu cầu mã mới.'
              : `Mã xác minh không chính xác (Lần thử ${currentAttempts}/5).`,
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const nowIso = new Date().toISOString();

      await env.DB.prepare(`
        UPDATE members
        SET email_verified = 1,
            email_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            email_verify_code_hash = NULL,
            email_verify_expires_at = NULL,
            email_verify_attempts = 0,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).bind(member.id).run();

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Xác minh email thành công! Tài khoản đã mở khóa Ưu Đãi Mua Lần Đầu 2.000 Core.',
          email_verified: true,
          email_verified_at: nowIso,
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // If neither action: reject
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Yêu cầu không hợp lệ. Vui lòng cung cấp mã xác minh (code) hoặc yêu cầu gửi mã mới (action: "send_code").',
      }),
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: 'Lỗi xác minh email: ' + (err?.message || 'Không xác định') }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
