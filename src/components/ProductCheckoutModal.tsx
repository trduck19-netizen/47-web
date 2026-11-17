import React, { useState } from 'react';
import { 
  X, ShieldCheck, Truck, Tag, CreditCard, Wallet, 
  MapPin, CheckCircle, Sparkles, AlertCircle, QrCode, ArrowRight 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { UniversalProduct, ProductVariant, CustomerShippingInfo, UniversalOrder } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { voucherService, Voucher } from '../services/voucherService';
import { shippingService, ShippingCarrier, ShippingOrderRecord } from '../services/shippingService';
import { ShopeeCouponModal } from './voucher/ShopeeCouponModal';
import { generateVietQrUrl } from '../utils/vietQrUtils';

interface ProductCheckoutModalProps {
  product: UniversalProduct;
  variant?: ProductVariant;
  quantity: number;
  onClose: () => void;
  onOrderSuccess: (order: UniversalOrder, shippingRecord?: ShippingOrderRecord) => void;
}

export const ProductCheckoutModal: React.FC<ProductCheckoutModalProps> = ({
  product,
  variant,
  quantity,
  onClose,
  onOrderSuccess,
}) => {
  const { formatCurrency, t } = useLanguage();

  // Shipping details state
  const [shippingInfo, setShippingInfo] = useState<CustomerShippingInfo>(() => {
    try {
      const saved = localStorage.getItem('universal_mall_saved_shipping_info');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      fullName: '',
      phone: '',
      email: '',
      provinceCity: 'Hà Nội',
      district: 'Cầu Giấy',
      ward: 'Dịch Vọng Hậu',
      streetAddress: '',
      note: '',
    };
  });

  const [carrier, setCarrier] = useState<ShippingCarrier>('GHTK');
  const [paymentMethod, setPaymentMethod] = useState<'vietqr' | 'wallet' | 'cod'>('vietqr');
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Vouchers state
  const [selectedFreeship, setSelectedFreeship] = useState<Voucher | null>(null);
  const [selectedDiscount, setSelectedDiscount] = useState<Voucher | null>(null);

  // Price calculations
  const unitPrice = variant ? variant.price : product.current_price;
  const subtotal = unitPrice * quantity;
  const baseShippingFee = product.product_type === 'physical'
    ? shippingService.calculateShippingFee(shippingInfo.provinceCity)
    : 0;

  const freeshipDiscount = selectedFreeship
    ? voucherService.calculateShippingDiscount(selectedFreeship, baseShippingFee, subtotal)
    : 0;

  const shopDiscount = selectedDiscount
    ? voucherService.calculateDiscount(selectedDiscount, subtotal)
    : 0;

  const finalShippingFee = Math.max(0, baseShippingFee - freeshipDiscount);
  const totalAmount = Math.max(0, subtotal - shopDiscount + finalShippingFee);

  const orderCode = `ORD-${Date.now().toString().slice(-6)}`;
  const vietQrUrl = generateVietQrUrl({
    amount: totalAmount,
    orderCode,
  });

  const handleCreateOrder = () => {
    // Basic validation
    if (product.product_type === 'physical') {
      if (!shippingInfo.fullName.trim()) {
        alert('Vui lòng nhập họ tên người nhận hàng');
        return;
      }
      if (!shippingInfo.phone.trim() || shippingInfo.phone.length < 9) {
        alert('Vui lòng nhập số điện thoại hợp lệ (10 số)');
        return;
      }
      if (!shippingInfo.streetAddress.trim()) {
        alert('Vui lòng nhập địa chỉ giao hàng cụ thể');
        return;
      }
    }

    setIsSubmitting(true);

    // Save shipping info for next time
    try {
      localStorage.setItem('universal_mall_saved_shipping_info', JSON.stringify(shippingInfo));
    } catch {}

    setTimeout(() => {
      let shippingRecord: ShippingOrderRecord | undefined;

      if (product.product_type === 'physical') {
        shippingRecord = shippingService.createShippingOrder({
          orderId: orderCode,
          carrier,
          customerName: shippingInfo.fullName,
          phone: shippingInfo.phone,
          address: `${shippingInfo.streetAddress}, ${shippingInfo.ward}, ${shippingInfo.district}, ${shippingInfo.provinceCity}`,
          provinceCity: shippingInfo.provinceCity,
          shippingFee: finalShippingFee,
        });
      }

      const newOrder: UniversalOrder = {
        id: `ord_${Date.now()}`,
        order_code: orderCode,
        product_id: product.id,
        variant_id: variant?.id,
        variant_name: variant?.variant_name,
        product_title: product.title,
        product_type: product.product_type,
        quantity,
        unit_price: unitPrice,
        subtotal_amount: subtotal,
        shipping_fee: finalShippingFee,
        discount_amount: shopDiscount + freeshipDiscount,
        voucher_code: selectedDiscount?.code,
        freeship_voucher_code: selectedFreeship?.code,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        payment_status: paymentMethod === 'cod' ? 'PENDING' : 'PAID',
        shipping_status: product.product_type === 'physical' ? 'PENDING' : 'DELIVERED',
        shipping_carrier: carrier,
        tracking_code: shippingRecord?.trackingCode,
        shipping_info: shippingInfo,
        delivered_codes: product.delivered_codes || ['KEY-UNIVERSAL-2026-AUTO-999'],
        created_at: new Date().toISOString(),
      };

      // Confetti effect
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });

      setIsSubmitting(false);
      onOrderSuccess(newOrder, shippingRecord);
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl relative my-8 text-xs flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-600 to-amber-600 text-white shrink-0">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-yellow-200" />
            <h3 className="font-bold text-base">{t('checkout.title')}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* 1. Item summary */}
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center space-x-3">
            <img
              src={product.thumbnail_url}
              alt={product.title}
              className="w-16 h-16 rounded-lg object-cover border border-gray-200 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-orange-600 font-bold uppercase">{product.brand_name}</span>
              <h4 className="font-semibold text-gray-900 truncate">{product.title}</h4>
              {variant && (
                <p className="text-gray-500 text-[11px] mt-0.5">Phân loại: {variant.variant_name}</p>
              )}
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="font-bold text-orange-600 text-sm">{formatCurrency(unitPrice)}</span>
                <span className="text-gray-400">x{quantity}</span>
              </div>
            </div>
          </div>

          {/* 2. Physical Shipping Address Form */}
          {product.product_type === 'physical' ? (
            <div className="space-y-3">
              <div className="flex items-center space-x-1.5 font-bold text-gray-900 text-sm">
                <MapPin className="w-4 h-4 text-orange-600" />
                <span>{t('checkout.shippingSection')}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    {t('checkout.fullName')} *
                  </label>
                  <input
                    type="text"
                    value={shippingInfo.fullName}
                    onChange={(e) => setShippingInfo({ ...shippingInfo, fullName: e.target.value })}
                    placeholder="Nguyễn Văn A"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    {t('checkout.phone')} *
                  </label>
                  <input
                    type="text"
                    value={shippingInfo.phone}
                    onChange={(e) => setShippingInfo({ ...shippingInfo, phone: e.target.value })}
                    placeholder="0912345678"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    {t('checkout.city')} *
                  </label>
                  <input
                    type="text"
                    value={shippingInfo.provinceCity}
                    onChange={(e) => setShippingInfo({ ...shippingInfo, provinceCity: e.target.value })}
                    placeholder="Hà Nội / TP. Hồ Chí Minh"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    {t('checkout.district')} *
                  </label>
                  <input
                    type="text"
                    value={shippingInfo.district}
                    onChange={(e) => setShippingInfo({ ...shippingInfo, district: e.target.value })}
                    placeholder="Quận / Huyện"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                    {t('checkout.address')} *
                  </label>
                  <input
                    type="text"
                    value={shippingInfo.streetAddress}
                    onChange={(e) => setShippingInfo({ ...shippingInfo, streetAddress: e.target.value })}
                    placeholder="Số 123 đường Cầu Giấy, Phường Dịch Vọng Hậu"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Carrier Selection */}
              <div className="pt-2">
                <label className="text-[11px] font-semibold text-gray-600 block mb-1.5">
                  Đơn vị vận chuyển bưu chính liên kết:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'GHTK', name: 'GHTK', sub: 'Tiết kiệm' },
                    { id: 'GHN', name: 'GHN Express', sub: 'Hỏa tốc' },
                    { id: 'VIETTEL_POST', name: 'Viettel Post', sub: 'Bưu chính' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCarrier(c.id as ShippingCarrier)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        carrier === c.id
                          ? 'border-orange-500 bg-orange-50/70 font-bold text-orange-700 ring-1 ring-orange-500'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                    >
                      <p className="font-bold">{c.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-purple-50 rounded-xl p-3 border border-purple-100 flex items-center space-x-3 text-purple-800">
              <Sparkles className="w-5 h-5 text-purple-600 shrink-0" />
              <div>
                <p className="font-bold text-xs">Sản phẩm kỹ thuật số (Giao tức thì 0 giây)</p>
                <p className="text-[11px] text-purple-600 mt-0.5">{t('checkout.digitalInstantNotice')}</p>
              </div>
            </div>
          )}

          {/* 3. Shopee Voucher Stacking Bar */}
          <div className="bg-orange-50/50 rounded-xl p-3 border border-orange-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Tag className="w-4 h-4 text-orange-600 shrink-0" />
              <div>
                <span className="font-bold text-gray-800">Shopee Voucher Đa Tầng</span>
                <div className="flex items-center space-x-2 mt-0.5 text-[11px]">
                  {selectedFreeship ? (
                    <span className="text-emerald-600 font-semibold">Freeship: -{formatCurrency(freeshipDiscount)}</span>
                  ) : (
                    <span className="text-gray-400">Chưa chọn Freeship</span>
                  )}
                  <span>•</span>
                  {selectedDiscount ? (
                    <span className="text-orange-600 font-semibold">Giảm: -{formatCurrency(shopDiscount)}</span>
                  ) : (
                    <span className="text-gray-400">Chưa chọn Giảm giá</span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowVoucherModal(true)}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg transition-colors text-xs shadow-sm"
            >
              {selectedFreeship || selectedDiscount ? 'Đổi Mã' : 'Chọn Voucher'}
            </button>
          </div>

          {/* 4. Payment Method & VietQR Preview */}
          <div className="space-y-3">
            <label className="text-[11px] font-bold text-gray-700 block">
              {t('checkout.paymentMethod')}:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'vietqr', label: 'VietQR', icon: QrCode, desc: 'Quét mã tự động' },
                { id: 'wallet', label: 'Ví Nội Bộ', icon: Wallet, desc: 'Số dư ví khả dụng' },
                { id: 'cod', label: 'COD', icon: Truck, desc: 'Thanh toán khi nhận' },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      paymentMethod === m.id
                        ? 'border-orange-500 bg-orange-50/70 font-bold text-orange-700 ring-1 ring-orange-500'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <Icon className="w-4 h-4 mx-auto mb-1 text-orange-600" />
                    <p className="font-bold">{m.label}</p>
                    <p className="text-[10px] text-gray-400">{m.desc}</p>
                  </button>
                );
              })}
            </div>

            {/* VietQR Preview Box */}
            {paymentMethod === 'vietqr' && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex items-center space-x-4">
                <img
                  src={vietQrUrl}
                  alt="VietQR Payment"
                  className="w-24 h-24 rounded-lg border border-gray-300 bg-white p-1 shrink-0"
                />
                <div className="text-[11px] space-y-1 text-gray-600">
                  <p className="font-bold text-gray-900 text-xs">Quét mã QR bằng App Ngân Hàng bất kỳ</p>
                  <p>Mã đơn: <span className="font-mono font-bold text-orange-600">{orderCode}</span></p>
                  <p>Số tiền: <span className="font-bold text-gray-900">{formatCurrency(totalAmount)}</span></p>
                  <p className="text-[10px] text-gray-400">Hệ thống SePay tự động ghi nhận và xác nhận trong 3 giây.</p>
                </div>
              </div>
            )}
          </div>

          {/* 5. Cost Breakdown */}
          <div className="border-t border-gray-100 pt-3 space-y-1.5 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>{t('checkout.subtotal')}:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {product.product_type === 'physical' && (
              <div className="flex justify-between">
                <span>{t('checkout.shippingFee')}:</span>
                <span>{formatCurrency(baseShippingFee)}</span>
              </div>
            )}
            {freeshipDiscount > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>{t('checkout.freeshipDiscount')}:</span>
                <span>-{formatCurrency(freeshipDiscount)}</span>
              </div>
            )}
            {shopDiscount > 0 && (
              <div className="flex justify-between text-orange-600 font-semibold">
                <span>{t('checkout.voucherDiscount')}:</span>
                <span>-{formatCurrency(shopDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-extrabold text-gray-900 pt-2 border-t border-gray-200">
              <span>{t('checkout.totalPayment')}:</span>
              <span className="text-orange-600 text-base">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
          <div>
            <p className="text-[11px] text-gray-500">Tổng thanh toán:</p>
            <p className="text-lg font-black text-orange-600">{formatCurrency(totalAmount)}</p>
          </div>

          <button
            onClick={handleCreateOrder}
            disabled={isSubmitting}
            className="px-8 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-orange-500/25 transition-all flex items-center space-x-2 disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Đang xử lý...' : t('checkout.confirmOrder')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Shopee Voucher Selection Modal */}
        {showVoucherModal && (
          <ShopeeCouponModal
            subtotal={subtotal}
            shippingFee={baseShippingFee}
            selectedFreeship={selectedFreeship}
            selectedDiscount={selectedDiscount}
            onApply={(f, d) => {
              setSelectedFreeship(f);
              setSelectedDiscount(d);
            }}
            onClose={() => setShowVoucherModal(false)}
          />
        )}
      </div>
    </div>
  );
};
