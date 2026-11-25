import { ensureSchemaUpgrades } from '../../../services/d1_service';
import { verifyAdminAuth } from '../../../services/mission_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Admin-Key, X-Api-Key, x-admin-sync-key',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET /api/admin/automation/config: Lấy cài đặt bật/tắt của các dịch vụ tự động hóa
 * POST / PUT /api/admin/automation/config: Bật/tắt hoặc cập nhật cấu hình dịch vụ
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const reqStart = Date.now();
  const { request, env } = context;
  const colo = String((request as any).cf?.colo || 'unknown');

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, message: 'D1 Database chưa cấu hình.' }), { status: 500, headers: CORS_HEADERS });
    }

    const authStart = Date.now();
    const authCheck = await verifyAdminAuth(request, env as any, 'AUTOMATION_CENTER_FULL');
    const authMs = Date.now() - authStart;
    if (!authCheck.authorized) {
      const totalMs = Date.now() - reqStart;
      return new Response(JSON.stringify({ success: false, message: authCheck.error || 'Yêu cầu quyền quản trị.' }), {
        status: 401,
        headers: {
          ...CORS_HEADERS,
          'X-Timing-D1-Ms': String(authMs),
          'X-Timing-Total-Ms': String(totalMs),
          'Server-Timing': `auth;dur=${authMs},d1_total;dur=${authMs},total;dur=${totalMs};desc="colo=${colo}"`,
        },
      });
    }

    const schemaStart = Date.now();
    await ensureSchemaUpgrades(env.DB);
    const schemaMs = Date.now() - schemaStart;

    let toggles = {
      sepay: true,
      telegram: true,
      resend: true,
      shipping: true,
      google: true,
      d1: true,
    };

    const settingsStart = Date.now();
    const row = await env.DB.prepare("SELECT value_json FROM admin_settings WHERE key = 'automation_toggles' LIMIT 1").first<any>().catch(() => null);
    const settingsMs = Date.now() - settingsStart;
    if (row?.value_json) {
      try {
        toggles = { ...toggles, ...JSON.parse(row.value_json) };
      } catch {}
    }

    const d1TotalMs = authMs + schemaMs + settingsMs;
    const totalMs = Date.now() - reqStart;

    return new Response(JSON.stringify({ success: true, toggles }), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'X-Timing-D1-Ms': String(d1TotalMs),
        'X-Timing-Total-Ms': String(totalMs),
        'Server-Timing': `auth;dur=${authMs},schema;dur=${schemaMs},settings;dur=${settingsMs},d1_total;dur=${d1TotalMs},total;dur=${totalMs};desc="colo=${colo}"`,
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi đọc cấu hình.' }), { status: 500, headers: CORS_HEADERS });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, message: 'D1 Database chưa cấu hình.' }), { status: 500, headers: CORS_HEADERS });
    }

    const authCheck = await verifyAdminAuth(request, env as any, 'AUTOMATION_CENTER_FULL');
    if (!authCheck.authorized) {
      return new Response(JSON.stringify({ success: false, message: authCheck.error || 'Yêu cầu quyền quản trị.' }), { status: 401, headers: CORS_HEADERS });
    }

    await ensureSchemaUpgrades(env.DB);

    const body: any = await request.json().catch(() => ({}));
    const { serviceId, enabled } = body;

    if (!serviceId) {
      return new Response(JSON.stringify({ success: false, message: 'Thiếu serviceId.' }), { status: 400, headers: CORS_HEADERS });
    }

    let toggles: Record<string, boolean> = {
      sepay: true,
      telegram: true,
      resend: true,
      shipping: true,
      google: true,
      d1: true,
    };

    const row = await env.DB.prepare("SELECT value_json FROM admin_settings WHERE key = 'automation_toggles' LIMIT 1").first<any>().catch(() => null);
    if (row?.value_json) {
      try {
        toggles = { ...toggles, ...JSON.parse(row.value_json) };
      } catch {}
    }

    toggles[serviceId] = Boolean(enabled);
    const nowIso = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO admin_settings (key, value_json, updated_at)
      VALUES ('automation_toggles', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).bind(JSON.stringify(toggles), nowIso).run().catch(async () => {
      // Fallback nếu bảng chưa có ràng buộc
      await env.DB.prepare("UPDATE admin_settings SET value_json = ?, updated_at = ? WHERE key = 'automation_toggles'").bind(JSON.stringify(toggles), nowIso).run();
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Đã ${enabled ? 'bật' : 'tắt'} dịch vụ tự động hóa ${serviceId}.`,
        toggles,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Lỗi cập nhật cấu hình.' }), { status: 500, headers: CORS_HEADERS });
  }
};
