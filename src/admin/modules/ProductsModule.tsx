import React, { useState } from 'react';
import { Plus, Search, Edit2, Trash2, Tag, Truck, Zap, Star } from 'lucide-react';
import { UNIVERSAL_PRODUCTS } from '../../data/universalProducts';
import type { UniversalProduct } from '../../types';

export const ProductsModule: React.FC = () => {
  const [products, setProducts] = useState<UniversalProduct[]>(UNIVERSAL_PRODUCTS);
  const [filterIndustry, setFilterIndustry] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = products.filter(p => {
    if (filterIndustry !== 'all' && p.industry_id !== filterIndustry) return false;
    if (search.trim() && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Quản Lý Sản Phẩm Đa Ngành</h2>
          <p className="text-gray-500 text-xs">Hàng vật lý (Form giao hàng bưu chính) & Hàng số (Giao mã 0s)</p>
        </div>
        <button 
          onClick={() => alert('Chức năng thêm sản phẩm: Mở modal thêm sản phẩm đa biến thể.')}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Sản Phẩm Mới</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          {['all', 'fashion', 'beauty', 'tech', 'services'].map(ind => (
            <button
              key={ind}
              onClick={() => setFilterIndustry(ind)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                filterIndustry === ind
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            >
              {ind === 'all' ? 'Tất Cả' : ind === 'fashion' ? 'Thời Trang' : ind === 'beauty' ? 'Mỹ Phẩm' : ind === 'tech' ? 'Công Nghệ' : 'Dịch Vụ Số'}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm tên sản phẩm..."
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs w-64 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Table Rule 9: table-fixed w-full with exact percentages */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="table-fixed w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold">
            <tr>
              <th className="py-3 px-3 w-[40%]">Sản phẩm & Thương hiệu</th>
              <th className="py-3 px-2 w-[15%]">Loại hàng</th>
              <th className="py-3 px-2 w-[15%]">Giá bán</th>
              <th className="py-3 px-2 w-[12%]">Tồn kho / Đã bán</th>
              <th className="py-3 px-3 w-[18%] text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-orange-50/30 transition-colors">
                <td className="py-2.5 px-3">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <img src={p.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 truncate" title={p.title}>{p.title}</p>
                      <p className="text-[10px] text-gray-400 truncate">{p.brand_name} • {p.category_name}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-2">
                  {p.product_type === 'physical' ? (
                    <span className="inline-flex items-center space-x-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                      <Truck className="w-3 h-3" />
                      <span>Vật lý</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                      <Zap className="w-3 h-3" />
                      <span>Mã số 0s</span>
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-2">
                  <p className="font-bold text-orange-600">{Number(p.current_price).toLocaleString('vi-VN')}đ</p>
                  {p.original_price > p.current_price && (
                    <p className="text-[10px] text-gray-400 line-through">{Number(p.original_price).toLocaleString('vi-VN')}đ</p>
                  )}
                </td>
                <td className="py-2.5 px-2">
                  <p className="font-semibold text-gray-800">Kho: {p.stock_quantity}</p>
                  <p className="text-[10px] text-gray-400">Bán: {p.sold_count}</p>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <div className="inline-flex items-center space-x-1">
                    <button 
                      onClick={() => alert(`Chỉnh sửa: ${p.title}`)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Sửa sản phẩm"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => alert(`Xóa: ${p.title}`)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Xóa sản phẩm"
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
