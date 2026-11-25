export interface TurnstileEnv {
  TURNSTILE_SECRET_KEY?: string;
  CF_TURNSTILE_SECRET?: string;
  TURNSTILE_ENABLED?: string;
  ENVIRONMENT?: string;
}

export function isTurnstileCheckEnabled(env: TurnstileEnv): boolean {
  if (env.ENVIRONMENT === 'development' && !(env.TURNSTILE_SECRET_KEY || env.CF_TURNSTILE_SECRET)) {
    return false;
  }
  return true;
}

export async function verifyTurnstileRequest(
  env: TurnstileEnv,
  turnstileToken: unknown,
  clientIp: string,
  corsHeaders: Record<string, string>
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const turnstileSecret = env.TURNSTILE_SECRET_KEY || env.CF_TURNSTILE_SECRET;
  if (!turnstileSecret) {
    if (env.ENVIRONMENT === 'development') {
      console.warn('[Turnstile] Dev mode bypass (ENVIRONMENT === development)');
      return { ok: true };
    }
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          success: false,
          message: 'Xác minh bảo mật chống bot chưa được cấu hình trên máy chủ. Vui lòng liên hệ quản trị viên.',
        }),
        { status: 503, headers: corsHeaders }
      ),
    };
  }

  const cleanToken = typeof turnstileToken === 'string' ? turnstileToken.trim() : '';
  if (!cleanToken) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ success: false, message: 'Yêu cầu mã xác thực chống bot Cloudflare Turnstile.' }),
        { status: 400, headers: corsHeaders }
      ),
    };
  }

  try {
    const formData = new FormData();
    formData.append('secret', turnstileSecret);
    formData.append('response', cleanToken);
    formData.append('remoteip', clientIp);

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const outcome: any = await verifyRes.json();
    if (!outcome.success) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ success: false, message: 'Xác minh bảo mật chống bot thất bại hoặc đã hết hạn.' }),
          { status: 400, headers: corsHeaders }
        ),
      };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('Turnstile verification network error:', err);
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          success: false,
          message: 'Dịch vụ xác thực bảo mật tạm thời không khả dụng, vui lòng thử lại sau.',
        }),
        { status: 503, headers: corsHeaders }
      ),
    };
  }
}
