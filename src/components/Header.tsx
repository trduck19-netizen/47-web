import React, { useState } from 'react';
import { 
  ShoppingBag, Search, Truck, ShieldCheck, 
  Globe, Sparkles, LayoutDashboard, ShoppingCart 
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface HeaderProps {
  currentIndustry: string;
  onSelectIndustry: (ind: string) => void;
  onOpenTracking: () => void;
  onOpenSolutions: () => void;
  onOpenAdmin: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentIndustry,
  onSelectIndustry,
  onOpenTracking,
  onOpenSolutions,
  onOpenAdmin,
  searchQuery,
  onSearchChange,
}) => {
  const { language, setLanguage, t } = useLanguage();
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm">
      {/* Top micro bar */}
      <div className="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t('home.mallBadge')}</span>
            </span>
            <span className="hidden md:inline text-orange-100">|</span>
            <span className="hidden md:flex items-center space-x-1 text-orange-50">
              <Truck className="w-3.5 h-3.5" />
              <span>{t('home.freeShipping')}</span>
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {/* Platform solutions */}
            <button 
              onClick={onOpenSolutions}
              className="flex items-center space-x-1 hover:text-orange-200 transition-colors font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span>{t('nav.solutions')}</span>
            </button>

            {/* Live Order Tracking */}
            <button 
              onClick={onOpenTracking}
              className="flex items-center space-x-1 hover:text-orange-200 transition-colors"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>{t('nav.trackOrder')}</span>
            </button>

            {/* Language Switcher */}
            <div className="relative">
              <button 
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                className="flex items-center space-x-1 bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="font-bold uppercase">{language}</span>
              </button>

              {isLangMenuOpen && (
                <div className="absolute right-0 mt-1 w-36 bg-white text-gray-800 rounded-lg shadow-xl border border-gray-100 py-1 z-50">
                  <button
                    onClick={() => { setLanguage('vi'); setIsLangMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center space-x-2 hover:bg-orange-50 ${language === 'vi' ? 'font-bold text-orange-600' : ''}`}
                  >
                    <span>🇻🇳</span>
                    <span>Tiếng Việt</span>
                  </button>
                  <button
                    onClick={() => { setLanguage('en'); setIsLangMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center space-x-2 hover:bg-orange-50 ${language === 'en' ? 'font-bold text-orange-600' : ''}`}
                  >
                    <span>🇺🇸</span>
                    <span>English</span>
                  </button>
                </div>
              )}
            </div>

            {/* Admin entry */}
            <button 
              onClick={onOpenAdmin}
              className="flex items-center space-x-1 text-orange-100 hover:text-white transition-colors"
              title="Truy cập Trang Quản Trị"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>{t('nav.admin')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main navigation header */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSelectIndustry('fashion')}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                Universal Mall
              </span>
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                MALL
              </span>
            </div>
            <p className="text-[11px] text-gray-500 hidden sm:block">Sàn Thương Mại Điện Tử Đa Ngành</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-2xl relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('nav.searchPlaceholder')}
            className="w-full pl-10 pr-24 py-2.5 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all shadow-inner"
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
          <button className="absolute right-1.5 top-1.5 bottom-1.5 bg-orange-600 hover:bg-orange-700 text-white px-4 rounded-full text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1">
            <span>Tìm</span>
          </button>
        </div>

        {/* Quick Cart */}
        <div className="flex items-center space-x-2">
          <button 
            onClick={onOpenTracking}
            className="relative p-2.5 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
            title="Đơn hàng của tôi"
          >
            <Truck className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Industries quick tabs bar */}
      <div className="border-t border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 flex items-center space-x-1 overflow-x-auto py-2 scrollbar-none text-xs font-semibold">
          {[
            { id: 'fashion', label: t('nav.fashion'), icon: '👕' },
            { id: 'beauty', label: t('nav.beauty'), icon: '💄' },
            { id: 'tech', label: t('nav.tech'), icon: '📱' },
            { id: 'services', label: t('nav.services'), icon: '📚' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectIndustry(item.id)}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all ${
                currentIndustry === item.id
                  ? 'bg-orange-600 text-white shadow-sm shadow-orange-500/30'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
