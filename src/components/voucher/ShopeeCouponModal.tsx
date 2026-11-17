import React, { useState } from 'react';
import { X, Tag, Check, Truck, Sparkles } from 'lucide-react';
import { voucherService, Voucher } from '../../services/voucherService';
import { useLanguage } from '../../context/LanguageContext';

interface ShopeeCouponModalProps {
  subtotal: number;
  shippingFee: number;
  selectedFreeship: Voucher | null;
  selectedDiscount: Voucher | null;
  onApply: (freeship: Voucher | null, discount: Voucher | null) => void;
  onClose: () => void;
}

export const ShopeeCouponModal: React.FC<ShopeeCouponModalProps> = ({
  subtotal,
  shippingFee,
  selectedFreeship,
  selectedDiscount,
  onApply,
  onClose,
}) => {
  const { formatCurrency } = useLanguage();
  const allVouchers = voucherService.getVouchers();
  const freeshipVouchers = allVouchers.filter((v) => v.voucher_type === 'freeship');
  const discountVouchers = allVouchers.filter((v) => v.voucher_type === 'discount');

  const [tempFreeship, setTempFreeship] = useState<Voucher | null>(selectedFreeship);
  const [tempDiscount, setTempDiscount] = useState<Voucher | null>(selectedDiscount);

  const calculatedFreeshipDiscount = tempFreeship
    ? voucherService.calculateShippingDiscount(tempFreeship, shippingFee, subtotal)
    : 0;

  const calculatedShopDiscount = tempDiscount
    ? voucherService.calculateDiscount(tempDiscount, subtotal)
    : 0;

  const totalSaved = calculatedFreeshipDiscount + calculatedShopDiscount;

  return (
    <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-500 to-amber-500 text-white">
          <div className="flex items-center space-x-2">
            <Tag className="w-5 h-5 text-yellow-200" />
            <h3 className="font-bold text-base">Shopee Voucher Đa Tầng</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="p-4 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Section 1: Freeship Vouchers */}
          <div>
            <div className="flex items-center space-x-1.5 text-orange-600 font-bold mb-2">
              <Truck className="w-4 h-4" />
              <span>1. Mã Miễn Phí Vận Chuyển (Chọn tối đa 1 mã)</span>
            </div>
            <div className="space-y-2">
              {freeshipVouchers.map((v) => {
                const isSelected = tempFreeship?.id === v.id;
                const isEligible = subtotal >= v.min_order_amount;
                return (
                  <div
                    key={v.id}
                    onClick={() => {
                      if (!isEligible) return;
                      setTempFreeship(isSelected ? null : v);
                    }}
                    className={`p-3 rounded-xl border transition-all flex items-start justify-between cursor-pointer ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/60 ring-1 ring-orange-500'
                        : isEligible
                        ? 'border-gray-200 hover:border-orange-200 bg-white'
                        : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-gray-800 text-sm">{v.code}</span>
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                          Freeship
                        </span>
                      </div>
                      <p className="text-gray-600 mt-1">{v.description}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Đơn tối thiểu: {formatCurrency(v.min_order_amount)}
                      </p>
                    </div>
                    <div className="pt-1">
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? 'bg-orange-600 border-orange-600 text-white'
                            : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Shop Discount Vouchers */}
          <div>
            <div className="flex items-center space-x-1.5 text-orange-600 font-bold mb-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>2. Mã Giảm Giá Đơn Hàng (Chọn tối đa 1 mã)</span>
            </div>
            <div className="space-y-2">
              {discountVouchers.map((v) => {
                const isSelected = tempDiscount?.id === v.id;
                const isEligible = subtotal >= v.min_order_amount;
                return (
                  <div
                    key={v.id}
                    onClick={() => {
                      if (!isEligible) return;
                      setTempDiscount(isSelected ? null : v);
                    }}
                    className={`p-3 rounded-xl border transition-all flex items-start justify-between cursor-pointer ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/60 ring-1 ring-orange-500'
                        : isEligible
                        ? 'border-gray-200 hover:border-orange-200 bg-white'
                        : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-gray-800 text-sm">{v.code}</span>
                        <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                          Giảm giá
                        </span>
                      </div>
                      <p className="text-gray-600 mt-1">{v.description}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Đơn tối thiểu: {formatCurrency(v.min_order_amount)}
                      </p>
                    </div>
                    <div className="pt-1">
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? 'bg-orange-600 border-orange-600 text-white'
                            : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-[11px]">Tiết kiệm được:</p>
            <p className="text-orange-600 font-extrabold text-base">{formatCurrency(totalSaved)}</p>
          </div>
          <button
            onClick={() => {
              onApply(tempFreeship, tempDiscount);
              onClose();
            }}
            className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-xs shadow-md shadow-orange-500/20 transition-all"
          >
            Đồng Ý Áp Dụng
          </button>
        </div>
      </div>
    </div>
  );
};
