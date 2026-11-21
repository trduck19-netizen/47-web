import {
  CORS_HEADERS,
  Env,
  verifyAdminAuth,
  computeSha256,
  formatScopes,
  parseScopes,
} from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

function generateSecureRandomKey(prefix: string): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

// Seed initial default keys if not present
async function ensureDefaultPresetKeys(env: Env) {
  if (!env.DB) return;

  const existingRows = await env.DB.prepare('SELECT id, scope FROM mission_ai_api_keys').all<any>();
  const list = existingRows?.results || [];

  const nowIso = new Date().toISOString();
  // 30 days expiration default for presets, or permanent for master
  const expires30d = new Date(Date.now() + 30 * 86400000).toISOString();
  const expires90d = new Date(Date.now() + 90 * 86400000).toISOString();

  // 1. Preset News Full Key
  const hasNews = list.some((r) => String(r.scope).toUpperCase() === 'NEWS_FULL');
  if (!hasNews) {
    const rawKey = generateSecureRandomKey('wcg_news');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_news_full', 'Toàn Quyền Tin Tức (News Full Access)', ?, ?, 'NEWS_FULL', 'Toàn quyền viết bài, sửa nội dung, xóa bài vĩnh viễn và đặt lịch hẹn đăng bài chuẩn SEO.', ?, '', 1, '', ?)
    `).bind(keyHash, keyPrefix, expires90d, nowIso).run().catch(() => {});
  }

  // 2. Preset Missions Full Key
  const hasMissions = list.some((r) => String(r.scope).toUpperCase() === 'MISSIONS_FULL');
  if (!hasMissions) {
    const rawKey = generateSecureRandomKey('wcg_mis');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_missions_full', 'Toàn Quyền Nhiệm Vụ (Missions Full Access)', ?, ?, 'MISSIONS_FULL', 'Toàn quyền tạo chiến dịch nhiệm vụ, nạp kho code thưởng, duyệt và từ chối bài nộp.', ?, '', 1, '', ?)
    `).bind(keyHash, keyPrefix, expires90d, nowIso).run().catch(() => {});
  }

  // 3. Preset AI Pine Review Key
  const hasReview = list.some((r) => ['MISSIONS_REVIEW', 'REVIEW_ONLY'].includes(String(r.scope).toUpperCase()));
  if (!hasReview) {
    const rawKey = generateSecureRandomKey('wcg_ai');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_missions_review', 'Thẩm Định Nhiệm Vụ Pine AI (Missions Reviewer)', ?, ?, 'MISSIONS_REVIEW', 'Dành riêng cho AI Pine tra cứu danh sách nộp chờ duyệt và gửi kết quả thẩm định tự động.', ?, '', 1, '', ?)
    `).bind(keyHash, keyPrefix, expires30d, nowIso).run().catch(() => {});
  }

  // 4. Preset Admin Full Key
  const hasAdmin = list.some((r) => ['ADMIN_FULL', 'FULL'].includes(String(r.scope).toUpperCase()) && r.id !== 'ak_1793169536801_vjxp');
  if (!hasAdmin) {
    const rawKey = generateSecureRandomKey('wcg_adm');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_admin_full', 'Toàn Quyền Quản Trị & Đồng Bộ (Master Admin Full)', ?, ?, 'ADMIN_FULL', 'Toàn quyền quản trị cấp cao, gọi được mọi API admin và đồng bộ dữ liệu hai chiều.', '', '', 1, '', ?)
    `).bind(keyHash, keyPrefix, nowIso).run().catch(() => {});
  }

  // 5. Preset Versatile Multi-Scope Key (Khóa API Đa Năng - 1 mã set mọi quyền)
  const hasMulti = list.some((r) => r.id === 'ak_preset_multi_versatile');
  if (!hasMulti) {
    const rawKey = generateSecureRandomKey('wcg_multi');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    const multiScope = 'NEWS_FULL,MISSIONS_FULL,GAMES_FULL,GIVEAWAYS_FULL,EVENT_SCHEDULER_FULL,STORE_FULL,MEMBERS_FULL,SYNC_FULL,API_KEYS_FULL';
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_multi_versatile', 'Khóa API Đa Năng (Universal Versatile Key)', ?, ?, ?, 'Khóa API Đa Năng cho phép Quản trị viên dùng 1 mã duy nhất để cấu hình và set linh hoạt mọi quyền trên web.', '', '', 1, '', ?)
    `).bind(keyHash, keyPrefix, multiScope, nowIso).run().catch(() => {});
  }

  // 6. Preset Giveaways Full Key (Toàn Quyền Quản Lý Giveaway)
  const hasGiveaways = list.some((r) => String(r.scope).toUpperCase() === 'GIVEAWAYS_FULL' || r.id === 'ak_preset_giveaways_full');
  if (!hasGiveaways) {
    const rawKey = generateSecureRandomKey('wcg_gw');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_giveaways_full', 'Toàn Quyền Giveaway (Giveaways Full Access)', ?, ?, 'GIVEAWAYS_FULL', 'Toàn quyền quản trị chiến dịch Giveaway, thêm/sửa/xóa đợt phát, nạp kho mã giftcode, bật tắt sự kiện và reset thời gian hồi chiêu.', ?, '', 1, '', ?)
    `).bind(keyHash, keyPrefix, expires90d, nowIso).run().catch(() => {});
  }

  // 7. Preset Event Scheduler Full Key (Toàn Quyền Lịch Sự Kiện & Đếm Ngược)
  const hasEventScheduler = list.some((r) => String(r.scope).toUpperCase() === 'EVENT_SCHEDULER_FULL' || r.id === 'ak_preset_event_scheduler_full');
  if (!hasEventScheduler) {
    const rawKey = generateSecureRandomKey('wcg_ev');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_event_scheduler_full', 'Toàn Quyền Lịch Sự Kiện & Đếm Ngược (Event Scheduler Full)', ?, ?, 'EVENT_SCHEDULER_FULL', 'Toàn quyền tạo lịch đếm ngược tự động, lên lịch phát code/flash sale, bật tắt trạng thái và ghim banner.', ?, '', 1, '', ?)
    `).bind(keyHash, keyPrefix, expires90d, nowIso).run().catch(() => {});
  }

  // 8. Preset Telegram Full Key (Toàn Quyền Quản Lý & Điều Hành Telegram)
  const hasTelegram = list.some((r) => String(r.scope).toUpperCase() === 'TELEGRAM_FULL' || r.id === 'ak_preset_telegram_full');
  if (!hasTelegram) {
    const rawKey = generateSecureRandomKey('wcg_tg');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_telegram_full', 'Toàn Quyền Telegram (Telegram Full & Management)', ?, ?, 'TELEGRAM_FULL', 'Toàn quyền điều hành bot và nhóm Telegram qua POST /api/telegram/manage và đăng thông báo tự động.', ?, '', 1, '', ?)
    `).bind(keyHash, keyPrefix, expires90d, nowIso).run().catch(() => {});
  }

  // 9. Preset Universal Mall Master Key (Toàn Quyền Sàn TMĐT Đa Ngành)
  const hasUniversalMall = list.some((r) => r.id === 'ak_preset_universal_admin_master');
  if (!hasUniversalMall) {
    const rawKey = generateSecureRandomKey('wcg_mall');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    const mallScopes = 'UNIVERSAL_MALL_FULL,ADMIN_FULL,PRODUCTS_FULL,CATEGORIES_FULL,VOUCHERS_FULL,SHIPPING_FULL,PLATFORM_LEADS_FULL,ORDERS_FULL,MEMBERS_FULL,WALLET_MANAGE,SEPAY_FULL,MARKETPLACE_MANAGE,STORE_FULL,SYNC_FULL';
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_universal_admin_master', 'Toàn Quyền Nền Tảng Sàn Đa Ngành (Universal Mall Platform Master)', ?, ?, ?, 'Toàn quyền điều hành toàn bộ Sàn TMĐT Đa Ngành: Sản phẩm, Danh mục, Vouchers, Vận chuyển bưu chính, Khách hàng B2B, Đơn hàng, Ví tiền và Cổng SePay.', '', '', 1, '', ?)
    `).bind(keyHash, keyPrefix, mallScopes, nowIso).run().catch(() => {});
  }

  // 10. Preset Products & Categories Key (Toàn Quyền Sản Phẩm & Danh Mục Đa Ngành)
  const hasProductsManage = list.some((r) => r.id === 'ak_preset_products_manage');
  if (!hasProductsManage) {
    const rawKey = generateSecureRandomKey('wcg_prd');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_products_manage', 'Toàn Quyền Sản Phẩm & Danh Mục (Products & Categories Full)', ?, ?, 'PRODUCTS_FULL,CATEGORIES_FULL,STORE_FULL', 'Toàn quyền thêm/sửa/xóa sản phẩm đa ngành (vật lý & số), quản lý biến thể SKU, hình ảnh, thông số kỹ thuật và cấu trúc ngành hàng.', ?, '', 1, '', ?)
    `).bind(keyHash, keyPrefix, expires90d, nowIso).run().catch(() => {});
  }

  // 11. Preset Vouchers & Shipping Key (Toàn Quyền Voucher & Vận Chuyển Bưu Chính)
  const hasVouchersShipping = list.some((r) => r.id === 'ak_preset_vouchers_shipping');
  if (!hasVouchersShipping) {
    const rawKey = generateSecureRandomKey('wcg_shp');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_vouchers_shipping', 'Toàn Quyền Voucher & Vận Chuyển (Vouchers & Shipping Full)', ?, ?, 'VOUCHERS_FULL,SHIPPING_FULL,ORDERS_FULL', 'Toàn quyền quản trị mã giảm giá/freeship đa tầng, tạo và tra cứu vận đơn bưu chính tự động (GHTK, GHN, Viettel Post).', ?, '', 1, '', ?)
    `).bind(keyHash, keyPrefix, expires90d, nowIso).run().catch(() => {});
  }

  // 12. Preset Platform Leads Key (Toàn Quyền Khách Hàng Nền Tảng B2B)
  const hasPlatformLeads = list.some((r) => r.id === 'ak_preset_platform_leads');
  if (!hasPlatformLeads) {
    const rawKey = generateSecureRandomKey('wcg_lead');
    const keyHash = await computeSha256(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES ('ak_preset_platform_leads', 'Toàn Quyền Khách Hàng Nền Tảng B2B (Platform Leads Full)', ?, ?, 'PLATFORM_LEADS_FULL', 'Toàn quyền tra cứu, tiếp nhận và xử lý danh sách khách hàng doanh nghiệp đăng ký thuê sàn TMĐT đa ngành (Platform Solutions).', ?, '', 1, '', ?)
    `).bind(keyHash, keyPrefix, expires90d, nowIso).run().catch(() => {});
  }
}

/**
 * GET /api/api-keys
 * Lấy danh sách toàn bộ các Khóa API trong hệ thống kèm thông tin phân quyền & thời hạn
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const adminCheck = await verifyAdminAuth(request, env);
    if (!adminCheck.authorized) {
      return new Response(
        JSON.stringify({ success: false, message: adminCheck.error || 'Quyền truy cập bị từ chối.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // Ensure preset keys exist so user sees all scopes ready to copy
    await ensureDefaultPresetKeys(env);

    const result = await env.DB.prepare(
      `SELECT id, key_name, key_prefix, scope, description, expires_at, is_active, last_used_at, created_at 
       FROM mission_ai_api_keys 
       ORDER BY created_at ASC`
    ).all<any>();

    // Master Key hệ thống quản lý qua Cloudflare Secret, hoàn toàn không tiết lộ bất kỳ tiền tố hay hậu tố secret nào
    const masterKeyInfo = {
      id: 'key_system_master',
      key_name: 'Khóa Quản Trị Hệ Thống (Master Key)',
      scope: 'ADMIN_FULL',
      description: 'Quyền tối cao: Toàn quyền đồng bộ hệ thống, quản lý cơ sở dữ liệu D1/KV, truy cập mọi API admin. Cấu hình bảo mật qua Cloudflare Secret.',
      is_master: true,
      is_active: 1,
      expires_at: '', // Permanent
      last_used_at: new Date().toISOString(),
      created_at: '2026-01-01T00:00:00.000Z',
    };

    return new Response(
      JSON.stringify({
        success: true,
        master_key: masterKeyInfo,
        keys: result?.results || [],
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi tải danh sách API keys.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

/**
 * POST /api/api-keys
 * Tạo khóa API mới kèm phân quyền và thời hạn hiệu lực (Time-based Permission)
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, message: 'D1 Database chưa được cấu hình.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const adminCheck = await verifyAdminAuth(request, env);
    if (!adminCheck.authorized) {
      return new Response(
        JSON.stringify({ success: false, message: adminCheck.error || 'Quyền truy cập bị từ chối.' }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const {
      key_name,
      scope,
      scopes,
      description = '',
      expires_at = '',
      validity_days = 0,
    } = body;

    if (!key_name || typeof key_name !== 'string' || !key_name.trim()) {
      return new Response(
        JSON.stringify({ success: false, message: 'Vui lòng đặt tên định danh cho khóa API.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Validate and format scope
    let validScope = 'NEWS_FULL';
    if (scopes !== undefined && Array.isArray(scopes) && scopes.length > 0) {
      validScope = formatScopes(scopes);
    } else if (scope) {
      validScope = formatScopes(scope);
    }

    // Calculate expiration timestamp
    let finalExpiresAt = (expires_at || '').trim();
    if (!finalExpiresAt && Number(validity_days) > 0) {
      finalExpiresAt = new Date(Date.now() + Number(validity_days) * 86400000).toISOString();
    }

    // Generate random 24 bytes (48 hex chars)
    const randomBytes = new Uint8Array(24);
    crypto.getRandomValues(randomBytes);
    const randomHex = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    let prefixTag = 'wcg_sec_';
    if (validScope.includes(',')) prefixTag = 'wcg_multi_';
    else if (validScope === 'NEWS_FULL') prefixTag = 'wcg_news_';
    else if (validScope === 'MISSIONS_FULL') prefixTag = 'wcg_mis_';
    else if (validScope === 'GIVEAWAYS_FULL') prefixTag = 'wcg_gw_';
    else if (validScope === 'EVENT_SCHEDULER_FULL') prefixTag = 'wcg_ev_';
    else if (validScope === 'MISSIONS_REVIEW' || validScope === 'REVIEW_ONLY') prefixTag = 'wcg_ai_';
    else if (validScope === 'ADMIN_FULL' || validScope === 'FULL') prefixTag = 'wcg_adm_';
    else prefixTag = 'wcg_multi_';

    const rawKey = `${prefixTag}${randomHex}`;
    const keyPrefix = `${rawKey.substring(0, 12)}••••••••••••••••••••${rawKey.slice(-4)}`;
    const keyHash = await computeSha256(rawKey);

    const id = `ak_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO mission_ai_api_keys (id, key_name, api_key_hash, key_prefix, scope, description, expires_at, raw_key, is_active, last_used_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', 1, '', ?)
    `).bind(
      id,
      key_name.trim(),
      keyHash,
      keyPrefix,
      validScope,
      description?.trim() || '',
      finalExpiresAt,
      nowIso
    ).run();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Khởi tạo khóa API thành công.',
        key: {
          id,
          key_name: key_name.trim(),
          scope: validScope,
          description: description?.trim() || '',
          expires_at: finalExpiresAt,
          key_prefix: keyPrefix,
          raw_key: rawKey,
          is_active: 1,
          created_at: nowIso,
        },
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tạo khóa API mới.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
