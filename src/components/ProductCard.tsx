import React from 'react';
import { MapPin, ShieldCheck, Star, Truck, Zap } from 'lucide-react';
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
  const isPhysical = product.product_type === 'physical';
  const shipOrigin = (product as any).warehouse_address || (product as any).origin || t('shopeePhysical.warehouseDefault');

  return (
    <div
      onClick={() => onSelect(product)}
      className="group bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 hover:border-[#ee4d2d] shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col overflow-hidden cursor-pointer relative"
    >
      {/* Square Product Image (Shopee Standard) */}
      <div className="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
        <img
          src={product.thumbnail_url}
          alt={product.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Top-left Mall / Preferred Ribbon */}
        <div className="absolute top-2 left-0 flex flex-col gap-1 items-start">
          <span className="bg-[#d0011b] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-r shadow-sm">
            {t('shopeePhysical.mallBadge')}
          </span>
          {product.badge && (
            <span className="bg-[#ee4d2d] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-r shadow-sm">
              {product.badge}
            </span>
          )}
        </div>

        {/* Top-right Shopee Discount Flag */}
        {product.discount_percent > 0 && (
          <div className="absolute top-0 right-0 bg-[#ffe97a] text-[#ee4d2d] font-extrabold text-[11px] px-1.5 py-0.5 rounded-bl shadow-xs">
            -{product.discount_percent}%
          </div>
        )}

        {/* Bottom-left Freeship Xtra / Instant 0s Strip */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-1.5 py-1 bg-gradient-to-t from-black/55 to-transparent">
          {isPhysical ? (
            <span className="bg-[#00bfa5] text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-xs flex items-center gap-1 tracking-tight shadow-xs">
              <Truck className="w-3 h-3 shrink-0" />
              <span>{t('shopeePhysical.freeshipXtra')}</span>
            </span>
          ) : (
            <span className="bg-purple-600/95 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-xs flex items-center gap-1 shadow-xs">
              <Zap className="w-3 h-3 shrink-0" />
              <span>{t('shopeePhysical.instant0s')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Info Body */}
      <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
        <div className="space-y-1">
          <h3 className="font-medium text-slate-800 dark:text-slate-100 text-xs leading-snug line-clamp-2 min-h-[2.1rem] group-hover:text-[#ee4d2d] transition-colors">
            {product.title}
          </h3>
          {isPhysical && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] font-semibold border border-[#ee4d2d] text-[#ee4d2d] px-1 py-0.2 rounded-xs">
                {t('shopeePhysical.cheapGuarantee')}
              </span>
              <span className="text-[9px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1 py-0.2 rounded-xs inline-flex items-center gap-0.5">
                <ShieldCheck className="w-2.5 h-2.5 shrink-0" />
                <span>{t('shopeePhysical.return15Days')}</span>
              </span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          {/* Price Row */}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[#ee4d2d] font-bold text-sm sm:text-base">
              {formatCurrency(product.current_price)}
            </span>
            {product.original_price > product.current_price && (
              <span className="text-slate-400 text-[11px] line-through">
                {formatCurrency(product.original_price)}
              </span>
            )}
          </div>

          {/* Rating, Sold & Origin Location */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-0.5 text-amber-500 font-semibold">
              <Star className="w-3 h-3 fill-current" />
              <span>{product.rating_avg.toFixed(1)}</span>
            </div>
            <span>{t('shopeePhysical.soldPrefix')} {product.sold_count}</span>
          </div>

          {isPhysical && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{shipOrigin}</span>
            </div>
          )}

          {/* Quick Action Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickBuy(product);
            }}
            className="w-full mt-1 py-1.5 bg-[#ee4d2d] hover:bg-[#d73211] text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>{t('shopeePhysical.buyNow')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
