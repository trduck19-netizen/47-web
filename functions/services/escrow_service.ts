import { recordLedgerTransaction } from './marketplace_service';

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
    const isPhys = params.productType === 'physical';
    const holdHours = isPhys ? 168 : (params.warrantyHours || 48);
    const holdUntil = new Date(Date.now() + holdHours * 3600 * 1000).toISOString();
    const feeRateDesc = isPhys ? 'phí hoa hồng 2%' : 'phí hoa hồng 5%';

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
  actor = 'customer_confirm'
): Promise<{ success: boolean; message: string; releasedAmount?: number }> {
  try {
    const order = await db
      .prepare("SELECT * FROM orders WHERE id = ? COLLATE NOCASE LIMIT 1")
      .bind(orderId)
      .first<any>();

    if (!order) {
      return { success: false, message: `Không tìm thấy đơn hàng ${orderId}.` };
    }

    // Kiểm tra quyền sở hữu nếu có userId
    if (userId && order.member_id && order.member_id !== userId && userId !== 'admin') {
      return { success: false, message: 'Bạn không có quyền thao tác trên đơn hàng này.' };
    }

    if (order.escrow_status === 'RELEASED' || order.status === 'COMPLETED') {
      return { success: false, message: 'Đơn hàng này đã được giải ngân hoàn tất trước đó.' };
    }

    if (order.escrow_status === 'DISPUTED') {
      return { success: false, message: 'Đơn hàng đang có khiếu nại chưa giải quyết. Vui lòng chờ Quản trị viên xử lý.' };
    }

    const sellerId = order.seller_id || (await ensureOfficialSeller(db));
    const amount = Number(order.total_amount || 0);
    const isPhysical = order.product_type === 'physical' || Boolean(order.shipping_address);
    const feeRate = isPhysical ? 0.02 : 0.05; // Phí sàn đa tầng: Hàng vật lý 2%, Hàng số 5%
    const feeCore = Math.round(amount * feeRate);
    const nowIso = new Date().toISOString();

    // 1. Ghi dòng RELEASE
    const relRes = await recordLedgerTransaction(db, {
      sellerId,
      orderId: order.id,
      type: 'RELEASE',
      amountCore: amount,
      actor,
      reason: `Khách hàng xác nhận đã nhận hàng - Giải ngân thành công cho đơn ${order.id} (${isPhysical ? 'Hàng vật lý' : 'Hàng số'})`,
    });

    if (!relRes.success) {
      return { success: false, message: relRes.error || 'Lỗi khi ghi sổ cái giải ngân.' };
    }

    // 2. Ghi dòng FEE
    if (feeCore > 0) {
      await recordLedgerTransaction(db, {
        sellerId,
        orderId: order.id,
        type: 'FEE',
        amountCore: feeCore,
        actor: 'platform_fee',
        reason: `Thu phí hoa hồng sàn ${isPhysical ? '2%' : '5%'} cho đơn ${order.id}`,
      });
    }

    // 3. Cập nhật trạng thái đơn hàng sang COMPLETED & RELEASED (State-guarded)
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

    if (!updateRes || updateRes.meta?.changes === 0) {
      return { success: false, message: 'Đơn hàng này đã được giải ngân hoặc hoàn tiền trước đó.' };
    }

    const logId1 = 'sec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
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

    return {
      processed: dueOrders.length,
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
    const order = await db
      .prepare("SELECT * FROM orders WHERE id = ? COLLATE NOCASE LIMIT 1")
      .bind(orderId)
      .first<any>();

    if (!order) {
      return { success: false, message: `Không tìm thấy đơn hàng ${orderId}.` };
    }

    if (order.member_id && order.member_id !== userId) {
      return { success: false, message: 'Bạn không có quyền khiếu nại đơn hàng của người khác.' };
    }

    if (order.escrow_status === 'RELEASED') {
      return { success: false, message: 'Đơn hàng này đã được giải ngân hoàn tất, không thể khiếu nại bảo chứng.' };
    }

    if (order.escrow_status === 'DISPUTED') {
      return { success: false, message: 'Đơn hàng này đã có khiếu nại đang được xử lý.' };
    }

    const nowIso = new Date().toISOString();
    const disputeId = `dsp_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const sellerId = order.seller_id || (await ensureOfficialSeller(db));

    // Cập nhật trạng thái đơn sang DISPUTED (đóng băng giải ngân)
    await db
      .prepare(`
        UPDATE orders
        SET escrow_status = 'DISPUTED',
            dispute_reason = ?,
            dispute_detail = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(reason, detail || '', nowIso, order.id)
      .run();

    // Ghi vào bảng seller_disputes
    await db
      .prepare(`
        INSERT INTO seller_disputes (
          id, order_id, buyer_member_id, seller_id, reason, detail, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
      `)
      .bind(disputeId, order.id, userId, sellerId, reason, detail || '', nowIso, nowIso)
      .run()
      .catch(() => {});

    const logId2 = 'sec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
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
    const order = await db
      .prepare("SELECT * FROM orders WHERE id = ? COLLATE NOCASE LIMIT 1")
      .bind(orderId)
      .first<any>();

    if (!order) {
      return { success: false, message: `Không tìm thấy đơn hàng ${orderId}.` };
    }

    const sellerId = order.seller_id || (await ensureOfficialSeller(db));
    const amount = Number(order.total_amount || 0);
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
      const updateRes: any = await db
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
      }

      // Hoàn tiền vào ví thành viên
      if (order.member_id) {
        await db
          .prepare(`
            UPDATE members
            SET balance = balance + ?,
                updated_at = ?
            WHERE id = ?
          `)
          .bind(amount, nowIso, order.member_id)
          .run();

        const txId = `tx_refund_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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
            order.member_id
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
