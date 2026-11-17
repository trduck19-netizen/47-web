import React, { useState } from 'react';
import { Truck, CheckCircle2, Clock, Search, ExternalLink } from 'lucide-react';
import { shippingService, ShippingOrderRecord } from '../../services/shippingService';

export const OrdersModule: React.FC = () => {
  const [orders, setOrders] = useState<ShippingOrderRecord[]>(() => shippingService.getAllOrders());
  const [search, setSearch] = useState('');

  const filtered = orders.filter(o => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        o.trackingCode.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.phone.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Quản Lý Đơn Hàng & Vận Đơn Bưu Chính</h2>
          <p className="text-gray-500 text-xs">Đồng bộ tự động mã vận đơn GHTK / GHN / Viettel Post và theo dõi trạng thái giao hàng</p>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã vận đơn, khách hàng, SĐT..."
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs w-64 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Table Rule 9: table-fixed w-full with exact percentages */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="table-fixed w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold">
            <tr>
              <th className="py-3 px-3 w-[22%]">Mã Vận Đơn & Hãng</th>
              <th className="py-3 px-2 w-[28%]">Người nhận & Địa chỉ</th>
              <th className="py-3 px-2 w-[18%]">Cước phí & Dự kiến</th>
              <th className="py-3 px-2 w-[18%]">Trạng thái bưu chính</th>
              <th className="py-3 px-3 w-[14%] text-right">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length > 0 ? (
              filtered.map(o => (
                <tr key={o.trackingCode} className="hover:bg-orange-50/30 transition-colors">
                  <td className="py-2.5 px-3">
                    <p className="font-mono font-bold text-orange-600 truncate" title={o.trackingCode}>{o.trackingCode}</p>
                    <p className="text-[10px] text-gray-500">{o.carrierName}</p>
                  </td>
                  <td className="py-2.5 px-2">
                    <p className="font-bold text-gray-800 truncate">{o.customerName} ({o.phone})</p>
                    <p className="text-[10px] text-gray-400 truncate" title={o.address}>{o.address}</p>
                  </td>
                  <td className="py-2.5 px-2">
                    <p className="font-semibold text-gray-800">{Number(o.shippingFee).toLocaleString('vi-VN')}đ</p>
                    <p className="text-[10px] text-gray-400">Giao trong {o.estimatedDeliveryDays} ngày</p>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="inline-flex items-center space-x-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span>Đang xử lý</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => alert(`Chi tiết vận đơn ${o.trackingCode}:\nNgười nhận: ${o.customerName}\nĐịa chỉ: ${o.address}`)}
                      className="px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-600 font-bold rounded-lg transition-colors text-[11px]"
                    >
                      Hành Trình
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400">
                  Chưa có vận đơn nào. Các đơn hàng tạo từ web khách sẽ tự động xuất hiện tại đây.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
