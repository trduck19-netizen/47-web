import { computeSha256 } from './mission_service';
import { getMarketplaceConfig } from './marketplace_service';

export interface SellerAffiliatePartnershipRecord {
  id: string;
  supplier_seller_id: string;
  reseller_seller_id: string;
  status: 'PENDING' | 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'REVOKED';
  api_key_hash: string;
  api_key_prefix: string;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  // Join fields
  supplier_name?: string;
  reseller_name?: string;
  reseller_owner_id?: string;
  supplier_owner_id?: string;
}

export interface SellerAffiliateListingRecord {
  id: string;
  partnership_id: string;
  supplier_seller_id: string;
  reseller_seller_id: string;
  supplier_product_id: string;
  reseller_product_id: string;
  markup_type: 'PERCENT' | 'FIXED';
  markup_value: number;
  price_mode: 'FORMULA' | 'LOCKED';
  locked_price: number | null;
  show_supplier: number;
  status: 'ACTIVE' | 'HIDDEN' | 'OUT_OF_STOCK' | 'SUPPLIER_DISABLED';
  price_warning: string | null;
  created_at: string;
  updated_at: string;
  // Product info
  product_name?: string;
  cover_url?: string;
  base_price?: number;
  selling_price?: number;
}

export interface Financial3WaySplit {
  basePrice: number;
  sellingPrice: number;
  markupAmount: number;
  discountAmount: number;
  commissionAmount: number;
  platformFee: number;
  feeRatePct: number;
  supplierPayout: number;
  resellerPayout: number;
  shippingFee: number;
  isMapEnforced: boolean;
  mapPrice?: number;
}

/**
 * Băm khóa cặp bằng SHA-256
 */
export async function hashPairShopKey(rawKey: string): Promise<string> {
  return await computeSha256(rawKey.trim());
}

/**
 * Sinh khóa theo cặp cho NCC - Shop Gán (Nhóm 1)
 * Định dạng: wcg_shop_<32 hex chars>
 * Khóa thô chỉ hiển thị DUY NHẤT 1 lần, lưu D1 chỉ dạng hash SHA-256
 */
export async function generatePairShopApiKey(): Promise<{
  rawKey: string;
  keyHash: string;
  keyPrefix: string;
}> {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex32 = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const rawKey = `wcg_shop_${hex32}`;
  const keyHash = await hashPairShopKey(rawKey);
  const keyPrefix = `wcg_shop_${hex32.substring(0, 4)}••••${hex32.substring(hex32.length - 4)}`;

  return { rawKey, keyHash, keyPrefix };
}

/**
 * Xác thực truy cập bằng khóa cặp (Nhóm 1 & Nhóm 5)
 * Khóa chỉ có quyền đọc sản phẩm đã mở của đúng NCC đó
 */
export async function verifyPairShopAccess(
  db: D1Database,
  rawKey: string,
  targetSupplierId?: string
): Promise<{
  authorized: boolean;
  status?: number;
  error?: string;
  partnership?: SellerAffiliatePartnershipRecord;
}> {
  const cleanKey = (rawKey || '').trim();
  if (!cleanKey.startsWith('wcg_shop_')) {
    return { authorized: false, status: 401, error: 'Khóa API gian hàng không đúng định dạng.' };
  }

  const keyHash = await hashPairShopKey(cleanKey);
  const partnership = await db
    .prepare(`
      SELECT sap.*, 
             s_sup.name as supplier_name,
             s_res.name as reseller_name
      FROM seller_affiliate_partnerships sap
      LEFT JOIN sellers s_sup ON sap.supplier_seller_id = s_sup.id
      LEFT JOIN sellers s_res ON sap.reseller_seller_id = s_res.id
      WHERE sap.api_key_hash = ? LIMIT 1
    `)
    .bind(keyHash)
    .first<SellerAffiliatePartnershipRecord>();

  if (!partnership) {
    return { authorized: false, status: 401, error: 'Khóa API gian hàng không hợp lệ hoặc không tồn tại.' };
  }

  if (partnership.status === 'REVOKED') {
    return { authorized: false, status: 401, error: 'Khóa API này đã bị Nhà Cung Cấp thu hồi.' };
  }

  if (partnership.status !== 'APPROVED') {
    return { authorized: false, status: 403, error: 'Liên kết giữa hai gian hàng chưa được phê duyệt.' };
  }

  const mConfig = await getMarketplaceConfig(db);
  if (!mConfig.affiliate_enabled) {
    return { authorized: false, status: 403, error: 'Tính năng bán lại liên gian hàng đang tạm tắt bởi Quản trị viên.' };
  }

  // Khóa chỉ có quyền đọc của đúng NCC phát hành khóa
  if (targetSupplierId && partnership.supplier_seller_id !== targetSupplierId) {
    return { authorized: false, status: 403, error: 'Khóa API này chỉ có quyền truy cập sản phẩm của Nhà Cung Cấp đã cấp khóa.' };
  }

  // Giới hạn tốc độ động từ Admin Config (mặc định 600 yêu cầu / phút / khóa cặp)
  const rateLimitRpm = Math.max(10, Number(mConfig.affiliate_rate_limit_rpm) || 600);
  const keyPrefix = partnership.api_key_prefix || (cleanKey.substring(0, 13) + '••••' + cleanKey.substring(cleanKey.length - 4));
  const recentCallsRes = await db
    .prepare(`
      SELECT COUNT(*) as recent_calls 
      FROM seller_affiliate_call_logs 
      WHERE key_prefix = ? AND created_at >= datetime('now', '-1 minute')
    `)
    .bind(keyPrefix)
    .first<{ recent_calls: number }>();

  if (recentCallsRes && Number(recentCallsRes.recent_calls) >= rateLimitRpm) {
    await logAffiliateCall(db, {
      partnershipId: partnership.id,
      callerSellerId: partnership.reseller_seller_id,
      keyPrefix,
      endpoint: '/api/seller/affiliate/catalog',
      method: 'GET',
      statusCode: 429,
    });
    return {
      authorized: false,
      status: 429,
      error: `Quá giới hạn ${rateLimitRpm} yêu cầu / phút cho khóa liên shop này. Vui lòng thử lại sau giây lát.`,
    };
  }

  return { authorized: true, partnership };
}

/**
 * Tính toán chia tiền 3 bên theo công thức chuẩn đã duyệt (Nhóm 4):
 * - Khách trả P = base_price + markup (>= 0)
 * - Phí sàn F = 5% (hàng số) / 2% (hàng vật lý) × base_price
 * - Hoa hồng H = % do NCC đặt × base_price
 * - Chiết khấu D = % do NCC đặt × base_price
 * - NCC nhận = base_price - D - F - H
 * - Shop gán nhận = markup + H + D
 * - Sàn nhận = F
 * - Tổng khớp tuyệt đối: NCC + Shop gán + Sàn == P
 */
export function calculate3WaySplit(params: {
  basePrice: number;
  markupType: 'PERCENT' | 'FIXED';
  markupValue: number;
  discountPct: number;
  commissionPct: number;
  isPhysical: boolean;
  shippingFee?: number;
  mapPrice?: number;
  lockedPrice?: number | null;
  priceMode?: 'FORMULA' | 'LOCKED';
  digitalFeePct?: number;
  physicalFeePct?: number;
}): Financial3WaySplit {
  const {
    basePrice,
    markupType,
    markupValue,
    discountPct,
    commissionPct,
    isPhysical,
    shippingFee = 0,
    mapPrice = 0,
    lockedPrice,
    priceMode = 'FORMULA',
    digitalFeePct,
    physicalFeePct,
  } = params;

  // 1. Tính mức tăng (markup)
  let rawMarkup = 0;
  if (markupType === 'PERCENT') {
    rawMarkup = Math.round(basePrice * (Math.max(0, markupValue) / 100));
  } else {
    rawMarkup = Math.max(0, Math.round(markupValue));
  }

  // 2. Tính giá bán theo chế độ
  let sellingPrice = basePrice + rawMarkup;
  let isMapEnforced = false;

  if (priceMode === 'LOCKED' && lockedPrice && lockedPrice > 0) {
    sellingPrice = lockedPrice;
    rawMarkup = Math.max(0, sellingPrice - basePrice);
  }

  // 3. Ràng buộc giá sàn MAP (nếu NCC đặt)
  if (mapPrice > 0 && sellingPrice < mapPrice) {
    sellingPrice = mapPrice;
    rawMarkup = Math.max(0, sellingPrice - basePrice);
    isMapEnforced = true;
  }

  // 4. Tính chiết khấu & hoa hồng trên giá gốc
  const discountAmount = Math.round(basePrice * (Math.max(0, discountPct) / 100));
  const commissionAmount = Math.round(basePrice * (Math.max(0, commissionPct) / 100));

  // 5. Phí sàn động theo cấu hình Admin (mặc định 5% hàng số / 2% hàng vật lý)
  const appliedFeePct = isPhysical
    ? (typeof physicalFeePct === 'number' && Number.isFinite(physicalFeePct) ? Math.min(50, Math.max(0, physicalFeePct)) : 2)
    : (typeof digitalFeePct === 'number' && Number.isFinite(digitalFeePct) ? Math.min(50, Math.max(0, digitalFeePct)) : 5);
  const feeRate = appliedFeePct / 100;
  const platformFee = Math.round(basePrice * feeRate);

  // 6. NCC nhận: base_price - discount - platformFee - commission
  // Đảm bảo không âm nếu chiết khấu/hoa hồng quá cao
  const supplierPayout = Math.max(0, basePrice - discountAmount - platformFee - commissionAmount);

  // 7. Shop gán nhận: markup + commission + discount
  // Điều chỉnh phần lẻ để tổng khớp 100% với sellingPrice
  const resellerPayout = sellingPrice - platformFee - supplierPayout;

  return {
    basePrice,
    sellingPrice,
    markupAmount: rawMarkup,
    discountAmount,
    commissionAmount,
    platformFee,
    feeRatePct: appliedFeePct,
    supplierPayout,
    resellerPayout,
    shippingFee: Math.max(0, Number(shippingFee) || 0),
    isMapEnforced,
    mapPrice,
  };
}

/**
 * Ghi log cuộc gọi API gán shop (Nhóm 5)
 */
export async function logAffiliateCall(
  db: D1Database,
  params: {
    partnershipId?: string;
    callerSellerId?: string;
    keyPrefix?: string;
    endpoint: string;
    method: string;
    ipAddress?: string;
    statusCode: number;
    responseTimeMs?: number;
  }
) {
  try {
    const id = `acl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    await db
      .prepare(`
        INSERT INTO seller_affiliate_call_logs (
          id, partnership_id, caller_seller_id, key_prefix, endpoint, method, ip_address, status_code, response_time_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .bind(
        id,
        params.partnershipId || null,
        params.callerSellerId || null,
        params.keyPrefix || null,
        params.endpoint,
        params.method,
        params.ipAddress || null,
        params.statusCode,
        params.responseTimeMs || 0
      )
      .run()
      .catch(() => {});
  } catch (e) {
    console.warn('[logAffiliateCall error]', e);
  }
}

/**
 * Đồng bộ giá và trạng thái tồn kho từ NCC sang các listing gán (Nhóm 3)
 */
export async function syncAffiliatePriceAndStock(
  db: D1Database,
  supplierProductId: string,
  changeType: 'PRICE_CHANGE' | 'STOCK_CHANGE' | 'STATUS_CHANGE' | 'RESELL_PARAM_CHANGE',
  details?: {
    newBasePrice?: number;
    newMapPrice?: number;
    newStock?: number;
    isDeleted?: boolean;
    isDisabled?: boolean;
    autoPauseOnLoss?: boolean;
    digitalFeePct?: number;
    physicalFeePct?: number;
  }
): Promise<{ affectedCount: number; antiLossPausedCount?: number }> {
  try {
    // 1. Tìm toàn bộ listing gán của sản phẩm NCC này
    const listings = await db
      .prepare(`
        SELECT sal.*,
               sp_orig.price_core as origin_price,
               sp_orig.resell_map_price as origin_map,
               sp_orig.resell_discount_pct as origin_discount_pct,
               sp_orig.resell_commission_pct as origin_commission_pct,
               sp_orig.product_type as origin_product_type
        FROM seller_affiliate_listings sal
        JOIN seller_products sp_orig ON sal.supplier_product_id = sp_orig.id
        WHERE sal.supplier_product_id = ?
      `)
      .bind(supplierProductId)
      .all<any>();

    const rows = listings.results || [];
    if (rows.length === 0) return { affectedCount: 0, antiLossPausedCount: 0 };

    const mConfig = await getMarketplaceConfig(db);
    const autoPauseOnLoss = typeof details?.autoPauseOnLoss === 'boolean'
      ? details.autoPauseOnLoss
      : mConfig.affiliate_auto_pause_on_loss;
    const digitalFeePct = typeof details?.digitalFeePct === 'number'
      ? details.digitalFeePct
      : mConfig.affiliate_digital_fee_pct;
    const physicalFeePct = typeof details?.physicalFeePct === 'number'
      ? details.physicalFeePct
      : mConfig.affiliate_physical_fee_pct;

    let affectedCount = 0;
    let antiLossPausedCount = 0;
    const nowIso = new Date().toISOString();

    for (const item of rows) {
      if (changeType === 'STATUS_CHANGE' && (details?.isDeleted || details?.isDisabled)) {
        // NCC tắt hoặc xóa -> Ẩn listing bên shop gán
        await db
          .prepare(`
            UPDATE seller_affiliate_listings
            SET status = 'SUPPLIER_DISABLED', updated_at = ?
            WHERE id = ?
          `)
          .bind(nowIso, item.id)
          .run()
          .catch(() => {});

        await db
          .prepare(`
            UPDATE seller_products
            SET status = 'PAUSED', updated_at = ?
            WHERE id = ?
          `)
          .bind(nowIso, item.reseller_product_id)
          .run()
          .catch(() => {});

        affectedCount++;
      } else if (changeType === 'STOCK_CHANGE') {
        // Tồn kho thay đổi: nếu newStock === 0 -> OUT_OF_STOCK; nếu newStock > 0 và đang OUT_OF_STOCK -> phục hồi ACTIVE
        const newStock = details?.newStock ?? 0;
        const newStatus = newStock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK';

        await db
          .prepare(`
            UPDATE seller_affiliate_listings
            SET status = ?, updated_at = ?
            WHERE id = ? AND status != 'SUPPLIER_DISABLED' AND COALESCE(price_warning, '') != 'ANTI_LOSS_PAUSED'
          `)
          .bind(newStatus, nowIso, item.id)
          .run()
          .catch(() => {});

        affectedCount++;
      } else if (changeType === 'PRICE_CHANGE' || changeType === 'RESELL_PARAM_CHANGE') {
        const basePrice = Number(details?.newBasePrice ?? item.origin_price) || 0;
        if (basePrice <= 0) continue;

        const mapPrice = Number(details?.newMapPrice ?? item.origin_map) || 0;
        const isPhysical = String(item.origin_product_type || '').toLowerCase() === 'physical';
        const split = calculate3WaySplit({
          basePrice,
          markupType: item.markup_type === 'FIXED' ? 'FIXED' : 'PERCENT',
          markupValue: Number(item.markup_value) || 0,
          discountPct: Number(item.origin_discount_pct) || 0,
          commissionPct: Number(item.origin_commission_pct) || 0,
          isPhysical,
          mapPrice,
          priceMode: item.price_mode === 'LOCKED' ? 'LOCKED' : 'FORMULA',
          lockedPrice: item.locked_price !== null && item.locked_price !== undefined ? Number(item.locked_price) : null,
          digitalFeePct,
          physicalFeePct,
        });

        if (item.price_mode === 'FORMULA') {
          const isLoss = split.resellerPayout < 0 || split.sellingPrice < basePrice;
          const nextWarning = isLoss ? (autoPauseOnLoss ? 'ANTI_LOSS_PAUSED' : `CẢNH BÁO: Giá bán (${split.sellingPrice.toLocaleString('vi-VN')} đ) thấp hơn giá vốn hoặc âm lợi nhuận.`) : null;
          const nextListingStatus = isLoss && autoPauseOnLoss
            ? 'HIDDEN'
            : (item.price_warning === 'ANTI_LOSS_PAUSED' && item.status === 'HIDDEN' ? 'ACTIVE' : item.status);

          if (isLoss && autoPauseOnLoss) antiLossPausedCount++;

          await db
            .prepare(`
              UPDATE seller_products
              SET price_core = ?, updated_at = ?
              WHERE id = ?
            `)
            .bind(split.sellingPrice, nowIso, item.reseller_product_id)
            .run()
            .catch(() => {});

          await db
            .prepare(`
              UPDATE seller_affiliate_listings
              SET status = ?, price_warning = ?, updated_at = ?
              WHERE id = ?
            `)
            .bind(nextListingStatus, nextWarning, nowIso, item.id)
            .run()
            .catch(() => {});

          affectedCount++;
        } else if (item.price_mode === 'LOCKED') {
          // Chế độ khóa giá: kiểm tra giá gốc > giá bán khóa, âm lợi nhuận hoặc vi phạm MAP mới
          const lockedPrice = Number(item.locked_price) || 0;
          const isLoss = basePrice > lockedPrice || split.resellerPayout < 0;
          const isBelowMap = mapPrice > 0 && lockedPrice > 0 && lockedPrice < mapPrice;

          let warning: string | null = null;
          let nextListingStatus = item.status;

          if (isLoss) {
            if (autoPauseOnLoss) {
              warning = 'ANTI_LOSS_PAUSED';
              nextListingStatus = 'HIDDEN';
              antiLossPausedCount++;
            } else {
              warning = `CẢNH BÁO: Giá gốc nhà cung cấp (${basePrice.toLocaleString('vi-VN')} đ) đã vượt giá bán khóa (${lockedPrice.toLocaleString('vi-VN')} đ).`;
            }
          } else if (isBelowMap) {
            // Đẩy giá bán sản phẩm lên bằng MAP mới để tuân thủ giá sàn NCC
            await db
              .prepare(`
                UPDATE seller_products
                SET price_core = ?, updated_at = ?
                WHERE id = ?
              `)
              .bind(mapPrice, nowIso, item.reseller_product_id)
              .run()
              .catch(() => {});
            warning = `CẢNH BÁO MAP: Giá khóa (${lockedPrice.toLocaleString('vi-VN')} đ) thấp hơn giá sàn MAP mới (${mapPrice.toLocaleString('vi-VN')} đ); đã tự nâng giá bán bằng MAP.`;
          } else if (item.price_warning === 'ANTI_LOSS_PAUSED' && item.status === 'HIDDEN') {
            nextListingStatus = 'ACTIVE';
          }

          await db
            .prepare(`
              UPDATE seller_affiliate_listings
              SET status = ?, price_warning = ?, updated_at = ?
              WHERE id = ?
            `)
            .bind(nextListingStatus, warning, nowIso, item.id)
            .run()
            .catch(() => {});

          affectedCount++;
        }
      }
    }

    // 2. Ghi nhật ký đồng bộ đối soát (seller_affiliate_sync_logs)
    const logId = `asl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    await db
      .prepare(`
        INSERT INTO seller_affiliate_sync_logs (
          id, supplier_product_id, change_type, old_value, new_value, affected_resellers_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        logId,
        supplierProductId,
        changeType,
        null,
        JSON.stringify(details || {}),
        affectedCount,
        nowIso
      )
      .run()
      .catch(() => {});

    return { affectedCount, antiLossPausedCount };
  } catch (e) {
    console.warn('[syncAffiliatePriceAndStock error]', e);
    return { affectedCount: 0, antiLossPausedCount: 0 };
  }
}
