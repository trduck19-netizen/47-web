export interface ProductReviewRecord {
  id: string;
  product_id: string;
  user_id: string;
  user_name: string | null;
  rating: number;
  comment: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewSummary {
  averageRating: number | null; // null nếu chưa có đánh giá nào
  totalReviews: number;
  starDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  reviews: ProductReviewRecord[];
  canReview?: boolean;
  hasPurchased?: boolean;
  hasReviewed?: boolean;
}

/**
 * Lấy danh sách đánh giá đã duyệt và thống kê điểm của sản phẩm
 */
export async function getProductReviews(
  db: D1Database,
  productId: string,
  currentUserId?: string
): Promise<ReviewSummary> {
  const reviewsRes = await db
    .prepare(`
      SELECT * FROM product_reviews
      WHERE product_id = ? AND status = 'approved'
      ORDER BY created_at DESC
      LIMIT 100
    `)
    .bind(productId)
    .all<ProductReviewRecord>();

  const reviews = reviewsRes?.results || [];
  const totalReviews = reviews.length;

  const starDistribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0,
  };

  let sumRating = 0;
  for (const r of reviews) {
    const star = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
    starDistribution[star] = (starDistribution[star] || 0) + 1;
    sumRating += r.rating;
  }

  const averageRating = totalReviews > 0 ? Math.round((sumRating / totalReviews) * 10) / 10 : null;

  let canReview = false;
  let hasPurchased = false;
  let hasReviewed = false;

  if (currentUserId) {
    // 1. Kiểm tra đã đánh giá chưa
    const existing = await db
      .prepare("SELECT id FROM product_reviews WHERE product_id = ? AND user_id = ? LIMIT 1")
      .bind(productId, currentUserId)
      .first<any>();

    hasReviewed = !!existing;

    // 2. Kiểm tra đã mua chưa (ở orders hoặc seller_orders)
    const orderCheck = await db
      .prepare(`
        SELECT id FROM orders
        WHERE member_id = ?
          AND product_id = ?
          AND (status IN ('COMPLETED', 'HOLDING', 'PAID') OR payment_status = 'PAID')
        LIMIT 1
      `)
      .bind(currentUserId, productId)
      .first<any>();

    if (orderCheck) {
      hasPurchased = true;
    } else {
      const sellerOrderCheck = await db
        .prepare(`
          SELECT id FROM seller_orders
          WHERE buyer_member_id = ?
            AND product_id = ?
            AND status IN ('PAID', 'DELIVERED', 'COMPLETED')
          LIMIT 1
        `)
        .bind(currentUserId, productId)
        .first<any>();
      if (sellerOrderCheck) {
        hasPurchased = true;
      }
    }

    canReview = hasPurchased && !hasReviewed;
  }

  return {
    averageRating,
    totalReviews,
    starDistribution,
    reviews,
    canReview,
    hasPurchased,
    hasReviewed,
  };
}

/**
 * Gửi đánh giá sản phẩm (chỉ áp dụng cho tài khoản đã mua)
 */
export async function createProductReview(
  db: D1Database,
  params: {
    productId: string;
    userId: string;
    userName?: string;
    rating: number;
    comment: string;
  }
): Promise<{ success: boolean; message: string; review?: any; code?: string }> {
  try {
    const { productId, userId, userName, rating, comment } = params;

    // 1. Validate rating
    const numRating = Math.round(Number(rating));
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return { success: false, message: 'Số sao đánh giá phải từ 1 đến 5.', code: 'INVALID_RATING' };
    }

    // 2. Kiểm tra tài khoản đã đánh giá sản phẩm này chưa
    const existing = await db
      .prepare("SELECT id FROM product_reviews WHERE product_id = ? AND user_id = ? LIMIT 1")
      .bind(productId, userId)
      .first<any>();

    if (existing) {
      return { success: false, message: 'Bạn đã đánh giá sản phẩm này rồi. Mỗi tài khoản chỉ được đánh giá 1 lần.', code: 'ALREADY_REVIEWED' };
    }

    // 3. Kiểm tra xem tài khoản đã mua sản phẩm hay chưa
    let hasBought = false;

    const orderCheck = await db
      .prepare(`
        SELECT id FROM orders
        WHERE member_id = ?
          AND product_id = ?
          AND (status IN ('COMPLETED', 'HOLDING', 'PAID') OR payment_status = 'PAID')
        LIMIT 1
      `)
      .bind(userId, productId)
      .first<any>();

    if (orderCheck) {
      hasBought = true;
    } else {
      const sellerOrderCheck = await db
        .prepare(`
          SELECT id FROM seller_orders
          WHERE buyer_member_id = ?
            AND product_id = ?
            AND status IN ('PAID', 'DELIVERED', 'COMPLETED')
          LIMIT 1
        `)
        .bind(userId, productId)
        .first<any>();

      if (sellerOrderCheck) {
        hasBought = true;
      }
    }

    if (!hasBought) {
      return {
        success: false,
        message: 'Bạn chỉ có thể gửi đánh giá sau khi đã mua sản phẩm này.',
        code: 'NOT_PURCHASED',
      };
    }

    // 4. Lưu đánh giá ở trạng thái chờ duyệt (pending)
    const reviewId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    await db
      .prepare(`
        INSERT INTO product_reviews (
          id, product_id, user_id, user_name, rating, comment, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `)
      .bind(
        reviewId,
        productId,
        userId,
        userName || 'Khách hàng',
        numRating,
        (comment || '').trim(),
        nowIso,
        nowIso
      )
      .run();

    return {
      success: true,
      message: 'Gửi đánh giá thành công! Đánh giá của bạn đang chờ Quản trị viên duyệt trước khi hiển thị công khai.',
      review: {
        id: reviewId,
        productId,
        rating: numRating,
        comment,
        status: 'pending',
        createdAt: nowIso,
      },
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi lưu đánh giá.' };
  }
}

/**
 * Quản trị viên duyệt đánh giá
 */
export async function approveReview(
  db: D1Database,
  reviewId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await db
      .prepare("UPDATE product_reviews SET status = 'approved', updated_at = datetime('now') WHERE id = ?")
      .bind(reviewId)
      .run();

    if ((res as any)?.meta?.changes === 0) {
      return { success: false, message: 'Không tìm thấy đánh giá cần duyệt.' };
    }

    return { success: true, message: 'Duyệt đánh giá thành công!' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi duyệt đánh giá.' };
  }
}

/**
 * Quản trị viên từ chối đánh giá
 */
export async function rejectReview(
  db: D1Database,
  reviewId: string,
  adminNote?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await db
      .prepare("UPDATE product_reviews SET status = 'rejected', admin_note = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(adminNote || 'Nội dung không phù hợp', reviewId)
      .run();

    if ((res as any)?.meta?.changes === 0) {
      return { success: false, message: 'Không tìm thấy đánh giá cần từ chối.' };
    }

    return { success: true, message: 'Đã từ chối hiển thị đánh giá.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi từ chối đánh giá.' };
  }
}

/**
 * Quản trị viên xóa vĩnh viễn đánh giá
 */
export async function deleteReview(
  db: D1Database,
  reviewId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await db
      .prepare("DELETE FROM product_reviews WHERE id = ?")
      .bind(reviewId)
      .run();

    if ((res as any)?.meta?.changes === 0) {
      return { success: false, message: 'Không tìm thấy đánh giá cần xóa.' };
    }

    return { success: true, message: 'Đã xóa đánh giá thành công.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Lỗi khi xóa đánh giá.' };
  }
}

/**
 * Quản trị viên lấy danh sách tất cả đánh giá (có thể lọc theo status)
 */
export async function listAdminReviews(
  db: D1Database,
  status?: string
): Promise<{ success: boolean; reviews: ProductReviewRecord[] }> {
  try {
    let query = "SELECT * FROM product_reviews";
    const params: any[] = [];
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query += " WHERE status = ?";
      params.push(status);
    }
    query += " ORDER BY created_at DESC LIMIT 200";
    const res = await (params.length > 0 ? db.prepare(query).bind(...params).all<ProductReviewRecord>() : db.prepare(query).all<ProductReviewRecord>());
    return { success: true, reviews: res?.results || [] };
  } catch (err: any) {
    return { success: false, reviews: [] };
  }
}
