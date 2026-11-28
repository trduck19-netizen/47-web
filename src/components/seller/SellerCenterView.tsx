import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Store,
  Package,
  KeyRound,
  ShoppingBag,
  Settings,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Shield,
  ShieldAlert,
  ArrowRight,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Edit2,
  Users,
  Coins,
  Send,
  Sliders,
  Sparkles,
  X,
  FileText,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  Layers,
  Code2,
  Key,
  Terminal,
  ExternalLink,
  Lock,
  Check,
  Share2,
  QrCode,
  Palette,
  Star,
  Truck,
  Ticket,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { getActiveBrandIdentity } from '../../utils/brandRuntime';
import { formatCore } from '../../utils/textUtils';
import { resolveProductCoverImage, PHYSICAL_DEFAULT_IMAGE_URL } from '../../utils/safeImageUrl';
import { Game } from '../../types/game';
import { parseSafeJsonArray } from '../../config/sellerIndustries';
import { SellerAffiliateManager, ResellSettingsModal } from './SellerAffiliateManager';
import { SellerSepayManager } from './SellerSepayManager';
import { SellerStorefrontStudio } from './SellerStorefrontStudio';
import { SellerProductEditorModal } from './SellerProductEditorModal';
import { SellerVouchersManager } from './SellerVouchersManager';
import type { SellerPortalConfigData, SellerPortalTabId, SellerSubRole } from './sellerPortalTheme';
import type { SellerSepayTopbarSummary } from './SellerPortalTopbar';

export interface SellerPortalContextSnapshot {
  loading: boolean;
  hasSeller: boolean;
  seller: any;
  subRole: SellerSubRole;
  stats: any;
  unresolvedDisputeCount: number;
  sepaySummary: SellerSepayTopbarSummary | null;
  portalConfig?: SellerPortalConfigData;
}

interface SellerCenterViewProps {
  currentUser: any;
  onOpenLogin: () => void;
  games: Game[];
  onNavigateHome: () => void;
  portalMode?: boolean;
  initialBootstrap?: SellerPortalContextSnapshot;
  controlledTab?: SellerPortalTabId;
  onControlledTabChange?: (tab: SellerPortalTabId) => void;
  onPortalContextChange?: (snapshot: SellerPortalContextSnapshot) => void;
}

export const SellerCenterView: React.FC<SellerCenterViewProps> = ({
  currentUser,
  onOpenLogin,
  games,
  onNavigateHome,
  portalMode = false,
  initialBootstrap,
  controlledTab,
  onControlledTabChange,
  onPortalContextChange,
}) => {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const currentUserId = currentUser?.id ? String(currentUser.id) : '';
  const hasBootstrap = Boolean(initialBootstrap && !initialBootstrap.loading);
  const [loading, setLoading] = useState<boolean>(() => (hasBootstrap ? false : true));
  const [sellerData, setSellerData] = useState<any>(() => (hasBootstrap ? initialBootstrap?.seller || null : null));
  const [subRole, setSubRole] = useState<SellerSubRole>(() => (hasBootstrap ? initialBootstrap?.subRole || 'OWNER' : 'OWNER'));
  const [sepaySummary, setSepaySummary] = useState<SellerSepayTopbarSummary | null>(() =>
    hasBootstrap ? initialBootstrap?.sepaySummary || null : null
  );
  const [portalConfigState, setPortalConfigState] = useState<SellerPortalConfigData | undefined>(() =>
    hasBootstrap ? initialBootstrap?.portalConfig : undefined
  );
  const [stats, setStats] = useState<any>(() => (hasBootstrap ? initialBootstrap?.stats || null : null));
  const [internalActiveTab, setInternalActiveTab] = useState<SellerPortalTabId>('dashboard');
  const activeTab: SellerPortalTabId = portalMode && controlledTab ? controlledTab : internalActiveTab;
  const setActiveTab = useCallback(
    (next: SellerPortalTabId) => {
      setInternalActiveTab(next);
      if (portalMode && onControlledTabChange) {
        onControlledTabChange(next);
      }
    },
    [portalMode, onControlledTabChange]
  );
  const [resellModalProduct, setResellModalProduct] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Disputes State (§B)
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loadingDisputes, setLoadingDisputes] = useState<boolean>(false);
  const [disputeFilter, setDisputeFilter] = useState<string>('');
  const [unresolvedDisputeCount, setUnresolvedDisputeCount] = useState<number>(0);
  const [respondingDispute, setRespondingDispute] = useState<any>(null);
  const [disputeResponseMsg, setDisputeResponseMsg] = useState<string>('');
  const [disputeReplacementCode, setDisputeReplacementCode] = useState<string>('');
  const [isSubmittingDisputeResp, setIsSubmittingDisputeResp] = useState<boolean>(false);

  // Finance & Withdraw State (Giai đoạn 2)
  const [financeData, setFinanceData] = useState<any>(null);
  const [loadingFinance, setLoadingFinance] = useState<boolean>(false);
  const [sellerWithdrawals, setSellerWithdrawals] = useState<any[]>([]);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState<boolean>(false);

  // Products State
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);
  const [showAddProductModal, setShowAddProductModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState<string>('');
  const [productStatusFilter, setProductStatusFilter] = useState<'ALL' | 'SELLING' | 'PAUSED' | 'OUT_OF_STOCK'>('ALL');
  const [productCollectionFilter, setProductCollectionFilter] = useState<string>('');

  // Order Shipping / Manual Service Fulfillment Modal State
  const [fulfillingOrder, setFulfillingOrder] = useState<any | null>(null);
  const [shipCarrier, setShipCarrier] = useState<string>('GHN');
  const [shipTrackingCode, setShipTrackingCode] = useState<string>('');
  const [shipFulfillmentNote, setShipFulfillmentNote] = useState<string>('');
  const [deliveredContentText, setDeliveredContentText] = useState<string>('');
  const [submittingFulfill, setSubmittingFulfill] = useState<boolean>(false);

  // Codes State
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [codes, setCodes] = useState<any[]>([]);
  const [loadingCodes, setLoadingCodes] = useState<boolean>(false);
  const [showAddCodesModal, setShowAddCodesModal] = useState<boolean>(false);
  const [revealedCode, setRevealedCode] = useState<{ id: string; code: string } | null>(null);

  // Orders State
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const [orderFilter, setOrderFilter] = useState<string>('');
  const [resolvingOrder, setResolvingOrder] = useState<any>(null);
  const [resolveType, setResolveType] = useState<'REPLACE_CODE' | 'REFUND_CORE'>('REPLACE_CODE');
  const [resolveNote, setResolveNote] = useState<string>('');

  // Subaccounts State
  const [subaccounts, setSubaccounts] = useState<any[]>([]);
  const [newSubEmail, setNewSubEmail] = useState<string>('');
  const [newSubRole, setNewSubRole] = useState<'VIEW_ORDERS' | 'MANAGE_STOCK'>('VIEW_ORDERS');

  // API Keys & Integrations State
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState<boolean>(false);
  const [thirdPartyApps, setThirdPartyApps] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState<boolean>(false);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState<boolean>(false);
  const [newKeyName, setNewKeyName] = useState<string>('');
  const [newKeyScope, setNewKeyScope] = useState<'FULL' | 'READ_ONLY' | 'PRODUCTS_ONLY' | 'ORDERS_ONLY'>('FULL');
  const [isCreatingKey, setIsCreatingKey] = useState<boolean>(false);
  const [generatedRawKeyData, setGeneratedRawKeyData] = useState<{ rawKey: string; name: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // Registration Form State
  const [regName, setRegName] = useState<string>('');
  const [regSlug, setRegSlug] = useState<string>('');
  const [regPhone, setRegPhone] = useState<string>('');
  const [regBankName, setRegBankName] = useState<string>('');
  const [regBankAccount, setRegBankAccount] = useState<string>('');
  const [regBankAccountName, setRegBankAccountName] = useState<string>('');
  const [regDescription, setRegDescription] = useState<string>('');
  const [regSupportHours, setRegSupportHours] = useState<string>('08:00 - 22:00');
  const [regWarranty, setRegWarranty] = useState<string>(isEn ? '7-day official warranty & 1-to-1 replacement if item is defective' : 'Bảo hành chính hãng & hỗ trợ đổi mới 1 đổi 1 nếu sản phẩm lỗi');
  const [regRefund, setRegRefund] = useState<string>(isEn ? '100% refund under 168h buyer protection if item does not match description' : 'Hoàn tiền 100% qua bảo chứng sàn 168h nếu không đúng mô tả');
  const [isSubmittingReg, setIsSubmittingReg] = useState<boolean>(false);

  // Add Codes Input
  const [rawCodesText, setRawCodesText] = useState<string>('');

  const getAuthToken = useCallback(() => {
    try {
      let tok =
        localStorage.getItem('pine_auth_token') ||
        sessionStorage.getItem('pine_auth_token') ||
        currentUser?.session_token ||
        '';
      if (!tok && typeof document !== 'undefined') {
        const m = document.cookie.match(/(?:^|;\s*)pine_auth_token=([^;]+)/);
        if (m) {
          try {
            tok = decodeURIComponent(m[1]);
          } catch {}
        }
      }
      return tok;
    } catch {
      return currentUser?.session_token || '';
    }
  }, [currentUser?.session_token]);

  const getHeaders = useCallback(() => {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, [getAuthToken]);

  // Fetch Seller Info
  const fetchSellerInfo = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/seller', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        if (data.portal_config) {
          setPortalConfigState(data.portal_config);
        }
        if (data.has_seller) {
          setSellerData(data.seller);
          const resolvedRole = (String(data.sub_role || 'OWNER').toUpperCase() as SellerSubRole) || 'OWNER';
          setSubRole(resolvedRole);
          setStats(data.stats);
          setSepaySummary(data.sepay_summary || null);
          fetchDisputes();
        } else {
          setSellerData(null);
          setSubRole('OWNER');
          setSepaySummary(null);
        }
      } else {
        const isNoStore = res.status === 404 || String(data?.error || '').includes('chưa có gian hàng');
        setErrorMsg(
          isNoStore
            ? t('sellerCenter.noStoreAccessError')
            : (isEn ? t('sellerCenter.loadStoreError') : (data.error || t('sellerCenter.loadStoreError')))
        );
      }
    } catch {
      setErrorMsg(isEn ? 'Cannot connect to server.' : 'Lỗi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  const bootstrappedRef = React.useRef<boolean>(hasBootstrap);

  useEffect(() => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }
    if (bootstrappedRef.current) {
      bootstrappedRef.current = false;
      if (sellerData) {
        fetchDisputes();
      }
      return;
    }
    fetchSellerInfo();
  }, [currentUserId]);

  // Đồng bộ snapshot trạng thái gian hàng lên SellerPortalApp (CHỈ phát khi đã xong loading để tuyệt đối không gây vòng lặp remount!)
  useEffect(() => {
    if (!portalMode || !onPortalContextChange) return;
    if (loading && !sellerData) return;
    onPortalContextChange({
      loading,
      hasSeller: Boolean(sellerData),
      seller: sellerData,
      subRole,
      stats,
      unresolvedDisputeCount,
      sepaySummary,
      portalConfig: portalConfigState,
    });
  }, [
    portalMode,
    onPortalContextChange,
    loading,
    sellerData,
    subRole,
    stats,
    unresolvedDisputeCount,
    sepaySummary,
    portalConfigState,
  ]);

  // Nạp dữ liệu theo tab khi chuyển qua Sidebar trong SellerPortalApp
  useEffect(() => {
    if (!portalMode || !sellerData) return;
    if (activeTab === 'disputes') fetchDisputes();
    if (activeTab === 'api_keys') {
      fetchApiKeys();
      fetchApps();
    }
  }, [portalMode, activeTab, sellerData?.id]);

  const shopCategories = useMemo(() => {
    const fromSeller = parseSafeJsonArray<string>(sellerData?.shop_categories_json).filter(
      (c) => typeof c === 'string' && c.trim()
    );
    const fromProds = products
      .map((p) => String(p.shop_category || '').trim())
      .filter(Boolean);
    return Array.from(new Set([...fromSeller, ...fromProds]));
  }, [sellerData?.shop_categories_json, products]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (productCollectionFilter && String(p.shop_category || '') !== productCollectionFilter) {
        return false;
      }
      const isStockQtyMode =
        String(p.product_type || '').toLowerCase() === 'physical' ||
        String(p.fulfillment_mode || '').toUpperCase() === 'MANUAL_SERVICE';
      const stockNum = isStockQtyMode ? Number(p.stock_quantity || 0) : Number(p.in_stock_count || 0);
      const isPaused = Number(p.is_paused || 0) === 1;

      if (productStatusFilter === 'SELLING' && (isPaused || stockNum <= 0)) return false;
      if (productStatusFilter === 'PAUSED' && !isPaused) return false;
      if (productStatusFilter === 'OUT_OF_STOCK' && stockNum > 0) return false;

      if (!q) return true;
      return (
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.sku || '').toLowerCase().includes(q) ||
        String(p.category_name || p.game_name || '').toLowerCase().includes(q) ||
        String(p.shop_category || '').toLowerCase().includes(q)
      );
    });
  }, [products, productSearch, productCollectionFilter, productStatusFilter]);

  // Fetch Products
  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await fetch('/api/seller/products', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setProducts(data.products || []);
        if (!selectedProductId && data.products && data.products.length > 0) {
          setSelectedProductId(data.products[0].id);
        }
      }
    } catch {}
    setLoadingProducts(false);
  };

  // Fetch Codes
  const fetchCodes = async (productId: string) => {
    if (!productId) return;
    setLoadingCodes(true);
    try {
      const res = await fetch(`/api/seller/products/${productId}/codes?limit=100`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setCodes(data.codes || []);
      }
    } catch {}
    setLoadingCodes(false);
  };

  // Fetch Orders
  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const url = orderFilter ? `/api/seller/orders?status=${orderFilter}` : '/api/seller/orders';
      const res = await fetch(url, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      }
    } catch {}
    setLoadingOrders(false);
  };

  // Fetch Subaccounts
  const fetchSubaccounts = async () => {
    try {
      const res = await fetch('/api/seller/subaccounts', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setSubaccounts(data.subaccounts || []);
      }
    } catch {}
  };

  // Fetch API Keys & Third-party Apps
  const fetchApiKeys = async () => {
    setLoadingApiKeys(true);
    try {
      const res = await fetch('/api/seller/api-keys', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setApiKeys(data.keys || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingApiKeys(false);
    }
  };

  const fetchApps = async () => {
    setLoadingApps(true);
    try {
      const res = await fetch('/api/seller/apps', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setThirdPartyApps(data.authorizations || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingApps(false);
    }
  };

  // Fetch Finance & Sổ Cái & Lịch Sử Rút Tiền (Giai đoạn 2)
  const fetchSellerFinance = async () => {
    setLoadingFinance(true);
    try {
      const [resFin, resWdr] = await Promise.all([
        fetch('/api/seller/finance', { headers: getHeaders() }),
        fetch('/api/seller/finance/withdrawals', { headers: getHeaders() }),
      ]);
      const dataFin = await resFin.json();
      const dataWdr = await resWdr.json();
      if (dataFin.success) setFinanceData(dataFin);
      if (dataWdr.success) setSellerWithdrawals(dataWdr.withdrawals || []);
    } catch (err) {
      console.warn('Fetch seller finance error:', err);
    } finally {
      setLoadingFinance(false);
    }
  };

  // Gửi Yêu Cầu Rút Tiền (§8)
  const handleRequestWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(withdrawAmount, 10);
    if (isNaN(amt) || amt < 1) {
      setErrorMsg(isEn ? 'Minimum withdrawal is 1 Core.' : 'Số tiền rút tối thiểu là 1 Core.');
      return;
    }
    setIsSubmittingWithdraw(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/seller/finance/withdraw', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ amount_core: amt }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || (isEn ? 'Withdrawal request submitted successfully!' : 'Gửi yêu cầu rút tiền thành công!'));
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        fetchSellerFinance();
        fetchSellerInfo();
      } else {
        setErrorMsg(data.error || (isEn ? 'Withdrawal failed.' : 'Rút tiền thất bại.'));
      }
    } catch {
      setErrorMsg(isEn ? 'Cannot connect to server.' : 'Không thể kết nối đến máy chủ.');
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  useEffect(() => {
    if (sellerData && (sellerData.status === 'TRIAL' || sellerData.status === 'ACTIVE')) {
      if (activeTab === 'products') fetchProducts();
      if (activeTab === 'codes') {
        fetchProducts();
        if (selectedProductId) fetchCodes(selectedProductId);
      }
      if (activeTab === 'orders') fetchOrders();
      if (activeTab === 'disputes') fetchDisputes();
      if (activeTab === 'finance') fetchSellerFinance();
      if (activeTab === 'settings') fetchSubaccounts();
      if (activeTab === 'api_keys') {
        fetchApiKeys();
        fetchApps();
      }
    }
  }, [sellerData, activeTab, selectedProductId, orderFilter, disputeFilter]);

  // Handle Register
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingReg(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/seller', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: regName,
          slug: regSlug,
          contact_phone: regPhone,
          bank_name: regBankName,
          bank_account: regBankAccount,
          bank_account_name: regBankAccountName,
          description: regDescription,
          support_hours: regSupportHours,
          warranty_policy: regWarranty,
          refund_policy: regRefund,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(isEn ? 'Store registered successfully! Your application is pending Admin approval.' : 'Đăng ký mở gian hàng thành công! Hồ sơ đang chờ Quản trị viên duyệt.');
        fetchSellerInfo();
      } else {
        setErrorMsg(data.error || (isEn ? 'Registration failed.' : 'Đăng ký thất bại.'));
      }
    } catch {
      setErrorMsg(isEn ? 'Cannot connect to server.' : 'Lỗi kết nối máy chủ.');
    } finally {
      setIsSubmittingReg(false);
    }
  };

  // Handle Toggle Vacation Mode (§6.4)
  const handleToggleVacation = async () => {
    if (!sellerData) return;
    const nextVacation = sellerData.is_vacation ? 0 : 1;
    try {
      const res = await fetch('/api/seller', {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ is_vacation: nextVacation }),
      });
      const data = await res.json();
      if (data.success) {
        setSellerData({ ...sellerData, is_vacation: nextVacation });
        setSuccessMsg(data.message);
      } else {
        setErrorMsg(data.error || (isEn ? 'Action failed.' : 'Thao tác thất bại.'));
      }
    } catch {
      setErrorMsg(isEn ? 'Cannot connect to server.' : 'Lỗi kết nối máy chủ.');
    }
  };

  const handleOpenCreateProductModal = () => {
    setErrorMsg('');
    setEditingProduct(null);
    setShowAddProductModal(true);
  };

  const handleOpenEditProductModal = (p: any) => {
    setErrorMsg('');
    setEditingProduct(p);
    setShowAddProductModal(true);
  };

  const handleTogglePauseProduct = async (p: any) => {
    try {
      const nextPaused = Number(p.is_paused || 0) === 1 ? 0 : 1;
      const res = await fetch(`/api/seller/products/${p.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ is_paused: nextPaused }),
      });
      if (res.ok) {
        setProducts((prev) => prev.map((it) => (it.id === p.id ? { ...it, is_paused: nextPaused } : it)));
      }
    } catch {}
  };

  const handleToggleFeaturedProduct = async (p: any) => {
    try {
      const nextFeatured = Number(p.is_featured || 0) === 1 ? 0 : 1;
      const res = await fetch(`/api/seller/products/${p.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ is_featured: nextFeatured }),
      });
      if (res.ok) {
        setProducts((prev) => prev.map((it) => (it.id === p.id ? { ...it, is_featured: nextFeatured } : it)));
      }
    } catch {}
  };

  const handleDuplicateProduct = (p: any) => {
    const clone = {
      ...p,
      id: undefined,
      name: `${p.name} (Copy)`,
      sku: p.sku ? `${p.sku}-COPY` : '',
    };
    setEditingProduct(null);
    setShowAddProductModal(true);
    setTimeout(() => setEditingProduct({ ...clone, _isCloneDraft: true }), 0);
  };

  const handleFulfillOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fulfillingOrder) return;
    setSubmittingFulfill(true);
    setErrorMsg('');
    try {
      const isPhys = String(fulfillingOrder.product_type || '').toLowerCase() === 'physical';
      const res = await fetch(`/api/seller/orders/${fulfillingOrder.id}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(
          isPhys
            ? {
                action: 'SHIPPING',
                carrier: shipCarrier,
                tracking_code: shipTrackingCode.trim(),
                note: shipFulfillmentNote.trim(),
              }
            : {
                action: 'DELIVER_MANUAL',
                delivered_content: deliveredContentText.trim(),
                note: shipFulfillmentNote.trim(),
              }
        ),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setFulfillingOrder(null);
        setShipTrackingCode('');
        setShipFulfillmentNote('');
        setDeliveredContentText('');
        setSuccessMsg(data.message || t('sellerProductEditor.fulfillSuccess'));
        fetchOrders();
      } else {
        setErrorMsg(data?.error || t('sellerProductEditor.saveFailed'));
      }
    } catch {
      setErrorMsg(t('sellerProductEditor.saveFailed'));
    } finally {
      setSubmittingFulfill(false);
    }
  };

  // Handle Soft-Delete Product (#71c: DELETE /api/seller/products/:id)
  const handleDeleteProduct = async (product: any) => {
    if (!product?.id) return;
    if (!window.confirm(t('sellerCenter.confirmDeleteProduct', { name: product.name }))) {
      return;
    }
    setDeletingProductId(product.id);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seller/products/${product.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSuccessMsg(t('sellerCenter.deleteProductSuccess'));
        if (selectedProductId === product.id) {
          setSelectedProductId('');
        }
        fetchProducts();
        fetchSellerInfo();
      } else {
        setErrorMsg(
          isEn
            ? t('sellerCenter.deleteProductFailed')
            : (data.error || t('sellerCenter.deleteProductFailed'))
        );
      }
    } catch {
      setErrorMsg(isEn ? 'Cannot connect to server.' : 'Lỗi kết nối máy chủ.');
    } finally {
      setDeletingProductId(null);
    }
  };

  // Handle Add Codes
  const handleAddCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !rawCodesText.trim()) return;
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seller/products/${selectedProductId}/codes`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ codes: rawCodesText }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddCodesModal(false);
        setRawCodesText('');
        setSuccessMsg(data.message);
        fetchCodes(selectedProductId);
        fetchProducts();
      } else {
        setErrorMsg(data.error || (isEn ? 'Restock failed.' : 'Nạp mã thất bại.'));
      }
    } catch {
      setErrorMsg(isEn ? 'Cannot connect to server.' : 'Lỗi kết nối máy chủ.');
    }
  };

  // Handle Reveal Code
  const handleRevealCode = async (codeId: string) => {
    try {
      const res = await fetch(`/api/seller/codes/${codeId}/reveal`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setRevealedCode({ id: codeId, code: data.code });
      } else {
        setErrorMsg(data.error || (isEn ? 'Cannot view code.' : 'Không thể xem mã.'));
      }
    } catch {
      setErrorMsg(isEn ? 'Cannot connect to server.' : 'Lỗi kết nối máy chủ.');
    }
  };

  // Handle Delete Code
  const handleDeleteCode = async (codeId: string) => {
    if (!confirm(isEn ? 'Are you sure you want to remove this code from vault?' : 'Bạn có chắc chắn muốn xóa mã này khỏi kho?')) return;
    try {
      const res = await fetch(`/api/seller/codes/${codeId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        if (selectedProductId) fetchCodes(selectedProductId);
        fetchProducts();
      } else {
        setErrorMsg(data.error || (isEn ? 'Failed to delete code.' : 'Xóa mã thất bại.'));
      }
    } catch {
      setErrorMsg(isEn ? 'Cannot connect to server.' : 'Lỗi kết nối máy chủ.');
    }
  };

  // Handle Resolve Order Dispute
  const handleResolveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingOrder) return;
    try {
      const res = await fetch(`/api/seller/orders/${resolvingOrder.id}/resolve-report`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          resolution_type: resolveType,
          note: resolveNote,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResolvingOrder(null);
        setResolveNote('');
        setSuccessMsg(data.message);
        fetchOrders();
        fetchSellerInfo();
      } else {
        setErrorMsg(data.error || (isEn ? 'Action failed.' : 'Xử lý thất bại.'));
      }
    } catch {
      setErrorMsg(isEn ? 'Cannot connect to server.' : 'Lỗi kết nối máy chủ.');
    }
  };

  // Fetch Disputes (§B)
  const fetchDisputes = async () => {
    setLoadingDisputes(true);
    try {
      const url = disputeFilter ? `/api/seller/disputes?status=${disputeFilter}` : '/api/seller/disputes';
      const res = await fetch(url, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setDisputes(data.disputes || []);
        setUnresolvedDisputeCount(data.unresolved_count || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDisputes(false);
    }
  };

  // Handle Respond Dispute (§B)
  const handleRespondDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respondingDispute || !disputeResponseMsg.trim()) return;
    setIsSubmittingDisputeResp(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seller/disputes/${respondingDispute.id}/respond`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          message: disputeResponseMsg.trim(),
          replacement_code: disputeReplacementCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRespondingDispute(null);
        setDisputeResponseMsg('');
        setDisputeReplacementCode('');
        setSuccessMsg(data.message || (isEn ? 'Dispute response submitted successfully!' : 'Đã gửi phản hồi khiếu nại thành công!'));
        fetchDisputes();
      } else {
        setErrorMsg(data.error || (isEn ? 'Response failed.' : 'Phản hồi thất bại.'));
      }
    } catch {
      setErrorMsg(isEn ? 'Cannot connect to server.' : 'Lỗi kết nối máy chủ.');
    } finally {
      setIsSubmittingDisputeResp(false);
    }
  };

  // Handle Add Subaccount
  const handleAddSubaccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubEmail.trim()) return;
    try {
      const res = await fetch('/api/seller/subaccounts', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          email: newSubEmail,
          role: newSubRole,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewSubEmail('');
        setSuccessMsg(data.message);
        fetchSubaccounts();
      } else {
        setErrorMsg(data.error || (isEn ? 'Failed to add staff account.' : 'Thêm tài khoản phụ thất bại.'));
      }
    } catch {
      setErrorMsg(isEn ? 'Cannot connect to server.' : 'Lỗi kết nối máy chủ.');
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setIsCreatingKey(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/seller/api-keys', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: newKeyName.trim(), scope: newKeyScope }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedRawKeyData({ rawKey: data.raw_key, name: data.key.name });
        setShowCreateKeyModal(false);
        setNewKeyName('');
        setNewKeyScope('FULL');
        fetchApiKeys();
      } else {
        setErrorMsg(data.error || t('common.error', 'Có lỗi xảy ra, vui lòng thử lại.'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('common.error', 'Có lỗi xảy ra, vui lòng thử lại.'));
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string, keyName: string) => {
    if (!confirm(t('sellerApiKeys.revokeConfirm', 'Bạn có chắc chắn muốn thu hồi khóa này? Mọi hệ thống dùng khóa này sẽ bị từ chối ngay lập tức.'))) return;
    try {
      const res = await fetch(`/api/seller/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || t('common.success', 'Thành công!'));
        fetchApiKeys();
      } else {
        setErrorMsg(data.error || t('common.error', 'Có lỗi xảy ra, vui lòng thử lại.'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('common.error', 'Có lỗi xảy ra, vui lòng thử lại.'));
    }
  };

  const handleRotateApiKey = async (keyId: string, keyName: string) => {
    if (!confirm(t('sellerApiKeys.rotateConfirm', 'Bạn có chắc chắn muốn xoay khóa này? Khóa cũ sẽ bị hủy ngay lập tức và cấp khóa mới.'))) return;
    try {
      const res = await fetch(`/api/seller/api-keys/${keyId}/rotate`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedRawKeyData({ rawKey: data.raw_key, name: data.key.name });
        fetchApiKeys();
      } else {
        setErrorMsg(data.error || t('common.error', 'Có lỗi xảy ra, vui lòng thử lại.'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('common.error', 'Có lỗi xảy ra, vui lòng thử lại.'));
    }
  };

  const handleRevokeApp = async (authId: string, appName: string) => {
    if (!confirm(t('sellerApiKeys.revokeAppConfirm', 'Bạn có chắc chắn muốn thu hồi quyền của ứng dụng này?'))) return;
    try {
      const res = await fetch(`/api/seller/apps/${authId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || t('common.success', 'Thành công!'));
        fetchApps();
      } else {
        setErrorMsg(data.error || t('common.error', 'Có lỗi xảy ra, vui lòng thử lại.'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('common.error', 'Có lỗi xảy ra, vui lòng thử lại.'));
    }
  };

  // 1. Chưa đăng nhập
  if (!currentUser) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 text-amber-500">
          <Store className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">{isEn ? getActiveBrandIdentity().sellerPortalName : `Trung Tâm Người Bán ${getActiveBrandIdentity().brandName}`}</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          {isEn ? 'Please log in with a member account to register a store and manage your business.' : 'Vui lòng đăng nhập tài khoản thành viên để đăng ký mở gian hàng và quản lý kinh doanh.'}
        </p>
        <button
          onClick={onOpenLogin}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/20"
        >
          {isEn ? 'Log In Now' : 'Đăng Nhập Ngay'}
        </button>
      </div>
    );
  }

  // 2. Đang tải - Skeleton Loader Dashboard mượt mà thay vì spinner trơ trọi
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-6 px-4 space-y-6 animate-pulse">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
            <div className="h-4 w-72 bg-slate-100 dark:bg-slate-800/60 rounded-md"></div>
          </div>
          <div className="h-9 w-32 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 rounded-2xl bg-card border border-border/60 space-y-3">
              <div className="flex justify-between">
                <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800"></div>
              </div>
              <div className="h-7 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
              <div className="h-3 w-36 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
            </div>
          ))}
        </div>
        <div className="p-6 rounded-2xl bg-card border border-border/60 space-y-4">
          <div className="h-5 w-40 bg-slate-200 dark:bg-slate-800 rounded"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 w-full bg-slate-100 dark:bg-slate-800/50 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 3. Chưa có gian hàng -> Form Đăng Ký (§3.1)
  if (!sellerData) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-500 text-xs font-semibold mb-3 border border-amber-500/20">
            <Sparkles className="w-4 h-4" /> {t('sellerProductEditor.regBadge')}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{isEn ? 'Register Store & Start Selling' : 'Đăng Ký Mở Gian Hàng Kinh Doanh'}</h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-xl mx-auto">
            {t('sellerProductEditor.regSubtitle')}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5">{isEn ? 'Store Name *' : 'Tên Gian Hàng *'}</label>
              <input
                type="text"
                required
                value={regName}
                onChange={(e) => {
                  setRegName(e.target.value);
                  if (!regSlug) {
                    setRegSlug(
                      e.target.value
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-+|-+$/g, '')
                    );
                  }
                }}
                placeholder={isEn ? "E.g. Nova Lifestyle Official Store" : "Ví dụ: Gian Hàng Chính Hãng Nova Lifestyle"}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">{isEn ? 'Store URL (Slug) *' : 'Đường Dẫn Gian Hàng (Slug) *'}</label>
              <div className="flex items-center">
                <span className="px-3 py-2.5 bg-muted text-muted-foreground text-xs rounded-l-xl border border-r-0 border-border select-none whitespace-nowrap shrink-0">
                  /gian-hang/
                </span>
                <input
                  type="text"
                  required
                  value={regSlug}
                  onChange={(e) => setRegSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="nova-lifestyle-store"
                  className="w-full px-3.5 py-2.5 rounded-r-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5">{isEn ? 'Phone / WhatsApp / Zalo' : 'Số Điện Thoại / Zalo'}</label>
              <input
                type="text"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                placeholder="0912345678"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">{isEn ? 'Bank Name (For Settlement)' : 'Ngân Hàng (Dùng đối soát)'}</label>
              <input
                type="text"
                value={regBankName}
                onChange={(e) => setRegBankName(e.target.value)}
                placeholder={isEn ? "MBBank / Vietcombank / Global Bank" : "MBBank / Vietcombank"}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">{isEn ? 'Bank Account Number' : 'Số Tài Khoản'}</label>
              <input
                type="text"
                value={regBankAccount}
                onChange={(e) => setRegBankAccount(e.target.value)}
                placeholder="0123456789"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5">{isEn ? 'Customer Support Hours' : 'Giờ Hỗ Trợ Khách Hàng'}</label>
            <input
              type="text"
              value={regSupportHours}
              onChange={(e) => setRegSupportHours(e.target.value)}
              placeholder={isEn ? "08:00 - 22:00 Daily" : "08:00 - 22:00 hàng ngày"}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5">{isEn ? 'Store Description' : 'Mô Tả Giới Thiệu Gian Hàng'}</label>
            <textarea
              rows={3}
              value={regDescription}
              onChange={(e) => setRegDescription(e.target.value)}
              placeholder={isEn ? "Official multi-category store offering authentic products, fast fulfillment & dedicated support..." : "Gian hàng phân phối sản phẩm chính hãng đa ngành, đóng gói chuẩn mực và hỗ trợ tận tâm..."}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5">{isEn ? 'Warranty Policy' : 'Chính Sách Bảo Hành'}</label>
              <textarea
                rows={3}
                value={regWarranty}
                onChange={(e) => setRegWarranty(e.target.value)}
                placeholder={isEn ? "E.g. 7-day 1-to-1 replacement if defective, official manufacturer warranty..." : "Ví dụ: Bảo hành chính hãng, hỗ trợ đổi mới 1 đổi 1 trong 7 ngày nếu lỗi nhà sản xuất..."}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">{isEn ? 'Refund Policy' : 'Chính Sách Hoàn Tiền'}</label>
              <textarea
                rows={3}
                value={regRefund}
                onChange={(e) => setRegRefund(e.target.value)}
                placeholder={isEn ? "E.g. 100% refund under 168h buyer protection if item does not match description..." : "Ví dụ: Hoàn tiền 100% qua bảo chứng sàn 168h nếu sản phẩm không đúng mô tả..."}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmittingReg}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-95 transition-all shadow-md shadow-primary/20 disabled:opacity-50"
          >
            {isSubmittingReg ? (isEn ? 'Submitting...' : 'Đang gửi hồ sơ...') : (isEn ? 'Submit Store Application' : 'Gửi Hồ Sơ Đăng Ký Mở Gian Hàng')}
          </button>
        </form>
      </div>
    );
  }

  // 4. Gian hàng đang chờ duyệt hoặc bị từ chối
  if (sellerData.status === 'PENDING') {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">{isEn ? 'Application Pending Review' : 'Hồ Sơ Đang Chờ Xét Duyệt'}</h2>
        <p className="text-muted-foreground text-sm mb-6">
          {isEn ? <>Store <strong>{sellerData.name}</strong> (/gian-hang/{sellerData.slug}) has been received and is queued for verification by Mall Admins.</> : <>{isEn ? <>Store <strong>{sellerData.name}</strong> (/gian-hang/{sellerData.slug}) has been received and is queued for verification by Mall Admins.</> : <>{isEn ? <>Store <strong>{sellerData.name}</strong> (/gian-hang/{sellerData.slug}) has been received and is queued for verification by Mall Admins.</> : <>Gian hàng <strong>{sellerData.name}</strong> (/gian-hang/{sellerData.slug}) đã được tiếp nhận và đang trong hàng chờ thẩm định của Quản trị viên Pine Universal Mall.</>}</>}</>}
        </p>
        {sellerData.request_info_note && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs text-left mb-6">
            <strong>{isEn ? 'Additional info requested by Admin:' : 'Yêu cầu bổ sung từ Quản trị viên:'}</strong> {sellerData.request_info_note}
          </div>
        )}
        <button onClick={fetchSellerInfo} className="px-5 py-2 rounded-xl bg-muted hover:bg-muted/80 text-sm font-semibold">
          {isEn ? 'Refresh Status' : 'Làm Mới Trạng Thái'}
        </button>
      </div>
    );
  }

  if (sellerData.status === 'REJECTED') {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">{isEn ? 'Application Rejected' : 'Hồ Sơ Bị Từ Chối'}</h2>
        <p className="text-muted-foreground text-sm mb-4">
          {isEn ? <>Store <strong>{sellerData.name}</strong> does not meet approval criteria.</> : <>{isEn ? <>Store <strong>{sellerData.name}</strong> does not meet approval criteria.</> : <>{isEn ? <>Store <strong>{sellerData.name}</strong> does not meet approval criteria.</> : <>Gian hàng <strong>{sellerData.name}</strong> chưa đủ điều kiện phê duyệt.</>}</>}</>}
        </p>
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs text-left mb-6">
          <strong>{isEn ? 'Reason for rejection:' : 'Lý do từ chối:'}</strong> {sellerData.reject_reason || (isEn ? 'Does not meet platform quality standards.' : 'Không đáp ứng tiêu chuẩn sàn.')}
        </div>
        <button
          onClick={() => setSellerData(null)}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-md"
        >
          {isEn ? 'Submit New Application' : 'Nộp Lại Hồ Sơ Mới'}
        </button>
      </div>
    );
  }

  // 5. Bảng điều khiển người bán chính (TRIAL / ACTIVE)
  return (
    <div className={portalMode ? 'w-full max-w-[1600px] mx-auto' : 'max-w-[1600px] 2xl:max-w-[1900px] mx-auto px-3 sm:px-4 py-6'}>
      {/* Header Profile Bar (Ẩn trong portalMode vì SellerPortalTopbar đã hiển thị gọn chuẩn Rule 9) */}
      {!portalMode && (
      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-xl shrink-0">
              {sellerData.avatar_url ? (
                <img src={sellerData.avatar_url} alt="" className="w-full h-full object-cover rounded-2xl" />
              ) : (
                sellerData.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">{sellerData.name}</h1>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    sellerData.status === 'ACTIVE'
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  }`}
                >
                  {sellerData.status === 'ACTIVE' ? (isEn ? 'OFFICIAL (ACTIVE)' : 'CHÍNH THỨC (ACTIVE)') : (isEn ? 'PROBATION (TRIAL)' : 'THỬ VIỆC (TRIAL)')}
                </span>
                {sellerData.is_vacation === 1 && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                    <PauseCircle className="w-3 h-3" /> {isEn ? 'On Vacation' : 'Đang Nghỉ Bán'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                <span>
                  {isEn ? 'URL:' : 'Đường dẫn:'} <a href={`/gian-hang/${sellerData.slug}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">/gian-hang/{sellerData.slug}</a>
                </span>
                <span>•</span>
                <span>{isEn ? 'Reputation:' : 'Uy tín:'} <strong className="text-foreground">{sellerData.reputation_score || 100} {isEn ? 'pts' : 'điểm'}</strong></span>
                <span>•</span>
                <span>{isEn ? 'Support Hours:' : 'Giờ hỗ trợ:'} {sellerData.support_hours}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleVacation}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                sellerData.is_vacation
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-muted hover:bg-muted/80 text-foreground border-border'
              }`}
            >
              {sellerData.is_vacation ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
              {sellerData.is_vacation ? (isEn ? 'Resume Selling' : 'Mở Bán Lại') : (isEn ? 'Vacation Mode' : 'Nghỉ Bán 1 Chạm')}
            </button>
            <a
              href={`/gian-hang/${sellerData.slug}`}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Store className="w-4 h-4" /> {isEn ? 'View Store' : 'Xem Gian Hàng'}
            </a>
          </div>
        </div>
      </div>
      )}

      {/* Compact Vacation / Status quick bar in portalMode on Dashboard */}
      {portalMode && activeTab === 'dashboard' && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300 flex-wrap">
            <span>
              {t('sellerPortal.dashboardStrip.reputation')}: <strong className="text-slate-900 dark:text-white">{sellerData.reputation_score || 100}</strong>
            </span>
            <span>•</span>
            <span>{t('sellerPortal.dashboardStrip.supportHours')}: <strong className="text-slate-900 dark:text-white">{sellerData.support_hours}</strong></span>
            {sellerData.is_vacation === 1 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                {t('sellerPortal.dashboardStrip.onVacation')}
              </span>
            )}
          </div>
          {subRole === 'OWNER' && (
            <button
              type="button"
              onClick={handleToggleVacation}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer ${
                sellerData.is_vacation
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              {sellerData.is_vacation ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
              <span>{sellerData.is_vacation ? t('sellerPortal.dashboardStrip.resumeSelling') : t('sellerPortal.dashboardStrip.vacationMode')}</span>
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      {errorMsg && (
        <div className="mb-4 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')}><X className="w-4 h-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Navigation Tabs (Ẩn khi chạy bên trong SellerPortalApp có Sidebar dọc) */}
      {!portalMode && (
      <div className="flex items-center gap-1 sm:gap-1.5 2xl:gap-2 overflow-x-auto 2xl:overflow-x-visible pb-2 mb-6 border-b border-border/80">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-2 sm:px-2.5 2xl:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'dashboard' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 shrink-0" /> {isEn ? 'Overview' : 'Tổng Quan'}
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-2 sm:px-2.5 2xl:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'products' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <Package className="w-3.5 h-3.5 shrink-0" /> {isEn ? `Products (${stats?.total_products || products.length})` : `Sản Phẩm (${stats?.total_products || products.length})`}
        </button>
        <button
          onClick={() => setActiveTab('vouchers')}
          className={`px-2 sm:px-2.5 2xl:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'vouchers' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <Ticket className="w-3.5 h-3.5 shrink-0" /> {t('sellerPortal.sidebar.vouchers')}
        </button>
        <button
          onClick={() => setActiveTab('codes')}
          className={`px-2 sm:px-2.5 2xl:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'codes' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5 shrink-0" /> {isEn ? 'Vault & Restock' : 'Kho Mã & Nạp Kho'}
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-2 sm:px-2.5 2xl:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'orders' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5 shrink-0" /> {isEn ? 'Sales Orders' : 'Đơn Hàng Bán'}
          {(stats?.reported_orders_count || 0) > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-destructive text-white text-[10px]">
              {stats.reported_orders_count}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab('disputes');
            fetchDisputes();
          }}
          className={`px-2 sm:px-2.5 2xl:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'disputes' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> {isEn ? 'Platform Disputes' : 'Khiếu Nại Sàn'}
          {unresolvedDisputeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-destructive text-white text-[10px] font-bold">
              {unresolvedDisputeCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('finance')}
          className={`px-2 sm:px-2.5 2xl:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'finance' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <Coins className="w-3.5 h-3.5 shrink-0" /> {isEn ? 'Finance & Payouts' : 'Tài Chính & Rút Tiền'}
        </button>
        <button
          onClick={() => setActiveTab('sepay')}
          className={`px-2 sm:px-2.5 2xl:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'sepay' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <QrCode className="w-3.5 h-3.5 shrink-0" /> {t('sellerSepay.tabTitle')}
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-2 sm:px-2.5 2xl:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'settings' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <Settings className="w-3.5 h-3.5 shrink-0" /> {isEn ? 'Settings & Staff' : 'Cài Đặt & Tài Khoản Phụ'}
        </button>
        <button
          onClick={() => {
            setActiveTab('api_keys');
            fetchApiKeys();
            fetchApps();
          }}
          className={`px-2 sm:px-2.5 2xl:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'api_keys' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <Code2 className="w-3.5 h-3.5 shrink-0" /> {isEn ? 'API Keys & Integrations' : 'Khóa API & Tích Hợp'}
        </button>
        <button
          onClick={() => setActiveTab('affiliate')}
          className={`px-2 sm:px-2.5 2xl:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'affiliate' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <Share2 className="w-3.5 h-3.5 shrink-0" /> {t('sellerAffiliate.tabTitle', 'Bán Lại & Gán Shop')}
        </button>
      </div>
      )}

      {/* Tab 1: Dashboard (§4) — Executive Merchant Overview */}
      {activeTab === 'dashboard' && stats && (
        <div className="space-y-5">
          {/* 4 KPI Cards (Dynamic formatCore) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/40 transition">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs text-muted-foreground font-semibold">{t('sellerStoreStudio.kpiTodayRevenue')}</span>
                <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                  <Coins className="w-4 h-4" />
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                {formatCore(stats.today_revenue_core, language)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/40 transition">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs text-muted-foreground font-semibold">{t('sellerStoreStudio.kpi30DayRevenue')}</span>
                <span className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-4 h-4" />
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                {formatCore(stats.month_revenue_core, language)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/40 transition">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs text-muted-foreground font-semibold">{t('sellerStoreStudio.kpiPendingBalance')}</span>
                <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-500 tracking-tight">
                {formatCore(stats.pending_balance_core, language)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/40 transition">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs text-muted-foreground font-semibold">{t('sellerStoreStudio.kpiReputation')}</span>
                <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4" />
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-primary tracking-tight">
                {stats.reputation_score} <span className="text-xs font-medium text-muted-foreground">/ 100</span>
              </div>
            </div>
          </div>

          {/* Store Readiness Checklist & 1-Click Quick Actions */}
          <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span>{t('sellerStoreStudio.readinessTitle')}</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('sellerStoreStudio.readinessSubtitle')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('products');
                    handleOpenCreateProductModal();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('sellerStoreStudio.quickAddProduct')}</span>
                </button>
                {subRole === 'OWNER' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-bold transition cursor-pointer"
                  >
                    <Palette className="w-3.5 h-3.5 text-primary" />
                    <span>{t('sellerStoreStudio.quickDecorateStore')}</span>
                  </button>
                )}
                <a
                  href={isEn ? `/en/gian-hang/${sellerData.slug}` : `/gian-hang/${sellerData.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{t('sellerStoreStudio.openPublicStore')}</span>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              {[
                {
                  done: Boolean(sellerData.avatar_url || sellerData.cover_url || sellerData.description),
                  label: t('sellerStoreStudio.checkBranding'),
                  tab: 'settings' as SellerPortalTabId,
                },
                {
                  done: Number(stats.total_products || 0) > 0,
                  label: t('sellerStoreStudio.checkProducts', { count: Number(stats.total_products || 0) }),
                  tab: 'products' as SellerPortalTabId,
                },
                {
                  done: Number(stats.low_stock_products_count || 0) === 0 && Number(stats.total_products || 0) > 0,
                  label: t('sellerStoreStudio.checkStock'),
                  tab: 'codes' as SellerPortalTabId,
                },
                {
                  done: Boolean(sepaySummary?.is_enabled && !sepaySummary?.admin_locked),
                  label: t('sellerStoreStudio.checkSepay'),
                  tab: 'sepay' as SellerPortalTabId,
                },
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveTab(item.tab)}
                  className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                    item.done
                      ? 'bg-emerald-500/5 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                      : 'bg-muted/40 border-border hover:border-primary/40 text-foreground'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 font-semibold truncate">
                    <CheckCircle2 className={`w-4 h-4 shrink-0 ${item.done ? 'text-emerald-500' : 'text-muted-foreground/40'}`} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                </button>
              ))}
            </div>
          </div>

          {/* Warnings & Alerts */}
          {(stats.reported_orders_count > 0 || stats.low_stock_products_count > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stats.reported_orders_count > 0 && (
                <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">{isEn ? `${stats.reported_orders_count} reported order(s) need attention!` : `Có ${stats.reported_orders_count} đơn hàng báo lỗi cần xử lý!`}</div>
                      <div className="text-[11px] opacity-80">{isEn ? 'Please review and issue a replacement code or refund Core to buyer.' : 'Vui lòng kiểm tra và đổi mã mới hoặc hoàn Core cho khách.'}</div>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab('orders')} className="px-3 py-1.5 rounded-lg bg-destructive text-white text-xs font-semibold shrink-0">
                    {isEn ? 'Resolve Now' : 'Xử Lý Ngay'}
                  </button>
                </div>
              )}
              {stats.low_stock_products_count > 0 && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">{isEn ? `${stats.low_stock_products_count} product(s) running low on stock!` : `Có ${stats.low_stock_products_count} sản phẩm sắp hết kho!`}</div>
                      <div className="text-[11px] opacity-80">{isEn ? 'Deposit more codes to prevent items from being hidden from customers.' : 'Nạp thêm mã để tránh bị tự động ẩn ngoài web khách.'}</div>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab('codes')} className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold shrink-0">
                    {isEn ? 'Restock' : 'Nạp Kho'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Trial Notice */}
          {sellerData.status === 'TRIAL' && (
            <div className="p-4 rounded-2xl bg-muted/60 border border-border text-xs leading-relaxed space-y-1">
              <div className="font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" /> {isEn ? 'Probation (TRIAL) Guidelines:' : 'Quy định giai đoạn thử việc (TRIAL):'}
              </div>
              <p className="text-muted-foreground">
                {isEn ? <>• Stores in probation may list up to <strong>{sellerData.trial_product_limit || 5} products</strong>.</> : <>• Gian hàng đang trong giai đoạn thử việc được đăng tối đa <strong>{sellerData.trial_product_limit || 5} sản phẩm</strong>.</>}
              </p>
              <p className="text-muted-foreground">
                {isEn ? <>• Maximum price per product must not exceed <strong>{sellerData.trial_order_max || 200} Core</strong>.</> : <>• Giá bán tối đa mỗi sản phẩm không vượt quá <strong>{sellerData.trial_order_max || 200} Core</strong>.</>}
              </p>
              <p className="text-muted-foreground">
                {isEn ? '• All new products or price updates require Admin approval (PENDING_REVIEW) before going live.' : '• Mọi sản phẩm mới hoặc khi đổi giá cần qua Quản trị viên duyệt (PENDING_REVIEW) trước khi mở bán công khai.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Multi-Industry Products & 10-Photo Catalog */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 id="seller-products-heading" className="text-base font-extrabold flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                <span>{t('sellerProductEditor.catalogHeading', { count: products.length })}</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('sellerProductEditor.catalogSubheading')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('vouchers')}
                className="px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Ticket className="w-3.5 h-3.5 text-primary" />
                <span>{t('sellerPortal.sidebar.vouchers')}</span>
              </button>
              <button
                type="button"
                onClick={handleOpenCreateProductModal}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold flex items-center gap-1.5 shadow-sm hover:opacity-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t('sellerProductEditor.addNewProductBtn')}</span>
              </button>
            </div>
          </div>

          {/* Search, Collection & Status Filter Toolbar */}
          {products.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 bg-card border border-border rounded-2xl p-3">
              <div className="sm:col-span-5 relative">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={t('sellerProductEditor.searchProductsPlaceholder')}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-background text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div className="sm:col-span-4">
                <select
                  value={productCollectionFilter}
                  onChange={(e) => setProductCollectionFilter(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-border bg-background text-xs font-medium focus:outline-none focus:border-primary"
                >
                  <option value="">{t('sellerProductEditor.allCollectionsOption')}</option>
                  {shopCategories.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <select
                  value={productStatusFilter}
                  onChange={(e) => setProductStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-1.5 rounded-xl border border-border bg-background text-xs font-medium focus:outline-none focus:border-primary"
                >
                  <option value="ALL">{t('sellerProductEditor.filterAllStatuses')}</option>
                  <option value="SELLING">{t('sellerProductEditor.filterSelling')}</option>
                  <option value="PAUSED">{t('sellerProductEditor.filterPaused')}</option>
                  <option value="OUT_OF_STOCK">{t('sellerProductEditor.filterOutOfStock')}</option>
                </select>
              </div>
            </div>
          )}

          {loadingProducts ? (
            <div className="py-12 text-center text-muted-foreground">{isEn ? 'Loading products...' : 'Đang tải sản phẩm...'}</div>
          ) : products.length === 0 ? (
            <div className="py-12 text-center bg-card border border-border rounded-2xl px-4">
              <Package className="w-12 h-12 text-muted-foreground/40 mx-auto mb-2" />
              <div className="text-sm font-bold">{t('sellerProductEditor.emptyCatalogTitle')}</div>
              <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-md mx-auto">
                {t('sellerProductEditor.emptyCatalogDesc')}
              </p>
              <button
                type="button"
                onClick={handleOpenCreateProductModal}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {t('sellerProductEditor.addNewProductBtn')}
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-10 text-center bg-card border border-border rounded-2xl text-xs text-muted-foreground">
              {t('sellerProductEditor.noFilterMatch')}
            </div>
          ) : (
            <div
              role="region"
              aria-labelledby="seller-products-heading"
              tabIndex={0}
              className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm"
            >
              {/* Rule 9 Single-Screen Table: 34 + 14 + 13 + 13 + 26 = 100% */}
              <table className="table-fixed w-full text-xs text-left">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-3 w-[34%]">{t('sellerProductEditor.colProductIndustry')}</th>
                    <th className="p-3 w-[14%] text-right">{t('sellerProductEditor.colPrice')}</th>
                    <th className="p-3 w-[13%] text-center">{t('sellerProductEditor.colStock')}</th>
                    <th className="p-3 w-[13%] text-center">{t('sellerProductEditor.colStatus')}</th>
                    <th className="p-3 w-[26%] text-center">{t('sellerProductEditor.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredProducts.map((p) => {
                    const imgList = Array.isArray(p.images) ? p.images : parseSafeJsonArray<string>(p.images_json);
                    const photoCount = Math.max(imgList.length, p.cover_url ? 1 : 0);
                    const varList = Array.isArray(p.variants) ? p.variants : parseSafeJsonArray<any>(p.variants_json);
                    const fMode = String(
                      p.fulfillment_mode || (String(p.product_type).toLowerCase() === 'physical' ? 'SHIPPING' : 'AUTO_VAULT')
                    ).toUpperCase();
                    const usesDirectQty = fMode === 'SHIPPING' || fMode === 'MANUAL_SERVICE';
                    const displayStock = usesDirectQty
                      ? Math.max(0, Number(p.stock_quantity ?? 0))
                      : Math.max(0, Number(p.in_stock_count ?? 0));
                    const isPaused = Number(p.is_paused || 0) === 1;
                    const isFeatured = Number(p.is_featured || 0) === 1;

                    return (
                      <tr key={p.id} className={`hover:bg-muted/30 ${isPaused ? 'opacity-70' : ''}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-border bg-muted">
                              <img
                                src={resolveProductCoverImage(p)}
                                alt={p.name || ''}
                                onError={(e) => {
                                  const el = e.currentTarget;
                                  if (!el.dataset.fb) {
                                    el.dataset.fb = '1';
                                    el.src = PHYSICAL_DEFAULT_IMAGE_URL;
                                  }
                                }}
                                className="w-full h-full object-cover"
                              />
                              <span
                                className="absolute bottom-0 right-0 px-1 py-0.2 bg-black/75 text-white text-[8px] font-bold rounded-tl"
                                title={t('sellerProductEditor.photoCountTooltip', { count: photoCount })}
                              >
                                {photoCount}/10
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1 min-w-0">
                                {isFeatured && (
                                  <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" aria-hidden="true" />
                                )}
                                <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                                  fMode === 'SHIPPING'
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                    : fMode === 'MANUAL_SERVICE'
                                      ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                                      : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                                }`}>
                                  {fMode === 'SHIPPING'
                                    ? t('sellerProductEditor.modeBadgeShipping')
                                    : fMode === 'MANUAL_SERVICE'
                                      ? t('sellerProductEditor.modeBadgeService')
                                      : t('sellerProductEditor.modeBadgeAuto')}
                                </span>
                                {p.is_affiliate === 1 && (
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                                    {isEn ? 'Reseller' : 'Gán Shop'}
                                  </span>
                                )}
                                <span className="font-bold truncate" title={p.name}>{p.name}</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                                <span className="truncate">{p.category_name || p.game_name || t('sellerProductEditor.generalCategory')}</span>
                                {p.shop_category && (
                                  <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary text-[9px] font-semibold shrink-0">
                                    {p.shop_category}
                                  </span>
                                )}
                                {p.sku && (
                                  <span className="font-mono text-[10px] opacity-80 shrink-0">SKU:{p.sku}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-right font-bold text-foreground">
                          <div>{formatCore(p.price_core, language)}</div>
                          {p.original_price_core && (
                            <div className="text-[10px] text-muted-foreground line-through">
                              {formatCore(p.original_price_core, language)}
                            </div>
                          )}
                          {varList.length > 0 && (
                            <div className="text-[10px] text-primary font-semibold">
                              {t('sellerProductEditor.variantCountBadge', { count: varList.length })}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                            displayStock > (p.low_stock_threshold || 2)
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : displayStock > 0
                              ? 'bg-amber-500/10 text-amber-500'
                              : 'bg-destructive/10 text-destructive'
                          }`}>
                            {displayStock > 0
                              ? t('sellerCenter.physicalStockBadge', { count: displayStock })
                              : t('sellerCenter.physicalOutOfStockBadge')}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p.status === 'APPROVED'
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                : p.status === 'PENDING_REVIEW'
                                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                : 'bg-destructive/10 text-destructive border border-destructive/20'
                            }`}>
                              {p.status === 'APPROVED' ? (isEn ? 'Approved' : 'Đã Duyệt') : p.status === 'PENDING_REVIEW' ? (isEn ? 'Pending' : 'Chờ Duyệt') : (isEn ? 'Rejected' : 'Từ Chối')}
                            </span>
                            {isPaused && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-500/15 text-slate-500">
                                {t('sellerProductEditor.pausedBadge')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {p.is_affiliate !== 1 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleFeaturedProduct(p)}
                                  className={`p-1 rounded-lg border text-[10px] cursor-pointer ${
                                    isFeatured
                                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-500'
                                      : 'border-border hover:bg-muted text-muted-foreground'
                                  }`}
                                  title={t('sellerProductEditor.pinFeaturedLabel')}
                                  aria-label={t('sellerProductEditor.pinFeaturedLabel')}
                                >
                                  <Star className={`w-3 h-3 ${isFeatured ? 'fill-current' : ''}`} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleTogglePauseProduct(p)}
                                  className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                                  title={isPaused ? t('sellerProductEditor.resumeProductBtn') : t('sellerProductEditor.pauseProductBtn')}
                                  aria-label={isPaused ? t('sellerProductEditor.resumeProductBtn') : t('sellerProductEditor.pauseProductBtn')}
                                >
                                  {isPaused ? <PlayCircle className="w-3 h-3 text-emerald-500" /> : <PauseCircle className="w-3 h-3" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateProduct(p)}
                                  className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                                  title={t('sellerProductEditor.duplicateBtn')}
                                  aria-label={t('sellerProductEditor.duplicateBtn')}
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </>
                            )}
                            {fMode === 'AUTO_VAULT' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedProductId(p.id);
                                  setActiveTab('codes');
                                }}
                                className="px-2 py-0.5 rounded-lg bg-muted hover:bg-muted/80 text-[10px] font-semibold whitespace-nowrap cursor-pointer"
                              >
                                {isEn ? 'Vault' : 'Kho Mã'}
                              </button>
                            )}
                            {p.is_affiliate !== 1 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setResellModalProduct(p)}
                                  className="px-1.5 py-0.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-semibold flex items-center gap-0.5 whitespace-nowrap cursor-pointer"
                                  title={t('sellerAffiliate.resellSettingsTitle', 'Cài đặt bán lại')}
                                >
                                  <Share2 className="w-2.5 h-2.5 shrink-0" />
                                  <span>{isEn ? 'Resell' : 'Bán Lại'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditProductModal(p)}
                                  className="px-1.5 py-0.5 rounded-lg border border-border hover:bg-muted text-foreground text-[10px] font-semibold flex items-center gap-0.5 whitespace-nowrap cursor-pointer"
                                  title={t('sellerCenter.editProductTitle')}
                                >
                                  <Edit2 className="w-2.5 h-2.5 shrink-0" />
                                  <span>{t('sellerCenter.editProductBtn')}</span>
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p)}
                              disabled={deletingProductId === p.id}
                              className="px-1.5 py-0.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-[10px] font-semibold flex items-center gap-0.5 whitespace-nowrap disabled:opacity-50 cursor-pointer"
                              title={t('sellerCenter.deleteProductBtn')}
                              aria-label={t('sellerCenter.deleteProductBtn')}
                            >
                              <Trash2 className="w-2.5 h-2.5 shrink-0" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2b: Shop Vouchers & Custom Storefront Collections */}
      {activeTab === 'vouchers' && (
        <SellerVouchersManager
          seller={sellerData}
          getHeaders={getHeaders}
          onSellerUpdated={(nextSeller) => setSellerData(nextSeller)}
          onNotify={(msg) => setSuccessMsg(msg)}
        />
      )}

      {/* Tab 3: Codes & Restock (§5.2) */}
      {activeTab === 'codes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold whitespace-nowrap">{isEn ? 'Select Product:' : 'Chọn Sản Phẩm:'}</label>
              <select
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  fetchCodes(e.target.value);
                }}
                className="px-3 py-1.5 rounded-xl border border-border bg-background text-xs font-medium focus:outline-none focus:border-primary max-w-xs"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({isEn ? `Stock: ${p.in_stock_count}` : `Còn ${p.in_stock_count}`})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setShowAddCodesModal(true)}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" /> {isEn ? 'Add Codes to Vault' : 'Nạp Thêm Mã Vào Kho'}
            </button>
          </div>

          {loadingCodes ? (
            <div className="py-12 text-center text-muted-foreground">{isEn ? 'Loading codes...' : 'Đang tải danh sách mã...'}</div>
          ) : codes.length === 0 ? (
            <div className="py-12 text-center bg-card border border-border rounded-2xl">
              <KeyRound className="w-12 h-12 text-muted-foreground/40 mx-auto mb-2" />
              <div className="text-sm font-semibold">{isEn ? 'No codes in vault for this product' : 'Kho sản phẩm này đang trống'}</div>
              <p className="text-xs text-muted-foreground mt-1 mb-4">{isEn ? 'Deposit giftcode inventory to enable automated fulfillment.' : 'Nạp danh sách mã giftcode để bắt đầu bán tự động.'}</p>
              <button
                onClick={() => setShowAddCodesModal(true)}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
              >
                {isEn ? 'Deposit Codes Now' : 'Nạp Mã Ngay'}
              </button>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <table className="table-fixed w-full text-xs text-left">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-3 w-[45%]">{isEn ? 'Vault Code (Encrypted / Masked)' : 'Mã Kho (Mã Hóa / Che)'}</th>
                    <th className="p-3 w-[20%] text-center">{isEn ? 'Status' : 'Trạng Thái'}</th>
                    <th className="p-3 w-[20%] text-center">{isEn ? 'Batch' : 'Lô Nạp'}</th>
                    <th className="p-3 w-[15%] text-center">{isEn ? 'Actions' : 'Thao Tác'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {codes.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="p-3 font-mono">
                        {revealedCode && revealedCode.id === c.id ? (
                          <span className="font-bold text-primary select-all">{revealedCode.code}</span>
                        ) : (
                          <span className="text-muted-foreground tracking-widest">{c.masked_code}</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.status === 'IN_STOCK'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : c.status === 'SOLD'
                            ? 'bg-blue-500/10 text-blue-500'
                            : c.status === 'REPORTED'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {c.status === 'IN_STOCK' ? (isEn ? 'In Stock' : 'Chưa Bán') : c.status === 'SOLD' ? (isEn ? 'Sold' : 'Đã Bán') : c.status === 'REPORTED' ? (isEn ? 'Reported' : 'Báo Lỗi') : (isEn ? 'Reserved' : 'Đang Giữ Chỗ')}
                        </span>
                      </td>
                      <td className="p-3 text-center text-muted-foreground font-mono text-[10px]">
                        {c.batch_id}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleRevealCode(c.id)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground mr-1"
                          title={isEn ? "View unmasked code (Audit logged)" : "Xem mã nguyên vẹn (Ghi log kiểm toán)"}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {c.status === 'IN_STOCK' && (
                          <button
                            onClick={() => handleDeleteCode(c.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            title={isEn ? "Delete unsold code" : "Xóa mã chưa bán"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Orders, Shipping Tracking & Dispute Resolution (§6.2, §6.3) */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="seller-orders-heading" className="text-base font-bold">{isEn ? 'Sales Orders List' : 'Danh Sách Đơn Hàng Bán Ra'}</h2>
            <div className="flex items-center gap-2">
              <select
                value={orderFilter}
                onChange={(e) => setOrderFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-border bg-background text-xs font-medium focus:outline-none focus:border-primary"
              >
                <option value="">{isEn ? 'All Statuses' : 'Tất cả trạng thái'}</option>
                <option value="PAID">{isEn ? 'Paid / Processing (PAID)' : 'Đã Thanh Toán (PAID)'}</option>
                <option value="SHIPPING">{t('sellerProductEditor.orderStatusShipping')}</option>
                <option value="DELIVERED">{isEn ? 'Delivered (DELIVERED)' : 'Đã Giao (DELIVERED)'}</option>
                <option value="REPORTED">{isEn ? 'Reported / Disputed (REPORTED)' : 'Báo Lỗi / Khiếu Nại (REPORTED)'}</option>
                <option value="REFUNDED">{isEn ? 'Refunded (REFUNDED)' : 'Đã Hoàn Tiền (REFUNDED)'}</option>
              </select>
            </div>
          </div>

          {loadingOrders ? (
            <div className="py-12 text-center text-muted-foreground">{isEn ? 'Loading orders...' : 'Đang tải đơn hàng...'}</div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center bg-card border border-border rounded-2xl">
              <ShoppingBag className="w-12 h-12 text-muted-foreground/40 mx-auto mb-2" />
              <div className="text-sm font-semibold">{isEn ? 'No orders yet' : 'Chưa có đơn hàng nào'}</div>
              <p className="text-xs text-muted-foreground mt-1">{isEn ? 'Customer orders from the storefront will appear here.' : 'Các đơn hàng phát sinh từ web khách sẽ hiển thị tại đây.'}</p>
            </div>
          ) : (
            <div
              role="region"
              aria-labelledby="seller-orders-heading"
              tabIndex={0}
              className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm"
            >
              {/* Rule 9: 22 + 32 + 15 + 14 + 17 = 100% */}
              <table className="table-fixed w-full text-xs text-left">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-3 w-[22%]">{isEn ? 'Order Code & Date' : 'Mã Đơn & Ngày Mua'}</th>
                    <th className="p-3 w-[32%]">{isEn ? 'Product, Variant & Customer' : 'Sản Phẩm, Phân Loại & Khách'}</th>
                    <th className="p-3 w-[15%] text-right">{t('sellerProductEditor.colPrice')}</th>
                    <th className="p-3 w-[14%] text-center">{isEn ? 'Status' : 'Trạng Thái'}</th>
                    <th className="p-3 w-[17%] text-center">{isEn ? 'Actions' : 'Xử Lý'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/30">
                      <td className="p-3">
                        <div className="font-mono font-bold truncate" title={o.order_code}>{o.order_code}</div>
                        <div className="text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleString(isEn ? 'en-US' : 'vi-VN')}</div>
                        {o.tracking_code && (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono text-[10px] font-bold max-w-full truncate">
                            <Truck className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{o.shipping_carrier ? `${o.shipping_carrier}: ` : ''}{o.tracking_code}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 min-w-0">
                        <div className="font-bold truncate" title={o.product_name}>{o.product_name}</div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          {o.selected_variant && (
                            <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary text-[10px] font-semibold">
                              {o.selected_variant}
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground truncate">
                            {isEn ? 'Buyer:' : 'Khách:'} {o.buyer_name || o.buyer_member_id}
                          </span>
                        </div>
                        {o.buyer_note && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 truncate mt-0.5" title={o.buyer_note}>
                            {t('sellerProductEditor.buyerNotePrefix')}: {o.buyer_note}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-bold text-foreground">
                        <div>{formatCore(Number(o.price_core || 0), language)}</div>
                        {Number(o.voucher_discount_core || 0) > 0 && (
                          <div className="text-[10px] text-emerald-500 font-semibold">
                            -{formatCore(Number(o.voucher_discount_core), language)} ({o.voucher_code})
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          o.status === 'DELIVERED' || o.status === 'PAID'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : o.status === 'SHIPPING'
                            ? 'bg-sky-500/10 text-sky-500'
                            : o.status === 'REPORTED'
                            ? 'bg-destructive/10 text-destructive animate-pulse'
                            : o.status === 'REFUNDED'
                            ? 'bg-purple-500/10 text-purple-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {o.status === 'DELIVERED'
                            ? (isEn ? 'Delivered' : 'Đã Giao')
                            : o.status === 'SHIPPING'
                              ? t('sellerProductEditor.orderStatusShippingShort')
                              : o.status === 'REPORTED'
                                ? (isEn ? 'Reported' : 'Báo Lỗi')
                                : o.status === 'REFUNDED'
                                  ? (isEn ? 'Refunded' : 'Đã Hoàn Tiền')
                                  : o.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {o.status === 'REPORTED' && (
                            <button
                              type="button"
                              onClick={() => {
                                setResolvingOrder(o);
                                setResolveType('REPLACE_CODE');
                              }}
                              className="px-2 py-1 rounded-lg bg-destructive text-white text-[10px] font-bold shadow-sm cursor-pointer"
                            >
                              {isEn ? 'Resolve' : 'Xử Lý'}
                            </button>
                          )}
                          {o.status !== 'REFUNDED' && o.status !== 'EXPIRED' && (
                            <button
                              type="button"
                              onClick={() => {
                                setFulfillingOrder(o);
                                setShipCarrier(o.shipping_carrier || 'GHN');
                                setShipTrackingCode(o.tracking_code || '');
                                setShipFulfillmentNote(o.fulfillment_note || '');
                                setDeliveredContentText('');
                              }}
                              className="px-2 py-1 rounded-lg border border-border hover:bg-muted text-foreground text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Truck className="w-3 h-3 text-primary" />
                              <span>{t('sellerProductEditor.fulfillBtn')}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 4b: Quản Lý Khiếu Nại Sàn TMĐT (§B) */}
      {activeTab === 'disputes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-destructive" /> {isEn ? 'Platform Disputes & Arbitration' : 'Khiếu Nại & Tranh Chấp Sàn TMĐT'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isEn ? 'Orders under escrow hold reported by buyers requiring response or replacement code.' : 'Các đơn hàng đang trong thời hạn 168h giữ tiền bị người mua báo lỗi cần phản hồi hoặc cấp mã thay thế.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={disputeFilter}
                onChange={(e) => setDisputeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-border bg-card text-foreground text-xs font-semibold focus:outline-none"
              >
                <option value="">{isEn ? 'All Statuses' : 'Tất cả trạng thái'}</option>
                <option value="OPEN">{isEn ? 'Waiting for Store (OPEN)' : 'Chờ Shop phản hồi (OPEN)'}</option>
                <option value="WAITING_SELLER">{isEn ? 'Store Responded (WAITING)' : 'Đã phản hồi (WAITING)'}</option>
                <option value="RESOLVED_REPLACED">{isEn ? 'Code Replaced (REPLACED)' : 'Đã đổi mã (REPLACED)'}</option>
                <option value="RESOLVED_REFUNDED">{isEn ? 'Core Refunded (REFUNDED)' : 'Đã hoàn tiền (REFUNDED)'}</option>
                <option value="REJECTED">{isEn ? 'Dispute Rejected (REJECTED)' : 'Từ chối khiếu nại (REJECTED)'}</option>
              </select>

              <button
                onClick={fetchDisputes}
                disabled={loadingDisputes}
                className="p-2 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground transition-all"
                title={isEn ? "Refresh list" : "Làm mới danh sách"}
              >
                <RefreshCw className={`w-4 h-4 ${loadingDisputes ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loadingDisputes ? (
            <div className="py-16 text-center text-muted-foreground">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-2" />
              <p className="text-xs">{isEn ? 'Loading dispute list...' : 'Đang tải danh sách khiếu nại...'}</p>
            </div>
          ) : disputes.length === 0 ? (
            <div className="py-16 text-center bg-card border border-border rounded-2xl">
              <CheckCircle2 className="w-12 h-12 text-emerald-500/30 mx-auto mb-2" />
              <div className="text-sm font-semibold">{isEn ? 'No disputes found' : 'Không có khiếu nại nào'}</div>
              <p className="text-xs text-muted-foreground mt-1">{isEn ? 'Your store currently has no disputed orders.' : 'Gian hàng của bạn hiện không có đơn hàng nào bị khiếu nại.'}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border overflow-hidden bg-card shadow-sm">
              <table className="table-fixed w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                    <th className="w-[22%] p-3 text-left">{isEn ? 'Order & Package' : 'Đơn Hàng & Gói'}</th>
                    <th className="w-[20%] p-3 text-left">{isEn ? 'Buyer & Reason' : 'Khách & Lý Do'}</th>
                    <th className="w-[28%] p-3 text-left">{isEn ? 'Details' : 'Nội Dung Chi Tiết'}</th>
                    <th className="w-[15%] p-3 text-center">{isEn ? 'Status' : 'Trạng Thái'}</th>
                    <th className="w-[15%] p-3 text-center">{isEn ? 'Actions' : 'Thao Tác'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {disputes.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        <div className="font-mono font-bold text-foreground text-xs">{d.order_code}</div>
                        <div className="text-[10px] font-mono text-primary/80 truncate mt-0.5" title={`${isEn ? 'Dispute ID:' : 'Mã khiếu nại:'} ${d.id}`}>
                          ID: {d.id}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate" title={d.product_name}>
                          {d.product_name}
                        </div>
                        <div className="text-[10px] text-amber-500 font-semibold mt-0.5">
                          {Number(d.price_core).toLocaleString()} Core
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="font-semibold text-foreground truncate" title={d.buyer_username}>
                          {d.buyer_username || (isEn ? 'Customer' : 'Khách hàng')}
                        </div>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          d.reason === 'WRONG_CODE'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : d.reason === 'USED_CODE'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : d.reason === 'EXPIRED_CODE'
                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}>
                          {d.reason === 'WRONG_CODE' ? (isEn ? 'Invalid Code' : 'Mã Sai') :
                           d.reason === 'USED_CODE' ? (isEn ? 'Used Code' : 'Mã Đã Dùng') :
                           d.reason === 'EXPIRED_CODE' ? (isEn ? 'Expired' : 'Hết Hạn') : (isEn ? 'Misdescribed' : 'Sai Mô Tả')}
                        </span>
                      </td>

                      <td className="p-3">
                        {d.detail && (
                          <div className="text-foreground text-[11px] line-clamp-2" title={d.detail}>
                            "{d.detail}"
                          </div>
                        )}
                        {d.seller_response && (
                          <div className="mt-1 text-[10px] text-primary-light bg-muted/40 p-1.5 rounded-lg border border-border/60">
                            <strong>{isEn ? 'Store:' : 'Shop:'}</strong> {d.seller_response}
                          </div>
                        )}
                        {d.seller_replacement_code && (
                          <div className="mt-0.5 text-[10px] font-mono text-emerald-400">
                            {isEn ? 'Replacement:' : 'Mã đổi:'} {d.seller_replacement_code}
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          d.status === 'OPEN'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse'
                            : d.status === 'WAITING_SELLER'
                            ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                            : d.status === 'RESOLVED_REPLACED'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : d.status === 'RESOLVED_REFUNDED'
                            ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                            : 'bg-destructive/15 text-destructive border border-destructive/30'
                        }`}>
                          {d.status === 'OPEN' ? (isEn ? 'Pending Response' : 'Chờ Phản Hồi') :
                           d.status === 'WAITING_SELLER' ? (isEn ? 'Responded' : 'Đã Phản Hồi') :
                           d.status === 'RESOLVED_REPLACED' ? (isEn ? 'Code Replaced' : 'Đã Đổi Mã') :
                           d.status === 'RESOLVED_REFUNDED' ? (isEn ? 'Core Refunded' : 'Đã Hoàn Core') :
                           (isEn ? 'Rejected' : 'Đã Từ Chối')}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        {(d.status === 'OPEN' || d.status === 'WAITING_SELLER') ? (
                          <button
                            onClick={() => {
                              setRespondingDispute(d);
                              setDisputeResponseMsg(d.seller_response || '');
                              setDisputeReplacementCode(d.seller_replacement_code || '');
                            }}
                            className="px-2.5 py-1 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-[11px] font-bold shadow-sm transition-opacity"
                          >
                            {isEn ? 'Respond' : 'Phản Hồi'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground font-mono">{isEn ? 'Resolved' : 'Đã xong'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Tài Chính & Rút Tiền (Giai đoạn 2) */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          {/* 3 Ngăn số dư */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-card border border-border">
              <div className="text-xs text-muted-foreground font-medium mb-1">{isEn ? 'Escrow Held (Hold)' : 'Đang Giữ (Hold)'}</div>
              <div className="text-2xl font-black text-amber-500 flex items-center gap-1.5">
                {Number(financeData?.balances?.held_core ?? sellerData?.pending_balance_core ?? 0).toLocaleString('vi-VN')}
                <span className="text-xs font-semibold">Core</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {isEn ? `Held for ${financeData?.config?.hold_hours || 168}h after delivery to protect buyers.` : `Tạm giữ ${financeData?.config?.hold_hours || 168}h sau khi giao mã thành công để bảo vệ người mua.`}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-card border border-border">
              <div className="text-xs text-muted-foreground font-medium mb-1">{isEn ? 'Available for Payout' : 'Khả Dụng (Available)'}</div>
              <div className="text-2xl font-black text-emerald-500 flex items-center gap-1.5">
                {Number(financeData?.balances?.available_core ?? sellerData?.available_balance_core ?? 0).toLocaleString(isEn ? 'en-US' : 'vi-VN')}
                <span className="text-xs font-semibold">Core</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {isEn ? 'Cleared escrow balance, eligible for bank withdrawal.' : 'Số dư đã hoàn tất thời gian giữ, có thể yêu cầu rút về tài khoản ngân hàng.'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-card border border-border">
              <div className="text-xs text-muted-foreground font-medium mb-1">{isEn ? 'Total Withdrawn' : 'Đã Chi Trả (Withdrawn)'}</div>
              <div className="text-2xl font-black text-blue-500 flex items-center gap-1.5">
                {Number(financeData?.balances?.withdrawn_core ?? sellerData?.withdrawn_balance_core ?? 0).toLocaleString(isEn ? 'en-US' : 'vi-VN')}
                <span className="text-xs font-semibold">Core</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {isEn ? 'Total Core transferred out to your bank account.' : 'Tổng số Core đã chuyển khoản ra ngoài tài khoản ngân hàng của bạn.'}
              </p>
            </div>
          </div>

          {/* Hộp hành động rút tiền & Tài khoản ngân hàng */}
          <div className="p-5 rounded-2xl bg-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" /> {isEn ? 'Withdraw Funds to Bank Account' : 'Rút Tiền Về Tài Khoản Ngân Hàng'}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isEn ? 'Beneficiary bank:' : 'Ngân hàng nhận:'} <span className="font-bold text-foreground">{sellerData?.bank_name || (isEn ? 'Not set' : 'Chưa cài đặt')}</span> • {isEn ? 'Account No:' : 'STK:'} <span className="font-mono font-bold text-foreground">{sellerData?.bank_account || '—'}</span> ({sellerData?.bank_account_name || '—'})
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {sellerData?.sub_role ? (
                <span className="text-xs text-muted-foreground italic bg-muted px-3 py-1.5 rounded-xl border border-border">
                  {isEn ? 'Staff accounts cannot withdraw funds' : 'Tài khoản phụ không có quyền rút tiền'}
                </span>
              ) : (
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={Number(financeData?.balances?.available_core ?? sellerData?.available_balance_core ?? 0) < 1}
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all hover:bg-primary/90"
                >
                  <ArrowRight className="w-4 h-4" /> {isEn ? 'Request Payout' : 'Yêu Cầu Rút Tiền'}
                </button>
              )}
            </div>
          </div>

          {/* Lịch sử yêu cầu rút tiền */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border bg-muted/20 font-bold text-xs flex items-center justify-between">
              <span>{isEn ? 'Withdrawal Requests History' : 'Lịch Sử Yêu Cầu Rút Tiền'}</span>
              <button onClick={fetchSellerFinance} className="text-muted-foreground hover:text-foreground text-[11px] flex items-center gap-1">
                <RefreshCw className={`w-3 h-3 ${loadingFinance ? 'animate-spin' : ''}`} /> {isEn ? 'Refresh' : 'Làm mới'}
              </button>
            </div>
            <table className="table-fixed w-full text-xs text-left">
              <thead className="bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                <tr>
                  <th style={{ width: '22%' }} className="p-3">{isEn ? 'Time' : 'Thời Gian'}</th>
                  <th style={{ width: '22%' }} className="p-3">{isEn ? 'Amount (Core)' : 'Số Core Yêu Cầu'}</th>
                  <th style={{ width: '28%' }} className="p-3">{isEn ? 'Beneficiary Account' : 'Tài Khoản Nhận'}</th>
                  <th style={{ width: '28%' }} className="p-3 text-right">{isEn ? 'Status & Notes' : 'Trạng Thái & Ghi Chú'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sellerWithdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      {isEn ? 'No withdrawal requests yet.' : 'Bạn chưa có yêu cầu rút tiền nào.'}
                    </td>
                  </tr>
                ) : (
                  sellerWithdrawals.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/20">
                      <td className="p-3 font-semibold">{new Date(w.created_at).toLocaleString('vi-VN')}</td>
                      <td className="p-3 font-bold font-mono text-primary text-sm">
                        {Number(w.amount_core).toLocaleString('vi-VN')} Core
                      </td>
                      <td className="p-3">
                        <div className="font-semibold truncate">{w.bank_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">{w.bank_account} ({w.bank_account_name})</div>
                      </td>
                      <td className="p-3 text-right">
                        <div>
                          {w.status === 'PENDING' && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-bold text-[10px] border border-amber-500/20">{isEn ? 'Pending' : 'Chờ duyệt'}</span>}
                          {w.status === 'APPROVED' && <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-bold text-[10px] border border-blue-500/20">{isEn ? 'Approved (Processing)' : 'Đã duyệt (Chờ chuyển)'}</span>}
                          {w.status === 'PAID' && <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-[10px] border border-emerald-500/20">{isEn ? 'Paid' : 'Đã chi trả'}</span>}
                          {w.status === 'REJECTED' && <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-bold text-[10px] border border-destructive/20">{isEn ? 'Rejected' : 'Đã từ chối'}</span>}
                        </div>
                        {w.review_note && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate" title={w.review_note}>
                            {w.review_note}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Sổ cái gian hàng */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border bg-muted/20 font-bold text-xs flex items-center justify-between">
              <span>{isEn ? 'Balance Change Ledger' : 'Sổ Cái Biến Động Số Dư (Ledger)'}</span>
              <span className="text-[11px] text-muted-foreground">{isEn ? '100% transparent transaction history' : 'Minh bạch 100% từng dòng giao dịch'}</span>
            </div>
            <table className="table-fixed w-full text-xs text-left">
              <thead className="bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                <tr>
                  <th style={{ width: '20%' }} className="p-3">{isEn ? 'Time' : 'Thời Gian'}</th>
                  <th style={{ width: '16%' }} className="p-3">{isEn ? 'Operation' : 'Nghiệp Vụ'}</th>
                  <th style={{ width: '18%' }} className="p-3">{isEn ? 'Change (Core)' : 'Biến Động (Core)'}</th>
                  <th style={{ width: '26%' }} className="p-3">{isEn ? 'Balances After Transaction' : '3 Ngăn Số Dư Sau Giao Dịch'}</th>
                  <th style={{ width: '20%' }} className="p-3 text-right">{isEn ? 'Description' : 'Diễn Giải'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(!financeData?.ledger || financeData.ledger.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      {isEn ? 'No ledger transactions recorded yet.' : 'Chưa có phát sinh biến động sổ cái.'}
                    </td>
                  </tr>
                ) : (
                  financeData.ledger.map((l: any) => (
                    <tr key={l.id} className="hover:bg-muted/20">
                      <td className="p-3 font-semibold">{new Date(l.created_at).toLocaleString('vi-VN')}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          l.type === 'HOLD' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                          l.type === 'RELEASE' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                          l.type === 'FEE' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' :
                          l.type === 'WITHDRAW' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                          l.type === 'REFUND' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                          'bg-muted text-muted-foreground border-border'
                        }`}>
                          {l.type}
                        </span>
                      </td>
                      <td className="p-3 font-bold font-mono">
                        <span className={l.amount_core >= 0 ? 'text-emerald-500' : 'text-destructive'}>
                          {l.amount_core >= 0 ? `+${Number(l.amount_core).toLocaleString('vi-VN')}` : Number(l.amount_core).toLocaleString('vi-VN')} Core
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        <div>{isEn ? 'Held:' : 'Giữ:'} <span className="text-amber-500 font-bold">{Number(l.balance_held_after).toLocaleString(isEn ? 'en-US' : 'vi-VN')}</span></div>
                        <div className="text-[10px] text-muted-foreground">{isEn ? 'Available:' : 'Khả dụng:'} <span className="text-emerald-500 font-bold">{Number(l.balance_available_after).toLocaleString(isEn ? 'en-US' : 'vi-VN')}</span> | {isEn ? 'Withdrawn:' : 'Đã rút:'} {Number(l.balance_withdrawn_after).toLocaleString(isEn ? 'en-US' : 'vi-VN')}</div>
                      </td>
                      <td className="p-3 text-right">
                        <span className="truncate block text-muted-foreground" title={l.reason}>
                          {l.reason}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Yêu Cầu Rút Tiền (§8) */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold flex items-center gap-2">
                <Coins className="w-5 h-5 text-primary" /> {isEn ? 'Withdraw Funds to Bank' : 'Rút Tiền Về Ngân Hàng'}
              </h4>
              <button onClick={() => setShowWithdrawModal(false)}><X className="w-4 h-4" /></button>
            </div>

            <div className="p-3.5 bg-muted/40 rounded-xl space-y-1.5 text-xs">
              <div className="text-muted-foreground">{isEn ? 'Current available balance:' : 'Số dư khả dụng hiện tại:'}</div>
              <div className="text-xl font-black text-emerald-500">
                {Number(financeData?.balances?.available_core ?? sellerData?.available_balance_core ?? 0).toLocaleString('vi-VN')} Core
              </div>
              <div className="pt-2 border-t border-border/60 text-[11px] text-muted-foreground">
                {isEn ? 'Beneficiary account:' : 'Tài khoản nhận:'} <span className="font-bold text-foreground">{sellerData?.bank_name}</span> - <span className="font-mono font-bold text-foreground">{sellerData?.bank_account}</span> ({sellerData?.bank_account_name})
              </div>
            </div>

            <form onSubmit={handleRequestWithdraw} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">{isEn ? 'Core amount to withdraw *' : 'Số Core muốn rút *'}</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={Number(financeData?.balances?.available_core ?? sellerData?.available_balance_core ?? 0)}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder={isEn ? "Enter Core amount (min 1)..." : "Nhập số Core (tối thiểu 1)..."}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background font-mono font-bold text-base focus:outline-none focus:border-primary"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  {isEn ? `Exchange rate: 1 Core = 1 VND. Transfer amount: ${parseInt(withdrawAmount || '0', 10).toLocaleString('en-US')} VND.` : `Tỷ lệ quy đổi: 1 Core = 1 VND. Số tiền chuyển khoản: ${parseInt(withdrawAmount || '0', 10).toLocaleString('vi-VN')} VNĐ.`}
                </span>
              </div>

              <div className="p-2.5 bg-primary/10 border border-primary/20 rounded-xl text-[11px] text-primary">
                {isEn ? `ℹ️ Note: Requests ≤ ${financeData?.config?.withdraw_approval_threshold_core || 500} Core are auto-approved. Larger amounts require manual approval by Mall Admin.` : `ℹ️ Lưu ý: Yêu cầu rút ≤ ${financeData?.config?.withdraw_approval_threshold_core || 500} Core sẽ được duyệt tự động. Yêu cầu lớn hơn sẽ được Chủ Sàn duyệt thủ công.`}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="px-4 py-2 rounded-xl border border-border font-semibold hover:bg-muted"
                >
                  {isEn ? 'Cancel' : 'Hủy'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWithdraw}
                  className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold shadow-sm disabled:opacity-50"
                >
                  {isSubmittingWithdraw ? (isEn ? 'Submitting...' : 'Đang gửi...') : (isEn ? 'Confirm Payout' : 'Xác Nhận Rút Tiền')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tab 6: Storefront Branding Studio & Staff Subaccounts (§6.5) */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-6xl">
          {subRole === 'OWNER' && sellerData && (
            <SellerStorefrontStudio
              seller={sellerData}
              sepayOnline={Boolean(sepaySummary?.is_enabled && !sepaySummary?.admin_locked)}
              getHeaders={getHeaders}
              onUpdated={(updatedSeller) => {
                setSellerData(updatedSeller);
                setSuccessMsg(t('sellerStoreStudio.saveSuccess'));
              }}
            />
          )}

          <div className="p-6 rounded-2xl bg-card border border-border space-y-4 max-w-3xl">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> {isEn ? 'Manage Staff & Subaccounts' : 'Quản Lý Tài Khoản Phụ (Nhân Viên / Hỗ Trợ)'}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isEn ? 'Invite staff members to manage inventory or view orders. Subaccounts cannot view/edit bank details or withdraw funds.' : 'Mời thành viên khác hỗ trợ quản lý kho hoặc xem đơn hàng. Tài khoản phụ tuyệt đối không thể xem hoặc sửa thông tin thanh toán ngân hàng và không thể rút tiền.'}
            </p>

            <form onSubmit={handleAddSubaccount} className="flex flex-col sm:flex-row gap-3 pt-2">
              <input
                type="email"
                required
                value={newSubEmail}
                onChange={(e) => setNewSubEmail(e.target.value)}
                placeholder={isEn ? "Enter staff email address..." : "Nhập email thành viên cần gán quyền..."}
                className="flex-1 px-3.5 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:border-primary"
              />
              <select
                value={newSubRole}
                onChange={(e: any) => setNewSubRole(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-medium focus:outline-none focus:border-primary"
              >
                <option value="VIEW_ORDERS">{isEn ? 'View Orders Only (VIEW_ORDERS)' : 'Chỉ Xem Đơn (VIEW_ORDERS)'}</option>
                <option value="MANAGE_STOCK">{isEn ? 'Manage Vault (MANAGE_STOCK)' : 'Quản Lý Kho Mã (MANAGE_STOCK)'}</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm shrink-0"
              >
                {isEn ? 'Grant Access' : 'Thêm Quyền'}
              </button>
            </form>

            <div className="pt-2 divide-y divide-border/60">
              {subaccounts.length === 0 ? (
                <div className="py-4 text-xs text-muted-foreground text-center">{isEn ? 'No staff accounts added yet.' : 'Chưa có tài khoản phụ nào.'}</div>
              ) : (
                subaccounts.map((sa) => (
                  <div key={sa.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-foreground">{sa.member_email}</div>
                      <div className="text-[11px] text-muted-foreground">{isEn ? 'Role:' : 'Vai trò:'} {sa.role}</div>
                    </div>
                    <button
                      onClick={async () => {
                        if (confirm(isEn ? `Remove access for ${sa.member_email}?` : `Xóa quyền của ${sa.member_email}?`)) {
                          await fetch(`/api/seller/subaccounts/${sa.id}`, { method: 'DELETE', headers: getHeaders() });
                          fetchSubaccounts();
                        }
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: API Keys & Integrations */}
      {activeTab === 'api_keys' && (
        <div className="space-y-6">
          {/* Top Banner */}
          <div className="p-6 rounded-2xl bg-card border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Code2 className="w-5 h-5 text-primary" />
                {t('sellerApiKeys.tabTitle', 'Khóa API & Tích Hợp')}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('sellerApiKeys.tabDesc', 'Quản lý khóa API kết nối máy-máy và ủy quyền ứng dụng bên thứ ba cho gian hàng.')}
              </p>
            </div>
            <button
              onClick={() => setShowCreateKeyModal(true)}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center gap-2 shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              {t('sellerApiKeys.createBtn', 'Tạo Khóa Mới')}
            </button>
          </div>

          {/* Table: Danh Sách Khóa API */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              {t('sellerApiKeys.tableTitle', 'Danh Sách Khóa API Gian Hàng')}
            </h4>

            {loadingApiKeys ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                {t('common.loading', 'Đang tải dữ liệu...')}
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('sellerApiKeys.noKeys', isEn ? 'No API keys yet. Click "Create Key" to issue your first key.' : 'Chưa có khóa API nào. Bấm "Tạo Khóa Mới" để cấp khóa đầu tiên.')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2.5 px-3 font-semibold">{t('sellerApiKeys.colName', 'Tên Khóa')}</th>
                      <th className="py-2.5 px-3 font-semibold">{t('sellerApiKeys.colPrefix', 'Tiền Tố Khóa')}</th>
                      <th className="py-2.5 px-3 font-semibold">{t('sellerApiKeys.colScope', 'Phạm Vi Quyền')}</th>
                      <th className="py-2.5 px-3 font-semibold">{t('sellerApiKeys.colCreated', 'Ngày Tạo')}</th>
                      <th className="py-2.5 px-3 font-semibold">{t('sellerApiKeys.colLastUsed', 'Dùng Lần Cuối')}</th>
                      <th className="py-2.5 px-3 font-semibold text-right">{t('sellerApiKeys.colCalls', 'Số Lần Gọi')}</th>
                      <th className="py-2.5 px-3 font-semibold text-center">{t('sellerApiKeys.colStatus', 'Trạng Thái')}</th>
                      <th className="py-2.5 px-3 font-semibold text-right">{t('sellerApiKeys.colActions', 'Thao Tác')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {apiKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-3 font-bold text-foreground">{k.name}</td>
                        <td className="py-3 px-3">
                          <code className="px-2 py-0.5 rounded bg-muted font-mono font-bold text-primary text-[11px]">
                            {k.key_prefix}
                          </code>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            k.scope === 'FULL' ? 'bg-primary/10 text-primary border border-primary/20' :
                            k.scope === 'READ_ONLY' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                            k.scope === 'PRODUCTS_ONLY' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                            'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                          }`}>
                            {k.scope === 'FULL' ? t('sellerApiKeys.scopeFull', 'Toàn Quyền') :
                             k.scope === 'READ_ONLY' ? t('sellerApiKeys.scopeReadOnly', 'Chỉ Đọc') :
                             k.scope === 'PRODUCTS_ONLY' ? t('sellerApiKeys.scopeProducts', 'Chỉ Sản Phẩm') :
                             t('sellerApiKeys.scopeOrders', 'Chỉ Đơn Hàng')}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-muted-foreground">
                          {new Date(k.created_at).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="py-3 px-3 text-muted-foreground">
                          {k.last_used_at ? new Date(k.last_used_at).toLocaleString('vi-VN') : t('sellerApiKeys.neverUsed', 'Chưa dùng')}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold">
                          {Number(k.calls_count || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {k.is_active ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-bold">
                              {t('sellerApiKeys.statusActive', 'Hoạt Động')}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-[10px] font-bold">
                              {t('sellerApiKeys.statusRevoked', 'Đã Thu Hồi')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {k.is_active ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleRotateApiKey(k.id, k.name)}
                                title={t('sellerApiKeys.rotateBtn', 'Xoay Khóa')}
                                className="px-2 py-1 rounded-lg border border-border hover:bg-muted text-muted-foreground text-[11px] font-semibold flex items-center gap-1"
                              >
                                <RefreshCw className="w-3 h-3" />
                                {t('sellerApiKeys.rotateBtn', 'Xoay Khóa')}
                              </button>
                              <button
                                onClick={() => handleRevokeApiKey(k.id, k.name)}
                                title={t('sellerApiKeys.revokeBtn', 'Thu Hồi')}
                                className="px-2 py-1 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-[11px] font-semibold flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                {t('sellerApiKeys.revokeBtn', 'Thu Hồi')}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">
                              {t('sellerApiKeys.statusRevoked', 'Đã Thu Hồi')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section: Ứng Dụng Bên Thứ Ba Đang Có Quyền */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              {t('sellerApiKeys.thirdPartySectionTitle', 'Ứng Dụng Bên Thứ Ba Đang Có Quyền')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t('sellerApiKeys.thirdPartySectionDesc', 'Các hệ thống bên ngoài hoặc ứng dụng AI được bạn cấp quyền thay mặt quản lý gian hàng.')}
            </p>

            {loadingApps ? (
              <div className="py-4 text-center text-xs text-muted-foreground animate-pulse">
                {t('common.loading', 'Đang tải dữ liệu...')}
              </div>
            ) : thirdPartyApps.length === 0 ? (
              <div className="py-4 text-xs text-muted-foreground text-center bg-muted/30 rounded-xl">
                {t('sellerApiKeys.noThirdPartyApps', 'Chưa có ứng dụng bên thứ ba nào được liên kết.')}
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {thirdPartyApps.map((app) => (
                  <div key={app.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-foreground flex items-center gap-2">
                        {app.app_name}
                        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">
                          {app.scope}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {t('sellerApiKeys.authorizedAt', 'Thời Điểm Duyệt')}: {new Date(app.created_at).toLocaleString('vi-VN')}
                      </div>
                    </div>
                    {app.status === 'ACTIVE' ? (
                      <button
                        onClick={() => handleRevokeApp(app.id, app.app_name)}
                        className="px-3 py-1 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-semibold"
                      >
                        {t('sellerApiKeys.revokeAppBtn', 'Thu Hồi Quyền')}
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-[11px] italic">
                        {t('sellerApiKeys.statusRevoked', 'Đã Thu Hồi')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Hướng Dẫn & Tài Liệu API */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                {t('sellerApiKeys.apiDocsTitle', 'Tài Liệu Hướng Dẫn Tích Hợp API')}
              </h4>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('sellerApiKeys.apiDocsDesc', 'Sử dụng Store API để kết nối máy-máy, ứng dụng ngoài hoặc cấu hình AI tự động quản lý.')}
            </p>

            <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2 text-xs">
              <div className="font-bold text-foreground">{t('sellerApiKeys.authHeaderTitle', 'Header Xác Thực Yêu Cầu')}:</div>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="p-2 rounded bg-background border border-border">
                  X-Store-Key: pine_sk_YOUR_STORE_API_KEY_HERE
                </div>
                <div className="p-2 rounded bg-background border border-border">
                  Authorization: Bearer pine_sk_YOUR_STORE_API_KEY_HERE
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground pt-1">
                {isEn ? <>⚡ Rate limit: Max 600 requests / minute. See technical details in <strong className="text-foreground">docs/STORE_API_GUIDE.md</strong> in repository.</> : <>⚡ Giới hạn: Tối đa 600 yêu cầu / phút. Xem tài liệu kỹ thuật chi tiết tại file <strong className="text-foreground">docs/STORE_API_GUIDE.md</strong> trong mã nguồn.</>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-4 rounded-xl bg-background border border-border space-y-2">
                <div className="font-sans font-bold text-foreground flex items-center justify-between">
                  <span>{t('sellerApiKeys.sampleCurlTitle', 'Mẫu Gọi cURL')}</span>
                </div>
                <pre className="text-[11px] text-muted-foreground overflow-x-auto p-2 bg-muted/50 rounded-lg whitespace-pre-wrap">
{`curl -X GET "https://universal-mall-shop.pages.dev/api/seller" \\
  -H "X-Store-Key: YOUR_STORE_KEY"`}
                </pre>
              </div>

              <div className="p-4 rounded-xl bg-background border border-border space-y-2">
                <div className="font-sans font-bold text-foreground flex items-center justify-between">
                  <span>{t('sellerApiKeys.sampleFetchTitle', 'Mẫu Gọi Fetch (Node.js/JS)')}</span>
                </div>
                <pre className="text-[11px] text-muted-foreground overflow-x-auto p-2 bg-muted/50 rounded-lg whitespace-pre-wrap">
{`const res = await fetch('/api/seller/products', {
  headers: {
    'Authorization': 'Bearer YOUR_STORE_KEY'
  }
});
const data = await res.json();`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 8: Resell & Cross-Shop (§Affiliate) */}
      {activeTab === 'sepay' && (
        <SellerSepayManager
          getHeaders={getHeaders}
          onRefreshSeller={fetchSellerInfo}
        />
      )}

      {activeTab === 'affiliate' && (
        <SellerAffiliateManager
          getHeaders={getHeaders}
          isEn={isEn}
          t={t}
          products={products}
          fetchProducts={fetchProducts}
        />
      )}

      {/* Modal: Thêm / Chỉnh Sửa Sản Phẩm Đa Ngành (Tối đa 10 Ảnh, Phân loại, Thông số) */}
      <SellerProductEditorModal
        isOpen={showAddProductModal}
        editingProduct={editingProduct}
        sellerData={sellerData}
        shopCategories={shopCategories}
        getHeaders={getHeaders}
        onClose={() => {
          setShowAddProductModal(false);
          setEditingProduct(null);
        }}
        onSaved={(msg) => {
          setSuccessMsg(msg);
          fetchProducts();
          fetchSellerInfo();
        }}
      />

      {/* Modal: Cập Nhật Mã Vận Đơn / Bàn Giao Dịch Vụ Thủ Công */}
      {fulfillingOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                <span>{t('sellerProductEditor.fulfillModalTitle')}</span>
              </h3>
              <button type="button" onClick={() => setFulfillingOrder(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs bg-muted/60 p-3 rounded-xl space-y-1">
              <div>{isEn ? 'Order:' : 'Đơn hàng:'} <strong className="font-mono">{fulfillingOrder.order_code}</strong></div>
              <div>{isEn ? 'Product:' : 'Sản phẩm:'} <strong>{fulfillingOrder.product_name}</strong></div>
              {fulfillingOrder.selected_variant && (
                <div>{t('sellerProductEditor.variantLabel')}: <strong>{fulfillingOrder.selected_variant}</strong></div>
              )}
              {fulfillingOrder.buyer_note && (
                <div>{t('sellerProductEditor.buyerNotePrefix')}: <strong>{fulfillingOrder.buyer_note}</strong></div>
              )}
            </div>

            <form onSubmit={handleFulfillOrder} className="space-y-3.5 text-xs">
              {String(fulfillingOrder.product_type || '').toLowerCase() === 'physical' ? (
                <>
                  <div>
                    <label className="block font-semibold mb-1">{t('sellerProductEditor.carrierLabel')}</label>
                    <select
                      value={shipCarrier}
                      onChange={(e) => setShipCarrier(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                    >
                      <option value="GHN">Giao Hàng Nhanh (GHN)</option>
                      <option value="GHTK">Giao Hàng Tiết Kiệm (GHTK)</option>
                      <option value="VIETTEL_POST">Viettel Post</option>
                      <option value="JT_EXPRESS">J&T Express</option>
                      <option value="SPX">SPX Express</option>
                      <option value="SELF_SHIP">{t('sellerProductEditor.selfDeliveryOption')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">{t('sellerProductEditor.trackingCodeLabel')} *</label>
                    <input
                      type="text"
                      required
                      value={shipTrackingCode}
                      onChange={(e) => setShipTrackingCode(e.target.value)}
                      placeholder="GHN892341290"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background font-mono"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block font-semibold mb-1">{t('sellerProductEditor.manualDeliveryContentLabel')} *</label>
                  <textarea
                    rows={4}
                    required
                    value={deliveredContentText}
                    onChange={(e) => setDeliveredContentText(e.target.value)}
                    placeholder={t('sellerProductEditor.manualDeliveryPlaceholder')}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1">{t('sellerProductEditor.fulfillNoteLabel')}</label>
                <input
                  type="text"
                  value={shipFulfillmentNote}
                  onChange={(e) => setShipFulfillmentNote(e.target.value)}
                  placeholder={t('sellerProductEditor.fulfillNotePlaceholder')}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFulfillingOrder(null)}
                  className="px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                >
                  {isEn ? 'Close' : 'Đóng'}
                </button>
                <button
                  type="submit"
                  disabled={submittingFulfill}
                  className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {submittingFulfill ? t('sellerProductEditor.savingBtn') : t('sellerProductEditor.confirmFulfillBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nạp Mã Vào Kho */}
      {showAddCodesModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">{isEn ? 'Restock Codes Into Vault' : 'Nạp Mã Vào Kho Sản Phẩm'}</h3>
              <button onClick={() => { setErrorMsg(''); setShowAddCodesModal(false); }}><X className="w-5 h-5" /></button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleAddCodes} className="space-y-4 text-xs">
              <p className="text-muted-foreground">
                {isEn ? 'Paste code list below (one code per line). System will automatically deduplicate and securely encrypt codes.' : 'Dán danh sách mã code vào ô bên dưới (mỗi dòng 1 mã code). Hệ thống sẽ tự động lọc trùng và mã hóa an toàn.'}
              </p>

              <textarea
                rows={8}
                required
                value={rawCodesText}
                onChange={(e) => setRawCodesText(e.target.value)}
                placeholder="CODE123&#10;GIFTCODE456&#10;VIP999"
                className="w-full font-mono px-3.5 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:border-primary"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCodesModal(false)}
                  className="px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold"
                >
                  {isEn ? 'Cancel' : 'Hủy'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold shadow-sm"
                >
                  {isEn ? 'Deposit Codes Now' : 'Nạp Kho Ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Giải Quyết Báo Lỗi Đơn Hàng (§6.3) */}
      {resolvingOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-destructive flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" /> {isEn ? 'Resolve Order Report' : 'Xử Lý Báo Lỗi Đơn Hàng'}
              </h3>
              <button onClick={() => setResolvingOrder(null)}><X className="w-5 h-5" /></button>
            </div>

            <div className="text-xs bg-muted/60 p-3 rounded-xl space-y-1">
              <div>{isEn ? 'Order:' : 'Đơn hàng:'} <strong>{resolvingOrder.order_code}</strong></div>
              <div>{isEn ? 'Product:' : 'Sản phẩm:'} <strong>{resolvingOrder.product_name}</strong></div>
              <div>{isEn ? 'Price:' : 'Giá:'} <strong>{resolvingOrder.price_core} Core</strong></div>
              <div>{isEn ? 'Buyer reason:' : 'Lý do khách báo:'} <span className="text-destructive font-semibold">{resolvingOrder.report_reason === 'expired' ? (isEn ? 'Expired code' : 'Mã hết hạn') : (isEn ? 'Cannot redeem' : 'Nhập không được')}</span></div>
              {resolvingOrder.report_note && <div>{isEn ? 'Note:' : 'Ghi chú:'} {resolvingOrder.report_note}</div>}
            </div>

            <form onSubmit={handleResolveOrder} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1.5">{isEn ? 'Select Resolution Option:' : 'Chọn Phương Án Xử Lý:'}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResolveType('REPLACE_CODE')}
                    className={`p-3 rounded-xl border text-center font-bold ${
                      resolveType === 'REPLACE_CODE'
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'border-border bg-background'
                    }`}
                  >
                    {isEn ? 'Auto Replace With New Code' : 'Đổi Mã Mới Tự Động'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolveType('REFUND_CORE')}
                    className={`p-3 rounded-xl border text-center font-bold ${
                      resolveType === 'REFUND_CORE'
                        ? 'bg-destructive/10 border-destructive text-destructive'
                        : 'border-border bg-background'
                    }`}
                  >
                    {isEn ? `Refund Core (${resolvingOrder.price_core} Core)` : `Hoàn Trả Core (${resolvingOrder.price_core} Core)`}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">{isEn ? 'Response Note to Buyer' : 'Ghi Chú Phản Hồi Cho Khách'}</label>
                <input
                  type="text"
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder={isEn ? "Replaced new code / Refunded Core..." : "Đã đổi mã mới / Đã hoàn Core..."}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResolvingOrder(null)}
                  className="px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold"
                >
                  {isEn ? 'Close' : 'Đóng'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-destructive text-white font-bold shadow-sm"
                >
                  {isEn ? 'Confirm Resolution' : 'Xác Nhận Giải Quyết'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Phản Hồi Khiếu Nại Sàn TMĐT (§B) */}
      {respondingDispute && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
                <ShieldAlert className="w-5 h-5 text-primary" /> {isEn ? 'Respond to Order Dispute' : 'Phản Hồi Khiếu Nại Đơn Hàng'}
              </h3>
              <button onClick={() => setRespondingDispute(null)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs bg-muted/60 p-3 rounded-xl space-y-1">
              <div>{isEn ? 'Dispute ID:' : 'Mã khiếu nại:'} <strong className="font-mono text-primary-light">{respondingDispute.id}</strong></div>
              <div>{isEn ? 'Order:' : 'Đơn hàng:'} <strong className="font-mono">{respondingDispute.order_code}</strong> ({Number(respondingDispute.price_core).toLocaleString(isEn ? 'en-US' : 'vi-VN')} Core)</div>
              <div>{isEn ? 'Package:' : 'Gói:'} <strong>{respondingDispute.product_name}</strong></div>
              <div>{isEn ? 'Customer:' : 'Khách:'} <strong>{respondingDispute.buyer_username || (isEn ? 'Customer' : 'Khách hàng')}</strong></div>
              <div>{isEn ? 'Dispute reason:' : 'Lý do khiếu nại:'} <span className="text-destructive font-semibold">
                {respondingDispute.reason === 'WRONG_CODE' ? (isEn ? 'Wrong code format' : 'Mã sai định dạng') :
                 respondingDispute.reason === 'USED_CODE' ? (isEn ? 'Already used' : 'Mã đã dùng') :
                 respondingDispute.reason === 'EXPIRED_CODE' ? (isEn ? 'Expired code' : 'Mã hết hạn') : (isEn ? 'Wrong description' : 'Sai mô tả')}
              </span></div>
              {respondingDispute.detail && (
                <div className="text-muted-foreground italic">{isEn ? 'Buyer wrote:' : 'Khách viết:'} "{respondingDispute.detail}"</div>
              )}
            </div>

            <form onSubmit={handleRespondDispute} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1">{isEn ? 'Response explanation / Justification *' : 'Nội dung phản hồi / Giải trình *'}</label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  required
                  value={disputeResponseMsg}
                  onChange={(e) => setDisputeResponseMsg(e.target.value)}
                  placeholder={isEn ? "Explain reason or guide customer on redeeming code..." : "Giải thích nguyên nhân hoặc hướng dẫn khách hàng nhập mã..."}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:border-primary text-xs resize-none"
                />
                <div className="text-[10px] text-muted-foreground text-right mt-0.5">
                  {disputeResponseMsg.length}/1000 {isEn ? 'chars' : 'ký tự'}
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">{isEn ? 'Attach new replacement code (Optional)' : 'Đính kèm mã thay thế mới (Tùy chọn)'}</label>
                <input
                  type="text"
                  value={disputeReplacementCode}
                  onChange={(e) => setDisputeReplacementCode(e.target.value)}
                  placeholder={isEn ? "Enter replacement giftcode if applicable..." : "Nhập mã giftcode thay thế nếu có..."}
                  className="w-full font-mono px-3.5 py-2 rounded-xl border border-border bg-background focus:outline-none focus:border-primary text-xs"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {isEn ? 'If you attach a replacement code here, Admins can immediately deliver it to the buyer upon approving the exchange.' : 'Nếu bạn nạp mã thay thế tại đây, Quản trị viên có thể bàn giao ngay mã này cho khách hàng khi duyệt đổi mã.'}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRespondingDispute(null)}
                  className="px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold"
                >
                  {isEn ? 'Close' : 'Đóng'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDisputeResp}
                  className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold shadow-sm disabled:opacity-50 transition-opacity"
                >
                  {isSubmittingDisputeResp ? (isEn ? 'Submitting...' : 'Đang gửi...') : (isEn ? 'Submit Response' : 'Gửi Phản Hồi')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tạo Khóa API Mới */}
      {showCreateKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                {t('sellerApiKeys.modalCreateTitle', 'Tạo Khóa API Mới')}
              </h3>
              <button onClick={() => setShowCreateKeyModal(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateApiKey} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">
                  {t('sellerApiKeys.keyNameLabel', 'Tên Khóa / Mục Đích Sử Dụng')} *
                </label>
                <input
                  type="text"
                  required
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={t('sellerApiKeys.keyNamePlaceholder', 'Ví dụ: Bot Đồng Bộ Đơn Hàng Shopee / AI Quản Lý Kho')}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background focus:outline-none focus:border-primary text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  {t('sellerApiKeys.scopeLabel', 'Phạm Vi Thẩm Quyền')}
                </label>
                <select
                  value={newKeyScope}
                  onChange={(e: any) => setNewKeyScope(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background focus:outline-none focus:border-primary text-xs font-medium"
                >
                  <option value="FULL">{t('sellerApiKeys.scopeFull', 'Toàn Quyền')}</option>
                  <option value="READ_ONLY">{t('sellerApiKeys.scopeReadOnly', 'Chỉ Đọc')}</option>
                  <option value="PRODUCTS_ONLY">{t('sellerApiKeys.scopeProducts', 'Chỉ Sản Phẩm')}</option>
                  <option value="ORDERS_ONLY">{t('sellerApiKeys.scopeOrders', 'Chỉ Đơn Hàng')}</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateKeyModal(false)}
                  className="px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold text-xs"
                >
                  {t('sellerApiKeys.cancelBtn', 'Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={isCreatingKey}
                  className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm disabled:opacity-50"
                >
                  {isCreatingKey ? t('common.loading', 'Đang tạo...') : t('sellerApiKeys.confirmCreateBtn', 'Tạo Khóa')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Hiển Thị Khóa API Thô Duy Nhất 1 Lần */}
      {generatedRawKeyData && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-primary/40 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-emerald-500">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-foreground">
                {t('sellerApiKeys.modalNewKeyTitle', 'Khóa API Đã Được Tạo Thành Công!')}
              </h3>
            </div>

            <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs leading-relaxed font-semibold">
              ⚠️ {t('sellerApiKeys.modalNewKeyWarning', 'LƯU Ý QUAN TRỌNG: Hãy sao chép và lưu trữ khóa này ở nơi an toàn ngay bây giờ. Vì lý do an toàn bảo mật, khóa API thô này sẽ KHÔNG BAO GIỜ hiển thị lại!')}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="text-muted-foreground">{t('sellerApiKeys.colName', 'Tên Khóa')}: <strong className="text-foreground">{generatedRawKeyData.name}</strong></div>
              <div className="relative flex items-center">
                <input
                  type="text"
                  readOnly
                  value={generatedRawKeyData.rawKey}
                  className="w-full font-mono text-xs px-3.5 py-2.5 pr-24 rounded-xl border border-primary/40 bg-muted/60 text-foreground font-bold focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedRawKeyData.rawKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2500);
                  }}
                  className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1 shadow-sm hover:opacity-95"
                >
                  {copiedKey ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      {t('sellerApiKeys.copied', 'Đã chép!')}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      {t('sellerApiKeys.copyBtn', 'Sao Chép')}
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setGeneratedRawKeyData(null)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-foreground text-background font-bold text-xs shadow hover:opacity-90"
              >
                {t('sellerApiKeys.closeModalBtn', 'Tôi Đã Lưu Khóa An Toàn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cài Đặt Mở Bán Lại Cho Sản Phẩm (Dành cho NCC) */}
      <ResellSettingsModal
        product={resellModalProduct}
        isOpen={Boolean(resellModalProduct)}
        onClose={() => setResellModalProduct(null)}
        getHeaders={getHeaders}
        onSuccess={() => {
          setSuccessMsg(isEn ? 'Resell settings updated successfully!' : 'Cập nhật cài đặt bán lại thành công!');
          fetchProducts();
        }}
        isEn={isEn}
        t={t}
      />
    </div>
  );
};
