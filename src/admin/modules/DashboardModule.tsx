import React from 'react';
import { 
  TrendingUp, ShoppingBag, Package, Users, 
  DollarSign, Truck, Tag, Sparkles 
} from 'lucide-react';
import { UNIVERSAL_PRODUCTS } from '../../data/universalProducts';
import { shippingService } from '../../services/shippingService';
import { voucherService } from '../../services/voucherService';

export const DashboardModule: React.FC = () => {
  const products = UNIVERSAL_PRODUCTS;
  const shippingOrders = shippingService.getAllOrders();
  const vouchers = voucherService.getVouchers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Tổng Quan Sàn Thương Mại</h2>
          <p className="text-xs text-gray-500 mt-0.5">Báo cáo thời gian thực về sản phẩm, đơn hàng và bưu chính</p>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="font-semibold text-emerald-600">Cloudflare Edge Live</span>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-bold text-gray-500">Tổng Sản Phẩm</span>
            <div className="p-2 rounded-xl bg-orange-50 text-orange-600">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">{products.length}</p>
          <p className="text-[11px] text-emerald-600 font-semibold mt-1">4 ngành hàng sẵn sàng</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-bold text-gray-500">Vận Đơn Bưu Chính</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">{shippingOrders.length}</p>
          <p className="text-[11px] text-blue-600 font-semibold mt-1">GHTK / GHN / VTP</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-bold text-gray-500">Voucher Đa Tầng</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">{vouchers.length}</p>
          <p className="text-[11px] text-purple-600 font-semibold mt-1">Freeship + Shop Discount</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-bold text-gray-500">Tốc Độ Máy Chủ Edge</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">&lt; 50ms</p>
          <p className="text-[11px] text-emerald-600 font-semibold mt-1">Chi phí máy chủ 0 VNĐ</p>
        </div>
      </div>

      {/* Quick Architecture Info */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-600 rounded-2xl p-6 text-white shadow-lg space-y-3">
        <h3 className="font-extrabold text-base flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-yellow-300" />
          <span>Dự Án Đa Ngành Độc Lập — Sạch Sẽ 100%</span>
        </h3>
        <p className="text-xs text-orange-100 leading-relaxed max-w-3xl">
          Hệ thống được tách riêng hoàn toàn khỏi web game cũ. Cơ sở dữ liệu và mã nguồn chỉ phục vụ thương mại điện tử đa ngành (Thời trang, Mỹ phẩm, Thiết bị số, Dịch vụ số), áp dụng tiêu chuẩn Single-Screen First (Rule 9) và giao nhận bưu chính toàn quốc.
        </p>
      </div>
    </div>
  );
};
