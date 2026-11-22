import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Edit2, Trash2, Tag, Truck, Zap, Star,
  RefreshCw, AlertCircle, CheckCircle2, X, Package, Image as ImageIcon,
  DollarSign, Layers, Check, ShoppingBag, Eye,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface CategoryItem {
  id: string;
  industry_id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
}

interface ProductItem {
  id: string;
  title: string;
  slug: string;
  industry_id: string;
  category_id?: string;
  product_type: 'physical' | 'digital';
  original_price: number;
  current_price: number;
  discount_percent: number;
  stock_quantity: number;
  thumbnail_url?: string;
  images?: string[];
  description?: string;
  brand_name?: string;
  rating_avg?: number;
  rating_count?: number;
  sold_count?: number;
  is_active: number | boolean;
  created_at?: string;
}

export const ProductsModule: React.FC = () => {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [filterIndustry, setFilterIndustry] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formIndustry, setFormIndustry] = useState('fashion');
  const [formCategory, setFormCategory] = useState('');
  const [formType, setFormType] = useState<'physical' | 'digital'>('physical');
  const [formCurrentPrice, setFormCurrentPrice] = useState(100000);
  const [formOriginalPrice, setFormOriginalPrice] = useState(150000);
  const [formStock, setFormStock] = useState(50);
  const [formBrand, setFormBrand] = useState('');
  const [formThumbnail, setFormThumbnail] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const getHeaders = useCallback(() => {
    const token =
      localStorage.getItem('pine_auth_token') ||
      sessionStorage.getItem('pine_auth_token') ||
      localStorage.getItem('pine_admin_sync_key') ||
      '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, []);

  // Fetch Categories from /api/categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const json: any = await res.json();
        if (json && json.success && Array.isArray(json.data)) {
          setCategories(json.data);
        }
      }
    } catch {}
  }, []);

  // Fetch Products from /api/products
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const params = new URLSearchParams();
      if (filterIndustry !== 'all') params.set('industry_id', filterIndustry);
      if (filterType !== 'all') params.set('product_type', filterType);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '100');

      const url = `/api/products?${params.toString()}`;
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) {
        const json: any = await res.json();
        if (json && json.success) {
          setProducts(json.data || []);
        } else {
          setErrorMsg(json.message || 'Không thể tải danh sách sản phẩm.');
        }
      } else {
        const errJson = await res.json().catch(() => null);
        setErrorMsg(errJson?.message || `Lỗi máy chủ (${res.status}).`);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Lỗi kết nối tới Cloudflare D1.');
    } finally {
      setIsLoading(false);
    }
  }, [filterIndustry, filterType, search, getHeaders]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormTitle('');
    setFormIndustry(filterIndustry !== 'all' ? filterIndustry : 'fashion');
    setFormCategory('');
    setFormType('physical');
    setFormCurrentPrice(100000);
    setFormOriginalPrice(150000);
    setFormStock(50);
    setFormBrand('');
    setFormThumbnail('');
    setFormDescription('');
    setErrorMsg('');
    setSuccessMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: ProductItem) => {
    setEditingProduct(p);
    setFormTitle(p.title);
    setFormIndustry(p.industry_id);
    setFormCategory(p.category_id || '');
    setFormType(p.product_type);
    setFormCurrentPrice(p.current_price);
    setFormOriginalPrice(p.original_price);
    setFormStock(p.stock_quantity);
    setFormBrand(p.brand_name || '');
    setFormThumbnail(p.thumbnail_url || '');
    setFormDescription(p.description || '');
    setErrorMsg('');
    setSuccessMsg('');
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Vui lòng nhập tên sản phẩm.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const discountPercent =
        formOriginalPrice > formCurrentPrice
          ? Math.round(((formOriginalPrice - formCurrentPrice) / formOriginalPrice) * 100)
          : 0;

      const payload = {
        title: formTitle.trim(),
        industry_id: formIndustry,
        category_id: formCategory || null,
        product_type: formType,
        current_price: Number(formCurrentPrice) || 0,
        original_price: Number(formOriginalPrice) || 0,
        discount_percent: discountPercent,
        stock_quantity: Number(formStock) || 0,
        brand_name: formBrand.trim(),
        thumbnail_url: formThumbnail.trim() || null,
        description: formDescription.trim(),
      };

      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const json: any = await res.json().catch(() => null);

      if (res.ok && json && json.success) {
        setSuccessMsg(editingProduct ? 'Cập nhật sản phẩm thành công!' : 'Tạo mới sản phẩm vào kho D1 thành công!');
        setIsModalOpen(false);
        fetchProducts();
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        alert(json?.message || 'Thao tác không thành công.');
      }
    } catch (err: any) {
      alert(err?.message || 'Lỗi khi lưu sản phẩm.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (p: ProductItem) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${p.title}" khỏi CSDL D1?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const json: any = await res.json().catch(() => null);
      if (res.ok && json && json.success) {
        setSuccessMsg(`Đã xóa sản phẩm "${p.title}".`);
        fetchProducts();
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        alert(json?.message || 'Không thể xóa sản phẩm.');
      }
    } catch (err: any) {
      alert(err?.message || 'Lỗi khi xóa sản phẩm.');
    }
  };

  const filteredCategories = categories.filter(
    (c) => !formIndustry || c.industry_id === formIndustry
  );

  return (
    <div className="space-y-4 text-xs font-sans">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-black text-gray-900 tracking-tight">
              {isEn ? 'Multi-Industry Products Management' : 'Quản Lý Sản Phẩm Đa Ngành'}
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold text-[10px]">
              D1 Database Live
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">
            {isEn
              ? 'Manage physical inventory (GHTK/GHN/VTP postal shipping) & digital products (0s auto delivery)'
              : 'Quản trị kho hàng vật lý (Giao hàng bưu chính GHTK/GHN/VTP) & Hàng số (Giao mã tự động 0s)'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchProducts}
            disabled={isLoading}
            className="p-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl transition flex items-center space-x-1"
            title={isEn ? 'Reload from D1' : 'Tải lại từ D1'}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-orange-600' : ''}`} />
          </button>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-sm transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isEn ? 'Add New Product' : 'Thêm Sản Phẩm Mới'}</span>
          </button>
        </div>
      </div>

      {/* Alert Banners */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: isEn ? 'All Industries' : 'Tất Cả Ngành' },
            { id: 'fashion', label: isEn ? '👕 Fashion' : '👕 Thời Trang' },
            { id: 'beauty', label: isEn ? '💄 Beauty' : '💄 Mỹ Phẩm' },
            { id: 'tech', label: isEn ? '📱 Tech' : '📱 Công Nghệ' },
            { id: 'services', label: isEn ? '🎓 Services' : '🎓 Dịch Vụ' },
            { id: 'gaming', label: isEn ? '🎮 Gaming' : '🎮 Game' },
          ].map((ind) => (
            <button
              key={ind.id}
              onClick={() => setFilterIndustry(ind.id)}
              className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                filterIndustry === ind.id
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {ind.label}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="all">{isEn ? 'All Item Types' : 'Tất Cả Loại Hàng'}</option>
            <option value="physical">{isEn ? '🚚 Physical (Shipping)' : '🚚 Hàng Vật Lý (Ship)'}</option>
            <option value="digital">{isEn ? '⚡ Digital (0s Code)' : '⚡ Hàng Số (Mã 0s)'}</option>
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isEn ? 'Search product name, brand...' : 'Tìm tên sản phẩm, thương hiệu...'}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs w-56 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Main Table — Rule 9: table-fixed w-full with exact percentages adding up to 100% */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="table-fixed w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold">
            <tr>
              <th className="py-3 px-3 w-[36%]">{isEn ? 'Product & Brand' : 'Sản phẩm & Thương hiệu'}</th>
              <th className="py-3 px-2 w-[14%]">{isEn ? 'Industry & Category' : 'Ngành & Danh mục'}</th>
              <th className="py-3 px-2 w-[12%]">{isEn ? 'Item Type' : 'Loại hàng'}</th>
              <th className="py-3 px-2 w-[14%]">{isEn ? 'Selling Price' : 'Giá bán'}</th>
              <th className="py-3 px-2 w-[10%]">{isEn ? 'Stock / Sold' : 'Tồn kho / Bán'}</th>
              <th className="py-3 px-3 w-[14%] text-right">{isEn ? 'Actions' : 'Thao tác'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 px-4 text-center">
                  <div className="max-w-md mx-auto space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto text-xl">
                      <Package className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-gray-800 text-sm">
                      {isEn ? 'D1 inventory currently has no products' : 'Kho hàng D1 hiện chưa có sản phẩm nào'}
                    </h3>
                    <p className="text-gray-500 text-xs leading-relaxed">
                      {isEn
                        ? 'All demo products have been cleared. You can click "Add New Product" to stock your live D1 catalog.'
                        : 'Toàn bộ sản phẩm mẫu demo đã được dọn sạch. Bạn có thể nhấn "Thêm Sản Phẩm Mới" hoặc nạp danh sách sản phẩm thật đợt đầu vào CSDL D1.'}
                    </p>
                    <button
                      onClick={openCreateModal}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-sm transition"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{isEn ? 'Add First Product' : 'Thêm Sản Phẩm Đầu Tiên'}</span>
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const catObj = categories.find((c) => c.id === p.category_id);
                return (
                  <tr key={p.id} className="hover:bg-orange-50/30 transition">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        {p.thumbnail_url ? (
                          <img
                            src={p.thumbnail_url}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0"
                            onError={(e) => {
                              (e.target as any).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate" title={p.title}>
                            {p.title}
                          </p>
                          <p className="text-[10px] text-gray-400 truncate">
                            {p.brand_name || (isEn ? 'Official Brand' : 'Chính Hãng')} • ID: {p.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-2.5 px-2">
                      <span className="font-semibold text-gray-700 block truncate" title={catObj?.name || p.industry_id}>
                        {catObj?.name || p.industry_id}
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider block">
                        {p.industry_id}
                      </span>
                    </td>

                    <td className="py-2.5 px-2">
                      {p.product_type === 'physical' ? (
                        <span className="inline-flex items-center space-x-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                          <Truck className="w-3 h-3" />
                          <span>{isEn ? 'Physical (Ship)' : 'Vật lý (Ship)'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                          <Zap className="w-3 h-3" />
                          <span>{isEn ? 'Digital 0s' : 'Mã số 0s'}</span>
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2">
                      <p className="font-bold text-orange-600">
                        {Number(p.current_price).toLocaleString('vi-VN')}đ
                      </p>
                      {p.original_price > p.current_price && (
                        <p className="text-[10px] text-gray-400 line-through">
                          {Number(p.original_price).toLocaleString('vi-VN')}đ
                        </p>
                      )}
                    </td>

                    <td className="py-2.5 px-2">
                      <p className={`font-semibold ${p.stock_quantity > 0 ? 'text-gray-800' : 'text-rose-600'}`}>
                        {p.stock_quantity > 0
                          ? (isEn ? `Stock: ${p.stock_quantity}` : `Kho: ${p.stock_quantity}`)
                          : (isEn ? 'Out of stock' : 'Hết hàng')}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {isEn ? `Sold: ${p.sold_count || 0}` : `Đã bán: ${p.sold_count || 0}`}
                      </p>
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center space-x-1">
                        <button
                          onClick={() => openEditModal(p)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          title={isEn ? 'Edit product' : 'Sửa sản phẩm'}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          title={isEn ? 'Delete product' : 'Xóa sản phẩm'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Thêm / Sửa Sản Phẩm (Rule 9: Compact, zero overflow) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-sm">
                    {editingProduct
                      ? (isEn ? 'Edit Product' : 'Chỉnh Sửa Sản Phẩm')
                      : (isEn ? 'Add New Product' : 'Thêm Sản Phẩm Mới')}
                  </h3>
                  <p className="text-[10px] text-gray-400">
                    {isEn ? 'Save data directly into Cloudflare D1 database' : 'Lưu dữ liệu trực tiếp vào CSDL Cloudflare D1'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-4 space-y-4">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  {isEn ? 'Product Name *' : 'Tên sản phẩm *'}
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={isEn ? 'e.g. Unisex Cotton Hoodie 380gsm...' : 'Ví dụ: Áo Hoodie Unisex Cotton 380gsm...'}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    {isEn ? 'Industry *' : 'Ngành hàng *'}
                  </label>
                  <select
                    value={formIndustry}
                    onChange={(e) => {
                      setFormIndustry(e.target.value);
                      setFormCategory('');
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="fashion">{isEn ? '👕 Fashion & Apparel' : '👕 Thời Trang & Phụ Kiện'}</option>
                    <option value="beauty">{isEn ? '💄 Beauty & Cosmetics' : '💄 Mỹ Phẩm & Sắc Đẹp'}</option>
                    <option value="tech">{isEn ? '📱 Tech & Electronics' : '📱 Thiết Bị Số & Công Nghệ'}</option>
                    <option value="services">{isEn ? '🎓 Courses & Digital Services' : '🎓 Khóa Học & Dịch Vụ Số'}</option>
                    <option value="gaming">{isEn ? '🎮 Gaming & Utilities' : '🎮 Game & Tiện Ích'}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    {isEn ? 'Sub-Category' : 'Danh mục con'}
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">{isEn ? '-- Select category --' : '-- Chọn danh mục --'}</option>
                    {filteredCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon || '•'} {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    {isEn ? 'Product Type *' : 'Loại sản phẩm *'}
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="physical">{isEn ? '🚚 Physical Goods (Postal Courier)' : '🚚 Hàng Vật Lý (Vận Chuyển Bưu Chính)'}</option>
                    <option value="digital">{isEn ? '⚡ Digital Goods (0s Instant Code)' : '⚡ Hàng Số (Giao Mã Tự Động 0s)'}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    {isEn ? 'Selling Price (VND) *' : 'Giá bán hiện tại (đ) *'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    required
                    value={formCurrentPrice}
                    onChange={(e) => setFormCurrentPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    {isEn ? 'List / Original Price (VND)' : 'Giá gốc gạch ngang (đ)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={formOriginalPrice}
                    onChange={(e) => setFormOriginalPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    {isEn ? 'Stock Quantity *' : 'Số lượng tồn kho *'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formStock}
                    onChange={(e) => setFormStock(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    {isEn ? 'Brand / Origin' : 'Thương hiệu / Xuất xứ'}
                  </label>
                  <input
                    type="text"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    placeholder={isEn ? 'e.g. Shopee Mall, Baseus, Official...' : 'Ví dụ: Shopee Mall, Baseus, Official...'}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    {isEn ? 'Thumbnail Image URL' : 'URL Ảnh đại diện'}
                  </label>
                  <input
                    type="url"
                    value={formThumbnail}
                    onChange={(e) => setFormThumbnail(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  {isEn ? 'Product Description' : 'Mô tả sản phẩm'}
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={isEn ? 'Specs, materials, refund policy...' : 'Thông số kỹ thuật, chất liệu, chính sách đổi trả...'}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl transition"
                >
                  {isEn ? 'Cancel' : 'Hủy bỏ'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-sm transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? (isEn ? 'Saving D1...' : 'Đang lưu D1...')
                      : editingProduct
                      ? (isEn ? 'Update D1' : 'Cập Nhật D1')
                      : (isEn ? 'Create Product D1' : 'Tạo Sản Phẩm D1')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
