import { authenticateAdmin } from '../../services/auth_service';
import { DEFAULT_EMAIL_CONFIG, EmailProviderConfig } from './_emailHelper';

interface Env {
  DB?: any;
  ADMIN_SYNC_SECRET?: string;
  JWT_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Requested-With',
};

async function isAuthorizedAdmin(request: Request, env: Env): Promise<{ authorized: boolean; adminId?: string }> {
  const configuredSecret = (env.ADMIN_SYNC_SECRET || '').trim();
  const authHeader = request.headers.get('Authorization') || '';
  const syncKeyHeader = request.headers.get('X-Sync-Key') || '';

  if (configuredSecret && configuredSecret.length >= 16) {
    if (syncKeyHeader && syncKeyHeader === configuredSecret) return { authorized: true, adminId: 'admin_sync' };
    if (authHeader.startsWith('Bearer ') && authHeader.replace('Bearer ', '').trim() === configuredSecret) {
      return { authorized: true, adminId: 'admin_sync' };
    }
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token && env.DB) {
    const adminAuth = await authenticateAdmin(env.DB, token, {
      JWT_SECRET: env.JWT_SECRET,
      ADMIN_SYNC_SECRET: env.ADMIN_SYNC_SECRET,
    });
    if (adminAuth.authenticated) {
      return { authorized: true, adminId: adminAuth.adminId || 'admin' };
    }
  }

  return { authorized: false };
}

export const onRequestOptions = async () => new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * Lấy cấu hình email provider (secrets are masked)
 */
export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;

  const auth = await isAuthorizedAdmin(request, env);
  if (!auth.authorized) {
    return new Response(
      JSON.stringify({ success: false, message: 'Yêu cầu quyền quản trị viên.' }),
      { status: 401, headers: CORS_HEADERS }
    );
  }

  if (env.DB) {
    try {
      const row: any = await env.DB.prepare(
        'SELECT value FROM system_settings WHERE key = ? LIMIT 1'
      ).bind('wcg_email_provider_config_v1').first().catch(() => null);

      let config = DEFAULT_EMAIL_CONFIG;
      if (row && row.value) {
        try { config = { ...DEFAULT_EMAIL_CONFIG, ...JSON.parse(row.value) }; } catch {}
      }

      const rawApiKey = String(config.apiKey || '').trim();
      const maskedConfig = {
        ...config,
        apiKey: rawApiKey ? (rawApiKey.length > 8 ? `${rawApiKey.substring(0, 4)}••••${rawApiKey.substring(rawApiKey.length - 4)}` : '••••••••') : '',
        isConfigured: Boolean(rawApiKey),
      };

      return new Response(
        JSON.stringify({ success: true, config: maskedConfig }),
        { headers: CORS_HEADERS }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || 'Lỗi đọc cấu hình' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }
  }

  return new Response(
    JSON.stringify({ success: false, message: 'D1 database không khả dụng.' }),
    { status: 500, headers: CORS_HEADERS }
  );
};

/**
 * Lưu cấu hình email provider
 */
export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;

  const auth = await isAuthorizedAdmin(request, env);
  if (!auth.authorized) {
    return new Response(
      JSON.stringify({ success: false, message: 'Yêu cầu quyền quản trị viên.' }),
      { status: 401, headers: CORS_HEADERS }
    );
  }

  try {
    const body: any = await request.json().catch(() => ({}));

    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 database không khả dụng.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const row: any = await env.DB.prepare(
      'SELECT value FROM system_settings WHERE key = ? LIMIT 1'
    ).bind('wcg_email_provider_config_v1').first().catch(() => null);

    let existingConfig: EmailProviderConfig = DEFAULT_EMAIL_CONFIG;
    if (row && row.value) {
      try { existingConfig = { ...DEFAULT_EMAIL_CONFIG, ...JSON.parse(row.value) }; } catch {}
    }

    let finalApiKey = String(body.apiKey || '').trim();
    if (!finalApiKey || finalApiKey.includes('••••')) {
      finalApiKey = existingConfig.apiKey || '';
    }

    const newConfig: EmailProviderConfig = {
      provider: body.provider === 'brevo' ? 'brevo' : 'resend',
      apiKey: finalApiKey,
      senderEmail: String(body.senderEmail || 'notifications@codegame.shop').trim(),
      senderName: String(body.senderName || 'CodeGame.shop - Thông Báo Sự Kiện & Code Game').trim(),
      isEnabled: Boolean(body.isEnabled),
    };

    await env.DB.prepare(`
      INSERT INTO system_settings (key, value, updated_at) 
      VALUES ('wcg_email_provider_config_v1', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(JSON.stringify(newConfig), new Date().toISOString()).run();

    const maskedConfig = {
      ...newConfig,
      apiKey: finalApiKey ? (finalApiKey.length > 8 ? `${finalApiKey.substring(0, 4)}••••${finalApiKey.substring(finalApiKey.length - 4)}` : '••••••••') : '',
      isConfigured: Boolean(finalApiKey),
    };

    return new Response(
      JSON.stringify({ success: true, message: 'Đã lưu cấu hình email thành công!', config: maskedConfig }),
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err?.message || 'Lỗi lưu cấu hình email' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
