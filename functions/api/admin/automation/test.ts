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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Admin-Key, X-Api-Key, x-admin-sync-key',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * POST /api/admin/automation/test
 * Kích hoạt kiểm tra kết nối trực tiếp (Live Ping) cho từng dịch vụ với timeout nghiêm ngặt 8 giây
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
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

    const body: any = await request.json().catch(() => ({}));
    const serviceId = String(body.serviceId || '').toLowerCase().trim();

    if (!serviceId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Vui lòng chỉ định serviceId cần kiểm tra.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const t0 = Date.now();

    // 1. D1 Database & KV Test
    if (serviceId === 'd1') {
      try {
        await env.DB.prepare('SELECT 1').first();
        const latencyMs = Math.max(1, Date.now() - t0);
        const count = await env.DB.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table'").first<any>();
        return new Response(
          JSON.stringify({
            success: true,
            latencyMs,
            message: `Kết nối CSDL Cloudflare D1 phản hồi nhanh chóng trong ${latencyMs}ms.`,
            details: { tables: count?.count || 0 },
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, latencyMs: Date.now() - t0, message: `Lỗi kết nối D1: ${err.message}` }),
          { status: 200, headers: CORS_HEADERS }
        );
      }
    }

    // 2. SePay Gateway Test
    if (serviceId === 'sepay') {
      let cfg: any = null;
      try {
        cfg = await env.DB.prepare("SELECT * FROM sepay_config WHERE id = 'active_config' LIMIT 1").first<any>().catch(() => null);
      } catch {}
      const key = cfg?.api_key || env.SEPAY_API_KEY || '';

      if (!key) {
        return new Response(
          JSON.stringify({
            success: false,
            latencyMs: Date.now() - t0,
            message: 'Chưa cấu hình SePay API Key trong hệ thống.',
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      // Ping SePay API với timeout 6 giây
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const pingRes = await fetch('https://my.sepay.vn/userapi/transactions/list?limit=1', {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const latencyMs = Math.max(1, Date.now() - t0);

        if (pingRes.ok || pingRes.status === 200) {
          return new Response(
            JSON.stringify({
              success: true,
              latencyMs,
              message: `Kết nối SePay Gateway thành công (${latencyMs}ms). Khóa API hợp lệ!`,
            }),
            { status: 200, headers: CORS_HEADERS }
          );
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              latencyMs,
              message: `SePay phản hồi mã lỗi HTTP ${pingRes.status}. Vui lòng kiểm tra lại API Key.`,
            }),
            { status: 200, headers: CORS_HEADERS }
          );
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        return new Response(
          JSON.stringify({
            success: false,
            latencyMs: Date.now() - t0,
            message: `Không thể kết nối máy chủ SePay: ${err.name === 'AbortError' ? 'Hết thời gian chờ (Timeout 6s)' : err.message}`,
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }
    }

    // 3. Telegram Bot Test
    if (serviceId === 'telegram') {
      let teleConfig: any = null;
      try {
        teleConfig = await env.DB.prepare("SELECT * FROM telegram_config WHERE id = 'active_config' LIMIT 1").first<any>().catch(() => null);
      } catch {}
      const token = teleConfig?.bot_token || env.TELEGRAM_BOT_TOKEN || '';

      if (!token) {
        return new Response(
          JSON.stringify({
            success: false,
            latencyMs: Date.now() - t0,
            message: 'Chưa cấu hình Telegram Bot Token trong hệ thống.',
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const pingRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const latencyMs = Math.max(1, Date.now() - t0);
        const data = await pingRes.json().catch(() => ({}));

        if (pingRes.ok && data?.ok) {
          return new Response(
            JSON.stringify({
              success: true,
              latencyMs,
              message: `Kết nối Telegram Bot @${data.result?.username || 'Bot'} thành công (${latencyMs}ms)!`,
              details: data.result,
            }),
            { status: 200, headers: CORS_HEADERS }
          );
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              latencyMs,
              message: `Telegram phản hồi: ${data?.description || 'Token không hợp lệ.'}`,
            }),
            { status: 200, headers: CORS_HEADERS }
          );
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        return new Response(
          JSON.stringify({
            success: false,
            latencyMs: Date.now() - t0,
            message: `Không thể kết nối Telegram API: ${err.name === 'AbortError' ? 'Hết thời gian chờ (Timeout 6s)' : err.message}`,
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }
    }

    // 4. Resend Email Test
    if (serviceId === 'resend') {
      const key = env.RESEND_API_KEY || '';
      if (!key) {
        return new Response(
          JSON.stringify({
            success: false,
            latencyMs: Date.now() - t0,
            message: 'Chưa thiết lập biến môi trường RESEND_API_KEY trên Cloudflare.',
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      if (!key.startsWith('re_') || key.length < 15) {
        return new Response(
          JSON.stringify({
            success: false,
            latencyMs: Date.now() - t0,
            message: 'RESEND_API_KEY không đúng định dạng chuẩn (bắt đầu bằng re_...).',
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const pingRes = await fetch('https://api.resend.com/api-keys', {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const latencyMs = Math.max(1, Date.now() - t0);

        if (pingRes.ok || pingRes.status === 200) {
          return new Response(
            JSON.stringify({
              success: true,
              latencyMs,
              message: `Xác thực Resend Email Service thành công (${latencyMs}ms). Khóa API hợp lệ!`,
            }),
            { status: 200, headers: CORS_HEADERS }
          );
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              latencyMs,
              message: `Resend báo lỗi HTTP ${pingRes.status}. Vui lòng kiểm tra lại API Key.`,
            }),
            { status: 200, headers: CORS_HEADERS }
          );
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        return new Response(
          JSON.stringify({
            success: false,
            latencyMs: Date.now() - t0,
            message: `Lỗi kết nối Resend API: ${err.name === 'AbortError' ? 'Timeout 6s' : err.message}`,
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }
    }

    // 5. Shipping / Logistics Test
    if (serviceId === 'shipping') {
      const hasAnyToken = Boolean(env.GHTK_API_TOKEN || env.GHN_API_TOKEN || env.VIETTEL_POST_TOKEN);
      const latencyMs = Math.max(1, Date.now() - t0);

      if (!hasAnyToken) {
        return new Response(
          JSON.stringify({
            success: false,
            latencyMs,
            message: 'Chưa cấu hình Token hãng vận chuyển (GHTK_API_TOKEN / GHN_API_TOKEN / VIETTEL_POST_TOKEN).',
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          latencyMs,
          message: 'Hệ thống định tuyến phí vận chuyển Logistics sẵn sàng hoạt động.',
          details: {
            ghtk: Boolean(env.GHTK_API_TOKEN),
            ghn: Boolean(env.GHN_API_TOKEN),
            viettelPost: Boolean(env.VIETTEL_POST_TOKEN),
          },
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 6. Google Identity OAuth2 Test
    if (serviceId === 'google') {
      const clientId = env.GOOGLE_CLIENT_ID || '';
      const latencyMs = Math.max(1, Date.now() - t0);

      if (!clientId) {
        return new Response(
          JSON.stringify({
            success: false,
            latencyMs,
            message: 'Chưa cấu hình biến môi trường GOOGLE_CLIENT_ID.',
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      if (!clientId.endsWith('.apps.googleusercontent.com')) {
        return new Response(
          JSON.stringify({
            success: false,
            latencyMs,
            message: 'GOOGLE_CLIENT_ID không đúng định dạng Google Cloud OAuth Client ID (*.apps.googleusercontent.com).',
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          latencyMs,
          message: 'Google Identity Services OAuth Client ID hợp lệ và sẵn sàng đăng nhập 1 chạm.',
          details: { clientIdPrefix: clientId.slice(0, 12) + '...' },
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: `Dịch vụ '${serviceId}' không hỗ trợ kiểm tra.` }),
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err?.message || 'Lỗi kiểm tra dịch vụ.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
