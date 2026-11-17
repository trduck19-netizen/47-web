import React, { useState } from 'react';
import { 
  LayoutDashboard, ShoppingBag, Truck, Tag, 
  Users, ArrowLeft, ShieldCheck, Globe, Settings 
} from 'lucide-react';
import { DashboardModule } from './modules/DashboardModule';
import { ProductsModule } from './modules/ProductsModule';
import { OrdersModule } from './modules/OrdersModule';
import { VouchersModule } from './modules/VouchersModule';
import { PlatformLeadsModule } from './modules/PlatformLeadsModule';

export type AdminTab = 'dashboard' | 'products' | 'orders' | 'vouchers' | 'leads';

interface AdminAppProps {
  onBackToClient: () => void;
}

export const AdminApp: React.FC<AdminAppProps> = ({ onBackToClient }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  const menuItems = [
    { id: 'dashboard', label: 'Tổng Quan', icon: LayoutDashboard },
    { id: 'products', label: 'Sản Phẩm Đa Ngành', icon: ShoppingBag },
    { id: 'orders', label: 'Vận Đơn & Bưu Chính', icon: Truck },
    { id: 'vouchers', label: 'Voucher Đa Tầng', icon: Tag },
    { id: 'leads', label: 'Khách Thuê Sàn', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      {/* Admin Top Navbar */}
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-black text-sm">
            U
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-gray-900 leading-none">Universal Mall Admin</h1>
            <p className="text-[10px] text-gray-400 mt-0.5">Hệ Thống Quản Trị Sàn Chuẩn Rule 9 Single-Screen</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToClient}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-100 hover:bg-orange-50 text-gray-700 hover:text-orange-600 rounded-lg text-xs font-bold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Về Web Khách</span>
          </button>
        </div>
      </header>

      {/* Main Admin Content Layout */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-gray-200 p-3 shrink-0 flex flex-col justify-between">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as AdminTab)}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-500/20'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="bg-orange-50/60 rounded-xl p-3 border border-orange-100 text-[11px] text-orange-800 space-y-1">
            <p className="font-bold">Rule 9 Standard</p>
            <p className="text-gray-500 text-[10px] leading-tight">100% hiển thị trọn vẹn màn hình tiêu chuẩn 1366x768 không tràn ngang.</p>
          </div>
        </aside>

        {/* Content Viewport */}
        <main className="flex-1 p-6 overflow-x-hidden">
          {activeTab === 'dashboard' && <DashboardModule />}
          {activeTab === 'products' && <ProductsModule />}
          {activeTab === 'orders' && <OrdersModule />}
          {activeTab === 'vouchers' && <VouchersModule />}
          {activeTab === 'leads' && <PlatformLeadsModule />}
        </main>
      </div>
    </div>
  );
};
