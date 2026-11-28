import { verifyMemberAuth } from '../../services/mission_service';
import { ensureMarketplaceSchema, logAdminAudit } from '../../services/d1_service';
import { getMarketplaceConfig } from '../../services/marketplace_service';
import { verifyStoreApiAccess } from '../../services/store_api_service';
import { bumpCatalogEpoch } from '../../services/cache_service';

const ALLOWED_BANNER_PRESETS = new Set([
  'shopee_flame',
  'aurora_indigo',
  'cyber_emerald',
  'royal_violet',
  'crimson_gaming',
  'gold_luxury',
]);

function sanitizeMediaUrl(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return '';
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(javascript|vbscript):/i.test(trimmed)) return '';
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/')
  ) {
    return trimmed.slice(0, 180000);
  }
  return '';
}

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET: Lấy thông tin gian hàng của thành viên hiện tại hoặc khóa API
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const mConfig = await getMarketplaceConfig(env.DB);
    const portalConfig = {
      theme_preset: mConfig.seller_portal_theme_preset || 'shopee_orange',
      allow_dark_mode: mConfig.seller_portal_allow_dark_mode !== false,
      banner_vi: mConfig.seller_portal_banner_vi || '',
      banner_en: mConfig.seller_portal_banner_en || '',
    };

    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'ANY' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      // Nếu là phiên web nhưng chưa có gian hàng -> trả has_seller: false để web hiển thị form mở gian hàng
      if (storeAuth.authType === 'MEMBER_SESSION' && storeAuth.status === 404) {
        return new Response(
          JSON.stringify({ success: true, has_seller: false, portal_config: portalConfig }),
          { status: 200, headers: CORS_HEADERS }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API gian hàng hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const seller = storeAuth.seller;
    const subRole = storeAuth.role || 'OWNER';

    // Thống kê nhanh (§4)
    // 1. Doanh thu Core hôm nay
    const todayRevenue = await env.DB
      .prepare(`
        SELECT COALESCE(SUM(price_core), 0) as total
        FROM seller_orders
        WHERE seller_id = ? AND status IN ('PAID', 'DELIVERED') AND date(created_at) = date('now')
      `)
      .bind(seller.id)
      .first<{ total: number }>();

    // 2. Doanh thu 30 ngày qua
    const monthRevenue = await env.DB
      .prepare(`
        SELECT COALESCE(SUM(price_core), 0) as total
        FROM seller_orders
        WHERE seller_id = ? AND status IN ('PAID', 'DELIVERED') AND datetime(created_at) >= datetime('now', '-30 days')
      `)
      .bind(seller.id)
      .first<{ total: number }>();

    // 3. Đơn chờ xử lý báo lỗi
    const reportedOrdersCount = await env.DB
      .prepare(`
        SELECT COUNT(*) as count
        FROM seller_orders
        WHERE seller_id = ? AND status = 'REPORTED'
      `)
      .bind(seller.id)
      .first<{ count: number }>();

    // 4. Sản phẩm cảnh báo kho thấp
    const lowStockCount = await env.DB
      .prepare(`
        SELECT COUNT(*) as count
        FROM seller_products sp
        WHERE sp.seller_id = ? AND sp.deleted_at IS NULL AND sp.status = 'APPROVED'
          AND (
            SELECT COUNT(*) FROM seller_codes sc 
            WHERE sc.product_id = sp.id AND sc.status = 'IN_STOCK' AND sc.deleted_at IS NULL
          ) <= sp.low_stock_threshold
      `)
      .bind(seller.id)
      .first<{ count: number }>();

    // 5. Tổng số sản phẩm đang có + tóm tắt trạng thái Cổng SePay riêng
    const [totalProducts, sepayCfgRow, sepayExRow] = await Promise.all([
      env.DB
        .prepare("SELECT COUNT(*) as count FROM seller_products WHERE seller_id = ? AND deleted_at IS NULL")
        .bind(seller.id)
        .first<{ count: number }>(),
      env.DB
        .prepare('SELECT is_enabled, admin_locked, fee_debt_core FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
        .bind(seller.id)
        .first<{ is_enabled: number; admin_locked: number; fee_debt_core: number }>()
        .catch(() => null),
      env.DB
        .prepare(`
          SELECT COUNT(*) as count
          FROM seller_sepay_transactions
          WHERE seller_id = ?
            AND status IN ('UNDERPAID', 'EXPIRED_PAYMENT', 'DUPLICATE_PAYMENT', 'UNMATCHED', 'PENDING_MANUAL_CODE')
        `)
        .bind(seller.id)
        .first<{ count: number }>()
        .catch(() => ({ count: 0 })),
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        has_seller: true,
        seller,
        is_subaccount: subRole !== 'OWNER',
        sub_role: subRole,
        portal_config: portalConfig,
        sepay_summary: {
          configured: Boolean(sepayCfgRow),
          is_enabled: Number(sepayCfgRow?.is_enabled || 0) === 1,
          admin_locked: Number(sepayCfgRow?.admin_locked || 0) === 1,
          fee_debt_core: Number(sepayCfgRow?.fee_debt_core || 0),
          open_exceptions: Number(sepayExRow?.count || 0),
        },
        stats: {
          today_revenue_core: todayRevenue?.total || 0,
          month_revenue_core: monthRevenue?.total || 0,
          reported_orders_count: reportedOrdersCount?.count || 0,
          low_stock_products_count: lowStockCount?.count || 0,
          total_products: totalProducts?.count || 0,
          pending_balance_core: seller.pending_balance_core || 0,
          reputation_score: seller.reputation_score || 100,
        },
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

// POST: Đăng ký mở gian hàng mới
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const auth = await verifyMemberAuth(request, env as any);
    if (!auth.authorized || !auth.member) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Vui lòng đăng nhập để đăng ký gian hàng.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const member = auth.member;
    const body = (await request.json().catch(() => ({}))) as any;
    const {
      name,
      slug,
      contact_phone,
      bank_name,
      bank_account,
      bank_account_name,
      description,
      support_hours,
      warranty_policy,
      refund_policy,
    } = body;

    if (!name || name.trim().length < 3 || name.trim().length > 50) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tên gian hàng phải từ 3 đến 50 ký tự.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cleanSlug = (slug || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!cleanSlug || cleanSlug.length < 3 || cleanSlug.length > 50) {
      return new Response(
        JSON.stringify({ success: false, error: 'Đường dẫn gian hàng (slug) không hợp lệ (3-50 ký tự thường, số, dấu gạch ngang).' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 1. Kiểm tra 1 shop / 1 member
    const existingOwnShop = await env.DB
      .prepare("SELECT id, status, reject_reason FROM sellers WHERE owner_member_id = ? AND deleted_at IS NULL LIMIT 1")
      .bind(member.id)
      .first<any>();

    if (existingOwnShop) {
      if (existingOwnShop.status === 'PENDING') {
        return new Response(
          JSON.stringify({ success: false, error: 'Hồ sơ gian hàng của bạn đang chờ quản trị viên duyệt.' }),
          { status: 409, headers: CORS_HEADERS }
        );
      }
      if (existingOwnShop.status === 'TRIAL' || existingOwnShop.status === 'ACTIVE') {
        return new Response(
          JSON.stringify({ success: false, error: 'Mỗi thành viên chỉ được sở hữu 1 gian hàng duy nhất.' }),
          { status: 409, headers: CORS_HEADERS }
        );
      }
    }

    // 2. Kiểm tra trùng slug hoặc tên với shop khác
    const conflictCheck = await env.DB
      .prepare("SELECT id FROM sellers WHERE (slug = ? OR name = ?) AND id != COALESCE(?, '') AND deleted_at IS NULL LIMIT 1")
      .bind(cleanSlug, name.trim(), existingOwnShop?.id || null)
      .first<any>();

    if (conflictCheck) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tên gian hàng hoặc đường dẫn (slug) đã được người khác sử dụng.' }),
        { status: 409, headers: CORS_HEADERS }
      );
    }

    // 3. Kiểm tra số tài khoản ngân hàng trùng nếu có nhập
    if (bank_account && bank_account.trim()) {
      const bankConflict = await env.DB
        .prepare("SELECT id FROM sellers WHERE bank_account = ? AND id != COALESCE(?, '') AND deleted_at IS NULL LIMIT 1")
        .bind(bank_account.trim(), existingOwnShop?.id || null)
        .first<any>();

      if (bankConflict) {
        return new Response(
          JSON.stringify({ success: false, error: 'Số tài khoản ngân hàng này đã được liên kết với một gian hàng khác.' }),
          { status: 409, headers: CORS_HEADERS }
        );
      }
    }

    const sellerId = existingOwnShop?.id || `sel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    if (existingOwnShop) {
      // Cập nhật lại hồ sơ nộp lại
      await env.DB
        .prepare(`
          UPDATE sellers
          SET name = ?, slug = ?, contact_phone = ?, bank_name = ?, bank_account = ?, bank_account_name = ?,
              description = ?, support_hours = ?, warranty_policy = ?, refund_policy = ?,
              status = 'PENDING', reject_reason = NULL, request_info_note = NULL, updated_at = ?
          WHERE id = ?
        `)
        .bind(
          name.trim(),
          cleanSlug,
          contact_phone?.trim() || null,
          bank_name?.trim() || null,
          bank_account?.trim() || null,
          bank_account_name?.trim() || null,
          description?.trim() || null,
          support_hours?.trim() || '08:00 - 22:00',
          warranty_policy?.trim() || null,
          refund_policy?.trim() || null,
          nowIso,
          sellerId
        )
        .run();
    } else {
      await env.DB
        .prepare(`
          INSERT INTO sellers (
            id, owner_member_id, name, slug, contact_phone, bank_name, bank_account, bank_account_name,
            description, support_hours, warranty_policy, refund_policy, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `)
        .bind(
          sellerId,
          member.id,
          name.trim(),
          cleanSlug,
          contact_phone?.trim() || null,
          bank_name?.trim() || null,
          bank_account?.trim() || null,
          bank_account_name?.trim() || null,
          description?.trim() || null,
          support_hours?.trim() || '08:00 - 22:00',
          warranty_policy?.trim() || null,
          refund_policy?.trim() || null,
          nowIso,
          nowIso
        )
        .run();
    }

    // Ghi audit log
    await logAdminAudit(env.DB, {
      actorName: member.username || member.email,
      actorEmail: member.email,
      action: 'SELLER_REGISTER',
      targetId: sellerId,
      details: { name: name.trim(), slug: cleanSlug },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Hồ sơ mở gian hàng đã được gửi và đang chờ duyệt.',
        seller_id: sellerId,
      }),
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

// PUT: Cập nhật thông tin & trang trí gian hàng (tên shop, giờ hỗ trợ, chính sách, mô tả, avatar, cover, chủ đề bìa, thông báo ghim)
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API gian hàng hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const seller = storeAuth.seller;
    const body = (await request.json().catch(() => ({}))) as any;

    const {
      name,
      description,
      support_hours,
      warranty_policy,
      refund_policy,
      avatar_url,
      cover_url,
      contact_phone,
      banner_preset,
      pinned_notice,
    } = body;

    let cleanName: string | null = null;
    if (name !== undefined && typeof name === 'string') {
      const trimmedName = name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
      if (trimmedName.length < 3 || trimmedName.length > 50) {
        return new Response(
          JSON.stringify({ success: false, error: 'Tên gian hàng phải từ 3 đến 50 ký tự.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      const dupName = await env.DB
        .prepare('SELECT id FROM sellers WHERE LOWER(TRIM(name)) = LOWER(?) AND id != ? AND deleted_at IS NULL LIMIT 1')
        .bind(trimmedName, seller.id)
        .first<any>();
      if (dupName) {
        return new Response(
          JSON.stringify({ success: false, error: 'Tên gian hàng này đã được người khác sử dụng.' }),
          { status: 409, headers: CORS_HEADERS }
        );
      }
      cleanName = trimmedName;
    }

    const cleanAvatar = sanitizeMediaUrl(avatar_url);
    const cleanCover = sanitizeMediaUrl(cover_url);
    const cleanBannerPreset =
      typeof banner_preset === 'string' && ALLOWED_BANNER_PRESETS.has(banner_preset.trim())
        ? banner_preset.trim()
        : null;
    const cleanPinnedNotice =
      pinned_notice !== undefined
        ? String(pinned_notice || '').replace(/[<>]/g, '').trim().slice(0, 240)
        : null;

    const nowIso = new Date().toISOString();

    await env.DB
      .prepare(`
        UPDATE sellers
        SET name = COALESCE(?, name),
            description = COALESCE(?, description),
            support_hours = COALESCE(?, support_hours),
            warranty_policy = COALESCE(?, warranty_policy),
            refund_policy = COALESCE(?, refund_policy),
            avatar_url = CASE WHEN ? IS NOT NULL THEN ? ELSE avatar_url END,
            cover_url = CASE WHEN ? IS NOT NULL THEN ? ELSE cover_url END,
            contact_phone = COALESCE(?, contact_phone),
            banner_preset = COALESCE(?, banner_preset),
            pinned_notice = CASE WHEN ? IS NOT NULL THEN ? ELSE pinned_notice END,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        cleanName,
        description !== undefined ? String(description || '').slice(0, 600) : null,
        support_hours !== undefined ? String(support_hours || '').slice(0, 80) : null,
        warranty_policy !== undefined ? String(warranty_policy || '').slice(0, 400) : null,
        refund_policy !== undefined ? String(refund_policy || '').slice(0, 400) : null,
        cleanAvatar !== undefined ? cleanAvatar : null,
        cleanAvatar !== undefined ? (cleanAvatar || null) : null,
        cleanCover !== undefined ? cleanCover : null,
        cleanCover !== undefined ? (cleanCover || null) : null,
        contact_phone !== undefined ? String(contact_phone || '').slice(0, 40) : null,
        cleanBannerPreset,
        pinned_notice !== undefined ? cleanPinnedNotice : null,
        pinned_notice !== undefined ? (cleanPinnedNotice || null) : null,
        nowIso,
        seller.id
      )
      .run();

    await bumpCatalogEpoch(env.DB).catch(() => {});

    const updatedSeller = await env.DB
      .prepare('SELECT * FROM sellers WHERE id = ? LIMIT 1')
      .bind(seller.id)
      .first<any>()
      .catch(() => null);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Đã cập nhật thông tin và giao diện gian hàng thành công.',
        seller: updatedSeller || seller,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

// PATCH: Bật/tắt chế độ nghỉ bán 1 chạm (§6.4)
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const storeAuth = await verifyStoreApiAccess(request, env as any, { requiredRole: 'OWNER' });
    if (!storeAuth.authorized || !storeAuth.seller) {
      return new Response(
        JSON.stringify({ success: false, error: storeAuth.error || 'Vui lòng đăng nhập hoặc cung cấp khóa API gian hàng hợp lệ.' }),
        { status: storeAuth.status || 401, headers: CORS_HEADERS }
      );
    }

    const seller = storeAuth.seller;
    const body = (await request.json().catch(() => ({}))) as any;
    const { is_vacation } = body;

    const vacationVal = is_vacation ? 1 : 0;
    await env.DB
      .prepare("UPDATE sellers SET is_vacation = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(vacationVal, seller.id)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        is_vacation: vacationVal,
        message: vacationVal === 1 ? 'Đã bật chế độ nghỉ bán. Toàn bộ sản phẩm sẽ tạm ẩn ngoài web khách.' : 'Đã tắt chế độ nghỉ bán. Gian hàng đã mở lại bình thường.',
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi hệ thống.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
