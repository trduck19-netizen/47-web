import { verifyMemberAuth } from '../../services/mission_service';
import { logAdminAudit, checkAndExpireSellerOrdersD1 } from '../../services/d1_service';
import {
  getMarketplaceConfig,
  generateVietQrPayload,
} from '../../services/marketplace_service';
import { calculate3WaySplit } from '../../services/seller_affiliate_service';
import {
  SellerSepayConfigRow,
  ensureSellerSepaySchema,
  evaluateSellerQrEligibility,
  generateShopQrGroupCode,
} from '../../services/seller_sepay_service';

interface Env {
  DB: D1Database;
  SEPAY_API_KEY?: string;
  ADMIN_SYNC_SECRET?: string;
  JWT_SECRET?: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: false, error: 'D1 Database chưa sẵn sàng.' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    await ensureSellerSepaySchema(env.DB);

    // 1. Xác thực người mua đăng nhập
    const auth = await verifyMemberAuth(request, env as any);
    if (!auth.authorized || !auth.member) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Vui lòng đăng nhập để thanh toán đơn hàng.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }
    const buyer = auth.member;

    // 2. Phân tích danh sách sản phẩm (hỗ trợ quantity trên từng item)
    const body = (await request.json().catch(() => ({}))) as any;
    const rawItems = Array.isArray(body?.items)
      ? body.items
      : body?.product_id
        ? [{ product_id: body.product_id, quantity: body.quantity || 1 }]
        : [];

    const expandedItems: Array<{ product_id: string }> = [];
    for (const entry of rawItems) {
      const prodId = String(entry?.product_id || entry?.productId || '').trim();
      if (!prodId) continue;
      const qty = Math.max(1, Math.min(20, Math.floor(Number(entry?.quantity) || 1)));
      for (let q = 0; q < qty; q++) {
        expandedItems.push({ product_id: prodId });
      }
    }

    if (expandedItems.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Giỏ hàng trống. Vui lòng chọn sản phẩm.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (expandedItems.length > 20) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mỗi đơn hàng chỉ được chứa tối đa 20 đơn vị sản phẩm.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Tự động thu hồi các đơn hàng chờ quá hạn 15 phút trước khi kiểm kho
    await checkAndExpireSellerOrdersD1(env.DB);

    // Chống DoS chiếm giữ kho
    const pendingOrdersCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM seller_parent_orders
      WHERE buyer_member_id = ? AND status = 'PENDING_PAYMENT' AND datetime(expires_at) > datetime('now')
    `)
      .bind(buyer.id)
      .first<any>();

    if (Number(pendingOrdersCount?.count || 0) >= 3) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Bạn đang có 3 đơn hàng đang chờ thanh toán. Vui lòng thanh toán hoặc chờ đơn hết hạn trước khi tạo đơn mới.',
        }),
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const config = await getMarketplaceConfig(env.DB);
    const qrOrderExpiryMinutes = 15;
    const now = Date.now();
    const expiresAtMs = now + qrOrderExpiryMinutes * 60 * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const nowIso = new Date(now).toISOString();

    const parentOrderId = `spord_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const parentOrderCode = `CGM-P-${now.toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    let totalAmount = 0;
    const childOrdersToInsert: any[] = [];
    const itemsToReserve: Array<{
      isPhysical: boolean;
      sourceProductId: string;
      codeId: string | null;
      childOrderId: string;
      productName: string;
      affiliateWholesaleCore: number;
      resellerOwnerMemberId: string | null;
    }> = [];

    // Cache theo từng seller_id trong cùng 1 request
    const sellerSepayCache = new Map<string, SellerSepayConfigRow | null>();
    const sellerOwnerBalanceRemaining = new Map<string, number>();
    const sellerGroupCodeMap = new Map<string, string>();
    const pickedCodeIdsInRequest = new Set<string>();

    const loadSellerSepayAndOwner = async (sellerId: string, ownerMemberId: string) => {
      if (!sellerSepayCache.has(sellerId)) {
        const cfg = await env.DB.prepare('SELECT * FROM seller_sepay_configs WHERE seller_id = ? LIMIT 1')
          .bind(sellerId)
          .first<SellerSepayConfigRow>();
        sellerSepayCache.set(sellerId, cfg || null);
      }
      if (!sellerOwnerBalanceRemaining.has(ownerMemberId)) {
        const ownerRow = await env.DB.prepare('SELECT COALESCE(balance, 0) as balance FROM members WHERE id = ? LIMIT 1')
          .bind(ownerMemberId)
          .first<{ balance: number }>();
        sellerOwnerBalanceRemaining.set(ownerMemberId, Number(ownerRow?.balance || 0));
      }
      if (!sellerGroupCodeMap.has(sellerId)) {
        sellerGroupCodeMap.set(sellerId, generateShopQrGroupCode(now + sellerGroupCodeMap.size));
      }
      return {
        sepayCfg: sellerSepayCache.get(sellerId) || null,
        ownerBal: sellerOwnerBalanceRemaining.get(ownerMemberId) || 0,
        shopGroupCode: sellerGroupCodeMap.get(sellerId)!,
      };
    };

    // 3. Kiểm tra từng đơn vị sản phẩm & tính điều kiện QR SePay riêng của từng Gian hàng
    for (const item of expandedItems) {
      const prodId = item.product_id;

      const product = await env.DB.prepare(`
        SELECT sp.*, s.owner_member_id, s.name as seller_name, s.status as seller_status, s.is_vacation, s.deleted_at as seller_deleted_at
        FROM seller_products sp
        JOIN sellers s ON sp.seller_id = s.id
        WHERE sp.id = ? AND sp.deleted_at IS NULL LIMIT 1
      `)
        .bind(prodId)
        .first<any>();

      if (!product) {
        return new Response(
          JSON.stringify({ success: false, error: `Sản phẩm (${prodId}) không tồn tại hoặc đã bị xóa.` }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      if (product.owner_member_id === buyer.id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Bạn không thể tự mua sản phẩm của chính gian hàng mình ("${product.seller_name}").`,
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      if (product.status !== 'APPROVED') {
        return new Response(
          JSON.stringify({ success: false, error: `Sản phẩm "${product.name}" chưa được duyệt bán.` }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      if (product.seller_deleted_at || (product.seller_status !== 'ACTIVE' && product.seller_status !== 'TRIAL')) {
        return new Response(
          JSON.stringify({ success: false, error: `Gian hàng "${product.seller_name}" hiện không mở bán.` }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      if (product.is_vacation === 1) {
        return new Response(
          JSON.stringify({ success: false, error: `Gian hàng "${product.seller_name}" đang trong chế độ tạm nghỉ bán.` }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const { sepayCfg, ownerBal, shopGroupCode } = await loadSellerSepayAndOwner(
        product.seller_id,
        product.owner_member_id
      );

      // Kiểm tra sản phẩm bán lại Liên Shop (Affiliate)
      const isAffiliate = product.is_affiliate === 1 && Boolean(product.origin_product_id);
      const sourceProductId = isAffiliate ? product.origin_product_id : product.id;
      const supplierSellerId = isAffiliate ? product.origin_seller_id : null;
      let affiliateBreakdownJson: string | null = null;
      let origProd: any = null;
      let affiliateWholesaleNeeded = 0;

      if (isAffiliate) {
        if (!config.affiliate_enabled) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Sản phẩm "${product.name}" thuộc luồng bán lại liên shop hiện đang tạm dừng bởi Quản trị viên.`,
              code: 'AFFILIATE_DISABLED',
            }),
            { status: 400, headers: CORS_HEADERS }
          );
        }

        origProd = await env.DB.prepare(
          'SELECT id, seller_id, price_core, resell_enabled, resell_discount_pct, resell_commission_pct, resell_map_price, product_type, stock_quantity, deleted_at FROM seller_products WHERE id = ? LIMIT 1'
        )
          .bind(product.origin_product_id)
          .first<any>();

        const listing = await env.DB.prepare(
          'SELECT id, partnership_id, markup_type, markup_value, price_mode, locked_price, status, price_warning FROM seller_affiliate_listings WHERE reseller_product_id = ? LIMIT 1'
        )
          .bind(product.id)
          .first<any>();

        if (!origProd || origProd.deleted_at || origProd.resell_enabled !== 1) {
          return new Response(
            JSON.stringify({ success: false, error: `Sản phẩm "${product.name}" đã ngừng bán lại từ Nhà Cung Cấp.`, code: 'SUPPLIER_DISABLED' }),
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (!listing || listing.status !== 'ACTIVE' || listing.price_warning === 'ANTI_LOSS_PAUSED') {
          const isAntiLoss = listing?.price_warning === 'ANTI_LOSS_PAUSED';
          const isListingOos = listing?.status === 'OUT_OF_STOCK';
          return new Response(
            JSON.stringify({
              success: false,
              error: isAntiLoss
                ? `Sản phẩm "${product.name}" đang tạm khóa chống lỗ do giá gốc thay đổi.`
                : isListingOos
                  ? `Sản phẩm "${product.name}" đã tạm hết tồn kho tại Nhà Cung Cấp.`
                  : `Sản phẩm bán lại "${product.name}" hiện đang tạm ngừng kinh doanh.`,
              code: isAntiLoss ? 'ANTI_LOSS_PAUSED' : isListingOos ? 'OUT_OF_STOCK' : 'AFFILIATE_LISTING_PAUSED',
            }),
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const partnership = await env.DB.prepare(
          'SELECT status FROM seller_affiliate_partnerships WHERE id = ? LIMIT 1'
        )
          .bind(listing.partnership_id)
          .first<{ status: string }>();

        if (!partnership || partnership.status !== 'APPROVED') {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Liên kết bán lại cho sản phẩm "${product.name}" chưa được phê duyệt hoặc đã bị tạm khóa.`,
              code: 'PARTNERSHIP_NOT_APPROVED',
            }),
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const split = calculate3WaySplit({
          basePrice: Number(origProd.price_core) || 0,
          markupType: listing.markup_type || 'PERCENT',
          markupValue: Number(listing.markup_value) || 0,
          discountPct: Number(origProd.resell_discount_pct) || 0,
          commissionPct: Number(origProd.resell_commission_pct) || 0,
          isPhysical: String(origProd.product_type || '').toLowerCase() === 'physical',
          mapPrice: Number(origProd.resell_map_price) || 0,
          priceMode: listing.price_mode,
          lockedPrice: listing.locked_price,
          // DIRECT_SEPAY uses configurable direct_sepay_fee_pct (default 0%)
          digitalFeePct: config.direct_sepay_fee_pct,
          physicalFeePct: config.direct_sepay_fee_pct,
        });

        if (config.affiliate_auto_pause_on_loss && (split.resellerPayout < 0 || Number(product.price_core) < Number(origProd.price_core))) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Sản phẩm "${product.name}" bị tạm khóa chống lỗ do giá bán thấp hơn giá gốc NCC.`,
              code: 'ANTI_LOSS_PAUSED',
            }),
            { status: 400, headers: CORS_HEADERS }
          );
        }

        affiliateWholesaleNeeded = Math.max(0, Math.round(Number(split.supplierPayout || 0)));
        affiliateBreakdownJson = JSON.stringify(split);
      }

      // Kiểm tra điều kiện sinh QR SePay riêng của đúng Gian hàng này
      const eligibility = evaluateSellerQrEligibility({
        sepayConfig: sepayCfg,
        marketplaceConfig: config,
        isAffiliate,
        wholesaleNeededCore: affiliateWholesaleNeeded,
        sellerOwnerCoreBalance: ownerBal,
      });

      const qrAllowedForItem = eligibility.eligible;
      const affiliateWholesaleToReserve = qrAllowedForItem && isAffiliate ? eligibility.wholesaleReserveCore : 0;
      if (affiliateWholesaleToReserve > 0) {
        sellerOwnerBalanceRemaining.set(product.owner_member_id, ownerBal - affiliateWholesaleToReserve);
      }

      const isPhysical =
        String((isAffiliate ? origProd?.product_type : product.product_type) || product.product_type || '').toLowerCase() ===
        'physical';

      let availableCode: any = null;
      if (isPhysical) {
        const physicalStock = Number((isAffiliate ? origProd?.stock_quantity : product.stock_quantity) || 0);
        if (physicalStock < 1) {
          return new Response(
            JSON.stringify({ success: false, error: `Sản phẩm vật lý "${product.name}" đã tạm hết tồn kho.`, code: 'OUT_OF_STOCK' }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
      } else {
        const codesRes = await env.DB.prepare(`
          SELECT id FROM seller_codes
          WHERE product_id = ? AND status = 'IN_STOCK' AND deleted_at IS NULL
          ORDER BY created_at ASC LIMIT 25
        `)
          .bind(sourceProductId)
          .all<{ id: string }>();

        availableCode = (codesRes?.results || []).find((c) => !pickedCodeIdsInRequest.has(c.id)) || null;
        if (!availableCode) {
          return new Response(
            JSON.stringify({ success: false, error: `Sản phẩm "${product.name}" đã tạm hết mã trong kho.` }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
        pickedCodeIdsInRequest.add(availableCode.id);
      }

      const childOrderId = `sord_${now}_${childOrdersToInsert.length}_${Math.random().toString(36).substring(2, 6)}`;
      const childOrderCode = `ORD-QR-S-${now.toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const priceCore = Number(product.price_core) || 0;
      totalAmount += priceCore;

      const sellerPrefix = sepayCfg?.payment_prefix || 'SHP';
      const transferContent = qrAllowedForItem ? `${sellerPrefix} ${shopGroupCode}` : null;

      childOrdersToInsert.push({
        id: childOrderId,
        order_code: childOrderCode,
        parent_order_id: parentOrderId,
        seller_id: product.seller_id,
        seller_name: product.seller_name,
        seller_owner_member_id: product.owner_member_id,
        product_id: product.id,
        product_name: product.name,
        product_type: isPhysical ? 'physical' : 'digital',
        game_slug: product.game_slug,
        code_id: availableCode ? availableCode.id : null,
        price_core: priceCore,
        status: 'PENDING_PAYMENT',
        payment_method: qrAllowedForItem ? 'QR_SEPAY' : 'CORE',
        payment_channel: qrAllowedForItem ? 'DIRECT_SEPAY' : 'CORE',
        shop_qr_group_code: qrAllowedForItem ? shopGroupCode : null,
        expires_at: expiresAt,
        qr_allowed: qrAllowedForItem,
        qr_ineligible_reason: eligibility.reason || null,
        qr_content: transferContent,
        bank_name: qrAllowedForItem ? sepayCfg?.bank_name || '' : '',
        account_number: qrAllowedForItem ? sepayCfg?.account_number || '' : '',
        bank_account: qrAllowedForItem ? sepayCfg?.account_holder || '' : '',
        has_api_token: Boolean(sepayCfg?.api_token_encrypted),
        is_affiliate_order: isAffiliate ? 1 : 0,
        affiliate_breakdown: affiliateBreakdownJson,
        supplier_seller_id: supplierSellerId,
        affiliate_wholesale_reserved_core: affiliateWholesaleToReserve,
      });

      itemsToReserve.push({
        isPhysical,
        sourceProductId,
        codeId: availableCode ? availableCode.id : null,
        childOrderId,
        productName: product.name,
        affiliateWholesaleCore: affiliateWholesaleToReserve,
        resellerOwnerMemberId: affiliateWholesaleToReserve > 0 ? product.owner_member_id : null,
      });
    }

    if (childOrdersToInsert.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không thể tạo đơn hàng từ danh sách sản phẩm đã chọn.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 4. Gom nhóm QR theo từng Gian hàng (1 shop = 1 mã VietQR tổng hợp toàn bộ món hợp lệ của shop đó)
    const shopGroupsMap = new Map<string, any>();
    for (const co of childOrdersToInsert) {
      if (!shopGroupsMap.has(co.seller_id)) {
        shopGroupsMap.set(co.seller_id, {
          seller_id: co.seller_id,
          seller_name: co.seller_name,
          shop_qr_group_code: co.shop_qr_group_code,
          total_amount: 0,
          qr_allowed: true,
          qr_ineligible_reason: null as string | null,
          bank_name: co.bank_name,
          account_number: co.account_number,
          bank_account: co.bank_account,
          qr_content: co.qr_content,
          qr_payload: null as string | null,
          has_api_token: co.has_api_token,
          status: 'PENDING_PAYMENT',
          order_ids: [] as string[],
        });
      }
      const grp = shopGroupsMap.get(co.seller_id);
      grp.total_amount += co.price_core;
      grp.order_ids.push(co.id);
      if (!co.qr_allowed) {
        grp.qr_allowed = false;
        grp.qr_ineligible_reason = grp.qr_ineligible_reason || co.qr_ineligible_reason;
      }
    }

    // Nếu 1 gian hàng có ít nhất 1 món không đủ điều kiện QR (VD: Affiliate thiếu vốn sỉ), đồng bộ cờ trên cả nhóm
    for (const grp of shopGroupsMap.values()) {
      if (grp.qr_allowed && grp.bank_name && grp.account_number && grp.qr_content) {
        grp.qr_payload = generateVietQrPayload({
          bankName: grp.bank_name,
          accountNumber: grp.account_number,
          amount: grp.total_amount,
          content: grp.qr_content,
        });
      } else {
        grp.qr_allowed = false;
        grp.qr_payload = null;
        grp.qr_content = null;
      }
    }

    // Gán qr_payload tương ứng cho từng child_order để tương thích ngược UI
    for (const co of childOrdersToInsert) {
      const grp = shopGroupsMap.get(co.seller_id);
      if (!grp?.qr_allowed) {
        co.qr_allowed = false;
        co.qr_payload = null;
        co.qr_content = null;
        co.shop_qr_group_code = null;
        co.payment_channel = 'CORE';
        co.payment_method = 'CORE';
        co.affiliate_wholesale_reserved_core = 0;
        const rItem = itemsToReserve.find((it) => it.childOrderId === co.id);
        if (rItem) {
          rItem.affiliateWholesaleCore = 0;
          rItem.resellerOwnerMemberId = null;
        }
      } else {
        co.qr_payload = grp.qr_payload;
      }
    }

    // 5. Pha 1 (Reserve-First): Khóa kho vật lý / giữ mã số + trích nguyên tử vốn sỉ Affiliate của chủ Shop A
    const reservedItems: typeof itemsToReserve = [];
    const deductedWholesale: Array<{ ownerMemberId: string; amount: number }> = [];

    const rollbackReservedItems = async () => {
      const rbIso = new Date().toISOString();
      for (const d of deductedWholesale) {
        await env.DB.prepare('UPDATE members SET balance = balance + ?, updated_at = ? WHERE id = ?')
          .bind(d.amount, rbIso, d.ownerMemberId)
          .run()
          .catch(() => {});
      }
      for (const item of reservedItems) {
        if (item.isPhysical) {
          await env.DB.prepare('UPDATE seller_products SET stock_quantity = stock_quantity + 1, updated_at = ? WHERE id = ?')
            .bind(rbIso, item.sourceProductId)
            .run()
            .catch(() => {});
        } else if (item.codeId) {
          await env.DB.prepare(`
            UPDATE seller_codes
            SET status = 'IN_STOCK', order_id = NULL, updated_at = ?
            WHERE id = ? AND order_id = ? AND status = 'RESERVED'
          `)
            .bind(rbIso, item.codeId, item.childOrderId)
            .run()
            .catch(() => {});
        }
      }
    };

    for (const item of itemsToReserve) {
      if (item.isPhysical) {
        const res: any = await env.DB.prepare(`
          UPDATE seller_products
          SET stock_quantity = stock_quantity - 1, updated_at = ?
          WHERE id = ? AND stock_quantity >= 1
        `)
          .bind(nowIso, item.sourceProductId)
          .run();
        const changes = Number(res?.meta?.changes ?? res?.changes ?? 0);
        if (changes !== 1) {
          await rollbackReservedItems();
          return new Response(
            JSON.stringify({
              success: false,
              error: `Sản phẩm vật lý "${item.productName}" vừa hết tồn kho. Đơn hàng chưa được tạo.`,
              code: 'STOCK_RACE_CONFLICT',
            }),
            { status: 409, headers: CORS_HEADERS }
          );
        }
        reservedItems.push(item);
      } else if (item.codeId) {
        const res: any = await env.DB.prepare(`
          UPDATE seller_codes
          SET status = 'RESERVED', order_id = ?, updated_at = ?
          WHERE id = ? AND status = 'IN_STOCK'
        `)
          .bind(item.childOrderId, nowIso, item.codeId)
          .run();
        const changes = Number(res?.meta?.changes ?? res?.changes ?? 0);
        if (changes !== 1) {
          await rollbackReservedItems();
          return new Response(
            JSON.stringify({
              success: false,
              error: `Mã kho của sản phẩm "${item.productName}" vừa được khách khác giữ. Vui lòng thử lại.`,
              code: 'STOCK_RACE_CONFLICT',
            }),
            { status: 409, headers: CORS_HEADERS }
          );
        }
        reservedItems.push(item);
      }

      // Trích tạm vốn sỉ nguyên tử từ Ví Core chủ Shop A cho đơn Liên Shop DIRECT_SEPAY
      if (item.affiliateWholesaleCore > 0 && item.resellerOwnerMemberId) {
        const wRes: any = await env.DB.prepare(`
          UPDATE members
          SET balance = balance - ?, updated_at = ?
          WHERE id = ? AND balance >= ?
        `)
          .bind(item.affiliateWholesaleCore, nowIso, item.resellerOwnerMemberId, item.affiliateWholesaleCore)
          .run();
        const wChanges = Number(wRes?.meta?.changes ?? wRes?.changes ?? 0);
        if (wChanges !== 1) {
          await rollbackReservedItems();
          return new Response(
            JSON.stringify({
              success: false,
              error: `Chủ gian hàng bán lại vừa không đủ hạn mức Ví Core ứng vốn cho sản phẩm Liên Shop "${item.productName}". Vui lòng thử lại bằng Ví Core.`,
              code: 'AFFILIATE_WHOLESALE_RACE_CONFLICT',
            }),
            { status: 409, headers: CORS_HEADERS }
          );
        }
        deductedWholesale.push({ ownerMemberId: item.resellerOwnerMemberId, amount: item.affiliateWholesaleCore });
      }
    }

    // 6. Pha 2: Chèn đơn cha và từng đơn con
    const anyDirectQr = Array.from(shopGroupsMap.values()).some((g) => g.qr_allowed);
    const parentChannel = anyDirectQr ? 'DIRECT_SEPAY' : 'CORE';
    const parentMethod = anyDirectQr ? 'QR_SEPAY' : 'CORE';

    const batchStatements: any[] = [
      env.DB.prepare(`
        INSERT INTO seller_parent_orders (
          id, parent_order_code, buyer_member_id, buyer_email,
          total_amount, payment_method, payment_channel, status, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT', ?, ?, ?)
      `).bind(
        parentOrderId,
        parentOrderCode,
        buyer.id,
        buyer.email || buyer.username,
        totalAmount,
        parentMethod,
        parentChannel,
        expiresAt,
        nowIso,
        nowIso
      ),
    ];

    for (const co of childOrdersToInsert) {
      batchStatements.push(
        env.DB.prepare(`
          INSERT INTO seller_orders (
            id, order_code, parent_order_id, buyer_member_id, buyer_name, buyer_email,
            seller_id, product_id, product_name, game_slug, code_id,
            price_core, payment_method, payment_channel, shop_qr_group_code, product_type, status, expires_at, created_at, updated_at,
            is_affiliate_order, affiliate_breakdown, supplier_seller_id, affiliate_wholesale_reserved_core
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT', ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          co.id,
          co.order_code,
          parentOrderId,
          buyer.id,
          buyer.username || buyer.email,
          buyer.email,
          co.seller_id,
          co.product_id,
          co.product_name,
          co.game_slug,
          co.code_id,
          co.price_core,
          co.payment_method,
          co.payment_channel,
          co.shop_qr_group_code,
          co.product_type || 'digital',
          expiresAt,
          nowIso,
          nowIso,
          co.is_affiliate_order || 0,
          co.affiliate_breakdown || null,
          co.supplier_seller_id || null,
          co.affiliate_wholesale_reserved_core || 0
        )
      );
    }

    try {
      await env.DB.batch(batchStatements);
    } catch (batchErr: any) {
      await rollbackReservedItems();
      throw batchErr;
    }

    await logAdminAudit(env.DB, {
      actorName: buyer.username || buyer.email,
      actorEmail: buyer.email,
      action: 'SELLER_PARENT_ORDER_CREATED',
      targetId: parentOrderId,
      details: {
        parent_order_code: parentOrderCode,
        total_amount: totalAmount,
        payment_channel: parentChannel,
        child_orders_count: childOrdersToInsert.length,
        shop_groups_count: shopGroupsMap.size,
      },
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tạo đơn hàng gian hàng thành công!',
        parent_order: {
          id: parentOrderId,
          parent_order_code: parentOrderCode,
          total_amount: totalAmount,
          payment_method: parentMethod,
          payment_channel: parentChannel,
          status: 'PENDING_PAYMENT',
          expires_at: expiresAt,
          seconds_left: Math.floor((expiresAtMs - now) / 1000),
        },
        shop_groups: Array.from(shopGroupsMap.values()),
        child_orders: childOrdersToInsert.map((co) => ({
          id: co.id,
          order_code: co.order_code,
          seller_id: co.seller_id,
          seller_name: co.seller_name,
          product_id: co.product_id,
          product_name: co.product_name,
          product_type: co.product_type,
          price_core: co.price_core,
          status: co.status,
          payment_channel: co.payment_channel,
          shop_qr_group_code: co.shop_qr_group_code,
          expires_at: co.expires_at,
          qr_allowed: co.qr_allowed,
          qr_ineligible_reason: co.qr_ineligible_reason,
          qr_payload: co.qr_payload,
          qr_content: co.qr_content,
          bank_name: co.bank_name,
          account_number: co.account_number,
          bank_account: co.bank_account,
          has_api_token: co.has_api_token,
        })),
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error('[createSellerMultiOrder error]', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi khi tạo đơn hàng gian hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
