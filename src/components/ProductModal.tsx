import React, { useState } from 'react';
import { X, Star, ShieldCheck, Truck, RotateCcw, Check, ShoppingBag, Zap } from 'lucide-react';
import type { UniversalProduct, ProductVariant } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface ProductModalProps {
  product: UniversalProduct;
  onClose: () => void;
  onProceedCheckout: (product: UniversalProduct, variant?: ProductVariant, quantity?: number) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  onClose,
  onProceedCheckout,
}) => {
  const { formatCurrency, t } = useLanguage();
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(
    product.variants && product.variants.length > 0 ? product.variants[0] : undefined
  );
  const [quantity, setQuantity] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const images = product.images && product.images.length > 0 ? product.images : [product.thumbnail_url];
  const activePrice = selectedVariant ? selectedVariant.price : product.current_price;
  const activeStock = selectedVariant ? selectedVariant.stock_quantity : product.stock_quantity;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl relative my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* Images Section */}
          <div className="space-y-3">
            <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-100 relative">
              <img
                src={images[activeImageIndex]}
                alt={product.title}
                className="w-full h-full object-cover"
              />
              <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                MALL CHÍNH HÃNG
              </span>
            </div>

            {images.length > 1 && (
              <div className="flex space-x-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImageIndex(i)}
                    className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                      activeImageIndex === i ? 'border-orange-500 scale-95' : 'border-gray-200 opacity-70'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Quick Guarantees */}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2 text-xs text-gray-600">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Cam kết chính hãng 100% • Đổi trả 7 ngày</span>
              </div>
              <div className="flex items-center space-x-2">
                <Truck className="w-4 h-4 text-orange-600 shrink-0" />
                <span>Giao hàng toàn quốc 63 tỉnh thành qua GHTK / GHN</span>
              </div>
            </div>
          </div>

          {/* Details Section */}
          <div className="flex flex-col justify-between space-y-4">
            <div>
              <span className="text-xs text-orange-600 font-semibold tracking-wide uppercase">
                {product.brand_name}
              </span>
              <h2 className="text-lg font-bold text-gray-900 mt-1 leading-snug">
                {product.title}
              </h2>

              <div className="flex items-center space-x-3 text-xs text-gray-500 mt-2">
                <div className="flex items-center space-x-1 text-amber-500 font-bold">
                  <Star className="w-4 h-4 fill-current" />
                  <span>{product.rating_avg.toFixed(1)}</span>
                </div>
                <span>•</span>
                <span>{product.rating_count} {t('home.reviews')}</span>
                <span>•</span>
                <span>{t('home.sold')} {product.sold_count}</span>
              </div>

              {/* Price Banner */}
              <div className="bg-orange-50 rounded-xl p-3 mt-4 flex items-baseline space-x-3 border border-orange-100">
                <span className="text-2xl font-extrabold text-orange-600">
                  {formatCurrency(activePrice)}
                </span>
                {product.original_price > activePrice && (
                  <span className="text-sm text-gray-400 line-through">
                    {formatCurrency(product.original_price)}
                  </span>
                )}
                {product.discount_percent > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    -{product.discount_percent}%
                  </span>
                )}
              </div>

              {/* Variants Selector */}
              {product.variants && product.variants.length > 0 && (
                <div className="mt-4 space-y-2">
                  <label className="text-xs font-bold text-gray-700 block">
                    Phân loại / Biến thể:
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                    {product.variants.map((v) => {
                      const isSelected = selectedVariant?.id === v.id;
                      return (
                        <button
                          key={v.id}
                          onClick={() => setSelectedVariant(v)}
                          className={`p-2 rounded-lg border text-left text-xs transition-all flex items-center justify-between ${
                            isSelected
                              ? 'border-orange-500 bg-orange-50/50 text-orange-700 font-semibold ring-1 ring-orange-500'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}
                        >
                          <span className="truncate pr-1">{v.variant_name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-orange-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="font-bold text-gray-700">Số lượng:</span>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold"
                    >
                      -
                    </button>
                    <span className="px-3 py-1 font-semibold text-gray-800">{quantity}</span>
                    <button
                      onClick={() => setQuantity(Math.min(activeStock, quantity + 1))}
                      className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-gray-400">({activeStock} có sẵn)</span>
                </div>
              </div>

              {/* Description */}
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-600 space-y-1">
                <p className="line-clamp-3">{product.description}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-gray-100 flex space-x-3">
              <button
                onClick={() => {
                  onProceedCheckout(product, selectedVariant, quantity);
                }}
                className="flex-1 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center space-x-2"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Mua Ngay ({formatCurrency(activePrice * quantity)})</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
