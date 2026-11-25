import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Heart,
  X,
  Trash2,
  ShoppingCart,
  ExternalLink,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { wishlistService, type WishlistRecord } from '../../services/wishlistService';
import { cartService } from '../../services/cartService';
import type { UserProfile } from '../../types/game';
import { formatCore } from '../../utils/textUtils';
import { useLanguage } from '../../context/LanguageContext';

interface WishlistDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onOpenLogin: () => void;
  onOpenCart: () => void;
  onNavigateDetail?: (targetId: string, targetType: 'game' | 'product') => void;
}

export const WishlistDrawerModal: React.FC<WishlistDrawerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onOpenLogin,
  onOpenCart,
  onNavigateDetail,
}) => {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [items, setItems] = useState<WishlistRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const list = await wishlistService.getWishlist();
      setItems(list);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadItems();
    }
  }, [isOpen, currentUser]);

  useEffect(() => {
    const handleUpdate = () => {
      wishlistService.getWishlist().then(setItems).catch(() => {});
    };
    window.addEventListener('pine_wishlist_updated', handleUpdate);
    return () => window.removeEventListener('pine_wishlist_updated', handleUpdate);
  }, []);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleRemove = async (targetId: string, targetType: 'game' | 'product') => {
    await wishlistService.toggleWishlist({ target_id: targetId, target_type: targetType });
    setItems((prev) => prev.filter((it) => !(it.target_id === targetId && it.target_type === targetType)));
  };

  const handleClearAll = async () => {
    if (confirm(isEn ? 'Clear all items from wishlist?' : 'Xóa toàn bộ danh sách yêu thích?')) {
      await wishlistService.clearWishlist();
      setItems([]);
    }
  };

  const handleAddToCart = (record: WishlistRecord) => {
    const meta = record.metadata;
    if (!meta) return;

    cartService.addItem({
      product_id: record.target_id,
      title: meta.title || 'Sản phẩm',
      price: meta.price || 0,
      image_url: meta.image_url || '',
      category: meta.category || 'MALL',
      product_type: (record.target_type === 'game' ? 'game' : 'digital') as any,
    });

    onClose();
    onOpenCart();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-card border-l border-border h-full flex flex-col shadow-2xl animate-slide-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-card/80 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center">
              <Heart className="w-5 h-5 fill-rose-500" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-foreground flex items-center gap-2">
                {isEn ? 'Saved Wishlist' : 'Danh Sách Yêu Thích'}
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 font-bold border border-rose-500/20">
                  {items.length}
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                {isEn ? 'All favorite products and items' : 'Các sản phẩm và game bạn đã lưu'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button
                onClick={handleClearAll}
                className="p-2 rounded-xl text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                title={isEn ? 'Clear all' : 'Xóa tất cả'}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={isEn ? 'Close' : 'Đóng'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sync Status Banner */}
        {!currentUser && (
          <div className="mx-4 mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 flex items-center justify-between gap-2">
            <span>{isEn ? 'Sign in to sync your wishlist across all devices.' : 'Đăng nhập để lưu yêu thích vĩnh viễn trên tài khoản.'}</span>
            <button
              onClick={() => {
                onClose();
                onOpenLogin();
              }}
              className="px-2.5 py-1 rounded-xl bg-amber-500 text-black font-bold shrink-0 hover:bg-amber-400"
            >
              {isEn ? 'Sign In' : 'Đăng nhập'}
            </button>
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center">
                <Heart className="w-8 h-8 opacity-40" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-foreground text-sm sm:text-base">
                  {isEn ? 'Wishlist is empty' : 'Chưa có sản phẩm yêu thích'}
                </h4>
                <p className="text-xs text-muted-foreground max-w-xs">
                  {isEn
                    ? 'Tap the heart icon on any product or item to save it here for later.'
                    : 'Nhấn vào biểu tượng trái tim ở bất kỳ sản phẩm nào để lưu lại xem sau.'}
                </p>
              </div>
            </div>
          ) : (
            items.map((record) => {
              const meta = record.metadata || {};
              const title = meta.title || record.target_id;
              const price = Number(meta.price || 0);
              const imageUrl = meta.image_url || '';

              return (
                <div
                  key={`${record.target_type}_${record.target_id}`}
                  className="p-3 rounded-2xl bg-muted/30 border border-border/70 hover:border-border transition-all flex items-center gap-3 group"
                >
                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded-xl bg-slate-900 border border-border/80 overflow-hidden shrink-0 flex items-center justify-center relative">
                    {imageUrl ? (
                      <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
                    ) : (
                      <ShoppingBag className="w-6 h-6 text-muted-foreground" />
                    )}
                    <span className="absolute top-1 left-1 px-1 text-[9px] font-bold rounded bg-black/60 text-white uppercase">
                      {record.target_type}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <h5
                      onClick={() => onNavigateDetail && onNavigateDetail(record.target_id, record.target_type)}
                      className="text-xs sm:text-sm font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                      title={title}
                    >
                      {title}
                    </h5>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold text-primary font-mono">
                        {formatCore(price)}
                      </span>
                      {meta.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {meta.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleAddToCart(record)}
                      className="p-2 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-white transition-all cursor-pointer"
                      title={isEn ? 'Add to cart' : 'Thêm vào giỏ'}
                    >
                      <ShoppingCart className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRemove(record.target_id, record.target_type)}
                      className="p-2 rounded-xl text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
                      title={isEn ? 'Remove' : 'Xóa'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-4 border-t border-border bg-card flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {items.length} {isEn ? 'items saved' : 'sản phẩm đã lưu'}
            </span>
            <button
              onClick={() => {
                onClose();
                onOpenCart();
              }}
              className="px-4 py-2.5 rounded-2xl bg-primary text-white font-bold text-xs flex items-center gap-2 hover:bg-primary-hover transition-colors shadow-glow-primary"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>{isEn ? 'View Shopping Cart' : 'Xem Giỏ Hàng'}</span>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
