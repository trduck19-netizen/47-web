import { verifyAdminAuth } from '../../services/mission_service';
import { ensureSchemaUpgrades, logAdminAudit } from '../../services/d1_service';
import {
  HOMEPAGE_SECTIONS_REGISTRY,
  mergeHomepageSectionsConfig,
  validateHomepageSectionsPayload,
} from '../../../src/config/homepageSections';

interface Env {
  DB: D1Database;
  ADMIN_SYNC_SECRET?: string;
  PINE_API_KEY?: string;
  MUSE_API_KEY?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key, X-Admin-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Lấy cấu hình các mục trang chủ (Chỉ Quản Trị Viên)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSchemaUpgrades(env.DB);
    const auth = await verifyAdminAuth(request, env as any, 'SYSTEM_SETTINGS_READ');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền Quản trị viên hợp lệ.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const row = await env.DB
      .prepare("SELECT value, updated_at FROM system_settings WHERE key = 'homepage_sections' LIMIT 1")
      .first<any>();

    let rawSections: any = null;
    if (row && row.value) {
      try {
        rawSections = JSON.parse(row.value);
      } catch {}
    }

    const sections = mergeHomepageSectionsConfig(rawSections);

    return new Response(
      JSON.stringify({
        success: true,
        registry: HOMEPAGE_SECTIONS_REGISTRY,
        sections,
        updated_at: row?.updated_at || null,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống khi tải cấu hình trang chủ.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

// PUT: Lưu cấu hình các mục trang chủ (Chỉ Quản Trị Viên)
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureSchemaUpgrades(env.DB);
    const auth = await verifyAdminAuth(request, env as any, 'SYSTEM_SETTINGS_UPDATE');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền Quản trị viên để lưu cấu hình.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = validateHomepageSectionsPayload(body);

    if (!validation.valid || !validation.sanitized) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error || 'Dữ liệu cấu hình không hợp lệ.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const sanitizedSections = validation.sanitized;
    const jsonValue = JSON.stringify(sanitizedSections);
    const nowIso = new Date().toISOString();

    // Lưu vào bảng system_settings
    await env.DB
      .prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('homepage_sections', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .bind(jsonValue, nowIso)
      .run();

    // Ghi nhật ký kiểm toán quản trị
    const disabledCount = sanitizedSections.filter((s) => !s.enabled).length;
    const details = JSON.stringify({
      total_sections: sanitizedSections.length,
      disabled_count: disabledCount,
      disabled_ids: sanitizedSections.filter((s) => !s.enabled).map((s) => s.id),
      order_sequence: sanitizedSections.map((s) => s.id),
      actor: auth.adminName || 'Admin',
    });

    await logAdminAudit(
      env.DB,
      auth.adminId || 'usr_admin',
      auth.adminName || 'Admin',
      'UPDATE_HOMEPAGE_SECTIONS',
      'system_settings',
      'homepage_sections',
      details,
      request.headers.get('cf-connecting-ip') || '127.0.0.1'
    ).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đã lưu cấu hình hiển thị trang chủ thành công.',
        sections: sanitizedSections,
        updated_at: nowIso,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống khi lưu cấu hình trang chủ.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
