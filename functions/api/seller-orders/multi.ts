import { verifyMemberAuth } from '../../services/mission_service';
import { ensureMarketplaceSchema, logAdminAudit, checkAndExpireSellerOrdersD1 } from '../../services/d1_service';
import {
  getMarketplaceConfig,
  isTestSellerAllowed,
  generateVietQrPayload,
} from '../../services/marketplace_service';
import { calculate3WaySplit } from '../../services/seller_affiliate_service';

interface Env {
  DB: D1Database;
  SEPAY_API_KEY?: string;
  ADMIN_SYNC_SECRET?: string;
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

    await ensureMarketplaceSchema(env.DB);

    // 1. Xác thực người mua đăng nhập (verifyMemberAuth)
    const auth = await verifyMemberAuth(request, env as any);
    if (!auth.authorized || !auth.member) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Vui lòng đăng nhập để thanh toán đơn hàng.' }),
        { status: 401, headers: CORS_HEADERS }
      );
    }
    const buyer = auth.member;

    // 2. Kiểm tra cấu hình SePay API Key (§5 trường hợp 6)
    let configuredApiKey = (env.SEPAY_API_KEY || '').trim();
    let bankName = 'TPBank';
    let accountNumber = '10004681879';
    let bankAccount = 'CODE GAME SHOP';
    let paymentPrefix = 'WCG';
    let qrOrderExpiryMinutes = 15;

    try {
      const sepaySetting = await env.DB.prepare(
        "SELECT value FROM system_settings WHERE key = 'wcg_admin_sepay_v4' LIMIT 1"
      ).first<any>();
      if (sepaySetting?.value) {
        const parsed = typeof sepaySetting.value === 'string' ? JSON.parse(sepaySetting.value) : sepaySetting.value;
        if (!configuredApiKey && parsed?.apiKey) configuredApiKey = parsed.apiKey.trim();
        if (parsed?.bankName) bankName = parsed.bankName.trim();
        if (parsed?.accountNumber) accountNumber = parsed.accountNumber.trim();
        if (parsed?.bankAccount) bankAccount = parsed.bankAccount.trim();
        if (parsed?.paymentPrefix) paymentPrefix = parsed.paymentPrefix.trim().toUpperCase() || 'WCG';
        if (parsed?.qrOrderExpiryMinutes && Number(parsed.qrOrderExpiryMinutes) > 0) {
          qrOrderExpiryMinutes = Number(parsed.qrOrderExpiryMinutes);
        }
      }

      if (!configuredApiKey) {
        const privSetting = await env.DB.prepare(
          "SELECT value FROM system_settings WHERE key = 'wcg_admin_sepay_private_v1' LIMIT 1"
        ).first<any>();
        if (privSetting?.value) {
          const parsedPriv = typeof privSetting.value === 'string' ? JSON.parse(privSetting.value) : privSetting.value;
          if (parsedPriv?.apiKey) configuredApiKey = parsedPriv.apiKey.trim();
        }
      }
    } catch {}

    if (!configuredApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Chưa cấu hình SePay API Key trên máy chủ. Không thể tạo đơn thanh toán QR lúc này.',
        }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // 3. Phân tích giỏ hàng
    const body = (await request.json().catch(() => ({}))) as any;
    const items = Array.isArray(body?.items) ? body.items : (body?.product_id ? [{ product_id: body.product_id }] : []);

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Giỏ hàng trống. Vui lòng chọn sản phẩm.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (items.length > 10) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mỗi đơn hàng chỉ được chứa tối đa 10 sản phẩm.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Tự động quét và hoàn trả mã cho các đơn hàng đã hết hạn trước khi kiểm kho
    await checkAndExpireSellerOrdersD1(env.DB);

    // Giới hạn số đơn hàng chờ thanh toán tối đa của 1 tài khoản (chống DoS chiếm giữ mã kho)
    const pendingOrdersCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM seller_parent_orders
      WHERE buyer_member_id = ? AND status = 'PENDING_PAYMENT' AND datetime(expires_at) > datetime('now')
    `).bind(buyer.id).first<any>();

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
    }> = [];

    // 4. Kiểm tra từng sản phẩm và gian hàng (§4.1)
    for (const item of items) {
      const prodId = String(item.product_id || item.productId || '').trim();
      if (!prodId) continue;

      const product = await env.DB.prepare(`
        SELECT sp.*, s.owner_member_id, s.name as seller_name, s.status as seller_status, s.is_vacation, s.deleted_at as seller_deleted_at
        FROM seller_products sp
        JOIN sellers s ON sp.seller_id = s.id
        WHERE sp.id = ? AND sp.deleted_at IS NULL LIMIT 1
      `).bind(prodId).first<any>();

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

      // Kiểm tra danh sách thử nghiệm tiền thật (§1.11)
      // Lưu ý: Các gian hàng ngoài danh sách này vẫn tiếp tục bán bằng ví Core bình thường; chỉ không sinh mã QR SePay tiền thật
      const isRealMoneyAllowed = isTestSellerAllowed(config, product.seller_id);

      // Kiểm tra sản phẩm gán liên shop (Affiliate / Reseller)
      const isAffiliate = product.is_affiliate === 1 && Boolean(product.origin_product_id);
      const sourceProductId = isAffiliate ? product.origin_product_id : product.id;
      const supplierSellerId = isAffiliate ? product.origin_seller_id : null;
      let affiliateBreakdownJson: string | null = null;
      let origProd: any = null;

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

        origProd = await env.DB
          .prepare('SELECT id, seller_id, price_core, resell_enabled, resell_discount_pct, resell_commission_pct, resell_map_price, product_type, stock_quantity, deleted_at FROM seller_products WHERE id = ? LIMIT 1')
          .bind(product.origin_product_id)
          .first<any>();

        const listing = await env.DB
          .prepare('SELECT id, partnership_id, markup_type, markup_value, price_mode, locked_price, status, price_warning FROM seller_affiliate_listings WHERE reseller_product_id = ? LIMIT 1')
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
              code: isAntiLoss ? 'ANTI_LOSS_PAUSED' : (isListingOos ? 'OUT_OF_STOCK' : 'AFFILIATE_LISTING_PAUSED'),
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
          digitalFeePct: config.affiliate_digital_fee_pct,
          physicalFeePct: config.affiliate_physical_fee_pct,
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

        affiliateBreakdownJson = JSON.stringify(split);
      }

      const isPhysical = String((isAffiliate ? origProd?.product_type : product.product_type) || product.product_type || '').toLowerCase() === 'physical';

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
        // Tìm 1 mã IN_STOCK để giữ mã nguyên tử (§4.1: IN_STOCK -> RESERVED)
        // Nếu là đơn liên shop thì giữ mã trực tiếp từ kho của NCC (sourceProductId)
        availableCode = await env.DB.prepare(`
          SELECT id FROM seller_codes
          WHERE product_id = ? AND status = 'IN_STOCK' AND deleted_at IS NULL
          ORDER BY created_at ASC LIMIT 1
        `).bind(sourceProductId).first<any>();

        if (!availableCode) {
          return new Response(
            JSON.stringify({ success: false, error: `Sản phẩm "${product.name}" đã tạm hết mã trong kho.` }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
      }

      const childOrderId = `sord_${now}_${Math.random().toString(36).substring(2, 7)}`;
      // Định dạng mã đơn con ORD-QR-S-... để khớp chuẩn SePay webhook
      const childOrderCode = `ORD-QR-S-${now.toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const priceCore = Number(product.price_core) || 0;
      totalAmount += priceCore;

      const transferContent = `${paymentPrefix} ${childOrderCode}`;
      const qrPayload = isRealMoneyAllowed
        ? generateVietQrPayload({
            bankName,
            accountNumber,
            amount: priceCore,
            content: transferContent,
          })
        : null;

      childOrdersToInsert.push({
        id: childOrderId,
        order_code: childOrderCode,
        parent_order_id: parentOrderId,
        seller_id: product.seller_id,
        seller_name: product.seller_name,
        product_id: product.id,
        product_name: product.name,
        product_type: isPhysical ? 'physical' : 'digital',
        game_slug: product.game_slug,
        code_id: availableCode ? availableCode.id : null,
        price_core: priceCore,
        status: 'PENDING_PAYMENT',
        payment_method: 'QR_SEPAY',
        expires_at: expiresAt,
        qr_allowed: isRealMoneyAllowed,
        qr_payload: qrPayload,
        qr_content: isRealMoneyAllowed ? transferContent : null,
        bank_name: bankName,
        account_number: accountNumber,
        bank_account: bankAccount,
        is_affiliate_order: isAffiliate ? 1 : 0,
        affiliate_breakdown: affiliateBreakdownJson,
        supplier_seller_id: supplierSellerId,
      });

      // Ghi nhận danh sách cần giữ kho/mã trước khi tạo đơn cha/đơn con
      itemsToReserve.push({
        isPhysical,
        sourceProductId,
        codeId: availableCode ? availableCode.id : null,
        childOrderId,
        productName: product.name,
      });
    }

    if (childOrdersToInsert.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không thể tạo đơn hàng từ danh sách sản phẩm đã chọn.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 5. Pha 1 (Reserve-First): Khóa tồn kho vật lý / giữ mã số từng món TRƯỚC khi tạo đơn cha/đơn con
    // Kiểm tra meta.changes === 1 cho từng món; nếu bất kỳ món nào thất bại -> hoàn tác toàn bộ món đã giữ & trả 409
    const reservedItems: typeof itemsToReserve = [];
    const rollbackReservedItems = async () => {
      const rbIso = new Date().toISOString();
      for (const item of reservedItems) {
        if (item.isPhysical) {
          await env.DB.prepare(`
            UPDATE seller_products
            SET stock_quantity = stock_quantity + 1, updated_at = ?
            WHERE id = ?
          `).bind(rbIso, item.sourceProductId).run().catch(() => {});
        } else if (item.codeId) {
          await env.DB.prepare(`
            UPDATE seller_codes
            SET status = 'IN_STOCK', order_id = NULL, updated_at = ?
            WHERE id = ? AND order_id = ? AND status = 'RESERVED'
          `).bind(rbIso, item.codeId, item.childOrderId).run().catch(() => {});
        }
      }
    };

    for (const item of itemsToReserve) {
      if (item.isPhysical) {
        const res: any = await env.DB.prepare(`
          UPDATE seller_products
          SET stock_quantity = stock_quantity - 1, updated_at = ?
          WHERE id = ? AND stock_quantity >= 1
        `).bind(nowIso, item.sourceProductId).run();
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
        `).bind(item.childOrderId, nowIso, item.codeId).run();
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
    }

    // 6. Pha 2: Tạo đơn cha + các đơn con sau khi toàn bộ kho/mã đã xác nhận giữ thành công
    const batchStatements: any[] = [
      // Đơn cha
      env.DB.prepare(`
        INSERT INTO seller_parent_orders (
          id, parent_order_code, buyer_member_id, buyer_email,
          total_amount, payment_method, status, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'QR_SEPAY', 'PENDING_PAYMENT', ?, ?, ?)
      `).bind(
        parentOrderId,
        parentOrderCode,
        buyer.id,
        buyer.email || buyer.username,
        totalAmount,
        expiresAt,
        nowIso,
        nowIso
      ),
    ];

    // Chèn từng đơn con
    for (const co of childOrdersToInsert) {
      batchStatements.push(
        env.DB.prepare(`
          INSERT INTO seller_orders (
            id, order_code, parent_order_id, buyer_member_id, buyer_name, buyer_email,
            seller_id, product_id, product_name, game_slug, code_id,
            price_core, payment_method, product_type, status, expires_at, created_at, updated_at,
            is_affiliate_order, affiliate_breakdown, supplier_seller_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QR_SEPAY', ?, 'PENDING_PAYMENT', ?, ?, ?, ?, ?, ?)
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
          co.product_type || 'digital',
          expiresAt,
          nowIso,
          nowIso,
          co.is_affiliate_order || 0,
          co.affiliate_breakdown || null,
          co.supplier_seller_id || null
        )
      );
    }

    try {
      await env.DB.batch(batchStatements);
    } catch (batchErr: any) {
      await rollbackReservedItems();
      throw batchErr;
    }

    // Ghi nhật ký kiểm toán
    await logAdminAudit(env.DB, {
      actorName: buyer.username || buyer.email,
      actorEmail: buyer.email,
      action: 'SELLER_PARENT_ORDER_CREATED',
      targetId: parentOrderId,
      details: {
        parent_order_code: parentOrderCode,
        total_amount: totalAmount,
        child_orders_count: childOrdersToInsert.length,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tạo đơn hàng đa gian hàng thành công!',
        parent_order: {
          id: parentOrderId,
          parent_order_code: parentOrderCode,
          total_amount: totalAmount,
          payment_method: 'QR_SEPAY',
          status: 'PENDING_PAYMENT',
          expires_at: expiresAt,
          seconds_left: Math.floor((expiresAtMs - now) / 1000),
        },
        child_orders: childOrdersToInsert.map((co) => ({
          id: co.id,
          order_code: co.order_code,
          seller_id: co.seller_id,
          seller_name: co.seller_name,
          product_id: co.product_id,
          product_name: co.product_name,
          price_core: co.price_core,
          status: co.status,
          expires_at: co.expires_at,
          qr_allowed: co.qr_allowed,
          qr_payload: co.qr_payload,
          qr_content: co.qr_content,
          bank_name: co.bank_name,
          account_number: co.account_number,
          bank_account: co.bank_account,
        })),
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error('[createSellerMultiOrder error]', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Lỗi khi tạo đơn hàng đa gian hàng.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
