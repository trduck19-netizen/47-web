import React from 'react';
import { Star, Truck, Zap } from 'lucide-react';
import type { UniversalProduct } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface ProductCardProps {
  product: UniversalProduct;
  onSelect: (p: UniversalProduct) => void;
  onQuickBuy: (p: UniversalProduct) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
  onQuickBuy,
}) => {
  const { formatCurrency, t } = useLanguage();

  return (
    <div 
      onClick={() => onSelect(product)}
      className="group bg-white rounded-xl border border-gray-100 hover:border-orange-300 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden cursor-pointer relative"
    >
      {/* Product Image */}
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        <img
          src={product.thumbnail_url}
          alt={product.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
            MALL
          </span>
          {product.badge && (
            <span className="bg-orange-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
              {product.badge}
            </span>
          )}
        </div>

        {/* Discount Tag */}
        {product.discount_percent > 0 && (
          <div className="absolute top-0 right-0 bg-amber-400 text-red-600 font-extrabold text-[11px] px-2 py-1 rounded-bl-lg shadow">
            -{product.discount_percent}%
          </div>
        )}

        {/* Physical vs Digital indicator */}
        <div className="absolute bottom-2 left-2">
          {product.product_type === 'digital' ? (
            <span className="bg-purple-600/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm flex items-center space-x-1">
              <Zap className="w-3 h-3" />
              <span>Giao tức thì 0s</span>
            </span>
          ) : (
            <span className="bg-emerald-600/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm flex items-center space-x-1">
              <Truck className="w-3 h-3" />
              <span>Giao toàn quốc</span>
            </span>
          )}
        </div>
      </div>

      {/* Info Body */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          <span className="text-[11px] text-gray-400 font-medium">{product.brand_name}</span>
          <h3 className="font-semibold text-gray-800 text-xs sm:text-sm line-clamp-2 mt-0.5 group-hover:text-orange-600 transition-colors">
            {product.title}
          </h3>
        </div>

        <div className="mt-3">
          {/* Price */}
          <div className="flex items-baseline space-x-2">
            <span className="text-orange-600 font-bold text-sm sm:text-base">
              {formatCurrency(product.current_price)}
            </span>
            {product.original_price > product.current_price && (
              <span className="text-gray-400 text-xs line-through">
                {formatCurrency(product.original_price)}
              </span>
            )}
          </div>

          {/* Social Proof */}
          <div className="flex items-center justify-between text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-50">
            <div className="flex items-center space-x-1 text-amber-500 font-semibold">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>{product.rating_avg.toFixed(1)}</span>
            </div>
            <span>{t('home.sold')} {product.sold_count}</span>
          </div>

          {/* Quick Action Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickBuy(product);
            }}
            className="w-full mt-3 py-1.5 bg-orange-50 hover:bg-orange-600 text-orange-600 hover:text-white rounded-lg text-xs font-bold transition-all duration-200 border border-orange-200 hover:border-transparent flex items-center justify-center space-x-1"
          >
            <span>{t('home.buyNow')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
