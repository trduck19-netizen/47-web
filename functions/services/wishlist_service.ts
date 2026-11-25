/**
 * Cloudflare Edge Wishlist Service (Wishlist Sync API)
 * Quản lý danh sách yêu thích và theo dõi game/sản phẩm trên CSDL D1 user_wishlist.
 */

export interface WishlistItem {
  id: string;
  user_id: string;
  item_type: 'game' | 'product';
  item_id: string;
  item_title?: string | null;
  item_image?: string | null;
  price_core?: number | null;
  created_at: string;
}

export interface ToggleWishlistParams {
  item_type?: 'game' | 'product';
  target_type?: 'game' | 'product';
  item_id?: string;
  target_id?: string;
  id?: string;
  item_title?: string;
  title?: string;
  name?: string;
  item_image?: string;
  image_url?: string;
  coverUrl?: string;
  price_core?: number;
  priceCore?: number;
}

/**
 * Lấy toàn bộ danh sách yêu thích của người dùng
 */
export async function getWishlistForUser(db: D1Database, userId: string): Promise<WishlistItem[]> {
  const res = await db
    .prepare('SELECT * FROM user_wishlist WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all<WishlistItem>();

  return res?.results || [];
}

/**
 * Thêm hoặc xóa một mục khỏi danh sách yêu thích (Toggle)
 */
export async function toggleWishlistItem(
  db: D1Database,
  userId: string,
  params: ToggleWishlistParams
): Promise<{ success: boolean; is_bookmarked: boolean; message: string; item?: WishlistItem }> {
  try {
    const item_id = (params.item_id || params.target_id || params.id || '').trim();

    if (!item_id) {
      return { success: false, is_bookmarked: false, message: 'Thiếu item_id.' };
    }

    const meta = (params as any).metadata || {};
    const rawType = params.item_type || params.target_type || meta.item_type || meta.target_type || 'game';
    const item_type = rawType === 'product' ? 'product' : 'game';
    const item_title = (params.item_title || params.title || params.name || meta.title || meta.name || meta.item_title || '').trim();
    const item_image = (params.item_image || params.image_url || params.coverUrl || meta.image_url || meta.item_image || meta.coverUrl || '').trim();
    const price_core = Number(params.price_core ?? params.priceCore ?? meta.price ?? meta.price_core ?? meta.priceCore ?? 0);

    // Kiểm tra đã có trong wishlist chưa
    const existing = await db
      .prepare('SELECT id FROM user_wishlist WHERE user_id = ? AND item_type = ? AND item_id = ? LIMIT 1')
      .bind(userId, item_type, item_id)
      .first<{ id: string }>();

    if (existing) {
      // Đã có -> Xóa bỏ
      await db.prepare('DELETE FROM user_wishlist WHERE id = ?').bind(existing.id).run();
      return {
        success: true,
        is_bookmarked: false,
        message: 'Đã xóa khỏi danh sách yêu thích.',
      };
    } else {
      // Chưa có -> Thêm mới
      const id = `wl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();

      await db
        .prepare(`
          INSERT INTO user_wishlist (
            id, user_id, item_type, item_id, item_title, item_image, price_core, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          id,
          userId,
          item_type,
          item_id,
          item_title || null,
          item_image || null,
          price_core || 0,
          nowIso
        )
        .run();

      const created = await db.prepare('SELECT * FROM user_wishlist WHERE id = ?').bind(id).first<WishlistItem>();

      return {
        success: true,
        is_bookmarked: true,
        message: 'Đã thêm vào danh sách yêu thích.',
        item: created || undefined,
      };
    }
  } catch (err: any) {
    return { success: false, is_bookmarked: false, message: err?.message || 'Lỗi xử lý yêu thích.' };
  }
}

/**
 * Đồng bộ danh sách yêu thích từ localStorage (mảng game slugs hoặc ID) vào D1 khi đăng nhập
 */
export async function syncWishlistForUser(
  db: D1Database,
  userId: string,
  localItems: Array<{ item_id: string; item_type?: 'game' | 'product'; item_title?: string; item_image?: string }>
): Promise<WishlistItem[]> {
  if (Array.isArray(localItems) && localItems.length > 0) {
    const nowIso = new Date().toISOString();

    for (const it of localItems) {
      if (!it.item_id) continue;
      const type = it.item_type || 'game';

      const existing = await db
        .prepare('SELECT id FROM user_wishlist WHERE user_id = ? AND item_type = ? AND item_id = ? LIMIT 1')
        .bind(userId, type, it.item_id)
        .first<any>();

      if (!existing) {
        const id = `wl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
        await db
          .prepare(`
            INSERT OR IGNORE INTO user_wishlist (
              id, user_id, item_type, item_id, item_title, item_image, price_core, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
          `)
          .bind(id, userId, type, it.item_id, it.item_title || null, it.item_image || null, nowIso)
          .run()
          .catch(() => {});
      }
    }
  }

  return getWishlistForUser(db, userId);
}

/**
 * Xóa toàn bộ danh sách yêu thích
 */
export async function clearWishlist(db: D1Database, userId: string): Promise<{ success: boolean; message: string }> {
  await db.prepare('DELETE FROM user_wishlist WHERE user_id = ?').bind(userId).run();
  return { success: true, message: 'Đã xóa toàn bộ danh sách yêu thích.' };
}
