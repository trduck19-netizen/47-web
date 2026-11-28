import { getMarketplaceConfig, recordLedgerTransaction } from './marketplace_service';

function generateSecureIdSuffix(length = 4): string {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('WebCrypto API (crypto.getRandomValues) is required to generate secure ID suffix. Failing closed.');
  }
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface EscrowHoldParams {
  orderId: string;
  sellerId?: string;
  amountCore: number;
  actor: string;
  reason?: string;
  productType?: 'digital' | 'physical';
  warrantyHours?: number;
}

/**
 * Đảm bảo gian hàng chính thức Universal Mall tồn tại để ghi nhận dòng tiền bảo chứng
 */
export async function ensureOfficialSeller(db: D1Database): Promise<string> {
  const defaultSellerId = 'seller_universal_mall';
  const existing = await db
    .prepare("SELECT id FROM sellers WHERE id = ? LIMIT 1")
    .bind(defaultSellerId)
    .first<any>();

  if (!existing) {
    const nowIso = new Date().toISOString();
    await db
      .prepare(`
        INSERT INTO sellers (
          id, owner_member_id, name, slug, contact_phone, bank_name, bank_account, bank_account_name,
          description, status, pending_balance_core, available_balance_core, withdrawn_balance_core, created_at, updated_at
        ) VALUES (?, 'admin', 'Universal Mall Official Store', 'universal-mall-official',
          '0987654321', 'TPBANK', '00000000000', 'UNIVERSAL MALL',
          'Gian hàng chính hãng sàn Universal Mall - Bảo chứng giữ tiền đa tầng (24h - 168h)', 'ACTIVE', 0, 0, 0, ?, ?
        )
      `)
      .bind(defaultSellerId, nowIso, nowIso)
      .run()
      .catch(() => {});
  }
  return defaultSellerId;
}

/**
 * 1. Ghi nhận giữ tiền đa tầng khi khách thanh toán thành công
 * - Hàng số: giữ 24–72h (theo warranty_hours hoặc 48h), hoa hồng 5%
 * - Hàng vật lý: giữ 168h (7 ngày), hoa hồng 2%
 */
export async function recordEscrowHold(
  db: D1Database,
  params: EscrowHoldParams
): Promise<{ success: boolean; holdUntil: string; ledgerId?: string; error?: string }> {
  try {
    const sellerId = params.sellerId || (await ensureOfficialSeller(db));
    const isPhys = String(params.productType || '').toLowerCase() === 'physical';
    const mConfig = await getMarketplaceConfig(db);
    const holdFeePct = isPhys ? mConfig.affiliate_physical_fee_pct : mConfig.affiliate_digital_fee_pct;
    const holdHours = isPhys ? 168 : (params.warrantyHours || 48);
    const holdUntil = new Date(Date.now() + holdHours * 3600 * 1000).toISOString();
    const feeRateDesc = `phí hoa hồng ${holdFeePct}%`;

    const ledgerRes = await recordLedgerTransaction(db, {
      sellerId,
      orderId: params.orderId,
      type: 'HOLD',
      amountCore: params.amountCore,
      actor: params.actor,
      reason: params.reason || `Bảo chứng sàn giữ tiền ${holdHours} giờ cho đơn hàng ${params.orderId} (${feeRateDesc})`,
    });

    if (!ledgerRes.success) {
      return { success: false, holdUntil, error: ledgerRes.error };
    }

    return {
      success: true,
      holdUntil,
      ledgerId: ledgerRes.ledgerId,
    };
  } catch (err: any) {
    return { success: false, holdUntil: '', error: err?.message };
  }
}

/**
 * 2. Khách hàng bấm xác nhận đã nhận hàng -> Giải ngân ngay cho người bán
 */
export async function confirmReceivedAndRelease(
  db: D1Database,
  orderId: string,
  userId?: string,
  actor = 'customer_confirm',
  isAdmin = false
): Promise<{ success: boolean; message: string; releasedAmount?: number }> {
  try {
    let order = await db
      .prepare("SELECT * FROM orders WHERE id = ? COLLATE NOCASE LIMIT 1")
      .bind(orderId)
      .first<any>();

    let isSellerOrderTable = false;
    if (!order) {
      order = await db
        .prepare("SELECT * FROM seller_orders WHERE (id = ? OR order_code = ?) AND deleted_at IS NULL LIMIT 1")
        .bind(orderId, orderId)
        .first<any>();
      if (order) {
        isSellerOrderTable = true;
      }
    }

    if (!order) {
      return { success: false, message: `Không tìm thấy đơn hàng ${orderId}.` };
    }

    // Kiểm tra quyền sở hữu nếu có userId và không phải quyền quản trị viên
    const orderBuyerId = isSellerOrderTable ? (order.buyer_member_id || order.member_id) : order.member_id;
    if (userId && !isAdmin && orderBuyerId && orderBuyerId !== userId) {
      return { success: false, message: 'Bạn không có quyền thao tác trên đơn hàng này.' };
    }

    if (order.escrow_status === 'RELEASED' || order.status === 'COMPLETED' || order.released_at) {
      return { success: false, message: 'Đơn hàng này đã được giải ngân hoàn tất trước đó.' };
    }

    if (order.escrow_status === 'DISPUTED' || order.status === 'REPORTED' || order.status === 'DISPUTED') {
      return { success: false, message: 'Đơn hàng đang có khiếu nại chưa giải quyết. Vui lòng chờ Quản trị viên xử lý.' };
    }

    const sellerId = order.seller_id || (await ensureOfficialSeller(db));
    const amount = Number(order.total_amount || order.price_core || 0);
    const isPhysical = String(order.product_type || '').toLowerCase() === 'physical' || Boolean(order.shipping_address);
    const mConfig = await getMarketplaceConfig(db);
    const feeRatePct = isPhysical ? mConfig.affiliate_physical_fee_pct : mConfig.affiliate_digital_fee_pct;
    const feeRate = feeRatePct / 100;
    const feeCore = Math.round(amount * feeRate);
    const nowIso = new Date().toISOString();

    // 1. Cập nhật trạng thái đơn hàng sang COMPLETED & RELEASED (State-guarded FIRST để chống race condition)
    let changes = 0;
    if (isSellerOrderTable) {
      const updateRes: any = await db
        .prepare(`
          UPDATE seller_orders
          SET status = 'COMPLETED',
              released_at = ?,
              updated_at = ?
          WHERE id = ?
            AND status != 'COMPLETED'
            AND released_at IS NULL
        `)
        .bind(nowIso, nowIso, order.id)
        .run();
      changes = updateRes?.meta?.changes ?? updateRes?.changes ?? 0;
    } else {
      const updateRes: any = await db
        .prepare(`
          UPDATE orders
          SET status = 'COMPLETED',
              escrow_status = 'RELEASED',
              released_at = ?,
              updated_at = ?
          WHERE id = ?
            AND escrow_status != 'RELEASED'
            AND escrow_status != 'REFUNDED'
        `)
        .bind(nowIso, nowIso, order.id)
        .run();
      changes = updateRes?.meta?.changes ?? updateRes?.changes ?? 0;
    }

    if (changes === 0) {
      return { success: false, message: 'Đơn hàng này đã được giải ngân hoặc hoàn tiền trước đó.' };
    }

    // Cô lập tuyệt đối với Ví Sàn cho đơn thu trực tiếp qua SePay riêng của Chủ Shop (DIRECT_SEPAY):
    // Shop bán đã nhận 100% tiền VNĐ ngoài ngân hàng -> KHÔNG cộng Core vào Ví Sàn của Shop bán.
    if (String(order.payment_channel || '').toUpperCase() === 'DIRECT_SEPAY') {
      const isAff = Number(order.is_affiliate_order || 0) === 1 && Boolean(order.supplier_seller_id);
      const wholesaleCore = Math.max(0, Number(order.affiliate_wholesale_reserved_core || 0));
      if (isAff && wholesaleCore > 0 && order.supplier_seller_id) {
        await recordLedgerTransaction(db, {
          sellerId: String(order.supplier_seller_id),
          orderId: order.id,
          type: 'RELEASE',
          amountCore: wholesaleCore,
          actor,
          reason: `Giải ngân vốn sỉ đơn Liên Shop DIRECT_SEPAY ${order.order_code || order.id} (đã đối ứng 100% từ Ví Core chủ shop bán lại)`,
        }).catch(() => {});
      }
      return {
        success: true,
        message: `Đã hoàn tất xác nhận nhận hàng đơn DIRECT_SEPAY ${order.order_code || order.id} (0 Core cộng thêm vào Ví Sàn).`,
        releasedAmount: isAff ? wholesaleCore : 0,
      };
    }

    // Nhóm 4: Động cơ chia tiền 3 bên cho đơn liên shop (Affiliate / Reseller)
    if (order.is_affiliate_order === 1 && order.affiliate_breakdown) {
      let breakdown: any = {};
      try {
        breakdown = JSON.parse(order.affiliate_breakdown);
      } catch {}

      const supplierId = order.supplier_seller_id;
      const resellerId = order.seller_id;
      const supplierPayout = Number(breakdown.supplierPayout) || 0;
      const resellerPayout = Number(breakdown.resellerPayout) || 0;
      const platformFee = Number(breakdown.platformFee) || 0;
      const shippingFee = Number(breakdown.shippingFee) || 0;

      // 1. Giải ngân tiền hoa hồng & mức tăng cho Shop Gán (Shop B): resellerPayout
      // Đồng thời khấu trừ toàn bộ amount khỏi pending_balance_core của Shop Gán
      if (resellerId) {
        const reseller = await db.prepare("SELECT * FROM sellers WHERE id = ?").bind(resellerId).first<any>();
        const curResHeld = Number(reseller?.pending_balance_core) || 0;
        const curResAvail = Number(reseller?.available_balance_core) || 0;
        const newResHeld = Math.max(0, curResHeld - amount);
        const newResAvail = curResAvail + resellerPayout;

        await db.prepare(`
          UPDATE sellers
          SET pending_balance_core = ?, available_balance_core = ?, updated_at = ?
          WHERE id = ?
        `).bind(newResHeld, newResAvail, nowIso, resellerId).run();

        const ledgResId = `ledg_${Date.now()}_res_${Math.random().toString(36).slice(2, 6)}`;
        await db.prepare(`
          INSERT INTO seller_ledger (
            id, seller_id, order_id, type, amount_core,
            balance_held_after, balance_available_after, balance_withdrawn_after,
            actor, reason, created_at
          ) VALUES (?, ?, ?, 'RELEASE', ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          ledgResId, resellerId, order.id, resellerPayout,
          newResHeld, newResAvail, Number(reseller?.withdrawn_balance_core) || 0,
          actor, `Giải ngân doanh thu Shop Gán đơn liên shop ${order.order_code || order.id} (Mức tăng + Hoa hồng + Chiết khấu)`, nowIso
        ).run();
      }

      // 2. Giải ngân tiền hàng cho NCC (Shop A): supplierPayout + shippingFee vào available_balance_core
      if (supplierId && supplierPayout + shippingFee > 0) {
        const supplier = await db.prepare("SELECT * FROM sellers WHERE id = ?").bind(supplierId).first<any>();
        const curSupHeld = Number(supplier?.pending_balance_core) || 0;
        const curSupAvail = Number(supplier?.available_balance_core) || 0;
        const newSupAvail = curSupAvail + supplierPayout + shippingFee;

        await db.prepare(`
          UPDATE sellers
          SET available_balance_core = ?, updated_at = ?
          WHERE id = ?
        `).bind(newSupAvail, nowIso, supplierId).run();

        const ledgSupId = `ledg_${Date.now()}_sup_${Math.random().toString(36).slice(2, 6)}`;
        await db.prepare(`
          INSERT INTO seller_ledger (
            id, seller_id, order_id, type, amount_core,
            balance_held_after, balance_available_after, balance_withdrawn_after,
            actor, reason, created_at
          ) VALUES (?, ?, ?, 'RELEASE', ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          ledgSupId, supplierId, order.id, supplierPayout + shippingFee,
          curSupHeld, newSupAvail, Number(supplier?.withdrawn_balance_core) || 0,
          actor, `Giải ngân tiền hàng NCC đơn liên shop ${order.order_code || order.id} (Giá gốc - Chiết khấu - Phí sàn - Hoa hồng + Ship)`, nowIso
        ).run();
      }

      // 3. Ghi nhận phí sàn
      if (platformFee > 0) {
        const ledgFeeId = `ledg_${Date.now()}_fee_${Math.random().toString(36).slice(2, 6)}`;
        await db.prepare(`
          INSERT INTO seller_ledger (
            id, seller_id, order_id, type, amount_core,
            balance_held_after, balance_available_after, balance_withdrawn_after,
            actor, reason, created_at
          ) VALUES (?, ?, ?, 'FEE', ?, 0, 0, 0, 'platform_fee', ?, ?)
        `).bind(
          ledgFeeId, supplierId || resellerId, order.id, platformFee,
          `Thu phí sàn ${breakdown.feeRatePct ?? feeRatePct}% trên giá gốc cho đơn liên shop ${order.order_code || order.id}`, nowIso
        ).run();
      }

      if (isSellerOrderTable) {
        await db.prepare("UPDATE seller_orders SET fee_core = ? WHERE id = ?").bind(platformFee, order.id).run().catch(() => {});
      }

      return {
        success: true,
        message: `Đã giải ngân thành công đơn liên shop ${order.id}: NCC nhận ${(supplierPayout + shippingFee).toLocaleString('vi-VN')} Core, Shop gán nhận ${resellerPayout.toLocaleString('vi-VN')} Core, Sàn thu ${platformFee.toLocaleString('vi-VN')} Core.`,
      };
    }

    // 2. Ghi dòng RELEASE sau khi đã xác nhận state guard thành công (Đơn thông thường)
    const relRes = await recordLedgerTransaction(db, {
      sellerId,
      orderId: order.id,
      type: 'RELEASE',
      amountCore: amount,
      actor,
      reason: `Khách hàng xác nhận đã nhận hàng - Giải ngân thành công cho đơn ${order.id} (${isPhysical ? 'Hàng vật lý' : 'Hàng số'})`,
    });

    if (!relRes.success) {
      console.warn('[Escrow Warning] Ghi sổ cái giải ngân gặp lỗi sau khi đã cập nhật trạng thái đơn:', relRes.error);
      await db.prepare(`
        UPDATE orders
        SET status = 'PROCESSING',
            escrow_status = 'HELD',
            released_at = NULL,
            updated_at = ?
        WHERE id = ?
      `).bind(nowIso, order.id).run();
      return {
        success: false,
        message: `Lỗi khi ghi sổ cái giải ngân (${relRes.error}). Đã khôi phục trạng thái đơn hàng về HELD để bảo vệ số dư.`,
      };
    }

    // 3. Ghi dòng FEE
    if (feeCore > 0) {
      const feeRes = await recordLedgerTransaction(db, {
        sellerId,
        orderId: order.id,
        type: 'FEE',
        amountCore: feeCore,
        actor: 'platform_fee',
        reason: `Thu phí hoa hồng sàn ${feeRatePct}% cho đơn ${order.id}`,
      });

      if (!feeRes.success) {
        console.warn('[Escrow Warning] Ghi sổ cái phí sàn gặp lỗi:', feeRes.error);
        const rollbackRes = await recordLedgerTransaction(db, {
          sellerId,
          orderId: order.id,
          type: 'HOLD',
          amountCore: amount,
          actor: 'escrow_rollback',
          reason: `Hoàn tác giải ngân do lỗi ghi nhận phí sàn đơn ${order.id}: ${feeRes.error}`,
        });

        await db.prepare(`
          UPDATE orders
          SET status = 'PROCESSING',
              escrow_status = 'HELD',
              released_at = NULL,
              updated_at = ?
          WHERE id = ?
        `).bind(nowIso, order.id).run();

        if (!rollbackRes.success) {
          console.error('[Escrow Critical Error] Lỗi nghiêm trọng: Ghi entry HOLD bù trừ thất bại:', rollbackRes.error);
          return {
            success: false,
            message: `Lỗi nghiêm trọng: Ghi phí sàn lỗi (${feeRes.error}) và ghi entry HOLD bù trừ thất bại (${rollbackRes.error}). Yêu cầu kiểm toán can thiệp.`,
          };
        }

        return {
          success: false,
          message: `Lỗi khi ghi nhận phí sàn (${feeRes.error}). Đã hoàn tác giải ngân và khôi phục đơn hàng về HELD.`,
        };
      }
    }

    const logId1 = 'sec_' + Date.now().toString(36) + '_' + generateSecureIdSuffix(4);
    await db.prepare(`
      INSERT INTO security_logs (id, actor_name, action, target_id, severity, details, created_at)
      VALUES (?, ?, 'ESCROW_ORDER_CONFIRMED_RELEASE', ?, 'INFO', ?, ?)
    `).bind(logId1, actor, order.id, JSON.stringify({ amount, feeCore, sellerId }), nowIso)
      .run()
      .catch(() => {});

    return {
      success: true,
      message: `Xác nhận thành công! Đã giải ngân ${amount.toLocaleString('vi-VN')} Core cho người bán (phí sàn ${feeCore.toLocaleString('vi-VN')} Core).`,
      releasedAmount: amount,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi hệ thống khi giải ngân đơn hàng.' };
  }
}

/**
 * 3. Tự động giải ngân các đơn hàng đã quá 168 giờ không khiếu nại
 */
export async function autoReleaseDueEscrow(
  db: D1Database,
  actor = 'system_cron_168h'
): Promise<{ processed: number; successCount: number; errors: string[] }> {
  try {
    const dueOrdersRes = await db
      .prepare(`
        SELECT * FROM orders
        WHERE escrow_status = 'HOLDING'
          AND hold_until IS NOT NULL
          AND datetime(hold_until) <= datetime('now')
          AND escrow_status != 'DISPUTED'
        LIMIT 50
      `)
      .all<any>();

    const dueOrders = dueOrdersRes?.results || [];
    let successCount = 0;
    const errors: string[] = [];

    for (const ord of dueOrders) {
      const res = await confirmReceivedAndRelease(db, ord.id, undefined, actor);
      if (res.success) {
        successCount++;
      } else {
        errors.push(`Đơn ${ord.id}: ${res.message}`);
      }
    }

    // Quét thêm đơn từ bảng seller_orders (đơn sàn người bán / liên shop affiliate)
    const dueSellerOrdersRes = await db
      .prepare(`
        SELECT id FROM seller_orders
        WHERE status = 'PAID'
          AND hold_until IS NOT NULL
          AND datetime(hold_until) <= datetime('now')
          AND released_at IS NULL
          AND (report_reason IS NULL OR status != 'REPORTED')
          AND deleted_at IS NULL
        LIMIT 50
      `)
      .all<any>();

    const dueSellerOrders = dueSellerOrdersRes?.results || [];
    for (const sord of dueSellerOrders) {
      const res = await confirmReceivedAndRelease(db, sord.id, undefined, actor);
      if (res.success) {
        successCount++;
      } else {
        errors.push(`Đơn ${sord.id}: ${res.message}`);
      }
    }

    return {
      processed: dueOrders.length + dueSellerOrders.length,
      successCount,
      errors,
    };
  } catch (err: any) {
    return { processed: 0, successCount: 0, errors: [err?.message] };
  }
}

/**
 * 4. Khách hàng gửi khiếu nại trong thời hạn 168 giờ
 */
export async function fileOrderDispute(
  db: D1Database,
  params: {
    orderId: string;
    userId: string;
    reason: string;
    detail?: string;
  }
): Promise<{ success: boolean; message: string; disputeId?: string }> {
  try {
    const { orderId, userId, reason, detail } = params;
    let order = await db
      .prepare("SELECT * FROM orders WHERE id = ? COLLATE NOCASE LIMIT 1")
      .bind(orderId)
      .first<any>();

    let isSellerOrderTable = false;
    if (!order) {
      order = await db
        .prepare("SELECT * FROM seller_orders WHERE (id = ? OR order_code = ?) AND deleted_at IS NULL LIMIT 1")
        .bind(orderId, orderId)
        .first<any>();
      if (order) isSellerOrderTable = true;
    }

    if (!order) {
      return { success: false, message: `Không tìm thấy đơn hàng ${orderId}.` };
    }

    const orderBuyerId = isSellerOrderTable ? (order.buyer_member_id || order.member_id) : order.member_id;
    if (orderBuyerId && orderBuyerId !== userId) {
      return { success: false, message: 'Bạn không có quyền khiếu nại đơn hàng của người khác.' };
    }

    if (order.escrow_status === 'RELEASED' || order.status === 'COMPLETED' || order.released_at) {
      return { success: false, message: 'Đơn hàng này đã được giải ngân hoàn tất, không thể khiếu nại bảo chứng.' };
    }

    if (order.escrow_status === 'DISPUTED' || order.status === 'REPORTED' || order.status === 'DISPUTED') {
      return { success: false, message: 'Đơn hàng này đã có khiếu nại đang được xử lý.' };
    }

    const nowIso = new Date().toISOString();
    const disputeId = `dsp_${Date.now().toString(36)}_${generateSecureIdSuffix(4)}`;
    const sellerId = order.seller_id || (await ensureOfficialSeller(db));

    // Cập nhật trạng thái đơn sang DISPUTED (đóng băng giải ngân)
    let updateOrderRes: any;
    if (isSellerOrderTable) {
      updateOrderRes = await db
        .prepare(`
          UPDATE seller_orders
          SET status = 'REPORTED',
              report_reason = ?,
              report_note = ?,
              reported_at = ?,
              updated_at = ?
          WHERE id = ? AND status != 'REPORTED'
        `)
        .bind(reason, detail || '', nowIso, nowIso, order.id)
        .run();
    } else {
      updateOrderRes = await db
        .prepare(`
          UPDATE orders
          SET escrow_status = 'DISPUTED',
              dispute_reason = ?,
              dispute_detail = ?,
              updated_at = ?
          WHERE id = ? AND escrow_status != 'DISPUTED'
        `)
        .bind(reason, detail || '', nowIso, order.id)
        .run();
    }

    if (!updateOrderRes.success || (updateOrderRes.meta?.changes ?? 0) === 0) {
      return { success: false, message: 'Không thể chuyển trạng thái đơn hàng sang khiếu nại hoặc đơn hàng đã bị khiếu nại trước đó.' };
    }

    // Nếu là đơn liên shop (Affiliate), bổ sung thông tin NCC vào chi tiết khiếu nại để giải quyết 3 bên
    const finalDetail = order.is_affiliate_order === 1 && order.supplier_seller_id
      ? `[Affiliate 3-Way Dispute: NCC ${order.supplier_seller_id} & Shop Gán ${order.seller_id}] ${detail || ''}`
      : (detail || '');

    // Ghi vào bảng seller_disputes (Hard error nếu thất bại, không nuốt lỗi)
    const insertDisputeRes = await db
      .prepare(`
        INSERT INTO seller_disputes (
          id, order_id, buyer_member_id, seller_id, reason, detail, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
      `)
      .bind(disputeId, order.id, userId, sellerId, reason, finalDetail, nowIso, nowIso)
      .run();

    if (!insertDisputeRes.success) {
      // Rollback trạng thái đơn hàng để đảm bảo toàn vẹn dữ liệu
      if (isSellerOrderTable) {
        await db.prepare(`
          UPDATE seller_orders
          SET status = 'PAID',
              report_reason = NULL,
              report_note = NULL,
              reported_at = NULL,
              updated_at = ?
          WHERE id = ? AND status = 'REPORTED'
        `).bind(nowIso, order.id).run().catch(() => {});
      } else {
        await db.prepare(`
          UPDATE orders
          SET escrow_status = 'HELD',
              dispute_reason = NULL,
              dispute_detail = NULL,
              updated_at = ?
          WHERE id = ? AND escrow_status = 'DISPUTED'
        `).bind(nowIso, order.id).run().catch(() => {});
      }

      return {
        success: false,
        message: 'Lỗi ghi nhận khiếu nại vào cơ sở dữ liệu. Yêu cầu khiếu nại không thành công.',
      };
    }

    // Nếu là đơn liên shop (Affiliate), bổ sung bản ghi tranh chấp cho NCC để cả 2 bên cùng thấy
    if (order.is_affiliate_order === 1 && order.supplier_seller_id && order.supplier_seller_id !== sellerId) {
      const supDisputeId = `dsp_sup_${Date.now().toString(36)}_${generateSecureIdSuffix(4)}`;
      try {
        const supDisputeRes = await db.prepare(`
          INSERT INTO seller_disputes (
            id, order_id, buyer_member_id, seller_id, reason, detail, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
        `).bind(supDisputeId, order.id, userId, order.supplier_seller_id, reason, finalDetail, nowIso, nowIso).run();

        if (!supDisputeRes.success) {
          throw new Error('Lỗi CSDL khi tạo bản ghi khiếu nại cho NCC.');
        }
      } catch (supErr: any) {
        console.error('[Escrow] Lỗi tạo khiếu nại NCC:', supErr);
        // Rollback 2 chiều đầy đủ: xóa dispute thứ 1 của shop gán và khôi phục đơn
        await db.prepare("DELETE FROM seller_disputes WHERE id = ?").bind(disputeId).run().catch(() => {});
        if (isSellerOrderTable) {
          await db.prepare(`
            UPDATE seller_orders
            SET status = 'PAID', report_reason = NULL, report_note = NULL, reported_at = NULL, updated_at = ?
            WHERE id = ? AND status = 'REPORTED'
          `).bind(nowIso, order.id).run().catch(() => {});
        } else {
          await db.prepare(`
            UPDATE orders
            SET escrow_status = 'HELD', dispute_reason = NULL, dispute_detail = NULL, updated_at = ?
            WHERE id = ? AND escrow_status = 'DISPUTED'
          `).bind(nowIso, order.id).run().catch(() => {});
        }
        return {
          success: false,
          message: 'Lỗi ghi nhận khiếu nại cho Nhà cung cấp. Đã khôi phục trạng thái đơn hàng.',
        };
      }
    }

    const logId2 = 'sec_' + Date.now().toString(36) + '_' + generateSecureIdSuffix(4);
    await db.prepare(`
      INSERT INTO security_logs (id, actor_name, action, target_id, severity, details, created_at)
      VALUES (?, ?, 'ESCROW_ORDER_DISPUTED', ?, 'INFO', ?, ?)
    `).bind(logId2, userId, order.id, JSON.stringify({ disputeId, reason, detail }), nowIso)
      .run()
      .catch(() => {});

    return {
      success: true,
      message: 'Đã gửi khiếu nại thành công! Tiền thanh toán của đơn hàng tiếp tục được sàn phong tỏa giữ an toàn cho đến khi Quản trị viên thẩm định giải quyết.',
      disputeId,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi gửi khiếu nại.' };
  }
}

/**
 * 5. Quản trị viên xử lý khiếu nại (Giải ngân cho người bán hoặc Hoàn tiền cho khách)
 */
export async function resolveAdminDispute(
  db: D1Database,
  params: {
    orderId: string;
    resolution: 'RELEASE' | 'REFUND';
    adminId: string;
    note?: string;
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const { orderId, resolution, adminId, note } = params;
    let isSellerOrder = false;
    let order = await db
      .prepare("SELECT * FROM orders WHERE id = ? COLLATE NOCASE LIMIT 1")
      .bind(orderId)
      .first<any>();

    if (!order) {
      order = await db
        .prepare("SELECT * FROM seller_orders WHERE id = ? COLLATE NOCASE LIMIT 1")
        .bind(orderId)
        .first<any>();
      if (order) isSellerOrder = true;
    }

    if (!order) {
      return { success: false, message: `Không tìm thấy đơn hàng ${orderId}.` };
    }

    const sellerId = order.seller_id || (await ensureOfficialSeller(db));
    const amount = Number(order.total_amount || order.price_core || 0);
    const buyerMemberId = order.buyer_member_id || order.member_id;
    const nowIso = new Date().toISOString();

    if (resolution === 'RELEASE') {
      // Quản trị viên phán quyết giải ngân cho người bán
      const relRes = await confirmReceivedAndRelease(db, order.id, undefined, `admin_resolve_${adminId}`);
      if (!relRes.success) return relRes;

      await db
        .prepare(`
          UPDATE seller_disputes
          SET status = 'RESOLVED_SELLER_RELEASE',
              resolved_by = ?,
              resolution_note = ?,
              updated_at = ?
          WHERE order_id = ?
        `)
        .bind(adminId, note || 'Quản trị viên giải quyết giải ngân cho người bán', nowIso, order.id)
        .run()
        .catch(() => {});

      return {
        success: true,
        message: `Đã xử lý khiếu nại: Giải ngân ${amount.toLocaleString('vi-VN')} Core cho người bán.`,
      };
    } else {
      // Quản trị viên phán quyết hoàn tiền cho khách (khách thắng khiếu nại)
      if (order.escrow_status === 'REFUNDED' || order.status === 'REFUNDED') {
        return { success: false, message: 'Đơn hàng này đã được hoàn tiền trước đó.' };
      }
      if (order.escrow_status === 'RELEASED' || order.status === 'COMPLETED') {
        return { success: false, message: 'Đơn hàng này đã được giải ngân hoàn tất, không thể hoàn tiền.' };
      }

      // Cập nhật trạng thái đơn sang REFUNDED (State-guarded update first để chống hoàn trùng lặp)
      let updateRes: any;
      if (isSellerOrder) {
        updateRes = await db
          .prepare(`
            UPDATE seller_orders
            SET status = 'REFUNDED',
                updated_at = ?
            WHERE id = ?
              AND status != 'REFUNDED'
              AND status != 'COMPLETED'
          `)
          .bind(nowIso, order.id)
          .run();
      } else {
        updateRes = await db
          .prepare(`
            UPDATE orders
            SET status = 'REFUNDED',
                escrow_status = 'REFUNDED',
                updated_at = ?
            WHERE id = ?
              AND escrow_status != 'REFUNDED'
              AND escrow_status != 'RELEASED'
              AND status != 'COMPLETED'
          `)
          .bind(nowIso, order.id)
          .run();
      }

      if (!updateRes || updateRes.meta?.changes === 0) {
        return { success: false, message: 'Đơn hàng này đã được xử lý hoàn tiền hoặc giải ngân trước đó.' };
      }

      const refRes = await recordLedgerTransaction(db, {
        sellerId,
        orderId: order.id,
        type: 'REFUND',
        amountCore: amount,
        actor: `admin_resolve_${adminId}`,
        reason: `Hoàn tiền cho khách theo phán quyết khiếu nại đơn ${order.id}. Ghi chú: ${note || 'Hàng lỗi/không nhận được hàng'}`,
      });

      if (!refRes.success) {
        console.warn('[Escrow] Error recording ledger refund:', refRes.error);
        if (isSellerOrder) {
          await db.prepare(`
            UPDATE seller_orders
            SET status = 'REPORTED',
                updated_at = ?
            WHERE id = ?
          `).bind(nowIso, order.id).run().catch(() => {});
        } else {
          await db.prepare(`
            UPDATE orders
            SET status = 'PROCESSING',
                escrow_status = 'DISPUTED',
                updated_at = ?
            WHERE id = ?
          `).bind(nowIso, order.id).run().catch(() => {});
        }
        return {
          success: false,
          message: `Lỗi khi ghi sổ cái hoàn tiền (${refRes.error}). Đã khôi phục trạng thái khiếu nại.`,
        };
      }

      // Hoàn tiền vào ví thành viên
      if (buyerMemberId) {
        await db
          .prepare(`
            UPDATE members
            SET balance = balance + ?,
                updated_at = ?
            WHERE id = ?
          `)
          .bind(amount, nowIso, buyerMemberId)
          .run();

        const txId = `tx_refund_${Date.now()}_${generateSecureIdSuffix(4)}`;
        await db
          .prepare(`
            INSERT INTO wallet_transactions (
              id, member_id, member_email, type, amount, balance_before, balance_after, description, status, order_id, created_at
            )
            SELECT ?, id, email, 'REFUND', ?, balance - ?, balance, ?, 'COMPLETED', ?, ?
            FROM members WHERE id = ?
          `)
          .bind(
            txId,
            amount,
            amount,
            `Hoàn tiền khiếu nại bảo chứng đơn ${order.id}`,
            order.id,
            nowIso,
            buyerMemberId
          )
          .run()
          .catch(() => {});
      }

      await db
        .prepare(`
          UPDATE seller_disputes
          SET status = 'RESOLVED_BUYER_REFUND',
              resolved_by = ?,
              resolution_note = ?,
              updated_at = ?
          WHERE order_id = ?
        `)
        .bind(adminId, note || 'Hoàn tiền cho khách theo khiếu nại', nowIso, order.id)
        .run()
        .catch(() => {});

      return {
        success: true,
        message: `Đã xử lý khiếu nại: Hoàn trả ${amount.toLocaleString('vi-VN')} Core vào ví khách hàng thành công.`,
      };
    }
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi hệ thống khi giải quyết khiếu nại.' };
  }
}
