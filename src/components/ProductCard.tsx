import React from 'react';
import { MapPin, ShieldCheck, Star, Truck, Zap } from 'lucide-react';
import type { UniversalProduct } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { PHYSICAL_DEFAULT_IMAGE_URL, resolveProductCoverImage } from '../utils/safeImageUrl';

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
  const { formatCurrency, t, language } = useLanguage();
  const isPhysical = product.product_type === 'physical';
  const isOutOfStock = typeof product.stock_quantity === 'number' && product.stock_quantity <= 0;
  const shipOrigin = (product as any).warehouse_address || (product as any).origin || t('shopeePhysical.warehouseDefault');
  const rawCoverSrc = resolveProductCoverImage(product, '/package-placeholder.svg');
  const coverSrc = rawCoverSrc.includes('test-game.webp') ? '/package-placeholder.svg' : rawCoverSrc;
  const isPlaceholder = coverSrc.includes('package-placeholder.svg');

  return (
    <article
      onClick={() => onSelect(product)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(product);
        }
      }}
      tabIndex={0}
      aria-label={product.title}
      className="group h-full bg-white dark:bg-slate-900 rounded-sm border border-slate-200/90 dark:border-slate-800 hover:border-[#ee4d2d] focus-visible:outline-2 focus-visible:outline-[#ee4d2d] focus-visible:outline-offset-1 shadow-xs hover:shadow-[0_4px_16px_rgba(238,77,45,0.14)] hover:-translate-y-0.5 hover:z-10 transition-all duration-200 flex flex-col overflow-hidden cursor-pointer relative"
    >
      {/* Square 1:1 Product Image (Shopee Standard) */}
      <div className="relative aspect-square w-full overflow-hidden bg-slate-50 dark:bg-slate-800 shrink-0">
        <img
          src={coverSrc}
          alt={product.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const target = e.currentTarget;
            if (isPhysical && !target.src.includes(PHYSICAL_DEFAULT_IMAGE_URL)) {
              target.src = PHYSICAL_DEFAULT_IMAGE_URL;
              return;
            }
            target.onerror = null;
            target.className = 'w-full h-full object-contain p-4 bg-slate-50 dark:bg-slate-800';
            target.src = '/package-placeholder.svg';
          }}
          className={`w-full h-full transition-transform duration-300 ${
            isPlaceholder ? 'object-contain p-4 bg-slate-50 dark:bg-slate-800' : 'object-cover group-hover:scale-105'
          }`}
        />

        {/* Top-left Shopee Mall / Preferred Ribbon */}
        <div className="absolute top-2 left-0 flex flex-col gap-1 items-start z-10">
          <span className="bg-[#d0011b] text-white text-[10px] leading-none font-bold px-1.5 py-1 rounded-r-xs shadow-xs tracking-tight">
            {t('shopeePhysical.mallBadge')}
          </span>
          {product.badge && (
            <span className="bg-[#ee4d2d] text-white text-[9px] leading-none font-bold px-1.5 py-0.5 rounded-r-xs shadow-xs">
              {product.badge}
            </span>
          )}
        </div>

        {/* Top-right Shopee Yellow Discount Flag */}
        {product.discount_percent > 0 && (
          <div className="absolute top-0 right-0 bg-[#ffe97a] text-[#ee4d2d] font-extrabold text-[11px] leading-tight px-1.5 py-1 rounded-bl-xs shadow-xs z-10 text-center">
            -{product.discount_percent}%
          </div>
        )}

        {/* Bottom-left Freeship Xtra / Instant 0s Strip */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-1.5 py-1 bg-gradient-to-t from-black/55 via-black/20 to-transparent">
          {isPhysical ? (
            <span className="bg-[#00bfa5] text-white text-[9px] leading-none font-extrabold px-1.5 py-1 rounded-xs flex items-center gap-1 tracking-tight shadow-xs">
              <Truck className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
              <span>{t('shopeePhysical.freeshipXtra')}</span>
            </span>
          ) : (
            <span className="bg-violet-600/95 text-white text-[9px] leading-none font-bold px-1.5 py-1 rounded-xs flex items-center gap-1 shadow-xs">
              <Zap className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
              <span>{t('shopeePhysical.instant0s')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Info Body */}
      <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-between gap-2">
        <div className="space-y-1.5">
          <h3 className="font-medium text-slate-800 dark:text-slate-100 text-xs leading-snug line-clamp-2 min-h-[2.125rem] group-hover:text-[#ee4d2d] transition-colors">
            {product.title}
          </h3>
          {isPhysical && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] leading-tight font-semibold border border-[#ee4d2d] text-[#ee4d2d] px-1 py-0.5 rounded-xs">
                {t('shopeePhysical.cheapGuarantee')}
              </span>
              <span className="text-[9px] leading-tight font-semibold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-1 py-0.5 rounded-xs inline-flex items-center gap-0.5">
                <ShieldCheck className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                <span>{t('shopeePhysical.return15Days')}</span>
              </span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          {/* Price Row */}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[#ee4d2d] font-bold text-sm sm:text-[15px] leading-none">
              {formatCurrency(product.current_price)}
            </span>
            {product.original_price > product.current_price && (
              <span className="text-slate-500 dark:text-slate-400 text-[11px] line-through leading-none">
                {formatCurrency(product.original_price)}
              </span>
            )}
          </div>

          {/* Rating & Sold Row */}
          <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-0.5 text-amber-500 font-semibold">
              <Star className="w-3 h-3 fill-current" aria-hidden="true" />
              <span className="text-slate-700 dark:text-slate-300">{product.rating_avg.toFixed(1)}</span>
            </div>
            <span className="truncate">{t('shopeePhysical.soldPrefix')} {product.sold_count}</span>
          </div>

          {isPhysical && (
            <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">
              <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{shipOrigin}</span>
            </div>
          )}

          {/* Quick Action Button */}
          <button
            type="button"
            disabled={isOutOfStock}
            onClick={(e) => {
              e.stopPropagation();
              onQuickBuy(product);
            }}
            className={`w-full mt-1 py-1.5 px-2 rounded-xs text-xs font-bold transition-colors flex items-center justify-center gap-1 ${
              isOutOfStock
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-[#ee4d2d] hover:bg-[#d73211] text-white cursor-pointer'
            }`}
          >
            <span>{isOutOfStock ? t('shopeePhysical.outOfStock') : t('shopeePhysical.buyNow')}</span>
          </button>
        </div>
      </div>

      {/* Shopee Signature Hover Bar ("Tìm sản phẩm tương tự" / "Find Similar") */}
      <div
        aria-hidden="true"
        className="hidden sm:flex items-center justify-center bg-[#ee4d2d] text-white text-[11px] font-semibold py-1.5 px-2 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
      >
        {language === 'en' ? 'Find Similar' : 'Tìm sản phẩm tương tự'}
      </div>
    </article>
  );
};
