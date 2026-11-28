import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useBrand } from '../context/BrandContext';

export interface CyberLoaderProps {
  title?: string;
  subText?: string;
  size?: number;
  avatarSize?: number;
  isOverlay?: boolean;
  className?: string;
}

export const CyberLoader: React.FC<CyberLoaderProps> = ({
  title,
  subText,
  size = 180,
  avatarSize,
  isOverlay = false,
  className = '',
}) => {
  const { brand } = useBrand();
  let isEn = false;
  try {
    const langCtx = useLanguage();
    isEn = langCtx.language === 'en';
  } catch {
    if (typeof window !== 'undefined') {
      isEn = window.location.pathname.startsWith('/en') || localStorage.getItem('pine_language') === 'en';
    }
  }

  const dynamicShortUpper = (brand.shortName || brand.brandName || 'PINE MALL').toUpperCase();

  // Automatic bilingual + brand-aware fallback mapping
  let resolvedTitle = title;
  if (!resolvedTitle) {
    resolvedTitle = dynamicShortUpper;
  } else if (resolvedTitle === 'CODE GAME' || resolvedTitle === 'PINE MALL') {
    resolvedTitle = dynamicShortUpper;
  } else if (isEn) {
    if (resolvedTitle === 'ĐANG GIẬT CODE...') resolvedTitle = 'CLAIMING CODE...';
    else if (resolvedTitle === 'ĐANG XỬ LÝ ĐƠN...') resolvedTitle = 'PROCESSING ORDER...';
    else if (resolvedTitle === 'ĐANG TẠO MÃ QR...') resolvedTitle = 'CREATING QR CODE...';
    else if (resolvedTitle === 'ĐANG XỬ LÝ TIỆN ÍCH...') resolvedTitle = 'PROCESSING UTILITY...';
    else if (resolvedTitle === 'ĐANG TẢI GIAO DIỆN...') resolvedTitle = 'LOADING INTERFACE...';
  }

  let resolvedSubText = subText;
  if (isEn && resolvedSubText) {
    if (resolvedSubText.includes('kết nối kho giftcode Cloudflare D1')) {
      resolvedSubText = 'Connecting to Cloudflare D1 vault to distribute giftcode reward...';
    } else if (resolvedSubText.includes('kiểm tra số dư ví & xuất mã quà tặng')) {
      resolvedSubText = 'Verifying wallet balance & exporting voucher from Cloudflare D1 secure vault...';
    } else if (resolvedSubText.includes('tạm giữ mã quà tặng trong kho bảo mật')) {
      resolvedSubText = 'Temporarily reserving giftcode in secure vault for your order...';
    } else if (resolvedSubText.includes('kiểm tra ví & xuất mã tiện ích')) {
      resolvedSubText = 'Verifying balance & exporting utility code from Cloudflare D1 secure vault...';
    } else if (resolvedSubText.includes('Đang nạp dữ liệu')) {
      resolvedSubText = 'Loading data...';
    }
  }

  const calcAvatarSize = avatarSize || Math.round(size * 0.6);
  const letters = resolvedTitle.split('');

  const content = (
    <div className={`flex flex-col items-center justify-center gap-4 text-center select-none ${className}`}>
      {/* 3D Glowing Ring & Center Avatar */}
      <div
        className="loader-wrapper"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <div className="loader" />
        <div
          className="loader-center-avatar"
          style={{ width: `${calcAvatarSize}px`, height: `${calcAvatarSize}px` }}
        >
          <img
            src={brand.logoUrl && brand.logoUrl !== '/logo.png' ? brand.logoUrl : '/brand_loader_logo.jpg'}
            alt={`${brand.brandName} Logo`}
            className="w-full h-full object-cover rounded-full"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = '/favicon.png';
            }}
          />
        </div>
      </div>

      {/* Bouncing neon letters */}
      {resolvedTitle && (
        <div className="flex items-center justify-center gap-0.5 sm:gap-1 text-sm sm:text-base font-extrabold text-white tracking-widest font-display drop-shadow-[0_0_12px_rgba(139,92,246,0.6)]">
          {letters.map((char, idx) => (
            <span
              key={idx}
              className="loader-letter inline-block"
              style={{ animationDelay: `${(idx % 12) * 0.1}s` }}
            >
              {char === ' ' ? '\u00A0' : char}
            </span>
          ))}
        </div>
      )}

      {/* Subtitle / Status details */}
      {resolvedSubText && (
        <p className="text-xs sm:text-sm text-slate-300/90 font-medium max-w-xs leading-relaxed animate-pulse">
          {resolvedSubText}
        </p>
      )}
    </div>
  );

  if (isOverlay) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in pointer-events-auto">
        {content}
      </div>
    );
  }

  return content;
};
