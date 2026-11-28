import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ShoppingCart,
  X,
  Trash2,
  Store,
  CreditCard,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronRight,
  RefreshCw,
  Clock,
  ExternalLink,
  ShieldCheck,
  Truck,
  Wallet,
} from 'lucide-react';
import { cartService, type CartItem, type StoreCartGroup } from '../../services/cartService';
import { dataService } from '../../services/dataService';
import type { UserProfile } from '../../types/game';
import { useLanguage } from '../../context/LanguageContext';
import { PHYSICAL_DEFAULT_IMAGE_URL, sanitizeImageUrl } from '../../utils/safeImageUrl';
import QRCode from 'qrcode';

interface CartDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onOpenLogin: () => void;
  onOpenWallet: () => void;
  onOpenReceivedCodes: (initialTab?: 'giveaways' | 'orders' | 'privates' | 'missions') => void;
  onNavigateStore?: (slug: string) => void;
}

export const CartDrawerModal: React.FC<CartDrawerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onOpenLogin,
  onOpenWallet,
  onOpenReceivedCodes,
  onNavigateStore,
}) => {
  const { t, formatCurrency } = useLanguage();
  const [cartItems, setCartItems] = useState<CartItem[]>(() => cartService.getCart());
  const [isSyncingCart, setIsSyncingCart] = useState(false);

  const totalItemCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0),
    [cartItems]
  );

  const totalCore = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + (Number(item.priceCore) || 0) * Math.max(1, Number(item.quantity) || 1),
        0
      ),
    [cartItems]
  );

  const groupedStores = useMemo<StoreCartGroup[]>(() => {
    const map = new Map<string, StoreCartGroup>();
    for (const item of cartItems) {
      const sId = item.sellerId || 'unknown';
      if (!map.has(sId)) {
        map.set(sId, {
          sellerId: sId,
          sellerName: item.sellerName || t('cart.defaultStoreName'),
          sellerSlug: item.sellerSlug,
          sellerAvatar: item.sellerAvatar,
          items: [],
          subtotal: 0,
        });
      }
      const group = map.get(sId)!;
      group.items.push(item);
      group.subtotal += (Number(item.priceCore) || 0) * Math.max(1, Number(item.quantity) || 1);
    }
    return Array.from(map.values());
  }, [cartItems, t]);

  // Checkout states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string>('');
  const [activeParentOrder, setActiveParentOrder] = useState<any | null>(null);
  const [activeChildOrders, setActiveChildOrders] = useState<any[]>([]);
  const [activeShopGroups, setActiveShopGroups] = useState<any[]>([]);
  const [paymentMode, setPaymentMode] = useState<'CORE' | 'QR'>('CORE');
  const [isPayingCore, setIsPayingCore] = useState(false);
  const [corePayError, setCorePayError] = useState<string>('');
  const [isVerifyingSepay, setIsVerifyingSepay] = useState(false);
  const [verifySepayMsg, setVerifySepayMsg] = useState<string>('');
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(900);

  const pollingTimerRef = useRef<any>(null);

  // Sync cart from service & events (single snapshot so count, groups & totalCore never diverge)
  const syncCartState = useCallback(() => {
    setCartItems(cartService.getCart());
  }, []);

  useEffect(() => {
    syncCartState();
    let cancelled = false;
    // Only hydrate from server when local cart is empty so POST /api/cart/sync never re-adds already-synced local quantities
    if (isOpen && currentUser && cartService.getCart().length === 0) {
      setIsSyncingCart(true);
      cartService
        .syncWithServer()
        .then(() => {
          if (!cancelled) syncCartState();
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setIsSyncingCart(false);
        });
    } else {
      setIsSyncingCart(false);
    }
    const handleCartUpdated = () => syncCartState();
    window.addEventListener('pine_cart_updated', handleCartUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('pine_cart_updated', handleCartUpdated);
    };
  }, [isOpen, currentUser?.id, syncCartState]);

  // Gợi ý mua kèm hàng số cùng gian hàng khi giỏ có hàng vật lý (§4)
  const [crossSellMap, setCrossSellMap] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (!isOpen || cartItems.length === 0) return;
    const storesWithPhysical = groupedStores.filter((s) =>
      s.items.some((i) => i.productType === 'physical') && s.sellerSlug
    );

    storesWithPhysical.forEach(async (store) => {
      if (!store.sellerSlug || crossSellMap[store.sellerId]) return;
      try {
        const res = await fetch(`/api/stores/${store.sellerSlug}/products`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.products)) {
          const inCartIds = new Set(cartItems.map((i) => i.productId));
          const digitalItems = data.products
            .filter((p: any) => (p.product_type || 'digital') === 'digital' && !inCartIds.has(p.id))
            .slice(0, 3);
          if (digitalItems.length > 0) {
            setCrossSellMap((prev) => ({ ...prev, [store.sellerId]: digitalItems }));
          }
        }
      } catch {}
    });
  }, [isOpen, cartItems, groupedStores]);

  const handleAddCrossSell = (prod: any, store: StoreCartGroup) => {
    cartService.addToCart({
      productId: prod.id,
      productName: prod.name,
      priceCore: prod.price_core,
      sellerId: store.sellerId,
      sellerName: store.sellerName,
      sellerSlug: store.sellerSlug,
      gameSlug: prod.game_slug,
      gameName: prod.game_name,
      coverUrl: prod.cover_url,
      productType: 'digital',
    });
  };

  // Generate QR code data URLs for shop groups & child orders
  useEffect(() => {
    const entries: Array<{ key: string; payload: string }> = [];
    (activeShopGroups || []).forEach((grp) => {
      if (grp?.qr_payload && grp?.seller_id) {
        entries.push({ key: `shop_${grp.seller_id}`, payload: grp.qr_payload });
      }
    });
    (activeChildOrders || []).forEach((co) => {
      if (co?.qr_payload && co?.id) {
        entries.push({ key: co.id, payload: co.qr_payload });
      }
    });
    if (entries.length === 0) return;

    entries.forEach(async ({ key, payload }) => {
      if (!qrImages[key]) {
        try {
          const url = await QRCode.toDataURL(payload, {
            errorCorrectionLevel: 'M',
            margin: 1.5,
            width: 220,
            color: { dark: '#0b0d19', light: '#ffffff' },
          });
          setQrImages((prev) => ({ ...prev, [key]: url }));
        } catch (err) {
          console.error('[QR generation error]', err);
        }
      }
    });
  }, [activeShopGroups, activeChildOrders]);

  // Polling for Parent Order status updates
  useEffect(() => {
    if (!isOpen || !activeParentOrder || activeParentOrder.status === 'COMPLETED' || activeParentOrder.status === 'PAID') {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      return;
    }

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/seller-orders/multi/${activeParentOrder.id}`, {
          headers: getHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.parent_order) {
          setActiveParentOrder(data.parent_order);
          setActiveChildOrders(data.child_orders || []);
          if (Array.isArray(data.shop_groups)) {
            setActiveShopGroups(data.shop_groups);
          }
          if (typeof data.parent_order.seconds_left === 'number') {
            setSecondsLeft(data.parent_order.seconds_left);
          }
          if (data.parent_order.status === 'PAID' || data.parent_order.status === 'COMPLETED') {
            dataService.refreshCurrentUserBalance().catch(() => {});
          }
        }
      } catch {}
    };

    pollingTimerRef.current = setInterval(pollStatus, 3500);
    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [isOpen, activeParentOrder]);

  // Countdown timer
  useEffect(() => {
    if (!activeParentOrder || secondsLeft <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [activeParentOrder, secondsLeft]);

  // Dismiss drawer on Esc key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRemoveItem = (prodId: string, variantId?: string) => {
    cartService.removeFromCart(prodId, variantId);
    syncCartState();
  };

  const handleClearCart = () => {
    if (window.confirm(t('cart.clearAllConfirm'))) {
      cartService.clearCart();
      syncCartState();
    }
  };

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Helper auth headers
  const getHeaders = () => {
    const token =
      (typeof localStorage !== 'undefined' ? localStorage.getItem('pine_auth_token') : null) ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pine_auth_token') : null) ||
      currentUser?.session_token ||
      '';
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  };

  // 1. Submit Multi-Order to create parent + child orders
  const handleCreateOrder = async () => {
    if (!currentUser) {
      onOpenLogin();
      return;
    }

    if (cartItems.length === 0) return;

    setIsSubmitting(true);
    setCheckoutError('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const itemsPayload = cartItems.map((i) => ({
        product_id: i.productId,
        quantity: Math.max(1, Number(i.quantity) || 1),
      }));
      const res = await fetch('/api/seller-orders/multi', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ items: itemsPayload }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(t('cart.errors.invalidServerResponse'));
      }

      if (!res.ok || !data.success) {
        setCheckoutError(data.error || t('cart.errors.createMultiOrderFailed'));
        return;
      }

      // Success: active parent order created!
      setActiveParentOrder(data.parent_order);
      setActiveChildOrders(data.child_orders || []);
      setActiveShopGroups(Array.isArray(data.shop_groups) ? data.shop_groups : []);
      setVerifySepayMsg('');
      const hasAnyQrGroup = Array.isArray(data.shop_groups)
        ? data.shop_groups.some((g: any) => g.qr_allowed)
        : (data.child_orders || []).some((c: any) => c.qr_allowed);
      setPaymentMode(hasAnyQrGroup ? 'QR' : 'CORE');
      setSecondsLeft(data.parent_order.seconds_left || 900);
      // Clear cart once order is confirmed
      cartService.clearCart();
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setCheckoutError(t('cart.errors.createOrderTimeout'));
      } else {
        setCheckoutError(err?.message || t('cart.errors.createOrderConnection'));
      }
    } finally {
      clearTimeout(timeoutId);
      setIsSubmitting(false);
    }
  };

  // 2. Pay Multi-Order with Core Wallet
  const handlePayWithCore = async () => {
    if (!currentUser) {
      onOpenLogin();
      return;
    }
    if (!activeParentOrder) return;

    setIsPayingCore(true);
    setCorePayError('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`/api/seller-orders/multi/${activeParentOrder.id}/pay-core`, {
        method: 'POST',
        headers: getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(t('cart.errors.invalidCorePayResponse'));
      }

      if (!res.ok || !data.success) {
        setCorePayError(data.error || t('cart.errors.corePayFailed'));
        return;
      }

      // Successful payment!
      setActiveParentOrder((prev: any) => ({ ...prev, status: 'PAID' }));
      if (Array.isArray(data.child_orders)) {
        setActiveChildOrders(data.child_orders);
      }

      // Update local wallet balance immediately
      if (typeof data.new_balance === 'number') {
        const u = dataService.getCurrentUser();
        if (u) {
          u.wallet_balance = data.new_balance;
          dataService.saveCurrentUser(u);
        }
      }
      dataService.refreshCurrentUserBalance().catch(() => {});
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setCorePayError(t('cart.errors.corePayTimeout'));
      } else {
        setCorePayError(err?.message || t('cart.errors.corePayConnection'));
      }
    } finally {
      clearTimeout(timeoutId);
      setIsPayingCore(false);
    }
  };

  // 3. On-demand SePay API Token check for Seller Direct QR orders
  const handleVerifyDirectSepay = async () => {
    if (!activeParentOrder) return;
    setIsVerifyingSepay(true);
    setVerifySepayMsg('');
    try {
      const res = await fetch(`/api/seller-orders/multi/${activeParentOrder.id}/verify-sepay`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (data.matched) {
        const pollRes = await fetch(`/api/seller-orders/multi/${activeParentOrder.id}`, { headers: getHeaders() });
        const pollData = await pollRes.json().catch(() => ({}));
        if (pollData.success && pollData.parent_order) {
          setActiveParentOrder(pollData.parent_order);
          setActiveChildOrders(pollData.child_orders || []);
          if (Array.isArray(pollData.shop_groups)) setActiveShopGroups(pollData.shop_groups);
        }
        setVerifySepayMsg(t('cart.verifySepayMatched'));
      } else {
        setVerifySepayMsg(data.message || t('cart.verifySepayPending'));
      }
    } catch {
      setVerifySepayMsg(t('cart.errors.createOrderConnection'));
    } finally {
      setIsVerifyingSepay(false);
    }
  };

  const userBalance = Number(currentUser?.wallet_balance || 0);
  const isPaid = activeParentOrder?.status === 'PAID' || activeParentOrder?.status === 'COMPLETED';
  const isAllPhysicalOrder =
    activeChildOrders.length > 0 && activeChildOrders.every((co) => co.product_type === 'physical');
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-xs flex items-end sm:items-stretch sm:justify-end p-0 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-none sm:rounded-l-2xl w-full sm:max-w-lg max-h-[92dvh] sm:max-h-full sm:h-full flex flex-col shadow-2xl overflow-hidden animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        {/* Modal Header (Shopee Style) */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#ee4d2d]/10 text-[#ee4d2d] border border-[#ee4d2d]/20 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="cart-drawer-title" className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {t('cart.multiStoreTitle')}
                </h2>
                {totalItemCount > 0 && !activeParentOrder && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#ee4d2d] text-white shrink-0">
                    {totalItemCount === 1
                      ? t('cart.itemCountSingular', { count: 1 })
                      : t('cart.itemCountPlural', { count: totalItemCount })}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {!activeParentOrder
                  ? t('cart.subtitleCombine')
                  : t('cart.masterOrderPrefix', { code: activeParentOrder.parent_order_code || activeParentOrder.id })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!activeParentOrder && cartItems.length > 0 && (
              <button
                type="button"
                onClick={handleClearCart}
                className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-[#d0011b] px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                title={t('cart.clearAllTitle')}
              >
                {t('cart.clearAll')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 bg-[#f5f5f5] dark:bg-slate-950/60">
          {/* SCENARIO A: Viewing Active Order (Payment or Delivery Screen) */}
          {activeParentOrder ? (
            <div className="space-y-4">
              {/* Status Header Banner */}
              {isPaid ? (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-900 dark:text-foreground flex items-center gap-1.5">
                      {isAllPhysicalOrder ? t('cart.paidSuccessPhysicalTitle') : t('cart.paidSuccessTitle')}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-muted-foreground mt-0.5">
                      {isAllPhysicalOrder ? t('cart.paidSuccessPhysicalDesc') : t('cart.paidSuccessDesc')}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5 animate-spin" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-foreground">
                        {t('cart.awaitingPaymentTitle')}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-muted-foreground">
                        {t('cart.masterOrderLabel')} <span className="font-mono font-semibold text-slate-900 dark:text-foreground">{activeParentOrder.parent_order_code}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-slate-600 dark:text-muted-foreground font-semibold uppercase">
                      {t('cart.expiresIn')}
                    </div>
                    <div className="font-mono text-base font-black text-[#ee4d2d]">
                      {formatTime(secondsLeft)}
                    </div>
                  </div>
                </div>
              )}

              {/* PAYMENT SECTION (If Not Paid) */}
              {!isPaid && (
                <div className="space-y-3">
                  {/* Mode Selector Tabs */}
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-200/70 dark:bg-muted/60 rounded-xl border border-slate-200 dark:border-border">
                    <button
                      type="button"
                      onClick={() => setPaymentMode('CORE')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        paymentMode === 'CORE'
                          ? 'bg-white dark:bg-card text-[#ee4d2d] shadow-xs border border-[#ee4d2d]/40'
                          : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground'
                      }`}
                    >
                      <Wallet className="w-4 h-4 text-[#ee4d2d] shrink-0" aria-hidden="true" />
                      <span className="truncate">{t('cart.coreWalletTab', { balance: userBalance.toLocaleString() })}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMode('QR')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        paymentMode === 'QR'
                          ? 'bg-white dark:bg-card text-[#ee4d2d] shadow-xs border border-[#ee4d2d]/40'
                          : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground'
                      }`}
                    >
                      <QrCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                      <span className="truncate">{t('cart.vietqrTab')}</span>
                    </button>
                  </div>

                  {corePayError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-destructive/10 border border-rose-200 dark:border-destructive/20 text-rose-700 dark:text-destructive text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{corePayError}</span>
                    </div>
                  )}

                  {/* Mode 1: Core Wallet Payment */}
                  {paymentMode === 'CORE' && (
                    <div className="p-4 rounded-xl bg-white dark:bg-card border border-slate-200 dark:border-border space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-muted-foreground">{t('cart.orderTotalLabel')}</span>
                        <span className="font-bold text-[#ee4d2d] text-sm">
                          {Number(activeParentOrder.total_amount).toLocaleString()} Core
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-muted-foreground">{t('cart.yourWalletBalanceLabel')}</span>
                        <span
                          className={`font-bold text-sm ${
                            userBalance >= Number(activeParentOrder.total_amount)
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-destructive'
                          }`}
                        >
                          {userBalance.toLocaleString()} Core
                        </span>
                      </div>

                      {userBalance >= Number(activeParentOrder.total_amount) ? (
                        <button
                          type="button"
                          disabled={isPayingCore}
                          onClick={handlePayWithCore}
                          className="w-full py-2.5 rounded-lg bg-[#ee4d2d] hover:bg-[#d73211] text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                        >
                          {isPayingCore ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" /> {t('cart.deductingWallet')}
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4" /> {t('cart.confirmCorePayment', { amount: Number(activeParentOrder.total_amount).toLocaleString() })}
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[11px] text-rose-600 dark:text-destructive text-center">
                            {t('cart.insufficientWalletShort', { shortage: (Number(activeParentOrder.total_amount) - userBalance).toLocaleString() })}
                          </p>
                          <button
                            type="button"
                            onClick={onOpenWallet}
                            className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Wallet className="w-4 h-4" /> {t('cart.topUpCoreWallet')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode 2: VietQR Direct Seller Banking Payment (Grouped per Shop) */}
                  {paymentMode === 'QR' && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-white dark:bg-muted/60 border border-slate-200 dark:border-border text-[11px] text-slate-600 dark:text-muted-foreground leading-relaxed">
                        {t('cart.qrTransferHint')}
                      </div>

                      {verifySepayMsg && (
                        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
                          {verifySepayMsg}
                        </div>
                      )}

                      <div className="space-y-3">
                        {activeShopGroups.length > 0
                          ? activeShopGroups.map((grp) => {
                              const grpChildren = activeChildOrders.filter((c) => c.seller_id === grp.seller_id);
                              const grpAllPaid =
                                grpChildren.length > 0 &&
                                grpChildren.every((c) => c.status === 'PAID' || c.status === 'COMPLETED' || c.status === 'PROCESSING');
                              const qrKey = `shop_${grp.seller_id}`;
                              return (
                                <div
                                  key={grp.seller_id}
                                  className="p-4 rounded-xl bg-white dark:bg-card border border-slate-200 dark:border-border space-y-3"
                                >
                                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-border/60 pb-2 gap-2">
                                    <div className="min-w-0">
                                      <div className="text-xs font-bold text-slate-900 dark:text-foreground truncate">
                                        {t('cart.shopPrefix')} {grp.seller_name} ({grpChildren.length})
                                      </div>
                                      <div className="text-[10px] text-slate-500 dark:text-muted-foreground truncate">
                                        {grpChildren.map((c) => c.product_name).join(' • ')}
                                      </div>
                                    </div>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                        grpAllPaid
                                          ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                          : 'bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-400'
                                      }`}
                                    >
                                      {grpAllPaid ? t('cart.statusPaid') : t('cart.statusAwaitingTransfer')}
                                    </span>
                                  </div>

                                  {!grpAllPaid ? (
                                    !grp.qr_allowed || !grp.qr_payload ? (
                                      <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-xs space-y-1.5">
                                        <div className="font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                                          <AlertCircle className="w-4 h-4 shrink-0" />
                                          {t('cart.onlyCoreSupportedTitle')}
                                        </div>
                                        <p className="text-[11px] text-slate-600 dark:text-muted-foreground leading-relaxed">
                                          {t('cart.onlyCoreSupportedDesc', { shop: grp.seller_name })}
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="space-y-3">
                                        <div className="flex flex-col sm:flex-row items-center gap-4">
                                          <div className="p-2 rounded-xl bg-white shadow-sm border border-slate-200 dark:border-border shrink-0">
                                            {qrImages[qrKey] ? (
                                              <img
                                                src={qrImages[qrKey]}
                                                alt="VietQR Code"
                                                className="w-36 h-36 object-contain"
                                              />
                                            ) : (
                                              <div className="w-36 h-36 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                                <RefreshCw className="w-6 h-6 animate-spin" />
                                              </div>
                                            )}
                                          </div>

                                          <div className="flex-1 space-y-2 text-xs w-full">
                                            <div>
                                              <div className="text-[10px] text-slate-500 dark:text-muted-foreground">{t('cart.bankAndAccount')}</div>
                                              <div className="font-bold text-slate-900 dark:text-foreground">
                                                {grp.bank_name} • <span className="font-mono">{grp.account_number}</span>
                                              </div>
                                              <div className="text-[10px] text-slate-500 dark:text-muted-foreground uppercase">{grp.bank_account}</div>
                                            </div>

                                            <div>
                                              <div className="text-[10px] text-slate-500 dark:text-muted-foreground">{t('cart.transferAmount')}</div>
                                              <div className="font-mono text-sm font-black text-[#ee4d2d]">
                                                {formatCurrency(Number(grp.total_amount))}
                                              </div>
                                            </div>

                                            <div>
                                              <div className="text-[10px] text-slate-500 dark:text-muted-foreground">{t('cart.transferMemoRequired')}</div>
                                              <div className="flex items-center gap-2 mt-0.5">
                                                <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-[#ee4d2d]/10 text-[#ee4d2d] border border-[#ee4d2d]/25 select-all">
                                                  {grp.qr_content}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => handleCopy(grp.qr_content, `qr_${grp.seller_id}`)}
                                                  className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-foreground cursor-pointer"
                                                  title={t('cart.copyMemo')}
                                                  aria-label={t('cart.copyMemo')}
                                                >
                                                  {copiedKey === `qr_${grp.seller_id}` ? (
                                                    <Check className="w-4 h-4 text-emerald-600" />
                                                  ) : (
                                                    <Copy className="w-4 h-4" />
                                                  )}
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        {grp.has_api_token && (
                                          <button
                                            type="button"
                                            disabled={isVerifyingSepay}
                                            onClick={handleVerifyDirectSepay}
                                            className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                          >
                                            <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingSepay ? 'animate-spin' : ''}`} />
                                            {isVerifyingSepay ? t('cart.verifyingSepayBtn') : t('cart.verifySepayNowBtn')}
                                          </button>
                                        )}
                                      </div>
                                    )
                                  ) : (
                                    <div className="space-y-2">
                                      {grpChildren.map((co) =>
                                        co.product_type === 'physical' ? (
                                          <div key={co.id} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-1">
                                            <div className="text-[10px] font-semibold text-amber-800 dark:text-amber-400 uppercase flex items-center gap-1.5">
                                              <Truck className="w-3.5 h-3.5" />
                                              <span>{co.product_name}</span>
                                            </div>
                                            <div className="text-xs font-bold text-slate-900 dark:text-foreground">
                                              {t('cart.awaitingPickupEscrow')}
                                            </div>
                                          </div>
                                        ) : (
                                          <div key={co.id} className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 space-y-1">
                                            <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">
                                              {co.product_name}
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="font-mono font-bold text-sm text-slate-900 dark:text-foreground select-all">
                                                {co.delivered_code || t('cart.codeReadyFallback')}
                                              </span>
                                              {co.delivered_code && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleCopy(co.delivered_code, `code_${co.id}`)}
                                                  className="px-2 py-1 rounded bg-white dark:bg-card text-[11px] font-semibold border border-slate-200 dark:border-border flex items-center gap-1 cursor-pointer"
                                                >
                                                  {copiedKey === `code_${co.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                                  {copiedKey === `code_${co.id}` ? t('cart.copiedShort') : t('cart.copyShort')}
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          : activeChildOrders.map((co) => (
                          <div
                            key={co.id}
                            className="p-4 rounded-xl bg-white dark:bg-card border border-slate-200 dark:border-border space-y-3"
                          >
                            <div className="flex items-center justify-between border-b border-slate-200 dark:border-border/60 pb-2 gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 dark:text-foreground truncate">{co.product_name}</div>
                                <div className="text-[10px] text-slate-500 dark:text-muted-foreground">
                                  {t('cart.shopPrefix')} <span className="font-semibold text-slate-900 dark:text-foreground">{co.seller_name}</span> • {t('cart.subOrderPrefix')}{' '}
                                  <span className="font-mono text-[#ee4d2d] font-bold">{co.order_code}</span>
                                </div>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                  co.status === 'PAID' || co.status === 'COMPLETED'
                                    ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-400'
                                }`}
                              >
                                {co.status === 'PAID' || co.status === 'COMPLETED'
                                  ? t('cart.statusPaid')
                                  : t('cart.statusAwaitingTransfer')}
                              </span>
                            </div>

                            {co.status !== 'PAID' && co.status !== 'COMPLETED' ? (
                              co.qr_allowed === false || (!co.qr_payload && !co.qr_content) ? (
                                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-xs space-y-1.5">
                                  <div className="font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {t('cart.onlyCoreSupportedTitle')}
                                  </div>
                                  <p className="text-[11px] text-slate-600 dark:text-muted-foreground leading-relaxed">
                                    {t('cart.onlyCoreSupportedDesc', { shop: co.seller_name })}
                                  </p>
                                </div>
                              ) : (
                              <div className="flex flex-col sm:flex-row items-center gap-4">
                                <div className="p-2 rounded-xl bg-white shadow-sm border border-slate-200 dark:border-border shrink-0">
                                  {qrImages[co.id] ? (
                                    <img
                                      src={qrImages[co.id]}
                                      alt="VietQR Code"
                                      className="w-36 h-36 object-contain"
                                    />
                                  ) : (
                                    <div className="w-36 h-36 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                      <RefreshCw className="w-6 h-6 animate-spin" />
                                    </div>
                                  )}
                                </div>

                                <div className="flex-1 space-y-2 text-xs w-full">
                                  <div>
                                    <div className="text-[10px] text-slate-500 dark:text-muted-foreground">{t('cart.bankAndAccount')}</div>
                                    <div className="font-bold text-slate-900 dark:text-foreground">
                                      {co.bank_name} •{' '}
                                      <span className="font-mono">{co.account_number}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-muted-foreground uppercase">{co.bank_account}</div>
                                  </div>

                                  <div>
                                    <div className="text-[10px] text-slate-500 dark:text-muted-foreground">{t('cart.transferAmount')}</div>
                                    <div className="font-mono text-sm font-black text-[#ee4d2d]">
                                      {formatCurrency(Number(co.price_core))}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-[10px] text-slate-500 dark:text-muted-foreground">{t('cart.transferMemoRequired')}</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-[#ee4d2d]/10 text-[#ee4d2d] border border-[#ee4d2d]/25 select-all">
                                        {co.qr_content}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleCopy(co.qr_content, `qr_${co.id}`)}
                                        className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-foreground cursor-pointer"
                                        title={t('cart.copyMemo')}
                                        aria-label={t('cart.copyMemo')}
                                      >
                                        {copiedKey === `qr_${co.id}` ? (
                                          <Check className="w-4 h-4 text-emerald-600" />
                                        ) : (
                                          <Copy className="w-4 h-4" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          ) : (
                              /* Đơn con đã hoàn tất */
                              co.product_type === 'physical' ? (
                                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-1">
                                  <div className="text-[10px] font-semibold text-amber-800 dark:text-amber-400 uppercase flex items-center gap-1.5">
                                    <Truck className="w-3.5 h-3.5" />
                                    <span>{t('cart.physicalOrderStatus')}</span>
                                  </div>
                                  <div className="text-xs font-bold text-slate-900 dark:text-foreground">
                                    {t('cart.awaitingPickupEscrow')}
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 space-y-1">
                                  <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">
                                    {t('cart.deliveredGiftcodeLabel')}
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-foreground select-all">
                                      {co.delivered_code || t('cart.codeReadyFallback')}
                                    </span>
                                    {co.delivered_code && (
                                      <button
                                        type="button"
                                        onClick={() => handleCopy(co.delivered_code, `code_${co.id}`)}
                                        className="px-2 py-1 rounded bg-white dark:bg-card text-[11px] font-semibold border border-slate-200 dark:border-border flex items-center gap-1 cursor-pointer"
                                      >
                                        {copiedKey === `code_${co.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copiedKey === `code_${co.id}` ? t('cart.copiedShort') : t('cart.copyShort')}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* DELIVERED CODES LIST (When Paid or Partially Paid) */}
              {isPaid && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider">
                    {activeChildOrders.length === 1
                      ? t('cart.deliveredItemsSingular', { count: 1 })
                      : t('cart.deliveredItemsPlural', { count: activeChildOrders.length })}
                  </h4>
                  <div className="space-y-2.5">
                    {activeChildOrders.map((co) => (
                      <div
                        key={co.id}
                        className="p-3.5 rounded-xl bg-white dark:bg-card border border-slate-200 dark:border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-foreground">{co.product_name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-muted-foreground">
                            {t('cart.shopPrefix')} <span className="font-semibold text-slate-900 dark:text-foreground">{co.seller_name}</span> • {t('cart.subOrderPrefix')}{' '}
                            <span className="font-mono text-[#ee4d2d] font-bold">{co.order_code}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {co.product_type === 'physical' ? (
                            <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-400 text-xs font-bold flex items-center gap-1.5">
                              <Truck className="w-4 h-4" />
                              <span>{t('cart.awaitingCourier')}</span>
                            </div>
                          ) : (
                            <>
                              <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-muted border border-slate-200 dark:border-border font-mono text-xs font-black text-[#ee4d2d] select-all">
                                {co.delivered_code || t('cart.unlockingCodeFallback')}
                              </div>
                              {co.delivered_code && (
                                <button
                                  type="button"
                                  onClick={() => handleCopy(co.delivered_code, `code_del_${co.id}`)}
                                  className="p-1.5 rounded-lg bg-white dark:bg-card hover:bg-slate-50 dark:hover:bg-card-hover border border-slate-200 dark:border-border text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                                  title={t('cart.copyCodeAria')}
                                  aria-label={t('cart.copyCodeAria')}
                                >
                                  {copiedKey === `code_del_${co.id}` ? (
                                    <Check className="w-4 h-4 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenReceivedCodes('orders');
                      }}
                      className="w-full sm:flex-1 py-2.5 rounded-lg bg-[#ee4d2d] hover:bg-[#d73211] text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" /> {t('cart.openMyVault')}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-white dark:bg-card border border-slate-200 dark:border-border text-slate-700 dark:text-foreground text-xs font-bold hover:bg-slate-50 dark:hover:bg-card-hover transition-all cursor-pointer"
                    >
                      {t('common.close')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* SCENARIO B: Shopping Cart Overview (Viewing items before order creation) */
            <>
              {cartItems.length === 0 ? (
                <div className="py-12 text-center space-y-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
                  <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-slate-800 text-[#ee4d2d] flex items-center justify-center mx-auto border border-orange-200/70 dark:border-slate-700">
                    <ShoppingCart className="w-7 h-7" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {t('cart.empty')}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                      {t('cart.emptyDesc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-2 px-5 py-2.5 rounded-lg bg-[#ee4d2d] hover:bg-[#d73211] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    {t('cart.continueShopping')}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {checkoutError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-destructive/10 border border-rose-200 dark:border-destructive/20 text-rose-700 dark:text-destructive text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{checkoutError}</span>
                    </div>
                  )}

                  {/* Grouped by Seller (Shopee Mall Store Card Style) */}
                  {groupedStores.map((store) => (
                    <div
                      key={store.sellerId}
                      className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs"
                    >
                      {/* Store Header */}
                      <div className="px-3.5 py-2.5 bg-slate-50/90 dark:bg-slate-800/70 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="bg-[#d0011b] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-xs shrink-0 leading-none">
                            {t('shopeePhysical.mallBadge')}
                          </span>
                          <Store className="w-3.5 h-3.5 text-[#ee4d2d] shrink-0" aria-hidden="true" />
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">{store.sellerName}</span>
                          {store.sellerSlug && onNavigateStore && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onNavigateStore(store.sellerSlug!);
                              }}
                              className="text-[10px] text-[#ee4d2d] hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer font-semibold"
                            >
                              {t('cart.visitShop')} <ChevronRight className="w-3 h-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>

                        <span className="text-xs font-bold text-[#ee4d2d] shrink-0">
                          {store.subtotal.toLocaleString()} Core
                        </span>
                      </div>

                      {/* Items List */}
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {store.items.map((item) => {
                          const cleanCover = sanitizeImageUrl(item.coverUrl);
                          const safeItemImg = cleanCover && !cleanCover.includes('test-game.webp')
                            ? cleanCover
                            : (item.productType === 'physical' ? PHYSICAL_DEFAULT_IMAGE_URL : '/package-placeholder.svg');
                          const isItemPlaceholder = safeItemImg.includes('package-placeholder.svg');

                          return (
                            <div
                              key={`${item.productId}_${item.variantId || 'default'}`}
                              className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-orange-50/25 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-14 h-14 rounded-lg bg-slate-50 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                                  <img
                                    src={safeItemImg}
                                    alt={item.productName}
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      const target = e.currentTarget;
                                      if (item.productType === 'physical' && !target.src.includes(PHYSICAL_DEFAULT_IMAGE_URL)) {
                                        target.src = PHYSICAL_DEFAULT_IMAGE_URL;
                                        return;
                                      }
                                      target.onerror = null;
                                      target.className = 'w-full h-full object-contain p-1.5';
                                      target.src = '/package-placeholder.svg';
                                    }}
                                    className={`w-full h-full ${isItemPlaceholder ? 'object-contain p-1.5' : 'object-cover'}`}
                                  />
                                </div>

                                <div className="min-w-0">
                                  {item.gameName && (
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block truncate">
                                      {item.gameName}
                                    </span>
                                  )}
                                  <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-1" title={item.productName}>
                                    {item.productName}
                                  </h4>
                                  {item.variantName && (
                                    <div className="text-[10px] font-semibold text-[#ee4d2d] bg-[#ee4d2d]/10 px-1.5 py-0.5 rounded-xs inline-block mt-0.5">
                                      {item.variantName}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <span className={`px-1.5 py-0.5 rounded-xs text-[9px] font-bold shrink-0 leading-none ${
                                      item.productType === 'physical'
                                        ? 'bg-[#00bfa5]/15 text-[#00897b] dark:text-[#00bfa5] border border-[#00bfa5]/30'
                                        : 'bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30'
                                    }`}>
                                      {item.productType === 'physical' ? t('cart.badgePhysicalShort') : t('cart.badgeDigitalShort')}
                                    </span>
                                    <span className="text-xs font-extrabold text-[#ee4d2d]">
                                      {item.priceCore.toLocaleString()} Core
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <div className="inline-flex items-center border border-slate-300 dark:border-slate-700 rounded-md overflow-hidden bg-white dark:bg-slate-800">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newQty = (item.quantity || 1) - 1;
                                      cartService.updateQuantity(item.productId, newQty, item.variantId);
                                      syncCartState();
                                    }}
                                    className="w-6 h-6 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                                    title={t('checkoutModal.decreaseQtyAria')}
                                    aria-label={t('checkoutModal.decreaseQtyAria')}
                                  >
                                    -
                                  </button>
                                  <span className="w-7 text-center text-xs font-bold text-slate-900 dark:text-slate-100 border-x border-slate-200 dark:border-slate-700 leading-6">
                                    {item.quantity || 1}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newQty = (item.quantity || 1) + 1;
                                      cartService.updateQuantity(item.productId, newQty, item.variantId);
                                      syncCartState();
                                    }}
                                    className="w-6 h-6 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                                    title={t('checkoutModal.increaseQtyAria')}
                                    aria-label={t('checkoutModal.increaseQtyAria')}
                                  >
                                    +
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(item.productId, item.variantId)}
                                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-[#d0011b] hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors shrink-0 cursor-pointer"
                                  title={t('cart.remove')}
                                  aria-label={t('cart.remove')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Gợi Ý Mua Kèm Hàng Số Cùng Gian Hàng (Cross-sell) */}
                      {crossSellMap[store.sellerId] && crossSellMap[store.sellerId].length > 0 && (
                        <div className="p-3 bg-orange-50/50 dark:bg-slate-800/40 border-t border-slate-200/80 dark:border-slate-800 space-y-2">
                          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span aria-hidden="true">✨</span>
                            <span>{t('cart.recommendedAddons', { shop: store.sellerName })}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {crossSellMap[store.sellerId].map((cs) => (
                              <div key={cs.id} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                                <div className="min-w-0 truncate">
                                  <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate" title={cs.name}>{cs.name}</div>
                                  <div className="text-[10px] font-bold text-[#ee4d2d]">{Number(cs.price_core).toLocaleString()} Core</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAddCrossSell(cs, store)}
                                  className="px-2 py-1 rounded bg-[#ee4d2d]/10 hover:bg-[#ee4d2d]/20 text-[#ee4d2d] text-[10px] font-bold shrink-0 cursor-pointer"
                                >
                                  + {t('cart.addAddonBtn')}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky Shopee Checkout Footer (When in Cart Overview) */}
        {!activeParentOrder && cartItems.length > 0 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] space-y-3 shrink-0">
            {checkoutError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-destructive/10 border border-rose-200 dark:border-destructive/30 text-rose-700 dark:text-destructive text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{checkoutError}</div>
                  <div className="text-[11px] text-rose-600/90 dark:text-destructive/80 mt-0.5">
                    {t('cart.errorSafeRetryHint')}
                  </div>
                </div>
              </div>
            )}

            {/* Thông báo phân loại thanh toán COD theo loại hàng */}
            {cartItems.every((i) => (i.productType || 'digital') === 'digital') ? (
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 text-[11px] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('cart.digitalNoCodNotice')}</span>
              </div>
            ) : (
              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[11px] flex items-center gap-2">
                <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('cart.physicalCourierNotice')}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400 font-medium">
                {totalItemCount === 1
                  ? t('cart.totalWithCountSingular', { count: 1 })
                  : t('cart.totalWithCountPlural', { count: totalItemCount })}
              </span>
              <div className="text-right">
                <span className="font-mono text-lg font-extrabold text-[#ee4d2d]">
                  {totalCore.toLocaleString()} Core
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1">
                  ({t('cart.coreRateHint')})
                </span>
              </div>
            </div>

            {currentUser && (
              <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                <span>{t('cart.walletBalanceFooter')}</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{userBalance.toLocaleString()} Core</span>
              </div>
            )}

            <button
              type="button"
              disabled={isSubmitting || isSyncingCart}
              onClick={handleCreateOrder}
              className="w-full py-3 rounded-lg bg-[#ee4d2d] hover:bg-[#d73211] text-white text-xs sm:text-sm font-bold shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSyncingCart ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> {t('cart.syncingCart')}
                </>
              ) : isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> {t('cart.creatingOrder')}
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" aria-hidden="true" /> {t('cart.proceedCheckoutWithTotal', { total: totalCore.toLocaleString() })}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
