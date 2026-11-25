import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyAdminAuth } from '../../../services/mission_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  RESEND_API_KEY?: string;
  GHTK_API_TOKEN?: string;
  GHN_API_TOKEN?: string;
  VIETTEL_POST_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  SEPAY_API_KEY?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Admin-Key, X-Api-Key, x-admin-sync-key',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

function maskSecret(str?: string | null): string {
  if (!str) return '';
  const s = String(str).trim();
  if (s.length <= 8) return '••••••••';
  const prefix = s.slice(0, 4);
  const suffix = s.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

function isValidApiKey(str?: string | null): boolean {
  if (!str) return false;
  const s = String(str).trim();
  if (s.length < 16) return false;
  if (s.includes('*') || s.includes('•')) return false;
  const lower = s.toLowerCase();
  if (lower.includes('change_me') || lower.includes('placeholder') || lower.includes('your_') || lower.includes('example')) {
    return false;
  }
  return true;
}

async function readSystemSettingJson(db: D1Database, key: string): Promise<any> {
  try {
    const row = await db.prepare('SELECT value FROM system_settings WHERE key = ? LIMIT 1').bind(key).first<any>();
    if (row?.value) {
      return typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    }
  } catch {}
  return null;
}

/**
 * GET /api/admin/automation/status
 * Lấy trạng thái sức khỏe và cấu hình tổng thể của 6 kênh tích hợp cốt lõi
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const authCheck = await verifyAdminAuth(request, env as any, 'AUTOMATION_CENTER_FULL');
    if (!authCheck.authorized) {
      return new Response(
        JSON.stringify({ success: false, message: authCheck.error || 'Yêu cầu quyền quản trị Automation Center.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);

    // 1. Kiểm tra D1 & KV Storage Engine
    let d1Latency = 0;
    let d1TablesCount = 0;
    let d1Healthy = false;
    try {
      const t0 = Date.now();
      await env.DB.prepare('SELECT 1').first();
      d1Latency = Math.max(1, Date.now() - t0);
      const tablesRes = await env.DB.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").first<any>();
      d1TablesCount = tablesRes?.count || 0;
      d1Healthy = true;
    } catch {
      d1Healthy = false;
    }

    // 2. Kiểm tra SePay Gateway (đọc đúng từ system_settings key 'wcg_admin_sepay_v4')
    const sepayConfig = await readSystemSettingJson(env.DB, 'wcg_admin_sepay_v4');
    const sepayKey = String(sepayConfig?.apiKey || sepayConfig?.api_key || env.SEPAY_API_KEY || '').trim();
    const sepayValidKey = isValidApiKey(sepayKey);
    const sepayConnected = Boolean(sepayValidKey && (sepayConfig?.enabled !== false));

    // 3. Kiểm tra Telegram Bot (đọc đúng từ system_settings key 'telegram_settings_v1')
    const teleConfig = await readSystemSettingJson(env.DB, 'telegram_settings_v1');
    const teleToken = String(teleConfig?.botToken || teleConfig?.bot_token || env.TELEGRAM_BOT_TOKEN || '').trim();
    const teleValidToken = isValidApiKey(teleToken) && teleToken.includes(':');
    const teleConnected = Boolean(teleValidToken && (teleConfig?.enabled !== false));

    // 4. Kiểm tra Resend Email
    const resendKey = String(env.RESEND_API_KEY || '').trim();
    const resendConnected = Boolean(isValidApiKey(resendKey) && resendKey.startsWith('re_'));

    // 5. Kiểm tra Logistics / Hãng Vận Chuyển
    const ghtkToken = String(env.GHTK_API_TOKEN || '').trim();
    const ghnToken = String(env.GHN_API_TOKEN || '').trim();
    const viettelToken = String(env.VIETTEL_POST_TOKEN || '').trim();
    const shippingTokens = [ghtkToken, ghnToken, viettelToken].filter((t) => isValidApiKey(t));
    const shippingConnected = shippingTokens.length > 0;
    const shippingCarriersCount = shippingTokens.length;

    // 6. Kiểm tra Google OAuth2
    const googleClientId = String(env.GOOGLE_CLIENT_ID || '').trim();
    const googleConnected = Boolean(googleClientId && googleClientId.endsWith('.apps.googleusercontent.com') && googleClientId.length >= 20);

    // Lấy trạng thái Bật/Tắt từ bảng admin_settings
    let automationToggles: Record<string, boolean> = {
      sepay: true,
      telegram: true,
      resend: true,
      shipping: true,
      google: true,
      d1: true,
    };
    try {
      const toggleRow = await env.DB.prepare("SELECT value_json FROM admin_settings WHERE key = 'automation_toggles' LIMIT 1").first<any>();
      if (toggleRow?.value_json) {
        automationToggles = { ...automationToggles, ...JSON.parse(toggleRow.value_json) };
      }
    } catch {}

    const services = [
      {
        id: 'sepay',
        name: 'SePay VietQR Gateway',
        category: 'payment',
        enabled: automationToggles.sepay ?? true,
        status: sepayConnected ? 'connected' : (sepayValidKey ? 'configuring' : 'disconnected'),
        maskedKey: sepayValidKey ? maskSecret(sepayKey) : '',
        latencyMs: undefined,
        description: 'Cổng thanh toán tự động VietQR nhận tiền 0 giây và kích hoạt đơn hàng.',
        lastChecked: new Date().toISOString(),
        details: {
          accountNumber: sepayConfig?.accountNumber || sepayConfig?.account_number || '',
          bankName: sepayConfig?.bankName || sepayConfig?.bank_name || '',
          autoFulfill: Boolean(sepayConfig?.autoConfirm ?? sepayConfig?.auto_confirm_order),
        },
      },
      {
        id: 'telegram',
        name: 'Telegram Bot & Channel',
        category: 'alert',
        enabled: automationToggles.telegram ?? true,
        status: teleConnected ? 'connected' : (teleValidToken ? 'configuring' : 'disconnected'),
        maskedKey: teleValidToken ? maskSecret(teleToken) : '',
        latencyMs: undefined,
        description: 'Bắn thông báo đơn mới, báo cáo doanh thu và cảnh báo bảo mật tới Quản trị.',
        lastChecked: new Date().toISOString(),
        details: {
          chatId: teleConfig?.chatId || teleConfig?.adminChatId || teleConfig?.channel_id || '',
          webhookEnabled: Boolean(teleConfig?.webhook_active || teleConfig?.enabled),
        },
      },
      {
        id: 'resend',
        name: 'Resend Email Service',
        category: 'notification',
        enabled: automationToggles.resend ?? true,
        status: resendConnected ? 'connected' : (resendKey ? 'configuring' : 'disconnected'),
        maskedKey: resendConnected ? maskSecret(resendKey) : '',
        latencyMs: undefined,
        description: 'Gửi email mã xác nhận OTP, hóa đơn mua hàng và email thông báo khách.',
        lastChecked: new Date().toISOString(),
        details: {
          provider: 'Resend Cloudflare Integration',
          senderDomain: 'codegame.shop / universal-mall',
        },
      },
      {
        id: 'shipping',
        name: 'Logistics (GHTK / GHN / Viettel Post)',
        category: 'logistics',
        enabled: automationToggles.shipping ?? true,
        status: shippingConnected ? 'connected' : 'disconnected',
        maskedKey: shippingConnected ? maskSecret(shippingTokens[0]) : '',
        latencyMs: undefined,
        description: 'Đồng bộ tính phí vận chuyển tự động và cập nhật trạng thái đơn vật lý.',
        lastChecked: new Date().toISOString(),
        details: {
          activeCarriers: shippingCarriersCount,
          supported: ['GHTK', 'GHN', 'VIETTEL_POST'],
        },
      },
      {
        id: 'google',
        name: 'Google Identity OAuth2',
        category: 'auth',
        enabled: automationToggles.google ?? true,
        status: googleConnected ? 'connected' : (googleClientId ? 'configuring' : 'disconnected'),
        maskedKey: googleConnected ? maskSecret(googleClientId) : '',
        latencyMs: undefined,
        description: 'Đăng nhập và tạo tài khoản 1 chạm cho khách hàng qua Google Account.',
        lastChecked: new Date().toISOString(),
        details: {
          clientIdSet: Boolean(googleClientId),
        },
      },
      {
        id: 'd1',
        name: 'Cloudflare D1 & KV Engine',
        category: 'database',
        enabled: automationToggles.d1 ?? true,
        status: d1Healthy ? 'connected' : 'error',
        latencyMs: d1Healthy ? d1Latency : undefined,
        description: 'Cơ sở dữ liệu Edge phân tán toàn cầu và bộ nhớ cache tốc độ cao.',
        lastChecked: new Date().toISOString(),
        details: {
          tablesCount: d1TablesCount,
          engine: 'Cloudflare D1 SQLite Edge',
          latency: d1Healthy ? `${d1Latency}ms` : 'N/A',
        },
      },
    ];

    const activeCount = services.filter((s) => s.status === 'connected').length;
    const latencies = services.map((s) => s.latencyMs).filter((n): n is number => typeof n === 'number');
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalServices: services.length,
          activeCount,
          averageLatencyMs: avgLatency,
          overallStatus: activeCount >= 4 ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
        },
        services,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err?.message || 'Lỗi kiểm tra trạng thái tự động hóa.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
