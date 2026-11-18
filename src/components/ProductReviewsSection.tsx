import React, { useState, useEffect, useCallback } from 'react';
import { Star, MessageSquare, CheckCircle, ShieldAlert, Send, LogIn, ThumbsUp } from 'lucide-react';
import type { UserProfile } from '../types/game';

export interface ProductReviewsSectionProps {
  productId: string;
  currentUser?: UserProfile | null;
  onOpenAuth?: () => void;
  onShowToast?: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

interface ReviewItem {
  id: string;
  product_id: string;
  user_id: string;
  user_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

interface ReviewSummaryData {
  averageRating: number | null;
  totalReviews: number;
  starDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  reviews: ReviewItem[];
  canReview?: boolean;
  hasPurchased?: boolean;
  hasReviewed?: boolean;
}

export const ProductReviewsSection: React.FC<ProductReviewsSectionProps> = ({
  productId,
  currentUser,
  onOpenAuth,
  onShowToast,
}) => {
  const [data, setData] = useState<ReviewSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratingInput, setRatingInput] = useState(5);
  const [commentInput, setCommentInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const fetchReviews = useCallback(async () => {
    if (!productId) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('wcg_auth_token') || '';
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/products/${productId}/reviews`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json);
        }
      }
    } catch (err) {
      console.warn('[Fetch reviews error]', err);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) {
      onShowToast?.('Vui lòng nhập nhận xét', 'Hãy chia sẻ cảm nhận trải nghiệm thực tế về sản phẩm', 'error');
      return;
    }

    const token = localStorage.getItem('wcg_auth_token') || '';
    if (!token) {
      onOpenAuth?.();
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rating: ratingInput,
          comment: commentInput.trim(),
          userName: currentUser?.name || currentUser?.email?.split('@')[0] || 'Khách hàng',
        }),
      });

      const resJson = await res.json();
      if (res.ok && resJson.success) {
        onShowToast?.('Gửi đánh giá thành công', resJson.message || 'Đánh giá đang được duyệt để hiển thị công khai.', 'success');
        setCommentInput('');
        fetchReviews();
      } else {
        onShowToast?.('Không thể gửi đánh giá', resJson.message || 'Đã có lỗi xảy ra', 'error');
      }
    } catch (err: any) {
      onShowToast?.('Lỗi kết nối', err?.message || 'Không thể kết nối máy chủ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const totalReviews = data?.totalReviews || 0;
  const averageRating = data?.averageRating;

  return (
    <div className="mt-6 pt-5 border-t border-border/80 space-y-4">
      {/* Header khu vực Đánh giá */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-secondary" />
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Đánh giá sản phẩm
          </h4>
        </div>
        {totalReviews > 0 && averageRating !== null && (
          <span className="text-xs text-muted-foreground font-mono">
            {totalReviews} đánh giá đã xác thực
          </span>
        )}
      </div>

      {loading && !data ? (
        <div className="py-4 text-center text-xs text-muted-foreground animate-pulse">
          Đang tải đánh giá sản phẩm...
        </div>
      ) : (
        <div className="space-y-4">
          {/* Khối Điểm số và Phân bổ */}
          {totalReviews === 0 || averageRating === null ? (
            <div className="p-4 rounded-xl bg-muted/40 border border-border/60 text-center space-y-1">
              <div className="flex justify-center gap-1 text-slate-500 mb-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-4 h-4" />
                ))}
              </div>
              <p className="text-xs font-semibold text-foreground">Chưa có đánh giá</p>
              <p className="text-[11px] text-muted-foreground">
                Hãy là người đầu tiên trải nghiệm và để lại nhận xét cho sản phẩm này!
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-muted/30 border border-border/70 flex flex-col sm:flex-row items-center gap-4">
              {/* Điểm TB */}
              <div className="text-center sm:border-r border-border/60 sm:pr-4 min-w-[110px]">
                <div className="text-3xl font-extrabold text-amber-400 font-mono flex items-center justify-center gap-1">
                  <span>{averageRating.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground font-normal">/ 5</span>
                </div>
                <div className="flex justify-center gap-0.5 my-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-3.5 h-3.5 ${
                        star <= Math.round(averageRating)
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-600'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {totalReviews} lượt đánh giá
                </p>
              </div>

              {/* Phân bổ sao */}
              <div className="flex-1 w-full space-y-1">
                {([5, 4, 3, 2, 1] as const).map((s) => {
                  const count = data?.starDistribution[s] || 0;
                  const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
                  return (
                    <div key={s} className="flex items-center gap-2 text-xs">
                      <span className="w-12 text-[11px] font-mono text-muted-foreground shrink-0 flex items-center gap-0.5">
                        {s} <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-[10px] font-mono text-right text-muted-foreground shrink-0">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Form Gửi Đánh Giá (Kiểm tra quyền sở hữu) */}
          <div className="p-3.5 rounded-xl bg-card border border-border/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">
                Gửi nhận xét của bạn
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                1 tài khoản / 1 đánh giá
              </span>
            </div>

            {!currentUser ? (
              <div className="p-3 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Vui lòng đăng nhập để gửi đánh giá sản phẩm.
                </span>
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="px-3 py-1 rounded-lg bg-secondary text-white text-xs font-bold hover:bg-secondary/90 transition flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Đăng nhập
                </button>
              </div>
            ) : data?.hasReviewed ? (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-emerald-400 text-xs">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Bạn đã gửi đánh giá cho sản phẩm này. Cảm ơn phản hồi quý báu của bạn!</span>
              </div>
            ) : !data?.hasPurchased ? (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-amber-300 text-xs">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  Chỉ khách hàng đã mua và thanh toán đơn hàng sản phẩm này mới có quyền gửi đánh giá thực tế.
                </span>
              </div>
            ) : (
              /* Đã đăng nhập và đã mua -> Cho phép đánh giá */
              <form onSubmit={handleSubmitReview} className="space-y-3">
                {/* Chọn số sao */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Chấm điểm:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRatingInput(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(null)}
                        className="p-1 text-slate-500 hover:text-amber-400 transition cursor-pointer"
                        aria-label={`${star} sao`}
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= (hoverRating ?? ratingInput)
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-600'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-bold text-amber-400 font-mono">
                    {hoverRating ?? ratingInput} sao
                  </span>
                </div>

                {/* Nhập nhận xét */}
                <textarea
                  rows={2}
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Chia sẻ trải nghiệm sử dụng thực tế của bạn về sản phẩm này..."
                  className="w-full p-2.5 rounded-lg bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                  disabled={submitting}
                />

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Đánh giá sẽ qua kiểm duyệt công khai trước khi xuất hiện trên trang.
                  </span>
                  <button
                    type="submit"
                    disabled={submitting || !commentInput.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-secondary text-white text-xs font-bold hover:bg-secondary/90 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Danh sách các đánh giá đã duyệt */}
          {data?.reviews && data.reviews.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <h5 className="text-xs font-bold text-foreground">
                Nhận xét gần đây ({data.reviews.length})
              </h5>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                {data.reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-3 rounded-lg bg-muted/20 border border-border/50 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">
                          {rev.user_name || 'Khách hàng'}
                        </span>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3 h-3 ${
                                s <= rev.rating
                                  ? 'text-amber-400 fill-amber-400'
                                  : 'text-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(rev.created_at).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                    {rev.comment && (
                      <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                        {rev.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
