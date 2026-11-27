import { ensureSchemaUpgrades, logAdminAudit } from '../../../services/d1_service';
import { verifyAdminAuth } from '../../../services/mission_service';
import { getMarketplaceConfig } from '../../../services/marketplace_service';
import {
  approvePartnershipAndIssueKey,
  calculate3WaySplit,
} from '../../../services/seller_affiliate_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_API_KEY?: string;
  PINE_API_KEY?: string;
  MUSE_API_KEY?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key, X-Admin-Key, X-Sync-Key',
};

export const ADMIN_SUSPENDED_WARNING = 'ADMIN_SUSPENDED';
export const PARTNERSHIP_REVOKED_WARNING = 'PARTNERSHIP_REVOKED';

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * Dispatcher cho /api/admin/affiliate/*
 * - GET   /api/admin/affiliate
 * - POST  /api/admin/affiliate/partnerships
 * - PATCH /api/admin/affiliate/partnerships/:id
 * - PATCH /api/admin/affiliate/listings/:id
 */
export async function handleAdminAffiliateRequest(
  context: { request: Request; env: Env },
  subPathSegments: string[] = []
): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return onRequestOptions(context as any);

  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database chưa sẵn sàng.' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const auth = await verifyAdminAuth(request, env as any, 'INTERSHOP_AFFILIATE_MANAGE');
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Yêu cầu quyền Quản trị viên (INTERSHOP_AFFILIATE_MANAGE).' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    await ensureSchemaUpgrades(env.DB);

    const seg0 = subPathSegments[0] || '';
    const seg1 = subPathSegments[1] || '';

    // 1. GET /api/admin/affiliate — Tổng quan KPI, danh sách partnerships, listings, active sellers & config
    if (method === 'GET' && !seg0) {
      const url = new URL(request.url);
      const statusFilter = (url.searchParams.get('status') || '').trim().toUpperCase();
      const warningFilter = (url.searchParams.get('warning') || '').trim();
      const sellerFilter = (url.searchParams.get('seller_id') || '').trim();

      const config = await getMarketplaceConfig(env.DB);

      // Selective projection: TUYỆT ĐỐI KHÔNG trả api_key_hash hay one_time_raw_key
      let pSql = `
        SELECT sap.id, sap.supplier_seller_id, sap.reseller_seller_id, sap.status,
               sap.api_key_prefix, sap.created_at, sap.updated_at, sap.revoked_at,
               s_sup.name AS supplier_name, s_sup.slug AS supplier_slug,
               s_res.name AS reseller_name, s_res.slug AS reseller_slug,
               (SELECT COUNT(*) FROM seller_affiliate_listings sal WHERE sal.partnership_id = sap.id AND sal.status = 'ACTIVE') AS active_listings_count
        FROM seller_affiliate_partnerships sap
        LEFT JOIN sellers s_sup ON sap.supplier_seller_id = s_sup.id
        LEFT JOIN sellers s_res ON sap.reseller_seller_id = s_res.id
        WHERE 1=1
      `;
      const pBinds: any[] = [];
      if (statusFilter) {
        pSql += ' AND sap.status = ?';
        pBinds.push(statusFilter);
      }
      if (sellerFilter) {
        pSql += ' AND (sap.supplier_seller_id = ? OR sap.reseller_seller_id = ?)';
        pBinds.push(sellerFilter, sellerFilter);
      }
      pSql += ' ORDER BY sap.updated_at DESC, sap.created_at DESC LIMIT 300';

      let lSql = `
        SELECT sal.id, sal.partnership_id, sal.supplier_seller_id, sal.reseller_seller_id,
               sal.supplier_product_id, sal.reseller_product_id,
               sal.markup_type, sal.markup_value, sal.price_mode, sal.locked_price,
               sal.show_supplier, sal.status, sal.price_warning, sal.created_at, sal.updated_at,
               sp_orig.name AS product_name, sp_orig.cover_url, sp_orig.product_type,
               sp_orig.price_core AS origin_price, sp_orig.stock_quantity AS origin_stock_quantity,
               sp_orig.resell_map_price, sp_orig.resell_discount_pct, sp_orig.resell_commission_pct,
               sp_res.price_core AS selling_price, sp_res.status AS reseller_product_status,
               s_sup.name AS supplier_name, s_res.name AS reseller_name
        FROM seller_affiliate_listings sal
        LEFT JOIN seller_products sp_orig ON sal.supplier_product_id = sp_orig.id
        LEFT JOIN seller_products sp_res ON sal.reseller_product_id = sp_res.id
        LEFT JOIN sellers s_sup ON sal.supplier_seller_id = s_sup.id
        LEFT JOIN sellers s_res ON sal.reseller_seller_id = s_res.id
        WHERE 1=1
      `;
      const lBinds: any[] = [];
      if (statusFilter) {
        lSql += ' AND sal.status = ?';
        lBinds.push(statusFilter);
      }
      if (warningFilter) {
        lSql += ' AND sal.price_warning = ?';
        lBinds.push(warningFilter);
      }
      if (sellerFilter) {
        lSql += ' AND (sal.supplier_seller_id = ? OR sal.reseller_seller_id = ?)';
        lBinds.push(sellerFilter, sellerFilter);
      }
      lSql += ' ORDER BY sal.updated_at DESC, sal.created_at DESC LIMIT 300';

      const [partnershipsRes, listingsRes, sellersRes] = await Promise.all([
        (pBinds.length ? env.DB.prepare(pSql).bind(...pBinds) : env.DB.prepare(pSql)).all<any>(),
        (lBinds.length ? env.DB.prepare(lSql).bind(...lBinds) : env.DB.prepare(lSql)).all<any>(),
        env.DB
          .prepare(`
            SELECT id, name, slug, status
            FROM sellers
            WHERE deleted_at IS NULL AND status IN ('ACTIVE', 'TRIAL')
            ORDER BY name ASC
            LIMIT 200
          `)
          .all<any>(),
      ]);

      // Bảo vệ kép: xóa sạch mọi trường nhạy cảm nếu mock/driver trả thừa
      const partnerships = (partnershipsRes.results || []).map((row: any) => {
        const { api_key_hash: _h, one_time_raw_key: _r, ...safe } = row;
        return safe;
      });
      const listings = listingsRes.results || [];
      const sellers = sellersRes.results || [];

      const kpis = {
        total_partnerships: partnerships.length,
        pending_admin_count: partnerships.filter((p: any) => p.status === 'PENDING_ADMIN').length,
        pending_supplier_count: partnerships.filter((p: any) => p.status === 'PENDING').length,
        approved_count: partnerships.filter((p: any) => p.status === 'APPROVED').length,
        suspended_count: partnerships.filter((p: any) => p.status === 'SUSPENDED').length,
        revoked_count: partnerships.filter((p: any) => p.status === 'REVOKED').length,
        total_listings: listings.length,
        active_listings: listings.filter((l: any) => l.status === 'ACTIVE').length,
        anti_loss_paused_count: listings.filter((l: any) => l.price_warning === 'ANTI_LOSS_PAUSED').length,
        out_of_stock_count: listings.filter((l: any) => l.status === 'OUT_OF_STOCK').length,
      };

      return new Response(
        JSON.stringify({
          success: true,
          config,
          kpis,
          partnerships,
          listings,
          sellers,
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 2. POST /api/admin/affiliate/partnerships — Admin tạo trực tiếp cặp liên kết giữa 2 gian hàng
    if (method === 'POST' && seg0 === 'partnerships' && !seg1) {
      const mConfig = await getMarketplaceConfig(env.DB);
      if (!mConfig.affiliate_enabled) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Tính năng bán lại liên gian hàng hiện đang tạm tắt bởi Quản trị viên.',
            code: 'AFFILIATE_DISABLED',
          }),
          { status: 403, headers: CORS_HEADERS }
        );
      }

      const body = (await request.json().catch(() => ({}))) as any;
      const supplierSellerId = String(body.supplier_seller_id || '').trim();
      const resellerSellerId = String(body.reseller_seller_id || '').trim();
      const autoApprove = body.auto_approve !== false;

      if (!supplierSellerId || !resellerSellerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Vui lòng chọn đầy đủ gian hàng nguồn (supplier_seller_id) và gian hàng bán lại (reseller_seller_id).' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      if (supplierSellerId === resellerSellerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Không thể tạo liên kết tự nối cùng một gian hàng (A → A).', code: 'SELF_PARTNERSHIP_FORBIDDEN' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const [supSeller, resSeller] = await Promise.all([
        env.DB
          .prepare('SELECT id, name, status FROM sellers WHERE id = ? AND deleted_at IS NULL LIMIT 1')
          .bind(supplierSellerId)
          .first<any>(),
        env.DB
          .prepare('SELECT id, name, status FROM sellers WHERE id = ? AND deleted_at IS NULL LIMIT 1')
          .bind(resellerSellerId)
          .first<any>(),
      ]);

      if (!supSeller || !resSeller) {
        return new Response(
          JSON.stringify({ success: false, error: 'Một trong hai gian hàng không tồn tại hoặc đã bị xóa.' }),
          { status: 404, headers: CORS_HEADERS }
        );
      }

      const existing = await env.DB
        .prepare('SELECT id, status FROM seller_affiliate_partnerships WHERE supplier_seller_id = ? AND reseller_seller_id = ? LIMIT 1')
        .bind(supplierSellerId, resellerSellerId)
        .first<any>();

      if (existing && existing.status === 'APPROVED') {
        return new Response(
          JSON.stringify({ success: false, error: 'Hai gian hàng này đã có liên kết đang hoạt động (APPROVED).', code: 'PARTNERSHIP_ALREADY_APPROVED' }),
          { status: 409, headers: CORS_HEADERS }
        );
      }

      const partnershipId = existing?.id || `sap_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      const initialStatus = autoApprove ? 'APPROVED' : 'PENDING_ADMIN';

      if (!existing) {
        await env.DB
          .prepare(`
            INSERT INTO seller_affiliate_partnerships (
              id, supplier_seller_id, reseller_seller_id, status, api_key_hash, api_key_prefix, created_at, updated_at
            ) VALUES (?, ?, ?, ?, '', '', datetime('now'), datetime('now'))
          `)
          .bind(partnershipId, supplierSellerId, resellerSellerId, initialStatus)
          .run();
      } else if (!autoApprove) {
        await env.DB
          .prepare(`
            UPDATE seller_affiliate_partnerships
            SET status = 'PENDING_ADMIN', revoked_at = NULL, updated_at = datetime('now')
            WHERE id = ?
          `)
          .bind(partnershipId)
          .run();
      }

      let keyPrefix = '';
      if (autoApprove) {
        const issued = await approvePartnershipAndIssueKey(env.DB, partnershipId);
        keyPrefix = issued.keyPrefix;
      }

      await logAdminAudit(env.DB, {
        actorName: auth.adminName || 'Admin',
        action: 'ADMIN_CREATE_AFFILIATE_PARTNERSHIP',
        targetId: partnershipId,
        details: {
          supplier_seller_id: supplierSellerId,
          reseller_seller_id: resellerSellerId,
          status: initialStatus,
          api_key_prefix: keyPrefix,
        },
      }).catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          message: autoApprove
            ? `Đã tạo và kích hoạt liên kết ${supSeller.name} → ${resSeller.name}.`
            : `Đã tạo liên kết chờ duyệt ${supSeller.name} → ${resSeller.name}.`,
          partnership: {
            id: partnershipId,
            supplier_seller_id: supplierSellerId,
            reseller_seller_id: resellerSellerId,
            supplier_name: supSeller.name,
            reseller_name: resSeller.name,
            status: initialStatus,
            api_key_prefix: keyPrefix,
          },
        }),
        { status: existing ? 200 : 201, headers: CORS_HEADERS }
      );
    }

    // 3. PATCH /api/admin/affiliate/partnerships/:id — Admin duyệt / tạm khóa / thu hồi / từ chối
    if (method === 'PATCH' && seg0 === 'partnerships' && seg1) {
      const partnershipId = seg1;
      const body = (await request.json().catch(() => ({}))) as any;
      const nextStatus = String(body.status || '').trim().toUpperCase();
      const rotateKey = body.rotate_key === true;

      if (!['APPROVED', 'SUSPENDED', 'REVOKED', 'REJECTED'].includes(nextStatus)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Trạng thái hợp lệ chỉ gồm APPROVED, SUSPENDED, REVOKED, REJECTED.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const partnership = await env.DB
        .prepare('SELECT id, supplier_seller_id, reseller_seller_id, status, api_key_hash, api_key_prefix FROM seller_affiliate_partnerships WHERE id = ? LIMIT 1')
        .bind(partnershipId)
        .first<any>();

      if (!partnership) {
        return new Response(
          JSON.stringify({ success: false, error: 'Không tìm thấy cặp liên kết gian hàng này.' }),
          { status: 404, headers: CORS_HEADERS }
        );
      }

      const nowIso = new Date().toISOString();
      let resultKeyPrefix = String(partnership.api_key_prefix || '');
      let restoredListingsCount = 0;

      if (nextStatus === 'APPROVED') {
        const mConfig = await getMarketplaceConfig(env.DB);
        if (!mConfig.affiliate_enabled) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Tính năng bán lại liên gian hàng hiện đang tạm tắt bởi Quản trị viên.',
              code: 'AFFILIATE_DISABLED',
            }),
            { status: 403, headers: CORS_HEADERS }
          );
        }

        const hasExistingKey = Boolean(partnership.api_key_hash && String(partnership.api_key_hash).trim().length > 0);
        if (!hasExistingKey || rotateKey) {
          const issued = await approvePartnershipAndIssueKey(env.DB, partnershipId);
          resultKeyPrefix = issued.keyPrefix;
        } else {
          await env.DB
            .prepare(`
              UPDATE seller_affiliate_partnerships
              SET status = 'APPROVED', revoked_at = NULL, updated_at = ?
              WHERE id = ?
            `)
            .bind(nowIso, partnershipId)
            .run();
        }

        // Nếu khôi phục từ SUSPENDED: chỉ mở lại đúng các listing & seller_products bị tạm dừng bởi ADMIN_SUSPENDED thuộc partnership này
        if (partnership.status === 'SUSPENDED') {
          const pausedRes = await env.DB
            .prepare(`
              SELECT id, reseller_product_id
              FROM seller_affiliate_listings
              WHERE partnership_id = ?
                AND status = 'SUPPLIER_DISABLED'
                AND price_warning = ?
            `)
            .bind(partnershipId, ADMIN_SUSPENDED_WARNING)
            .all<any>();

          const toRestore = pausedRes.results || [];
          if (toRestore.length > 0) {
            const restoreStmts: any[] = [];
            for (const row of toRestore) {
              restoreStmts.push(
                env.DB
                  .prepare(`
                    UPDATE seller_affiliate_listings
                    SET status = 'ACTIVE', price_warning = NULL, updated_at = ?
                    WHERE id = ? AND partnership_id = ? AND price_warning = ?
                  `)
                  .bind(nowIso, row.id, partnershipId, ADMIN_SUSPENDED_WARNING),
                env.DB
                  .prepare(`
                    UPDATE seller_products
                    SET status = 'APPROVED', updated_at = ?
                    WHERE id = ? AND status = 'PAUSED'
                  `)
                  .bind(nowIso, row.reseller_product_id)
              );
            }
            await env.DB.batch(restoreStmts);
            restoredListingsCount = toRestore.length;
          }
        }
      } else if (nextStatus === 'SUSPENDED' || nextStatus === 'REVOKED') {
        const warningCode = nextStatus === 'SUSPENDED' ? ADMIN_SUSPENDED_WARNING : PARTNERSHIP_REVOKED_WARNING;
        const updatePartnershipStmt = nextStatus === 'REVOKED'
          ? env.DB
              .prepare(`
                UPDATE seller_affiliate_partnerships
                SET status = 'REVOKED',
                    api_key_hash = '',
                    one_time_raw_key = NULL,
                    revoked_at = ?,
                    updated_at = ?
                WHERE id = ?
              `)
              .bind(nowIso, nowIso, partnershipId)
          : env.DB
              .prepare(`
                UPDATE seller_affiliate_partnerships
                SET status = 'SUSPENDED',
                    revoked_at = COALESCE(revoked_at, ?),
                    updated_at = ?
                WHERE id = ?
              `)
              .bind(null, nowIso, partnershipId);

        await env.DB.batch([
          updatePartnershipStmt,
          env.DB
            .prepare(`
              UPDATE seller_affiliate_listings
              SET status = 'SUPPLIER_DISABLED',
                  price_warning = ?,
                  updated_at = ?
              WHERE partnership_id = ? AND status != 'HIDDEN'
            `)
            .bind(warningCode, nowIso, partnershipId),
          env.DB
            .prepare(`
              UPDATE seller_products
              SET status = 'PAUSED',
                  updated_at = ?
              WHERE id IN (
                SELECT reseller_product_id
                FROM seller_affiliate_listings
                WHERE partnership_id = ?
              ) AND status = 'APPROVED'
            `)
            .bind(nowIso, partnershipId),
        ]);
      } else {
        // REJECTED
        await env.DB
          .prepare(`
            UPDATE seller_affiliate_partnerships
            SET status = 'REJECTED',
                one_time_raw_key = NULL,
                updated_at = ?
            WHERE id = ?
          `)
          .bind(nowIso, partnershipId)
          .run();
      }

      await logAdminAudit(env.DB, {
        actorName: auth.adminName || 'Admin',
        action: `ADMIN_PARTNERSHIP_${nextStatus}`,
        targetId: partnershipId,
        details: {
          previous_status: partnership.status,
          next_status: nextStatus,
          rotate_key: rotateKey,
          restored_listings_count: restoredListingsCount,
        },
      }).catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          message: `Đã cập nhật trạng thái liên kết sang ${nextStatus}.`,
          partnership: {
            id: partnershipId,
            supplier_seller_id: partnership.supplier_seller_id,
            reseller_seller_id: partnership.reseller_seller_id,
            status: nextStatus,
            api_key_prefix: resultKeyPrefix,
            restored_listings_count: restoredListingsCount,
          },
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 4. PATCH /api/admin/affiliate/listings/:id — Admin chỉnh tự do biên lợi nhuận / giá / trạng thái listing
    if (method === 'PATCH' && seg0 === 'listings' && seg1) {
      const listingId = seg1;
      const listing = await env.DB
        .prepare(`
          SELECT sal.*,
                 sp_orig.price_core AS origin_price,
                 sp_orig.resell_discount_pct,
                 sp_orig.resell_commission_pct,
                 sp_orig.resell_map_price,
                 sp_orig.product_type
          FROM seller_affiliate_listings sal
          JOIN seller_products sp_orig ON sal.supplier_product_id = sp_orig.id
          WHERE sal.id = ?
          LIMIT 1
        `)
        .bind(listingId)
        .first<any>();

      if (!listing) {
        return new Response(
          JSON.stringify({ success: false, error: 'Không tìm thấy sản phẩm bán lại liên shop này.' }),
          { status: 404, headers: CORS_HEADERS }
        );
      }

      const body = (await request.json().catch(() => ({}))) as any;
      const mConfig = await getMarketplaceConfig(env.DB);

      const nextMarkupType: 'PERCENT' | 'FIXED' =
        body.markup_type !== undefined
          ? (String(body.markup_type).toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENT')
          : (listing.markup_type === 'FIXED' ? 'FIXED' : 'PERCENT');
      const nextMarkupValue =
        body.markup_value !== undefined
          ? Math.max(0, Number(body.markup_value) || 0)
          : Number(listing.markup_value || 0);
      const nextPriceMode: 'FORMULA' | 'LOCKED' =
        body.price_mode !== undefined
          ? (String(body.price_mode).toUpperCase() === 'LOCKED' ? 'LOCKED' : 'FORMULA')
          : (listing.price_mode === 'LOCKED' ? 'LOCKED' : 'FORMULA');
      const nextShowSupplier =
        body.show_supplier !== undefined
          ? (body.show_supplier === 0 || body.show_supplier === false ? 0 : 1)
          : Number(listing.show_supplier ?? 1);

      let nextStatus = String(listing.status || 'ACTIVE');
      if (body.status !== undefined) {
        const cand = String(body.status).trim().toUpperCase();
        if (!['ACTIVE', 'HIDDEN', 'SUPPLIER_DISABLED', 'OUT_OF_STOCK'].includes(cand)) {
          return new Response(
            JSON.stringify({ success: false, error: 'Trạng thái listing không hợp lệ.' }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
        nextStatus = cand;
      }

      const basePrice = Number(listing.origin_price) || 0;
      const mapPrice = Number(listing.resell_map_price) || 0;
      const isPhysical = String(listing.product_type || '').toLowerCase() === 'physical';
      const candidateLockedPrice =
        nextPriceMode === 'LOCKED'
          ? (body.locked_price !== undefined && Number(body.locked_price) > 0
              ? Math.round(Number(body.locked_price))
              : (Number(listing.locked_price) > 0
                  ? Math.round(Number(listing.locked_price))
                  : basePrice + Math.round(nextMarkupType === 'PERCENT' ? basePrice * (nextMarkupValue / 100) : nextMarkupValue)))
          : null;

      const split = calculate3WaySplit({
        basePrice,
        markupType: nextMarkupType,
        markupValue: nextMarkupValue,
        discountPct: Number(listing.resell_discount_pct) || 0,
        commissionPct: Number(listing.resell_commission_pct) || 0,
        isPhysical,
        mapPrice,
        priceMode: nextPriceMode,
        lockedPrice: candidateLockedPrice,
        digitalFeePct: mConfig.affiliate_digital_fee_pct,
        physicalFeePct: mConfig.affiliate_physical_fee_pct,
      });

      const finalSellingPrice = split.sellingPrice;
      const finalLockedPrice = nextPriceMode === 'LOCKED' ? finalSellingPrice : null;
      const nextPriceWarning =
        body.clear_warning === true || nextStatus === 'ACTIVE'
          ? null
          : (body.price_warning !== undefined ? body.price_warning : listing.price_warning);
      const nextResellerProductStatus = nextStatus === 'ACTIVE' ? 'APPROVED' : 'PAUSED';
      const nowIso = new Date().toISOString();

      await env.DB.batch([
        env.DB
          .prepare(`
            UPDATE seller_affiliate_listings
            SET markup_type = ?,
                markup_value = ?,
                price_mode = ?,
                locked_price = ?,
                show_supplier = ?,
                status = ?,
                price_warning = ?,
                updated_at = ?
            WHERE id = ?
          `)
          .bind(
            nextMarkupType,
            nextMarkupValue,
            nextPriceMode,
            finalLockedPrice,
            nextShowSupplier,
            nextStatus,
            nextPriceWarning,
            nowIso,
            listingId
          ),
        env.DB
          .prepare(`
            UPDATE seller_products
            SET price_core = ?,
                status = ?,
                updated_at = ?
            WHERE id = ?
          `)
          .bind(finalSellingPrice, nextResellerProductStatus, nowIso, listing.reseller_product_id),
      ]);

      await logAdminAudit(env.DB, {
        actorName: auth.adminName || 'Admin',
        action: 'ADMIN_UPDATE_AFFILIATE_LISTING',
        targetId: listingId,
        details: {
          markup_type: nextMarkupType,
          markup_value: nextMarkupValue,
          price_mode: nextPriceMode,
          selling_price: finalSellingPrice,
          status: nextStatus,
          price_warning: nextPriceWarning,
        },
      }).catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Đã cập nhật sản phẩm bán lại liên shop thành công.',
          listing: {
            id: listingId,
            reseller_product_id: listing.reseller_product_id,
            markup_type: nextMarkupType,
            markup_value: nextMarkupValue,
            price_mode: nextPriceMode,
            locked_price: finalLockedPrice,
            show_supplier: nextShowSupplier,
            status: nextStatus,
            price_warning: nextPriceWarning,
            selling_price: finalSellingPrice,
            is_map_enforced: split.isMapEnforced,
            split,
          },
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    return new Response(JSON.stringify({ success: false, error: 'Route quản trị liên shop không tồn tại.' }), {
      status: 404,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi xử lý API quản trị liên shop.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export const onRequest: PagesFunction<Env> = async (context) =>
  handleAdminAffiliateRequest(context as any, []);
