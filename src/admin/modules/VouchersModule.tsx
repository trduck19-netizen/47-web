import React, { useState } from 'react';
import { Tag, Plus, Check, Trash2, Edit2, Sparkles, Truck } from 'lucide-react';
import { voucherService, Voucher } from '../../services/voucherService';

export const VouchersModule: React.FC = () => {
  const [vouchers, setVouchers] = useState<Voucher[]>(() => voucherService.getVouchers());

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Quản Lý Voucher Shopee Đa Tầng</h2>
          <p className="text-gray-500 text-xs">Cấu hình mã Giảm giá đơn hàng & Mã Miễn phí vận chuyển (Freeship) xếp chồng độc lập</p>
        </div>
        <button 
          onClick={() => alert('Mở form tạo mã voucher mới.')}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo Voucher Mới</span>
        </button>
      </div>

      {/* Table Rule 9: table-fixed w-full with exact percentages */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="table-fixed w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold">
            <tr>
              <th className="py-3 px-3 w-[25%]">Mã & Tiêu đề</th>
              <th className="py-3 px-2 w-[18%]">Loại Voucher</th>
              <th className="py-3 px-2 w-[22%]">Mức Giảm & Đơn Tối Thiểu</th>
              <th className="py-3 px-2 w-[15%]">Trạng thái</th>
              <th className="py-3 px-3 w-[20%] text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vouchers.map(v => (
              <tr key={v.id} className="hover:bg-orange-50/30 transition-colors">
                <td className="py-2.5 px-3">
                  <p className="font-mono font-bold text-orange-600 text-sm truncate">{v.code}</p>
                  <p className="text-[10px] text-gray-500 truncate" title={v.title}>{v.title}</p>
                </td>
                <td className="py-2.5 px-2">
                  {v.voucher_type === 'freeship' ? (
                    <span className="inline-flex items-center space-x-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
                      <Truck className="w-3 h-3" />
                      <span>Freeship</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
                      <Sparkles className="w-3 h-3" />
                      <span>Giảm Đơn Hàng</span>
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-2">
                  <p className="font-bold text-gray-900">
                    {v.discount_type === 'fixed'
                      ? `-${Number(v.discount_value).toLocaleString('vi-VN')}đ`
                      : `-${v.discount_value}% (Max ${Number(v.max_discount_amount || 0).toLocaleString('vi-VN')}đ)`}
                  </p>
                  <p className="text-[10px] text-gray-400">Đơn từ: {Number(v.min_order_amount).toLocaleString('vi-VN')}đ</p>
                </td>
                <td className="py-2.5 px-2">
                  <span className="inline-flex items-center space-x-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                    <Check className="w-3 h-3" />
                    <span>Đang hoạt động</span>
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <div className="inline-flex items-center space-x-1">
                    <button 
                      onClick={() => alert(`Sửa voucher: ${v.code}`)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Sửa"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => alert(`Xóa voucher: ${v.code}`)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
