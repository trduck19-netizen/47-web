import { verifyMemberAuth } from '../../services/mission_service';
import { ensureMarketplaceSchema, logAdminAudit } from '../../services/d1_service';
import { decryptCode, getMarketplaceConfig } from '../../services/marketplace_service';
import { calculate3WaySplit, syncAffiliatePriceAndStock } from '../../services/seller_affiliate_service';
import { dispatchSupplierFulfillmentWebhook } from '../../services/supplier_connector_service';

interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
  MARKETPLACE_CODE_KEY?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST: Mua hàng bằng ví Core & giao mã tự động tức thì (§6.2)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    await ensureMarketplaceSchema(env.DB);
    const auth = await verifyMemberAuth(request, env as any);
    if (!auth.authorized || !auth.member) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Vui lòng đăng nhập để thanh toán mua mã.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const buyer = auth.member;
    const body = (await request.json().catch(() => ({}))) as any;
    const { product_id } = body;

    if (!product_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Thiếu mã sản phẩm (product_id).' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 1. Kiểm tra sản phẩm và thông tin gian hàng
    const product = await env.DB
      .prepare(`
        SELECT sp.*, s.name as seller_name, s.status as seller_status, s.is_vacation, s.owner_member_id,
               s.pending_balance_core, s.available_balance_core, s.withdrawn_balance_core
        FROM seller_products sp
        JOIN sellers s ON sp.seller_id = s.id
        WHERE sp.id = ? AND sp.deleted_at IS NULL AND s.deleted_at IS NULL
        LIMIT 1
      `)
      .bind(product_id)
      .first<any>();

    if (!product) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sản phẩm không tồn tại hoặc đã bị xóa.' }),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (product.status !== 'APPROVED') {
      return new Response(
        JSON.stringify({ success: false, error: 'Sản phẩm hiện chưa được mở bán.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (product.seller_status !== 'TRIAL' && product.seller_status !== 'ACTIVE') {
      return new Response(
        JSON.stringify({ success: false, error: 'Gian hàng này hiện đang tạm ngừng hoạt động.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (product.is_vacation) {
      return new Response(
        JSON.stringify({ success: false, error: 'Gian hàng hiện đang nghỉ bán, tạm thời không nhận đơn mới.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (product.owner_member_id === buyer.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bạn không thể tự mua sản phẩm của chính gian hàng mình.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 2. Đọc cấu hình sàn động + kiểm tra trạng thái liên shop (chặn ANTI_LOSS_PAUSED / HIDDEN / tắt liên shop)
    const mConfig = await getMarketplaceConfig(env.DB);
    const isAffiliate = product.is_affiliate === 1 && Boolean(product.origin_product_id);
    const sourceProductId = isAffiliate ? product.origin_product_id : product.id;
    const supplierSellerId = isAffiliate ? product.origin_seller_id : null;
    let affiliateBreakdownJson: string | null = null;
    let origProd: any = null;

    if (isAffiliate) {
      if (!mConfig.affiliate_enabled) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Tính năng mua sản phẩm bán lại liên gian hàng đang tạm dừng bởi Quản trị viên.',
            code: 'AFFILIATE_DISABLED',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      origProd = await env.DB
        .prepare('SELECT id, seller_id, price_core, resell_enabled, resell_discount_pct, resell_commission_pct, resell_map_price, product_type, stock_quantity, status, deleted_at FROM seller_products WHERE id = ? LIMIT 1')
        .bind(product.origin_product_id)
        .first<any>();

      const listing = await env.DB
        .prepare('SELECT id, partnership_id, markup_type, markup_value, price_mode, locked_price, status, price_warning FROM seller_affiliate_listings WHERE reseller_product_id = ? LIMIT 1')
        .bind(product.id)
        .first<any>();

      if (!origProd || origProd.deleted_at || origProd.resell_enabled !== 1) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Sản phẩm gốc từ Nhà Cung Cấp đã ngừng bán lại.',
            code: 'SUPPLIER_DISABLED',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      if (!listing || listing.status !== 'ACTIVE' || listing.price_warning === 'ANTI_LOSS_PAUSED') {
        const isAntiLoss = listing?.price_warning === 'ANTI_LOSS_PAUSED';
        return new Response(
          JSON.stringify({
            success: false,
            error: isAntiLoss
              ? 'Sản phẩm bán lại đang bị tạm khóa chống lỗ do giá gốc thay đổi. Vui lòng quay lại sau.'
              : 'Sản phẩm bán lại hiện đang tạm ngừng kinh doanh.',
            code: isAntiLoss ? 'ANTI_LOSS_PAUSED' : 'AFFILIATE_LISTING_PAUSED',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const partnership = await env.DB
        .prepare('SELECT status FROM seller_affiliate_partnerships WHERE id = ? LIMIT 1')
        .bind(listing.partnership_id)
        .first<{ status: string }>();

      if (!partnership || partnership.status !== 'APPROVED') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Liên kết giữa hai gian hàng chưa được phê duyệt hoặc đã bị tạm khóa.',
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
        digitalFeePct: mConfig.affiliate_digital_fee_pct,
        physicalFeePct: mConfig.affiliate_physical_fee_pct,
      });

      if (mConfig.affiliate_auto_pause_on_loss && (split.resellerPayout < 0 || Number(product.price_core) < Number(origProd.price_core))) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Sản phẩm bán lại bị tạm khóa chống lỗ vì giá bán thấp hơn giá gốc Nhà Cung Cấp.',
            code: 'ANTI_LOSS_PAUSED',
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      affiliateBreakdownJson = JSON.stringify(split);
    }

    const effectiveProductType = String((isAffiliate ? origProd?.product_type : product.product_type) || product.product_type || 'digital').toLowerCase();
    const isPhysical = effectiveProductType === 'physical';

    let availableCode: any = null;
    let plainDeliveredCode: string | null = null;
    let currentPhysicalStock = 0;

    if (isPhysical) {
      const stockRow = isAffiliate
        ? origProd
        : product;
      currentPhysicalStock = Number(stockRow?.stock_quantity || 0);
      if (currentPhysicalStock < 1) {
        return new Response(
          JSON.stringify({ success: false, error: 'Sản phẩm vật lý tạm thời hết hàng trong kho. Vui lòng quay lại sau.', code: 'OUT_OF_STOCK' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
    } else {
      availableCode = await env.DB
        .prepare(`
          SELECT id, code_encrypted FROM seller_codes
          WHERE product_id = ? AND status = 'IN_STOCK' AND deleted_at IS NULL
          ORDER BY created_at ASC
          LIMIT 1
        `)
        .bind(sourceProductId)
        .first<any>();

      if (!availableCode) {
        return new Response(
          JSON.stringify({ success: false, error: 'Sản phẩm tạm thời hết mã trong kho. Vui lòng quay lại sau.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
    }

    // 3. Kiểm tra số dư Core của người mua
    const memberRow = await env.DB
      .prepare("SELECT id, balance, email, username FROM members WHERE id = ? LIMIT 1")
      .bind(buyer.id)
      .first<any>();

    const userCore = Number(memberRow?.balance ?? buyer.balance) || 0;
    const priceCore = product.price_core;

    if (userCore < priceCore) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Số dư ví không đủ để thanh toán. Bạn có ${userCore} Core, đơn hàng cần ${priceCore} Core.`,
          required_core: priceCore,
          current_balance_core: userCore,
        }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!isPhysical) {
      if (!env.MARKETPLACE_CODE_KEY || !env.MARKETPLACE_CODE_KEY.trim()) {
        return new Response(
          JSON.stringify({ success: false, error: 'Chưa cấu hình biến môi trường MARKETPLACE_CODE_KEY trên máy chủ.' }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
      // 4. Giải mã code trước để giao ngay
      plainDeliveredCode = await decryptCode(availableCode.code_encrypted, env.MARKETPLACE_CODE_KEY);
    }

    const holdHours = mConfig.hold_hours || 168;
    const holdUntil = new Date(Date.now() + holdHours * 3600 * 1000).toISOString();

    const orderId = `sord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orderCode = `CGM-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const ledgerId = `ledg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const currentHeld = Number(product.pending_balance_core) || 0;
    const currentAvailable = Number(product.available_balance_core) || 0;
    const currentWithdrawn = Number(product.withdrawn_balance_core) || 0;
    const newHeld = currentHeld + priceCore;

    // 5. Giao dịch nguyên tử qua D1 Batch (§4.3 & §6.1):
    // - Trừ Core người mua (có điều kiện balance >= priceCore chống race-condition)
    // - Đổi mã kho sang SOLD (hàng số) HOẶC trừ nguyên tử stock_quantity - 1 tại kho gốc (hàng vật lý)
    // - Cộng pending_balance_core cho gian hàng
    // - Ghi dòng HOLD vào sổ cái seller_ledger
    // - Thêm bản ghi đơn hàng seller_orders (trạng thái PAID trong 168h giữ tiền)
    const stockDeductStatement = isPhysical
      ? env.DB.prepare(`
          UPDATE seller_products
          SET stock_quantity = stock_quantity - 1, updated_at = ?
          WHERE id = ? AND stock_quantity >= 1
        `).bind(nowIso, sourceProductId)
      : env.DB.prepare(`
          UPDATE seller_codes
          SET status = 'SOLD', order_id = ?, sold_at = ?, updated_at = ?
          WHERE id = ? AND status = 'IN_STOCK'
        `).bind(orderId, nowIso, nowIso, availableCode.id);

    const batchResults = await env.DB.batch([
      // Statement 0: Trừ Core người mua
      env.DB.prepare(`
        UPDATE members
        SET balance = balance - ?, updated_at = ?
        WHERE id = ? AND balance >= ?
      `).bind(priceCore, nowIso, buyer.id, priceCore),

      // Statement 1: Trừ tồn kho hàng vật lý hoặc khóa mã số SOLD
      stockDeductStatement,

      // Statement 2: Cộng Core chờ rút cho gian hàng
      env.DB.prepare(`
        UPDATE sellers
        SET pending_balance_core = pending_balance_core + ?, updated_at = ?
        WHERE id = ?
      `).bind(priceCore, nowIso, product.seller_id),

      // Statement 3: Ghi dòng HOLD vào sổ cái seller_ledger
      env.DB.prepare(`
        INSERT INTO seller_ledger (
          id, seller_id, order_id, type, amount_core,
          balance_held_after, balance_available_after, balance_withdrawn_after,
          actor, reason, created_at
        ) VALUES (?, ?, ?, 'HOLD', ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        ledgerId,
        product.seller_id,
        orderId,
        priceCore,
        newHeld,
        currentAvailable,
        currentWithdrawn,
        buyer.username || buyer.email || 'buyer_core_wallet',
        `Mua lẻ bằng ví Core (Đơn hàng ${orderCode})`,
        nowIso
      ),

      // Statement 4: Thêm đơn hàng trạng thái PAID trong 168h giữ tiền (lưu phân rã tài chính 3 bên nếu là liên shop)
      env.DB.prepare(`
        INSERT INTO seller_orders (
          id, order_code, buyer_member_id, buyer_name, buyer_email,
          seller_id, product_id, product_name, game_slug, code_id,
          delivered_code, price_core, payment_method, product_type, hold_until,
          status, supplier_seller_id, is_affiliate_order, affiliate_breakdown,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CORE', ?, ?, 'PAID', ?, ?, ?, ?, ?)
      `).bind(
        orderId,
        orderCode,
        buyer.id,
        buyer.username || buyer.email,
        buyer.email,
        product.seller_id,
        product.id,
        product.name,
        product.game_slug,
        availableCode ? availableCode.id : null,
        plainDeliveredCode,
        priceCore,
        isPhysical ? 'physical' : 'digital',
        holdUntil,
        supplierSellerId,
        isAffiliate ? 1 : 0,
        affiliateBreakdownJson,
        nowIso,
        nowIso
      ),
    ]);

    // Kiểm tra hàng bị tác động của statement 0 (trừ tiền) & statement 1 (trừ kho/mã)
    const updateMemberMeta = (batchResults[0] as any)?.meta;
    if (updateMemberMeta && updateMemberMeta.changes === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Số dư không đủ hoặc có giao dịch khác đang thực hiện cùng lúc.' }),
        { status: 409, headers: CORS_HEADERS }
      );
    }

    const deductStockMeta = (batchResults[1] as any)?.meta;
    if (deductStockMeta && deductStockMeta.changes === 0) {
      return new Response(
        JSON.stringify({ success: false, error: isPhysical ? 'Sản phẩm vật lý vừa hết tồn kho. Vui lòng thử lại sau.' : 'Mã kho vừa được khách hàng khác mua. Vui lòng thử lại.' }),
        { status: 409, headers: CORS_HEADERS }
      );
    }

    // Ghi audit log & gửi PA2 Supplier Fulfillment Webhook (Non-blocking theo mẫu orders/create.ts)
    const backgroundPromises: Promise<any>[] = [
      logAdminAudit(env.DB, {
        actorName: buyer.username || buyer.email,
        actorEmail: buyer.email,
        action: 'SELLER_ORDER_PURCHASE',
        targetId: orderId,
        details: {
          order_code: orderCode,
          product_name: product.name,
          product_type: isPhysical ? 'physical' : 'digital',
          price_core: priceCore,
          seller_id: product.seller_id,
          supplier_seller_id: supplierSellerId,
          is_affiliate_order: isAffiliate,
          hold_until: holdUntil,
        },
      }).catch(() => {}),
      dispatchSupplierFulfillmentWebhook(env.DB, env, {
        sellerIds: [product.seller_id, ...(supplierSellerId ? [supplierSellerId] : [])],
        orderId,
        orderCode,
        eventType: 'order.paid',
        payloadData: {
          product_id: product.id,
          product_name: product.name,
          product_type: isPhysical ? 'physical' : 'digital',
          game_slug: product.game_slug,
          price_core: priceCore,
          seller_id: product.seller_id,
          supplier_seller_id: supplierSellerId,
          is_affiliate_order: isAffiliate,
          hold_until: holdUntil,
        },
      }).catch((err) => console.warn('[SellerOrders] PA2 webhook dispatch warning:', err?.message)),
    ];

    if (isPhysical && currentPhysicalStock - 1 <= 0) {
      backgroundPromises.push(
        syncAffiliatePriceAndStock(env.DB, sourceProductId, 'STOCK_CHANGE', { newStock: 0 }).catch(() => {})
      );
    }

    if (context.waitUntil) {
      context.waitUntil(Promise.all(backgroundPromises));
    } else {
      Promise.all(backgroundPromises).catch(() => {});
    }

    const newBalance = Math.max(0, userCore - priceCore);

    return new Response(
      JSON.stringify({
        success: true,
        message: isPhysical
          ? 'Thanh toán thành công! Đơn hàng vật lý đã được chuyển tới gian hàng để đóng gói và vận chuyển.'
          : 'Thanh toán thành công! Mã của bạn đã được giao ngay lập tức.',
        new_balance: newBalance,
        order: {
          id: orderId,
          order_code: orderCode,
          product_name: product.name,
          product_type: isPhysical ? 'physical' : 'digital',
          game_slug: product.game_slug,
          price_core: priceCore,
          delivered_code: plainDeliveredCode,
          status: 'PAID',
          hold_until: holdUntil,
          created_at: nowIso,
        },
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
