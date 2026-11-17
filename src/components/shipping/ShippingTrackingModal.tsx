import React, { useState } from 'react';
import { X, Search, Truck, CheckCircle2, Clock, MapPin, Package, ShieldCheck } from 'lucide-react';
import { shippingService, ShippingOrderRecord } from '../../services/shippingService';
import { useLanguage } from '../../context/LanguageContext';

interface ShippingTrackingModalProps {
  initialTrackingCode?: string;
  onClose: () => void;
}

export const ShippingTrackingModal: React.FC<ShippingTrackingModalProps> = ({
  initialTrackingCode = '',
  onClose,
}) => {
  const { formatCurrency } = useLanguage();
  const [searchInput, setSearchInput] = useState(initialTrackingCode);
  const [currentOrder, setCurrentOrder] = useState<ShippingOrderRecord | null>(() => {
    if (initialTrackingCode) return shippingService.getByTrackingCode(initialTrackingCode);
    const all = shippingService.getAllOrders();
    return all.length > 0 ? all[0] : null;
  });

  const handleSearch = () => {
    if (!searchInput.trim()) return;
    const found = shippingService.getByTrackingCode(searchInput.trim());
    setCurrentOrder(found);
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-600 to-amber-600 text-white">
          <div className="flex items-center space-x-2">
            <Truck className="w-5 h-5 text-orange-200" />
            <h3 className="font-bold text-base">Tra Cứu Vận Đơn Bưu Chính</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-4 bg-gray-50 border-b border-gray-100">
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Nhập mã vận đơn (vd: GHTK.VN..., GHN..., VTP...)"
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            </div>
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
            >
              Tra Cứu
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {currentOrder ? (
            <>
              {/* Order Info Card */}
              <div className="bg-orange-50/60 rounded-xl p-4 border border-orange-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-orange-900 text-sm">{currentOrder.carrierName}</span>
                  <span className="bg-orange-600 text-white font-extrabold text-[11px] px-2 py-0.5 rounded">
                    {currentOrder.trackingCode}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-gray-600 pt-2 border-t border-orange-100">
                  <p>Người nhận: <span className="font-semibold text-gray-800">{currentOrder.customerName}</span></p>
                  <p>Điện thoại: <span className="font-semibold text-gray-800">{currentOrder.phone}</span></p>
                  <p className="col-span-2">Địa chỉ: <span className="font-semibold text-gray-800">{currentOrder.address}</span></p>
                </div>
              </div>

              {/* 5-Stage Live Timeline */}
              <div>
                <h4 className="font-bold text-gray-900 mb-4 flex items-center space-x-1.5 text-sm">
                  <Clock className="w-4 h-4 text-orange-600" />
                  <span>Hành Trình Giao Hàng Chi Tiết</span>
                </h4>

                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                  {currentOrder.timeline.map((step, idx) => {
                    return (
                      <div key={idx} className="relative">
                        {/* Dot indicator */}
                        <div
                          className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 bg-white ${
                            step.isCompleted
                              ? 'border-emerald-500 text-emerald-500'
                              : step.isCurrent
                              ? 'border-orange-500 bg-orange-500 text-white animate-pulse'
                              : 'border-gray-300 text-gray-300'
                          }`}
                        >
                          {step.isCompleted ? (
                            <CheckCircle2 className="w-3.5 h-3.5 fill-current text-white bg-emerald-500 rounded-full" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-current" />
                          )}
                        </div>

                        {/* Text */}
                        <div>
                          <div className="flex items-center justify-between">
                            <span
                              className={`font-bold ${
                                step.isCompleted
                                  ? 'text-gray-900'
                                  : step.isCurrent
                                  ? 'text-orange-600 font-extrabold'
                                  : 'text-gray-400'
                              }`}
                            >
                              {step.title}
                            </span>
                            <span className="text-[10px] text-gray-400">{step.timestamp}</span>
                          </div>
                          <p className="text-gray-500 text-[11px] mt-0.5">{step.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-400 space-y-2">
              <Package className="w-12 h-12 mx-auto text-gray-300" />
              <p className="font-semibold text-gray-600">Chưa tìm thấy mã vận đơn này</p>
              <p className="text-[11px]">Vui lòng kiểm tra lại mã vận đơn hoặc đặt đơn hàng mới để theo dõi.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
