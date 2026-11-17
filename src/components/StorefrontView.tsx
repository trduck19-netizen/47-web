import React, { useState, useMemo } from 'react';
import { 
  Sparkles, Flame, Clock, Tag, ShieldCheck, 
  Truck, ArrowRight, Zap, Filter 
} from 'lucide-react';
import type { UniversalProduct } from '../types';
import { INDUSTRY_CONFIGS } from '../data/industryPresets';
import { UNIVERSAL_PRODUCTS } from '../data/universalProducts';
import { ProductCard } from './ProductCard';
import { useLanguage } from '../context/LanguageContext';

interface StorefrontViewProps {
  currentIndustry: string;
  onSelectIndustry: (ind: string) => void;
  onSelectProduct: (p: UniversalProduct) => void;
  onQuickBuy: (p: UniversalProduct) => void;
  searchQuery: string;
}

export const StorefrontView: React.FC<StorefrontViewProps> = ({
  currentIndustry,
  onSelectIndustry,
  onSelectProduct,
  onQuickBuy,
  searchQuery,
}) => {
  const { t } = useLanguage();
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');

  const industryConfig = INDUSTRY_CONFIGS[currentIndustry] || INDUSTRY_CONFIGS['fashion'];

  // Filtered products
  const filteredProducts = useMemo(() => {
    return UNIVERSAL_PRODUCTS.filter((p) => {
      // 1. Filter by industry
      const matchIndustry = p.industry_id === currentIndustry;
      if (!matchIndustry) return false;

      // 2. Filter by subcategory
      if (selectedSubCategory !== 'all' && p.category_id !== selectedSubCategory) {
        return false;
      }

      // 3. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchBrand = p.brand_name.toLowerCase().includes(q);
        const matchDesc = p.description.toLowerCase().includes(q);
        if (!matchTitle && !matchBrand && !matchDesc) return false;
      }

      return true;
    });
  }, [currentIndustry, selectedSubCategory, searchQuery]);

  // Flash Sale products
  const flashSaleProducts = useMemo(() => {
    return UNIVERSAL_PRODUCTS.filter((p) => p.discount_percent >= 35).slice(0, 4);
  }, []);

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Hero Shopee Mall Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-yellow-400/20 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 py-10 md:py-14 relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-4 max-w-xl text-center md:text-left">
            <div className="inline-flex items-center space-x-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white shadow">
              <span>{industryConfig.icon}</span>
              <span>{industryConfig.badge}</span>
              <span>•</span>
              <span className="text-yellow-300 font-extrabold">SHOPEE MALL V2.5</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              {industryConfig.bannerTitle}
            </h1>

            <p className="text-orange-100 text-xs sm:text-sm leading-relaxed">
              {industryConfig.bannerSubtitle}
            </p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2 text-xs">
              <span className="bg-black/20 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>100% Chính Hãng</span>
              </span>
              <span className="bg-black/20 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-medium">
                <Truck className="w-4 h-4 text-amber-300" />
                <span>Giao Toàn Quốc 63 Tỉnh</span>
              </span>
              <span className="bg-black/20 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-medium">
                <Tag className="w-4 h-4 text-yellow-300" />
                <span>Voucher Đa Tầng 50K</span>
              </span>
            </div>
          </div>

          {/* Quick industry buttons cards */}
          <div className="grid grid-cols-2 gap-2.5 w-full md:w-auto shrink-0">
            {Object.values(INDUSTRY_CONFIGS).map((ind) => (
              <button
                key={ind.id}
                onClick={() => {
                  onSelectIndustry(ind.id);
                  setSelectedSubCategory('all');
                }}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  currentIndustry === ind.id
                    ? 'bg-white text-orange-700 font-extrabold shadow-lg scale-102 border-white'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm'
                }`}
              >
                <div className="text-2xl mb-1">{ind.icon}</div>
                <p className="text-xs font-bold leading-tight">{ind.name}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Flash Sale Section */}
      <section className="bg-gradient-to-r from-red-600 to-orange-600 rounded-2xl p-4 sm:p-6 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-yellow-400 text-red-700 rounded-lg animate-bounce">
              <Flame className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg tracking-wide uppercase flex items-center space-x-2">
                <span>{t('home.flashSale')}</span>
              </h2>
              <p className="text-red-100 text-[11px]">Giảm tới 72% • Số lượng có hạn</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 text-xs bg-black/30 px-3 py-1 rounded-full font-mono">
            <Clock className="w-3.5 h-3.5 text-yellow-300" />
            <span>02 : 45 : 18</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {flashSaleProducts.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onSelect={onSelectProduct}
              onQuickBuy={onQuickBuy}
            />
          ))}
        </div>
      </section>

      {/* 3. Subcategories Filter Pills */}
      <div className="flex items-center justify-between gap-4 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center space-x-2">
          {industryConfig.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedSubCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-1.5 border ${
                selectedSubCategory === cat.id
                  ? 'bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-500/20'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300 hover:bg-orange-50/50'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Products Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-gray-200 pb-2">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-orange-600" />
            <h2 className="font-extrabold text-base sm:text-lg text-gray-900 tracking-tight">
              {industryConfig.name} ({filteredProducts.length} sản phẩm)
            </h2>
          </div>
        </div>

        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-5">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={onSelectProduct}
                onQuickBuy={onQuickBuy}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400 border border-gray-100 shadow-sm space-y-3">
            <Filter className="w-10 h-10 mx-auto text-gray-300" />
            <p className="font-bold text-gray-700 text-sm">Chưa có sản phẩm phù hợp</p>
            <p className="text-xs">Vui lòng thử tìm kiếm với từ khóa khác hoặc chọn danh mục khác.</p>
          </div>
        )}
      </section>
    </div>
  );
};
