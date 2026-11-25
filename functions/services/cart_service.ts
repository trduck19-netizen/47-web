/**
 * Cloudflare Edge Cart Service (Cart Sync API)
 * Quản lý giỏ hàng đa thiết bị, đồng bộ D1 cart_items theo chuẩn Universal Mall Multi-Store.
 */

export interface DbCartItem {
  id: string;
  user_id: string;
  product_id: string;
  seller_id: string;
  product_name: string;
  price_core: number;
  quantity: number;
  variant_id?: string | null;
  variant_name?: string | null;
  attributes_json?: string | null;
  product_type?: string | null;
  weight_grams?: number | null;
  cover_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientCartItem {
  productId: string;
  productName: string;
  priceCore: number;
  sellerId: string;
  sellerName?: string;
  sellerSlug?: string;
  sellerAvatar?: string;
  gameSlug?: string;
  gameName?: string;
  coverUrl?: string;
  addedAt?: string;
  variantId?: string;
  variantName?: string;
  attributes?: Record<string, string>;
  quantity?: number;
  productType?: 'digital' | 'physical';
  weightGrams?: number;
  warehouseAddress?: string;
  codAllowed?: boolean;
}

export interface StoreCartGroup {
  sellerId: string;
  sellerName: string;
  sellerSlug?: string;
  sellerAvatar?: string;
  items: ClientCartItem[];
  subtotal: number;
}

export interface CartSummaryResult {
  items: ClientCartItem[];
  groups: StoreCartGroup[];
  totalCount: number;
  subtotal: number;
}

/**
 * Format 1 DbCartItem sang ClientCartItem
 */
function toClientItem(dbItem: DbCartItem, sellerMap?: Map<string, any>): ClientCartItem {
  let attributes: Record<string, string> | undefined;
  if (dbItem.attributes_json) {
    try {
      attributes = JSON.parse(dbItem.attributes_json);
    } catch {
      attributes = undefined;
    }
  }

  const sellerInfo = sellerMap?.get(dbItem.seller_id) || {};

  return {
    productId: dbItem.product_id,
    productName: dbItem.product_name,
    priceCore: dbItem.price_core,
    sellerId: dbItem.seller_id,
    sellerName: sellerInfo.name || dbItem.seller_id,
    sellerSlug: sellerInfo.slug || dbItem.seller_id,
    sellerAvatar: sellerInfo.avatar || undefined,
    coverUrl: dbItem.cover_url || undefined,
    addedAt: dbItem.created_at,
    variantId: dbItem.variant_id || undefined,
    variantName: dbItem.variant_name || undefined,
    attributes,
    quantity: dbItem.quantity || 1,
    productType: (dbItem.product_type as 'digital' | 'physical') || 'digital',
    weightGrams: dbItem.weight_grams || 0,
  };
}

/**
 * Nhóm các ClientCartItem theo từng Seller
 */
function groupCartItems(items: ClientCartItem[]): StoreCartGroup[] {
  const map = new Map<string, StoreCartGroup>();

  for (const item of items) {
    const sId = item.sellerId || 'official';
    if (!map.has(sId)) {
      map.set(sId, {
        sellerId: sId,
        sellerName: item.sellerName || 'Gian hàng',
        sellerSlug: item.sellerSlug || sId,
        sellerAvatar: item.sellerAvatar,
        items: [],
        subtotal: 0,
      });
    }
    const grp = map.get(sId)!;
    grp.items.push(item);
    grp.subtotal += (item.priceCore || 0) * (item.quantity || 1);
  }

  return Array.from(map.values());
}

/**
 * Lấy toàn bộ giỏ hàng của user trong CSDL D1
 */
export async function getCartForUser(db: D1Database, userId: string): Promise<CartSummaryResult> {
  const rawRes = await db
    .prepare('SELECT * FROM cart_items WHERE user_id = ? ORDER BY updated_at DESC')
    .bind(userId)
    .all<DbCartItem>();

  const dbItems = rawRes?.results || [];

  // Lấy danh sách sellers để làm giàu dữ liệu tên gian hàng
  const sellerIds = Array.from(new Set(dbItems.map((i) => i.seller_id).filter(Boolean)));
  const sellerMap = new Map<string, any>();
  if (sellerIds.length > 0) {
    try {
      const placeholders = sellerIds.map(() => '?').join(',');
      const sellersRes = await db
        .prepare(`SELECT id, name, slug FROM sellers WHERE id IN (${placeholders})`)
        .bind(...sellerIds)
        .all<any>();
      (sellersRes?.results || []).forEach((s) => sellerMap.set(s.id, s));
    } catch {
      // Fallback nếu bảng sellers chưa có
    }
  }

  const items = dbItems.map((i) => toClientItem(i, sellerMap));
  const groups = groupCartItems(items);
  const totalCount = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
  const subtotal = items.reduce((sum, i) => sum + (i.priceCore || 0) * (i.quantity || 1), 0);

  return { items, groups, totalCount, subtotal };
}

/**
 * Đồng bộ gộp (Merge) giỏ hàng từ Client localStorage vào D1 khi đăng nhập
 */
export async function syncCartForUser(
  db: D1Database,
  userId: string,
  clientItems: ClientCartItem[]
): Promise<CartSummaryResult> {
  if (Array.isArray(clientItems) && clientItems.length > 0) {
    const nowIso = new Date().toISOString();

    for (const cItem of clientItems) {
      if (!cItem.productId) continue;
      const vId = cItem.variantId || null;
      const sellerId = cItem.sellerId || 'seller_universal_mall';
      const qty = Math.max(1, Number(cItem.quantity) || 1);
      const attrs = cItem.attributes ? JSON.stringify(cItem.attributes) : null;

      // Kiểm tra sản phẩm đã có trong giỏ D1 chưa
      let existing: any = null;
      if (vId) {
        existing = await db
          .prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND variant_id = ? LIMIT 1')
          .bind(userId, cItem.productId, vId)
          .first<any>();
      } else {
        existing = await db
          .prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND (variant_id IS NULL OR variant_id = \'\') LIMIT 1')
          .bind(userId, cItem.productId)
          .first<any>();
      }

      if (existing) {
        // Cộng dồn số lượng
        const newQty = existing.quantity + qty;
        await db
          .prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?')
          .bind(newQty, nowIso, existing.id)
          .run();
      } else {
        // Thêm mới
        const id = `cart_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
        await db
          .prepare(`
            INSERT INTO cart_items (
              id, user_id, product_id, seller_id, product_name, price_core,
              quantity, variant_id, variant_name, attributes_json,
              product_type, weight_grams, cover_url, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            id,
            userId,
            cItem.productId,
            sellerId,
            cItem.productName || 'Sản phẩm',
            cItem.priceCore || 0,
            qty,
            vId,
            cItem.variantName || null,
            attrs,
            cItem.productType || 'digital',
            cItem.weightGrams || 0,
            cItem.coverUrl || null,
            nowIso,
            nowIso
          )
          .run();
      }
    }
  }

  return getCartForUser(db, userId);
}

/**
 * Thêm 1 sản phẩm vào giỏ hàng D1
 */
export async function addCartItem(
  db: D1Database,
  userId: string,
  item: ClientCartItem
): Promise<CartSummaryResult> {
  const vId = item.variantId || null;
  const sellerId = item.sellerId || 'seller_universal_mall';
  const qty = Math.max(1, Number(item.quantity) || 1);
  const nowIso = new Date().toISOString();
  const attrs = item.attributes ? JSON.stringify(item.attributes) : null;

  let existing: any = null;
  if (vId) {
    existing = await db
      .prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND variant_id = ? LIMIT 1')
      .bind(userId, item.productId, vId)
      .first<any>();
  } else {
    existing = await db
      .prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND (variant_id IS NULL OR variant_id = \'\') LIMIT 1')
      .bind(userId, item.productId)
      .first<any>();
  }

  if (existing) {
    await db
      .prepare('UPDATE cart_items SET quantity = quantity + ?, updated_at = ? WHERE id = ?')
      .bind(qty, nowIso, existing.id)
      .run();
  } else {
    const id = `cart_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    await db
      .prepare(`
        INSERT INTO cart_items (
          id, user_id, product_id, seller_id, product_name, price_core,
          quantity, variant_id, variant_name, attributes_json,
          product_type, weight_grams, cover_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        userId,
        item.productId,
        sellerId,
        item.productName || 'Sản phẩm',
        item.priceCore || 0,
        qty,
        vId,
        item.variantName || null,
        attrs,
        item.productType || 'digital',
        item.weightGrams || 0,
        item.coverUrl || null,
        nowIso,
        nowIso
      )
      .run();
  }

  return getCartForUser(db, userId);
}

/**
 * Cập nhật số lượng của 1 sản phẩm trong giỏ D1
 */
export async function updateCartItemQuantity(
  db: D1Database,
  userId: string,
  productId: string,
  quantity: number,
  variantId?: string
): Promise<CartSummaryResult> {
  const vId = variantId || null;
  const nowIso = new Date().toISOString();

  if (quantity <= 0) {
    if (vId) {
      await db
        .prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND variant_id = ?')
        .bind(userId, productId, vId)
        .run();
    } else {
      await db
        .prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND (variant_id IS NULL OR variant_id = \'\')')
        .bind(userId, productId)
        .run();
    }
  } else {
    if (vId) {
      await db
        .prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE user_id = ? AND product_id = ? AND variant_id = ?')
        .bind(quantity, nowIso, userId, productId, vId)
        .run();
    } else {
      await db
        .prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE user_id = ? AND product_id = ? AND (variant_id IS NULL OR variant_id = \'\')')
        .bind(quantity, nowIso, userId, productId)
        .run();
    }
  }

  return getCartForUser(db, userId);
}

/**
 * Xóa 1 sản phẩm khỏi giỏ D1
 */
export async function removeCartItem(
  db: D1Database,
  userId: string,
  productId: string,
  variantId?: string
): Promise<CartSummaryResult> {
  return updateCartItemQuantity(db, userId, productId, 0, variantId);
}

/**
 * Xóa toàn bộ giỏ hàng của user
 */
export async function clearCart(db: D1Database, userId: string): Promise<CartSummaryResult> {
  await db.prepare('DELETE FROM cart_items WHERE user_id = ?').bind(userId).run();
  return { items: [], groups: [], totalCount: 0, subtotal: 0 };
}
