import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { StorefrontView } from './components/StorefrontView';
import { ProductModal } from './components/ProductModal';
import { ProductCheckoutModal } from './components/ProductCheckoutModal';
import { ShippingTrackingModal } from './components/shipping/ShippingTrackingModal';
import { PlatformSolutionsView } from './components/solutions/PlatformSolutionsView';
import { AdminApp } from './admin/AdminApp';
import type { UniversalProduct, ProductVariant, UniversalOrder } from './types';
import type { ShippingOrderRecord } from './services/shippingService';
import { useLanguage } from './context/LanguageContext';

export const App: React.FC = () => {
  const { t } = useLanguage();

  // Navigation states
  const [currentView, setCurrentView] = useState<'store' | 'solutions' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      const path = window.location.pathname.toLowerCase();
      if (path.startsWith('/admin') || hash.includes('admin')) return 'admin';
      if (path.startsWith('/giai-phap-san') || hash.includes('giai-phap-san')) return 'solutions';
    }
    return 'store';
  });

  const [currentIndustry, setCurrentIndustry] = useState<string>('fashion');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [selectedProduct, setSelectedProduct] = useState<UniversalProduct | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<{
    product: UniversalProduct;
    variant?: ProductVariant;
    quantity: number;
  } | null>(null);

  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [activeTrackingCode, setActiveTrackingCode] = useState<string | undefined>(undefined);

  // Sync route hashes
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      const path = window.location.pathname.toLowerCase();
      if (path.startsWith('/admin') || hash.includes('admin')) setCurrentView('admin');
      else if (path.startsWith('/giai-phap-san') || hash.includes('giai-phap-san')) setCurrentView('solutions');
      else setCurrentView('store');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Quick buy action
  const handleQuickBuy = (product: UniversalProduct) => {
    setCheckoutProduct({
      product,
      variant: product.variants && product.variants.length > 0 ? product.variants[0] : undefined,
      quantity: 1,
    });
  };

  // Order success callback
  const handleOrderSuccess = (order: UniversalOrder, shippingRecord?: ShippingOrderRecord) => {
    setCheckoutProduct(null);
    setSelectedProduct(null);
    if (shippingRecord) {
      setActiveTrackingCode(shippingRecord.trackingCode);
      setShowTrackingModal(true);
    } else {
      alert(`Đặt hàng thành công! Mã đơn: ${order.order_code}\nMã sản phẩm số của bạn: ${order.delivered_codes?.join(', ')}`);
    }
  };

  if (currentView === 'admin') {
    return (
      <AdminApp
        onBackToClient={() => {
          setCurrentView('store');
          window.location.hash = '';
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900 selection:bg-orange-500 selection:text-white">
      {/* Universal Header */}
      <Header
        currentIndustry={currentIndustry}
        onSelectIndustry={(ind) => {
          setCurrentIndustry(ind);
          setCurrentView('store');
        }}
        onOpenTracking={() => setShowTrackingModal(true)}
        onOpenSolutions={() => {
          setCurrentView('solutions');
          window.location.hash = '#giai-phap-san';
        }}
        onOpenAdmin={() => {
          setCurrentView('admin');
          window.location.hash = '#admin';
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {currentView === 'store' && (
          <StorefrontView
            currentIndustry={currentIndustry}
            onSelectIndustry={setCurrentIndustry}
            onSelectProduct={setSelectedProduct}
            onQuickBuy={handleQuickBuy}
            searchQuery={searchQuery}
          />
        )}

        {currentView === 'solutions' && (
          <PlatformSolutionsView />
        )}
      </main>

      {/* Universal Footer */}
      <Footer />

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onProceedCheckout={(prod, variant, qty) => {
            setSelectedProduct(null);
            setCheckoutProduct({
              product: prod,
              variant,
              quantity: qty || 1,
            });
          }}
        />
      )}

      {/* Checkout Modal */}
      {checkoutProduct && (
        <ProductCheckoutModal
          product={checkoutProduct.product}
          variant={checkoutProduct.variant}
          quantity={checkoutProduct.quantity}
          onClose={() => setCheckoutProduct(null)}
          onOrderSuccess={handleOrderSuccess}
        />
      )}

      {/* Shipping Live Tracking Modal */}
      {showTrackingModal && (
        <ShippingTrackingModal
          initialTrackingCode={activeTrackingCode}
          onClose={() => {
            setShowTrackingModal(false);
            setActiveTrackingCode(undefined);
          }}
        />
      )}
    </div>
  );
};
