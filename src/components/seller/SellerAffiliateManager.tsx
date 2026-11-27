import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Share2,
  Link2,
  CheckSquare,
  Package,
  Store,
  RefreshCw,
  Clock,
  Send,
  X,
  Check,
  Copy,
  CheckCircle2,
  Edit3,
  Webhook,
  Receipt,
  AlertTriangle,
  Plus,
  Play,
  Trash2,
  RotateCcw,
  Power,
} from 'lucide-react';

interface SellerAffiliateManagerProps {
  getHeaders: () => Record<string, string>;
  isEn: boolean;
  t: (key: string, params?: Record<string, any>) => string;
  products: any[];
  fetchProducts: () => void;
}

type AffiliateSubTab = 'supplier' | 'reseller' | 'webhooks' | 'orders';

export const SellerAffiliateManager: React.FC<SellerAffiliateManagerProps> = ({
  getHeaders,
  isEn,
  t,
  fetchProducts,
}) => {
  const locale = isEn ? 'en-US' : 'vi-VN';
  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;

  // Navigation
  const [affiliateSubTab, setAffiliateSubTab] = useState<AffiliateSubTab>('supplier');

  // Supplier state
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [loadingIncoming, setLoadingIncoming] = useState<boolean>(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [loadingPartners, setLoadingPartners] = useState<boolean>(false);
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);
  const [isRejectingId, setIsRejectingId] = useState<string | null>(null);
  const [isRevokingId, setIsRevokingId] = useState<string | null>(null);

  // One-time Pair Key reveal (shown to reseller Shop B once when approved)
  const [revealedPairKeyData, setRevealedPairKeyData] = useState<{
    partnerShopName: string;
    rawKey: string;
  } | null>(null);
  const [copiedPairKey, setCopiedPairKey] = useState<boolean>(false);

  // Reseller state
  const [supplierCodeInput, setSupplierCodeInput] = useState<string>('');
  const [requestNoteInput, setRequestNoteInput] = useState<string>('');
  const [isSendingReq, setIsSendingReq] = useState<boolean>(false);
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
  const [loadingOutgoing, setLoadingOutgoing] = useState<boolean>(false);
  const [selectedSupplierCatalog, setSelectedSupplierCatalog] = useState<{
    supplierId: string;
    partnershipId: string;
    name: string;
  } | null>(null);
  const [supplierCatalog, setSupplierCatalog] = useState<any[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [loadingListings, setLoadingListings] = useState<boolean>(false);

  // Assign / Edit Listing Modal
  const [listingModalMode, setListingModalMode] = useState<'assign' | 'edit' | null>(null);
  const [modalTargetItem, setModalTargetItem] = useState<any | null>(null);
  const [formMarkupType, setFormMarkupType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [formMarkupValue, setFormMarkupValue] = useState<string>('10');
  const [formPriceMode, setFormPriceMode] = useState<'FORMULA' | 'LOCKED'>('FORMULA');
  const [formLockedPrice, setFormLockedPrice] = useState<string>('0');
  const [formShowSupplier, setFormShowSupplier] = useState<boolean>(true);
  const [isSavingListing, setIsSavingListing] = useState<boolean>(false);

  // Webhooks state (Sub-tab 3)
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState<boolean>(false);
  const [showWebhookModal, setShowWebhookModal] = useState<boolean>(false);
  const [whName, setWhName] = useState<string>('');
  const [whUrl, setWhUrl] = useState<string>('');
  const [whEvent, setWhEvent] = useState<'order.paid' | '*'>('order.paid');
  const [whTimeoutMs, setWhTimeoutMs] = useState<string>('5000');
  const [whRetryMax, setWhRetryMax] = useState<string>('2');
  const [savingWebhook, setSavingWebhook] = useState<boolean>(false);
  const [webhookBusyId, setWebhookBusyId] = useState<string | null>(null);
  const [oneTimeWebhookSecret, setOneTimeWebhookSecret] = useState<string | null>(null);
  const [copiedWebhookSecret, setCopiedWebhookSecret] = useState<boolean>(false);

  // 3-Way Orders state (Sub-tab 4)
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersSummary, setOrdersSummary] = useState<{
    total_orders: number;
    as_supplier_orders: number;
    as_reseller_orders: number;
    supplier_payout_total: number;
    reseller_payout_total: number;
    platform_fee_total: number;
  }>({
    total_orders: 0,
    as_supplier_orders: 0,
    as_reseller_orders: 0,
    supplier_payout_total: 0,
    reseller_payout_total: 0,
    platform_fee_total: 0,
  });
  const [ordersRoleFilter, setOrdersRoleFilter] = useState<'all' | 'supplier' | 'reseller'>('all');
  const [ordersStatusFilter, setOrdersStatusFilter] = useState<string>('');
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);

  // Feedback
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const fmtNum = (val: unknown) => Number(val || 0).toLocaleString(locale);
  const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(locale);
  };

  // --- Fetches matching backend contracts ---
  const fetchRequestsAll = useCallback(async () => {
    setLoadingIncoming(true);
    setLoadingOutgoing(true);
    try {
      const res = await fetch('/api/seller/affiliate/requests?role=all', {
        headers: getHeadersRef.current(),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        const inc = Array.isArray(data.incoming_requests) ? data.incoming_requests : [];
        const out = Array.isArray(data.outgoing_requests) ? data.outgoing_requests : [];
        setIncomingRequests(inc);
        setOutgoingRequests(out);
        const firstWithKey = out.find((r: any) => r?.one_time_raw_key);
        if (firstWithKey?.one_time_raw_key) {
          setRevealedPairKeyData({
            partnerShopName: firstWithKey.supplier_name || firstWithKey.supplier_seller_id,
            rawKey: String(firstWithKey.one_time_raw_key),
          });
        }
      }
    } catch {}
    setLoadingIncoming(false);
    setLoadingOutgoing(false);
  }, []);

  const fetchPartners = useCallback(async () => {
    setLoadingPartners(true);
    try {
      const res = await fetch('/api/seller/affiliate/partners', { headers: getHeadersRef.current() });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setPartners(Array.isArray(data.partners) ? data.partners : []);
      }
    } catch {}
    setLoadingPartners(false);
  }, []);

  const fetchListings = useCallback(async () => {
    setLoadingListings(true);
    try {
      const res = await fetch('/api/seller/affiliate/listings', { headers: getHeadersRef.current() });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setMyListings(Array.isArray(data.listings) ? data.listings : []);
      }
    } catch {}
    setLoadingListings(false);
  }, []);

  const fetchSupplierCatalog = async (
    supplierId: string,
    supplierName: string,
    partnershipId: string
  ) => {
    if (!supplierId && !partnershipId) return;
    setLoadingCatalog(true);
    setSelectedSupplierCatalog({
      supplierId,
      partnershipId,
      name: supplierName || supplierId,
    });
    try {
      const qs = partnershipId
        ? `partnership_id=${encodeURIComponent(partnershipId)}`
        : `supplier_id=${encodeURIComponent(supplierId)}`;
      const res = await fetch(`/api/seller/affiliate/catalog?${qs}`, {
        credentials: 'include',
        headers: getHeadersRef.current(),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setSupplierCatalog(Array.isArray(data.products) ? data.products : []);
      } else {
        setErrorMsg(data?.error || t('sellerAffiliate.actionFailed'));
      }
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
    setLoadingCatalog(false);
  };

  const fetchWebhooks = useCallback(async () => {
    setLoadingWebhooks(true);
    try {
      const res = await fetch('/api/seller/webhooks', { headers: getHeadersRef.current() });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setWebhooks(Array.isArray(data.webhooks) ? data.webhooks : []);
        setDeliveries(Array.isArray(data.deliveries) ? data.deliveries : []);
      }
    } catch {}
    setLoadingWebhooks(false);
  }, []);

  const fetchAffiliateOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const params = new URLSearchParams();
      params.set('role', ordersRoleFilter);
      if (ordersStatusFilter) params.set('status', ordersStatusFilter);
      const res = await fetch(`/api/seller/affiliate/orders?${params.toString()}`, {
        headers: getHeadersRef.current(),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setOrders(Array.isArray(data.orders) ? data.orders : []);
        if (data.summary) setOrdersSummary(data.summary);
      }
    } catch {}
    setLoadingOrders(false);
  }, [ordersRoleFilter, ordersStatusFilter]);

  useEffect(() => {
    fetchRequestsAll();
    fetchPartners();
    fetchListings();
    fetchWebhooks();
  }, [fetchRequestsAll, fetchPartners, fetchListings, fetchWebhooks]);

  useEffect(() => {
    if (affiliateSubTab === 'orders') {
      fetchAffiliateOrders();
    }
  }, [affiliateSubTab, fetchAffiliateOrders]);

  // --- Handlers: Partnerships ---
  const handleApproveRequest = async (id: string, shopName: string) => {
    if (!window.confirm(t('sellerAffiliate.approveConfirm'))) return;
    setIsApprovingId(id);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/seller/affiliate/requests/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        headers: getHeadersRef.current(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSuccessMsg(data.message || t('sellerAffiliate.statusApproved'));
        if (data.status === 'APPROVED' && data.rawKey) {
          setRevealedPairKeyData({ partnerShopName: shopName, rawKey: data.rawKey });
        }
        await fetchRequestsAll();
        await fetchPartners();
      } else {
        setErrorMsg(data?.error || t('sellerAffiliate.actionFailed'));
      }
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
    setIsApprovingId(null);
  };

  const handleRejectRequest = async (id: string) => {
    if (!window.confirm(t('sellerAffiliate.rejectConfirm'))) return;
    setIsRejectingId(id);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/seller/affiliate/requests/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        headers: getHeadersRef.current(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSuccessMsg(data.message || t('sellerAffiliate.statusRejected'));
        await fetchRequestsAll();
      } else {
        setErrorMsg(data?.error || t('sellerAffiliate.actionFailed'));
      }
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
    setIsRejectingId(null);
  };

  const handleRevokePartner = async (partnershipId: string) => {
    if (!partnershipId) return;
    if (!window.confirm(t('sellerAffiliate.revokePartnerConfirm'))) return;
    setIsRevokingId(partnershipId);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/seller/affiliate/partners/${encodeURIComponent(partnershipId)}`, {
        method: 'DELETE',
        headers: getHeadersRef.current(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSuccessMsg(data.message || t('sellerAffiliate.statusRevoked'));
        await fetchPartners();
        await fetchRequestsAll();
      } else {
        setErrorMsg(data?.error || t('sellerAffiliate.actionFailed'));
      }
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
    setIsRevokingId(null);
  };

  const handleSendAffiliateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = supplierCodeInput.trim();
    if (!target) return;
    setIsSendingReq(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/seller/affiliate/requests', {
        method: 'POST',
        headers: getHeadersRef.current(),
        body: JSON.stringify({
          supplier_seller_id: target,
          note: requestNoteInput.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSuccessMsg(data.message || t('sellerAffiliate.sendRequestBtn'));
        setSupplierCodeInput('');
        setRequestNoteInput('');
        await fetchRequestsAll();
      } else {
        setErrorMsg(data?.error || t('sellerAffiliate.actionFailed'));
      }
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
    setIsSendingReq(false);
  };

  // --- Handlers: Assign / Edit Listings ---
  const openAssignModal = (prod: any) => {
    setListingModalMode('assign');
    setModalTargetItem(prod);
    setFormMarkupType('PERCENT');
    setFormMarkupValue('10');
    setFormPriceMode('FORMULA');
    const base = Number(prod.base_price ?? prod.price_core ?? 0);
    setFormLockedPrice(String(Math.round(base * 1.1)));
    setFormShowSupplier(true);
  };

  const openEditListingModal = (listing: any) => {
    setListingModalMode('edit');
    setModalTargetItem(listing);
    setFormMarkupType(listing.markup_type === 'FIXED' ? 'FIXED' : 'PERCENT');
    setFormMarkupValue(String(Number(listing.markup_value ?? 0)));
    setFormPriceMode(listing.price_mode === 'LOCKED' ? 'LOCKED' : 'FORMULA');
    setFormLockedPrice(
      String(
        Number(
          listing.locked_price ?? listing.my_selling_price ?? listing.origin_price ?? 0
        )
      )
    );
    setFormShowSupplier(Number(listing.show_supplier ?? 1) === 1);
  };

  const handleSubmitListingModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTargetItem || !listingModalMode) return;
    setIsSavingListing(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const markupNum = Math.max(0, parseFloat(formMarkupValue) || 0);
      const lockedNum = Math.max(0, Math.round(parseFloat(formLockedPrice) || 0));

      if (listingModalMode === 'assign') {
        if (!selectedSupplierCatalog?.partnershipId) {
          throw new Error(t('sellerAffiliate.actionFailed'));
        }
        const res = await fetch('/api/seller/affiliate/listings', {
          method: 'POST',
          headers: getHeadersRef.current(),
          body: JSON.stringify({
            partnership_id: selectedSupplierCatalog.partnershipId,
            supplier_product_id: modalTargetItem.id,
            markup_type: formMarkupType,
            markup_value: markupNum,
            price_mode: formPriceMode,
            show_supplier: formShowSupplier ? 1 : 0,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || t('sellerAffiliate.actionFailed'));
        }
        setListingModalMode(null);
        setSuccessMsg(data.message || t('sellerAffiliate.assignBtn'));
        await fetchListings();
        if (selectedSupplierCatalog) {
          await fetchSupplierCatalog(
            selectedSupplierCatalog.supplierId,
            selectedSupplierCatalog.name,
            selectedSupplierCatalog.partnershipId
          );
        }
        fetchProducts();
      } else {
        const res = await fetch(
          `/api/seller/affiliate/listings/${encodeURIComponent(modalTargetItem.id)}`,
          {
            method: 'PUT',
            headers: getHeadersRef.current(),
            body: JSON.stringify({
              markup_type: formMarkupType,
              markup_value: markupNum,
              price_mode: formPriceMode,
              locked_price: formPriceMode === 'LOCKED' && lockedNum > 0 ? lockedNum : undefined,
              show_supplier: formShowSupplier ? 1 : 0,
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || t('sellerAffiliate.actionFailed'));
        }
        setListingModalMode(null);
        setSuccessMsg(data.message || t('sellerAffiliate.confirmSaveListingBtn'));
        await fetchListings();
        fetchProducts();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('sellerAffiliate.networkError'));
    }
    setIsSavingListing(false);
  };

  const handleRemoveListing = async (listingId: string) => {
    if (!window.confirm(t('sellerAffiliate.removeListingConfirm'))) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/seller/affiliate/listings/${encodeURIComponent(listingId)}`, {
        method: 'DELETE',
        headers: getHeadersRef.current(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSuccessMsg(data.message || t('sellerAffiliate.removeListingBtn'));
        await fetchListings();
        fetchProducts();
      } else {
        setErrorMsg(data?.error || t('sellerAffiliate.actionFailed'));
      }
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
  };

  // --- Handlers: Webhooks ---
  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWebhook(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/seller/webhooks', {
        method: 'POST',
        headers: getHeadersRef.current(),
        body: JSON.stringify({
          name: whName.trim(),
          webhook_url: whUrl.trim(),
          events: [whEvent],
          timeout_ms: Number(whTimeoutMs) || 5000,
          retry_max: Number(whRetryMax) || 2,
          is_active: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || t('sellerAffiliate.actionFailed'));
      }
      setShowWebhookModal(false);
      setWhName('');
      setWhUrl('');
      setWhEvent('order.paid');
      if (data.raw_hmac_secret) {
        setOneTimeWebhookSecret(String(data.raw_hmac_secret));
      }
      setSuccessMsg(t('sellerAffiliate.whCreateBtn'));
      await fetchWebhooks();
    } catch (err: any) {
      setErrorMsg(err?.message || t('sellerAffiliate.networkError'));
    }
    setSavingWebhook(false);
  };

  const handlePingWebhook = async (id: string) => {
    setWebhookBusyId(`ping:${id}`);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/seller/webhooks/${encodeURIComponent(id)}/test`, {
        method: 'POST',
        headers: getHeadersRef.current(),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setSuccessMsg(t('sellerAffiliate.whPingSuccess'));
      } else {
        setSuccessMsg(t('sellerAffiliate.whPingRecorded'));
      }
      await fetchWebhooks();
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
    setWebhookBusyId(null);
  };

  const handleToggleWebhook = async (hook: any) => {
    setWebhookBusyId(`toggle:${hook.id}`);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seller/webhooks/${encodeURIComponent(hook.id)}`, {
        method: 'PATCH',
        headers: getHeadersRef.current(),
        body: JSON.stringify({ is_active: Number(hook.is_active) !== 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setErrorMsg(data?.error || t('sellerAffiliate.actionFailed'));
      } else {
        await fetchWebhooks();
      }
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
    setWebhookBusyId(null);
  };

  const handleRotateWebhookSecret = async (hook: any) => {
    if (!window.confirm(t('sellerAffiliate.whRotateConfirm', { name: hook.name }))) return;
    setWebhookBusyId(`rotate:${hook.id}`);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seller/webhooks/${encodeURIComponent(hook.id)}`, {
        method: 'PATCH',
        headers: getHeadersRef.current(),
        body: JSON.stringify({ rotate_secret: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        if (data.raw_hmac_secret) {
          setOneTimeWebhookSecret(String(data.raw_hmac_secret));
        }
        await fetchWebhooks();
      } else {
        setErrorMsg(data?.error || t('sellerAffiliate.actionFailed'));
      }
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
    setWebhookBusyId(null);
  };

  const handleDeleteWebhook = async (hook: any) => {
    if (!window.confirm(t('sellerAffiliate.whDeleteConfirm', { name: hook.name }))) return;
    setWebhookBusyId(`del:${hook.id}`);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seller/webhooks/${encodeURIComponent(hook.id)}`, {
        method: 'DELETE',
        headers: getHeadersRef.current(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        await fetchWebhooks();
      } else {
        setErrorMsg(data?.error || t('sellerAffiliate.actionFailed'));
      }
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
    setWebhookBusyId(null);
  };

  const handleRetryDelivery = async (deliveryId: string) => {
    setWebhookBusyId(`retry:${deliveryId}`);
    setErrorMsg('');
    try {
      const res = await fetch(
        `/api/seller/webhooks/deliveries/${encodeURIComponent(deliveryId)}/retry`,
        {
          method: 'POST',
          headers: getHeadersRef.current(),
        }
      );
      await res.json().catch(() => ({}));
      await fetchWebhooks();
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
    setWebhookBusyId(null);
  };

  // --- UI Helpers ---
  const renderPartnershipBadge = (status: string) => {
    const st = String(status || '').toUpperCase();
    if (st === 'APPROVED') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          {t('sellerAffiliate.statusApproved')}
        </span>
      );
    }
    if (st === 'PENDING_ADMIN') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">
          {t('sellerAffiliate.statusPendingAdmin')}
        </span>
      );
    }
    if (st === 'PENDING') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30">
          {t('sellerAffiliate.statusPending')}
        </span>
      );
    }
    if (st === 'SUSPENDED') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-500/15 text-orange-600 dark:text-orange-300 border border-orange-500/30">
          {t('sellerAffiliate.statusSuspended')}
        </span>
      );
    }
    if (st === 'REVOKED') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-destructive/15 text-destructive border border-destructive/30">
          {t('sellerAffiliate.statusRevoked')}
        </span>
      );
    }
    return (
      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
        {t('sellerAffiliate.statusRejected')}
      </span>
    );
  };

  const renderListingStatusBadge = (status: string) => {
    const st = String(status || '').toUpperCase();
    if (st === 'ACTIVE') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          {t('sellerAffiliate.listingActive')}
        </span>
      );
    }
    if (st === 'SUPPLIER_DISABLED') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-300">
          {t('sellerAffiliate.listingDisabled')}
        </span>
      );
    }
    if (st === 'OUT_OF_STOCK') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/15 text-destructive">
          {t('sellerAffiliate.listingOos')}
        </span>
      );
    }
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
        {t('sellerAffiliate.listingHidden')}
      </span>
    );
  };

  const renderWarningLabel = (warn?: string | null) => {
    if (!warn) return null;
    if (warn === 'ANTI_LOSS_PAUSED') return t('sellerAffiliate.warnAntiLossPaused');
    if (warn === 'ADMIN_SUSPENDED') return t('sellerAffiliate.warnAdminSuspended');
    if (warn === 'PARTNERSHIP_REVOKED') return t('sellerAffiliate.warnPartnershipRevoked');
    return warn;
  };

  const renderEscrowLabel = (status: string) => {
    switch (String(status || '').toUpperCase()) {
      case 'RELEASED':
        return { label: t('sellerAffiliate.escrowReleased'), cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' };
      case 'HELD':
        return { label: t('sellerAffiliate.escrowHeld'), cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' };
      case 'DISPUTED':
        return { label: t('sellerAffiliate.escrowDisputed'), cls: 'bg-destructive/15 text-destructive' };
      case 'REFUNDED':
        return { label: t('sellerAffiliate.escrowRefunded'), cls: 'bg-rose-500/15 text-rose-500' };
      case 'EXPIRED':
        return { label: t('sellerAffiliate.escrowExpired'), cls: 'bg-muted text-muted-foreground' };
      case 'DELIVERED':
        return { label: t('sellerAffiliate.escrowDelivered'), cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' };
      case 'CANCELLED':
        return { label: t('sellerAffiliate.escrowCancelled'), cls: 'bg-muted text-muted-foreground' };
      case 'PROCESSING':
        return { label: t('sellerAffiliate.escrowProcessing'), cls: 'bg-indigo-500/15 text-indigo-500' };
      default:
        return { label: t('sellerAffiliate.escrowPendingPayment'), cls: 'bg-muted text-muted-foreground' };
    }
  };

  const pendingIncomingCount = incomingRequests.filter(
    (r) => r.status === 'PENDING' || r.status === 'PENDING_ADMIN'
  ).length;
  const antiLossCount = myListings.filter((l) => l.price_warning === 'ANTI_LOSS_PAUSED').length;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Feedback Notifications */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center justify-between gap-2">
          <span className="truncate">{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="shrink-0 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-between gap-2">
          <span className="truncate">{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg('')} className="shrink-0 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Anti-Loss Alert Banner */}
      {antiLossCount > 0 && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-semibold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {t('sellerAffiliate.antiLossAlertBanner', { count: antiLossCount })}
            </span>
          </div>
          {affiliateSubTab !== 'reseller' && (
            <button
              type="button"
              onClick={() => setAffiliateSubTab('reseller')}
              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold shrink-0 cursor-pointer"
            >
              {t('sellerAffiliate.resellerTab')}
            </button>
          )}
        </div>
      )}

      {/* Top Banner & 4-Sub-tab Switcher */}
      <div className="p-5 rounded-2xl bg-card border border-border flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1 min-w-0">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary shrink-0" />
            <span className="truncate">{t('sellerAffiliate.tabTitle')}</span>
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('sellerAffiliate.tabDesc')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border shrink-0">
          <button
            type="button"
            onClick={() => setAffiliateSubTab('supplier')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              affiliateSubTab === 'supplier'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>{t('sellerAffiliate.supplierTab')}</span>
            {pendingIncomingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px]">
                {pendingIncomingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAffiliateSubTab('reseller')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              affiliateSubTab === 'reseller'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>{t('sellerAffiliate.resellerTab')}</span>
            {antiLossCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px]">
                {antiLossCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAffiliateSubTab('webhooks')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              affiliateSubTab === 'webhooks'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>{t('sellerAffiliate.webhooksTab')}</span>
          </button>

          <button
            type="button"
            onClick={() => setAffiliateSubTab('orders')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              affiliateSubTab === 'orders'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>{t('sellerAffiliate.ordersTab')}</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: SUPPLIER */}
      {affiliateSubTab === 'supplier' && (
        <div className="space-y-6">
          {/* Card 1: Incoming Requests (24 + 14 + 22 + 18 + 22 = 100%) */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                <span>{t('sellerAffiliate.supplierRequestsTitle')}</span>
              </h4>
              <button
                type="button"
                onClick={fetchRequestsAll}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground text-xs flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingIncoming ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingIncoming && incomingRequests.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                {t('sellerAffiliate.loadingText')}
              </div>
            ) : incomingRequests.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('sellerAffiliate.noRequests')}
              </div>
            ) : (
              <table className="table-fixed w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2.5 px-2.5 w-[24%] font-semibold">{t('sellerAffiliate.colResellerShop')}</th>
                    <th className="py-2.5 px-2.5 w-[14%] font-semibold">{t('sellerAffiliate.colRequestDate')}</th>
                    <th className="py-2.5 px-2.5 w-[22%] font-semibold">{t('sellerAffiliate.colNote')}</th>
                    <th className="py-2.5 px-2.5 w-[18%] font-semibold text-center">{t('sellerAffiliate.colStatus')}</th>
                    <th className="py-2.5 px-2.5 w-[22%] font-semibold text-right">{t('sellerAffiliate.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {incomingRequests.map((req) => {
                    const rName = req.reseller_name || req.reseller_seller_id;
                    return (
                      <tr key={req.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-2.5 font-bold text-foreground truncate" title={rName}>
                          {rName}
                        </td>
                        <td className="py-3 px-2.5 text-muted-foreground truncate">
                          {fmtDate(req.created_at)}
                        </td>
                        <td
                          className="py-3 px-2.5 text-muted-foreground font-mono text-[11px] truncate"
                          title={req.api_key_prefix || req.reseller_slug || '—'}
                        >
                          {req.api_key_prefix || req.reseller_slug || '—'}
                        </td>
                        <td className="py-3 px-2.5 text-center">
                          {renderPartnershipBadge(req.status)}
                        </td>
                        <td className="py-3 px-2.5 text-right">
                          {req.status === 'PENDING' ? (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleApproveRequest(req.id, rName)}
                                disabled={isApprovingId === req.id}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 font-bold text-[11px] disabled:opacity-50 cursor-pointer"
                              >
                                {isApprovingId === req.id ? '...' : t('sellerAffiliate.approveBtn')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectRequest(req.id)}
                                disabled={isRejectingId === req.id}
                                className="px-2.5 py-1 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25 font-bold text-[11px] disabled:opacity-50 cursor-pointer"
                              >
                                {isRejectingId === req.id ? '...' : t('sellerAffiliate.rejectBtn')}
                              </button>
                            </div>
                          ) : req.status === 'PENDING_ADMIN' ? (
                            <span
                              className="text-[11px] text-amber-600 dark:text-amber-300 font-medium truncate block"
                              title={t('sellerAffiliate.awaitingAdminHint')}
                            >
                              {t('sellerAffiliate.statusPendingAdmin')}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Card 2: Approved / Partner Resellers (26 + 18 + 10 + 16 + 14 + 16 = 100%) */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Store className="w-4 h-4 text-primary" />
                <span>{t('sellerAffiliate.partnerShopsTitle')}</span>
              </h4>
              <button
                type="button"
                onClick={fetchPartners}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground text-xs flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPartners ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingPartners && partners.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                {t('sellerAffiliate.loadingText')}
              </div>
            ) : partners.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('sellerAffiliate.noPartners')}
              </div>
            ) : (
              <table className="table-fixed w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2.5 px-2.5 w-[26%] font-semibold">{t('sellerAffiliate.colPartnerName')}</th>
                    <th className="py-2.5 px-2.5 w-[18%] font-semibold">{t('sellerAffiliate.colKeyPrefix')}</th>
                    <th className="py-2.5 px-2 w-[10%] font-semibold text-center">{t('sellerAffiliate.colActiveListings')}</th>
                    <th className="py-2.5 px-2.5 w-[16%] font-semibold text-right">{t('sellerAffiliate.colTotalRevenue')}</th>
                    <th className="py-2.5 px-2.5 w-[14%] font-semibold text-center">{t('sellerAffiliate.colConnectedAt')}</th>
                    <th className="py-2.5 px-2.5 w-[16%] font-semibold text-right">{t('sellerAffiliate.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {partners.map((partner) => {
                    const pid = partner.partnership_id || partner.id;
                    const pName = partner.reseller_name || partner.reseller_seller_id;
                    const pStatus = String(partner.partnership_status || partner.status || '').toUpperCase();
                    const prefix = partner.api_key_prefix || '—';

                    return (
                      <tr key={pid} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-2.5 truncate" title={pName}>
                          <div className="font-bold text-foreground truncate">{pName}</div>
                          <div className="mt-0.5">{renderPartnershipBadge(pStatus)}</div>
                        </td>
                        <td className="py-3 px-2.5 truncate" title={prefix}>
                          <code className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold text-primary text-[10px] truncate block">
                            {prefix}
                          </code>
                        </td>
                        <td className="py-3 px-2 text-center font-bold text-foreground">
                          {fmtNum(partner.active_listings_count)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-bold text-foreground truncate">
                          {fmtNum(partner.total_revenue_core)} Core
                        </td>
                        <td className="py-3 px-2.5 text-center text-muted-foreground truncate">
                          {fmtDate(partner.connected_at || partner.created_at)}
                        </td>
                        <td className="py-3 px-2.5 text-right">
                          {(pStatus === 'APPROVED' || pStatus === 'SUSPENDED') ? (
                            <button
                              type="button"
                              onClick={() => handleRevokePartner(pid)}
                              disabled={isRevokingId === pid}
                              className="px-2.5 py-1 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25 font-bold text-[11px] disabled:opacity-50 cursor-pointer"
                            >
                              {isRevokingId === pid ? '...' : t('sellerAffiliate.revokePartnerBtn')}
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: RESELLER */}
      {affiliateSubTab === 'reseller' && (
        <div className="space-y-6">
          {/* Card 1: Send Partnership Request */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                <span>{t('sellerAffiliate.connectSupplierTitle')}</span>
              </h4>
              <p className="text-xs text-muted-foreground">
                {t('sellerAffiliate.connectSupplierDesc')}
              </p>
            </div>

            <form onSubmit={handleSendAffiliateRequest} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    {t('sellerAffiliate.supplierCodeLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierCodeInput}
                    onChange={(e) => setSupplierCodeInput(e.target.value)}
                    placeholder={t('sellerAffiliate.supplierCodePlaceholder')}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    {t('sellerAffiliate.requestNoteLabel')}
                  </label>
                  <input
                    type="text"
                    value={requestNoteInput}
                    onChange={(e) => setRequestNoteInput(e.target.value)}
                    placeholder={t('sellerAffiliate.requestNotePlaceholder')}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSendingReq || !supplierCodeInput.trim()}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSendingReq ? t('sellerAffiliate.sending') : t('sellerAffiliate.sendRequestBtn')}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Outgoing Requests (30 + 16 + 24 + 30 = 100%) */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span>{t('sellerAffiliate.mySentRequestsTitle')}</span>
              </h4>
              <button
                type="button"
                onClick={fetchRequestsAll}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground text-xs flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingOutgoing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingOutgoing && outgoingRequests.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                {t('sellerAffiliate.loadingText')}
              </div>
            ) : outgoingRequests.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('sellerAffiliate.noSentRequests')}
              </div>
            ) : (
              <table className="table-fixed w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2.5 px-2.5 w-[30%] font-semibold">{t('sellerAffiliate.colSupplierShop')}</th>
                    <th className="py-2.5 px-2.5 w-[16%] font-semibold">{t('sellerAffiliate.colRequestDate')}</th>
                    <th className="py-2.5 px-2.5 w-[24%] font-semibold text-center">{t('sellerAffiliate.colStatus')}</th>
                    <th className="py-2.5 px-2.5 w-[30%] font-semibold text-right">{t('sellerAffiliate.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {outgoingRequests.map((req) => {
                    const sName = req.supplier_name || req.supplier_seller_id;
                    return (
                      <tr key={req.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-2.5 truncate" title={sName}>
                          <div className="font-bold text-foreground truncate">{sName}</div>
                          {req.api_key_prefix && (
                            <div className="text-[10px] font-mono text-muted-foreground truncate">
                              {req.api_key_prefix}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2.5 text-muted-foreground truncate">
                          {fmtDate(req.created_at)}
                        </td>
                        <td className="py-3 px-2.5 text-center">
                          {renderPartnershipBadge(req.status)}
                        </td>
                        <td className="py-3 px-2.5 text-right">
                          {req.status === 'APPROVED' ? (
                            <button
                              type="button"
                              onClick={() =>
                                fetchSupplierCatalog(req.supplier_seller_id, sName, req.id)
                              }
                              className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Package className="w-3.5 h-3.5" />
                              <span>{t('sellerAffiliate.openCatalogBtn')}</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Card 3: Supplier Open Catalog (30 + 15 + 13 + 13 + 13 + 16 = 100%) */}
          {selectedSupplierCatalog && (
            <div className="p-5 rounded-2xl bg-card border border-primary/40 space-y-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2 min-w-0">
                  <Package className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate">
                    {t('sellerAffiliate.catalogTitle')}:{' '}
                    <strong className="text-primary">{selectedSupplierCatalog.name}</strong>
                  </span>
                </h4>
                <button
                  type="button"
                  onClick={() => setSelectedSupplierCatalog(null)}
                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {loadingCatalog ? (
                <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                  {t('sellerAffiliate.loadingText')}
                </div>
              ) : supplierCatalog.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  {t('sellerAffiliate.noCatalogProducts')}
                </div>
              ) : (
                <table className="table-fixed w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2.5 px-2.5 w-[30%] font-semibold">{t('sellerAffiliate.colProduct')}</th>
                      <th className="py-2.5 px-2.5 w-[15%] font-semibold text-right">{t('sellerAffiliate.colBasePrice')}</th>
                      <th className="py-2.5 px-2 w-[13%] font-semibold text-center">{t('sellerAffiliate.colDiscount')}</th>
                      <th className="py-2.5 px-2 w-[13%] font-semibold text-center">{t('sellerAffiliate.colCommission')}</th>
                      <th className="py-2.5 px-2 w-[13%] font-semibold text-center">{t('sellerAffiliate.colMap')}</th>
                      <th className="py-2.5 px-2.5 w-[16%] font-semibold text-right">{t('sellerAffiliate.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {supplierCatalog.map((prod) => {
                      const base = Number(prod.base_price ?? prod.price_core ?? 0);
                      const isPhysical = String(prod.product_type || '').toLowerCase() === 'physical';
                      const alreadyListed = Boolean(prod.is_already_listed);
                      const hasStock = prod.has_stock !== false;

                      return (
                        <tr key={prod.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              {prod.cover_url && (
                                <img
                                  src={prod.cover_url}
                                  alt=""
                                  className="w-7 h-7 rounded-lg object-cover shrink-0 border border-border"
                                />
                              )}
                              <div className="min-w-0">
                                <div className="font-bold text-foreground truncate" title={prod.name}>
                                  {prod.name}
                                </div>
                                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                                  <span>
                                    {isPhysical
                                      ? t('sellerAffiliate.badgePhysical')
                                      : t('sellerAffiliate.badgeDigital')}
                                  </span>
                                  {!isPhysical && (
                                    <span>
                                      ·{' '}
                                      {t('sellerAffiliate.stockLabel', {
                                        count: fmtNum(prod.digital_stock_count),
                                      })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2.5 text-right font-bold text-foreground truncate">
                            {fmtNum(base)} Core
                          </td>
                          <td className="py-3 px-2 text-center text-emerald-500 font-semibold">
                            {Number(prod.resell_discount_pct || 0)}%
                          </td>
                          <td className="py-3 px-2 text-center text-primary font-semibold">
                            {Number(prod.resell_commission_pct || 0)}%
                          </td>
                          <td className="py-3 px-2 text-center text-muted-foreground truncate">
                            {Number(prod.resell_map_price || 0) > 0
                              ? fmtNum(prod.resell_map_price)
                              : '—'}
                          </td>
                          <td className="py-3 px-2.5 text-right">
                            {alreadyListed ? (
                              <span className="inline-flex px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                {t('sellerAffiliate.alreadyListedBadge')}
                              </span>
                            ) : !hasStock ? (
                              <span className="inline-flex px-2 py-1 rounded-lg bg-muted text-muted-foreground text-[10px] font-semibold">
                                {t('sellerAffiliate.outOfStockBadge')}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openAssignModal(prod)}
                                className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-[11px] shadow-sm hover:opacity-95 cursor-pointer"
                              >
                                {t('sellerAffiliate.assignBtn')}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Card 4: My Assigned Listings (26 + 16 + 12 + 14 + 16 + 16 = 100%) */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" />
                <span>{t('sellerAffiliate.myListingsTitle')}</span>
              </h4>
              <button
                type="button"
                onClick={fetchListings}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground text-xs flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingListings ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingListings && myListings.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                {t('sellerAffiliate.loadingText')}
              </div>
            ) : myListings.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('sellerAffiliate.noListings')}
              </div>
            ) : (
              <table className="table-fixed w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2.5 px-2.5 w-[26%] font-semibold">{t('sellerAffiliate.colProductAndSupplier')}</th>
                    <th className="py-2.5 px-2.5 w-[16%] font-semibold text-right">{t('sellerAffiliate.colSellingPrice')}</th>
                    <th className="py-2.5 px-2 w-[12%] font-semibold text-center">{t('sellerAffiliate.colMarkup')}</th>
                    <th className="py-2.5 px-2 w-[14%] font-semibold text-center">{t('sellerAffiliate.colPriceMode')}</th>
                    <th className="py-2.5 px-2 w-[16%] font-semibold text-center">{t('sellerAffiliate.colSyncStatus')}</th>
                    <th className="py-2.5 px-2.5 w-[16%] font-semibold text-right">{t('sellerAffiliate.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {myListings.map((listing) => {
                    const sellPrice = Number(listing.my_selling_price ?? listing.selling_price ?? 0);
                    const origPrice = Number(listing.origin_price ?? 0);
                    const mapPrice = Number(listing.origin_map_price ?? listing.resell_map_price ?? 0);
                    const supName = listing.supplier_name || listing.supplier_seller_id;
                    const warnText = renderWarningLabel(listing.price_warning);

                    return (
                      <tr key={listing.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {listing.cover_url && (
                              <img
                                src={listing.cover_url}
                                alt=""
                                className="w-7 h-7 rounded-lg object-cover shrink-0 border border-border"
                              />
                            )}
                            <div className="min-w-0">
                              <div
                                className="font-bold text-foreground truncate"
                                title={listing.product_name}
                              >
                                {listing.product_name}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate" title={supName}>
                                {t('sellerAffiliate.supplierPrefix', { name: supName })}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-2.5 text-right truncate">
                          <div className="font-bold text-foreground truncate">
                            {fmtNum(sellPrice)} Core
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {t('sellerAffiliate.originPriceShort', { price: fmtNum(origPrice) })}
                          </div>
                          {mapPrice > 0 && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 truncate">
                              {t('sellerAffiliate.mapPriceShort', { price: fmtNum(mapPrice) })}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-2 text-center font-semibold text-primary truncate">
                          {listing.markup_type === 'PERCENT'
                            ? `+${Number(listing.markup_value || 0)}%`
                            : `+${fmtNum(listing.markup_value)} Core`}
                        </td>

                        <td className="py-3 px-2 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${
                              listing.price_mode === 'FORMULA'
                                ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                                : 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                            }`}
                          >
                            {listing.price_mode === 'FORMULA'
                              ? t('sellerAffiliate.modeFormulaShort')
                              : t('sellerAffiliate.modeLockedShort')}
                          </span>
                        </td>

                        <td className="py-3 px-2 text-center">
                          <div>{renderListingStatusBadge(listing.status)}</div>
                          {warnText && (
                            <div
                              className="text-[10px] font-bold text-rose-600 dark:text-rose-400 truncate mt-1"
                              title={warnText}
                            >
                              {warnText}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-2.5 text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditListingModal(listing)}
                              className="px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{t('sellerAffiliate.editListingBtn')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveListing(listing.id)}
                              className="px-2 py-1 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-[11px] font-semibold cursor-pointer"
                            >
                              {t('sellerAffiliate.removeListingBtn')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: STORE WEBHOOKS (HMAC) */}
      {affiliateSubTab === 'webhooks' && (
        <div className="space-y-6">
          {/* One-time Webhook Secret Banner */}
          {oneTimeWebhookSecret && (
            <div className="p-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-300">
                  {t('sellerAffiliate.whSecretOnceTitle')}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t('sellerAffiliate.whSecretOnceDesc')}
                </p>
                <code className="block text-xs font-mono font-bold text-foreground break-all select-all">
                  {oneTimeWebhookSecret}
                </code>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(oneTimeWebhookSecret);
                    setCopiedWebhookSecret(true);
                    setTimeout(() => setCopiedWebhookSecret(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  {copiedWebhookSecret ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWebhookSecret ? t('sellerAffiliate.copiedBtn') : t('sellerAffiliate.copyBtn')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOneTimeWebhookSecret(null)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Webhooks List (24 + 26 + 16 + 12 + 22 = 100%) */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate">{t('sellerAffiliate.whTitle')}</span>
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('sellerAffiliate.whSubtitle')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={fetchWebhooks}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingWebhooks ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowWebhookModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('sellerAffiliate.whCreateBtn')}</span>
                </button>
              </div>
            </div>

            {loadingWebhooks && webhooks.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                {t('sellerAffiliate.loadingText')}
              </div>
            ) : webhooks.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('sellerAffiliate.whNoWebhooks')}
              </div>
            ) : (
              <table className="table-fixed w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2.5 px-2.5 w-[24%] font-semibold">{t('sellerAffiliate.whColName')}</th>
                    <th className="py-2.5 px-2.5 w-[26%] font-semibold">{t('sellerAffiliate.whColUrlSecret')}</th>
                    <th className="py-2.5 px-2 w-[16%] font-semibold">{t('sellerAffiliate.whColEventsTimeout')}</th>
                    <th className="py-2.5 px-2 w-[12%] font-semibold text-center">{t('sellerAffiliate.whColState')}</th>
                    <th className="py-2.5 px-2.5 w-[22%] font-semibold text-right">{t('sellerAffiliate.whColActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {webhooks.map((hook) => {
                    const isActive = Number(hook.is_active) === 1;
                    const evList = Array.isArray(hook.events) ? hook.events.join(', ') : 'order.paid';
                    const isBusy = webhookBusyId?.endsWith(`:${hook.id}`);

                    return (
                      <tr key={hook.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-2.5 font-bold text-foreground truncate" title={hook.name}>
                          {hook.name}
                        </td>
                        <td className="py-3 px-2.5 truncate">
                          <div className="truncate text-foreground" title={hook.webhook_url}>
                            {hook.webhook_url}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground truncate">
                            {hook.secret_prefix}
                          </div>
                        </td>
                        <td className="py-3 px-2 truncate">
                          <div className="font-mono text-[11px] text-foreground truncate" title={evList}>
                            {evList}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {hook.timeout_ms}ms · retry {hook.retry_max}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isActive
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isActive ? t('sellerAffiliate.whActive') : t('sellerAffiliate.whInactive')}
                          </span>
                          {hook.last_status_code != null && (
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                              HTTP {hook.last_status_code}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2.5 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1">
                            <button
                              type="button"
                              disabled={Boolean(isBusy || loadingWebhooks)}
                              onClick={() => handlePingWebhook(hook.id)}
                              title={t('sellerAffiliate.whPingBtn')}
                              aria-label={t('sellerAffiliate.whPingBtn')}
                              className="px-2 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-600 dark:text-sky-300 text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Play className="w-3 h-3" />
                              <span>{t('sellerAffiliate.whPingBtn')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(isBusy || loadingWebhooks)}
                              onClick={() => handleToggleWebhook(hook)}
                              title={t('sellerAffiliate.whToggleBtn')}
                              aria-label={t('sellerAffiliate.whToggleBtn')}
                              className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Power className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(isBusy || loadingWebhooks)}
                              onClick={() => handleRotateWebhookSecret(hook)}
                              title={t('sellerAffiliate.whRotateBtn')}
                              aria-label={t('sellerAffiliate.whRotateBtn')}
                              className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(isBusy || loadingWebhooks)}
                              onClick={() => handleDeleteWebhook(hook)}
                              title={t('sellerAffiliate.whDeleteBtn')}
                              aria-label={t('sellerAffiliate.whDeleteBtn')}
                              className="p-1.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Deliveries Log (22 + 16 + 14 + 12 + 22 + 14 = 100%) */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <span>{t('sellerAffiliate.whDeliveriesTitle')}</span>
            </h4>

            {deliveries.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {t('sellerAffiliate.whNoDeliveries')}
              </div>
            ) : (
              <table className="table-fixed w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2.5 px-2.5 w-[22%] font-semibold">{t('sellerAffiliate.whDelColHookOrder')}</th>
                    <th className="py-2.5 px-2 w-[16%] font-semibold">{t('sellerAffiliate.whDelColEvent')}</th>
                    <th className="py-2.5 px-2 w-[14%] font-semibold text-center">{t('sellerAffiliate.whDelColStatusHttp')}</th>
                    <th className="py-2.5 px-2 w-[12%] font-semibold text-center">{t('sellerAffiliate.whDelColAttempts')}</th>
                    <th className="py-2.5 px-2 w-[22%] font-semibold">{t('sellerAffiliate.whDelColError')}</th>
                    <th className="py-2.5 px-2.5 w-[14%] font-semibold text-right">{t('sellerAffiliate.whDelColAction')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {deliveries.map((d) => {
                    const isOk = d.delivery_status === 'DELIVERED';
                    return (
                      <tr key={d.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-2.5 px-2.5 truncate">
                          <div className="font-semibold text-foreground truncate" title={d.webhook_name || d.webhook_id}>
                            {d.webhook_name || d.webhook_id}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground truncate">
                            {d.order_code || d.order_id}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 font-mono text-[11px] truncate">{d.event_type}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isOk
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                            }`}
                          >
                            {d.delivery_status}
                          </span>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {d.http_status != null ? `HTTP ${d.http_status}` : '—'}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono">{d.attempts ?? 1}</td>
                        <td
                          className="py-2.5 px-2 text-[11px] text-muted-foreground truncate"
                          title={d.error_message || d.response_snippet || '—'}
                        >
                          {d.error_message || d.response_snippet || '—'}
                        </td>
                        <td className="py-2.5 px-2.5 text-right">
                          {!isOk ? (
                            <button
                              type="button"
                              disabled={Boolean(webhookBusyId === `retry:${d.id}` || loadingWebhooks)}
                              onClick={() => handleRetryDelivery(d.id)}
                              className="px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {t('sellerAffiliate.whRetryBtn')}
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: 3-WAY ORDERS LEDGER */}
      {affiliateSubTab === 'orders' && (
        <div className="space-y-5">
          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-card border border-border">
              <div className="text-[11px] text-muted-foreground font-medium truncate">
                {t('sellerAffiliate.ordersSumTotal')}
              </div>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {fmtNum(ordersSummary.total_orders)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {t('sellerAffiliate.ordersSumRoles', {
                  sup: fmtNum(ordersSummary.as_supplier_orders),
                  res: fmtNum(ordersSummary.as_reseller_orders),
                })}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border">
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium truncate">
                {t('sellerAffiliate.ordersSumSupplier')}
              </div>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {fmtNum(ordersSummary.supplier_payout_total)} Core
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border">
              <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium truncate">
                {t('sellerAffiliate.ordersSumReseller')}
              </div>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {fmtNum(ordersSummary.reseller_payout_total)} Core
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border">
              <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium truncate">
                {t('sellerAffiliate.ordersSumPlatformFee')}
              </div>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {fmtNum(ordersSummary.platform_fee_total)} Core
              </div>
            </div>
          </div>

          {/* Orders Filter & Table (18 + 22 + 12 + 14 + 20 + 14 = 100%) */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-primary" />
                  <span>{t('sellerAffiliate.ordersTitle')}</span>
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('sellerAffiliate.ordersSubtitle')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={ordersRoleFilter}
                  onChange={(e) => setOrdersRoleFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs"
                >
                  <option value="all">{t('sellerAffiliate.ordersFilterAll')}</option>
                  <option value="supplier">{t('sellerAffiliate.ordersFilterSupplier')}</option>
                  <option value="reseller">{t('sellerAffiliate.ordersFilterReseller')}</option>
                </select>
                <select
                  value={ordersStatusFilter}
                  onChange={(e) => setOrdersStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs"
                >
                  <option value="">{t('sellerAffiliate.ordersAllStatuses')}</option>
                  <option value="PAID">PAID (HELD)</option>
                  <option value="COMPLETED">COMPLETED (RELEASED)</option>
                  <option value="PENDING_PAYMENT">PENDING_PAYMENT</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="DELIVERED">DELIVERED</option>
                  <option value="REPORTED">REPORTED (DISPUTED)</option>
                  <option value="RESOLVED_BUYER_REFUND">RESOLVED_BUYER_REFUND</option>
                  <option value="EXPIRED">EXPIRED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
                <button
                  type="button"
                  onClick={fetchAffiliateOrders}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {loadingOrders ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                {t('sellerAffiliate.loadingText')}
              </div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('sellerAffiliate.ordersNoOrders')}
              </div>
            ) : (
              <table className="table-fixed w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2.5 px-2.5 w-[18%] font-semibold">{t('sellerAffiliate.ordersColCodeDate')}</th>
                    <th className="py-2.5 px-2.5 w-[22%] font-semibold">{t('sellerAffiliate.ordersColProductPartner')}</th>
                    <th className="py-2.5 px-2 w-[12%] font-semibold text-center">{t('sellerAffiliate.ordersColMyRole')}</th>
                    <th className="py-2.5 px-2.5 w-[14%] font-semibold text-right">{t('sellerAffiliate.ordersColMyPayout')}</th>
                    <th className="py-2.5 px-2 w-[20%] font-semibold">{t('sellerAffiliate.ordersColBreakdown')}</th>
                    <th className="py-2.5 px-2.5 w-[14%] font-semibold text-right">{t('sellerAffiliate.ordersColEscrow')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {orders.map((ord) => {
                    const esc = renderEscrowLabel(ord.escrow_status);
                    const s = ord.split || {};
                    const supPay = Number(s.supplierPayout || 0) + Number(s.shippingFee || 0);
                    const resPay = Number(s.resellerPayout || 0);
                    const feePay = Number(s.platformFee ?? ord.fee_core ?? 0);

                    return (
                      <tr key={ord.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-2.5 truncate">
                          <div className="font-mono font-bold text-foreground truncate" title={ord.order_code}>
                            {ord.order_code}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {fmtDate(ord.created_at)} · {ord.payment_method}
                          </div>
                        </td>

                        <td className="py-3 px-2.5 truncate">
                          <div className="font-semibold text-foreground truncate" title={ord.product_name}>
                            {ord.product_name}
                          </div>
                          <div
                            className="text-[10px] text-muted-foreground truncate"
                            title={`${ord.supplier_name || ord.supplier_seller_id} -> ${ord.reseller_name || ord.seller_id}`}
                          >
                            {ord.supplier_name || ord.supplier_seller_id} →{' '}
                            {ord.reseller_name || ord.seller_id}
                          </div>
                        </td>

                        <td className="py-3 px-2 text-center truncate">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                              ord.my_role === 'SUPPLIER'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                            }`}
                          >
                            {ord.my_role === 'SUPPLIER'
                              ? t('sellerAffiliate.ordersRoleSupplier')
                              : t('sellerAffiliate.ordersRoleReseller')}
                          </span>
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {fmtNum(ord.price_core)} Core
                          </div>
                        </td>

                        <td className="py-3 px-2.5 text-right font-bold text-foreground truncate">
                          {fmtNum(ord.my_payout_core)} Core
                        </td>

                        <td
                          className="py-3 px-2 text-[10px] text-muted-foreground truncate"
                          title={t('sellerAffiliate.ordersSplitLine', {
                            sup: fmtNum(supPay),
                            res: fmtNum(resPay),
                            fee: fmtNum(feePay),
                          })}
                        >
                          {t('sellerAffiliate.ordersSplitLine', {
                            sup: fmtNum(supPay),
                            res: fmtNum(resPay),
                            fee: fmtNum(feePay),
                          })}
                        </td>

                        <td className="py-3 px-2.5 text-right">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${esc.cls}`}>
                            {esc.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN OR EDIT LISTING */}
      {listingModalMode && modalTargetItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                <span>
                  {listingModalMode === 'edit'
                    ? t('sellerAffiliate.editModalTitle')
                    : t('sellerAffiliate.assignModalTitle')}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setListingModalMode(null)}
                className="cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-muted/40 rounded-xl border border-border flex items-center gap-3">
              {modalTargetItem.cover_url && (
                <img
                  src={modalTargetItem.cover_url}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border"
                />
              )}
              <div className="min-w-0">
                <div className="font-bold text-xs text-foreground truncate">
                  {modalTargetItem.name || modalTargetItem.product_name}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t('sellerAffiliate.colBasePrice')}:{' '}
                  <strong className="text-foreground">
                    {fmtNum(
                      modalTargetItem.base_price ??
                        modalTargetItem.origin_price ??
                        modalTargetItem.price_core
                    )}{' '}
                    Core
                  </strong>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmitListingModal} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.markupTypeLabel')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormMarkupType('PERCENT')}
                    className={`p-2.5 rounded-xl border font-bold transition-all cursor-pointer ${
                      formMarkupType === 'PERCENT'
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {t('sellerAffiliate.markupPercent')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMarkupType('FIXED')}
                    className={`p-2.5 rounded-xl border font-bold transition-all cursor-pointer ${
                      formMarkupType === 'FIXED'
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {t('sellerAffiliate.markupFixed')}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.markupValueLabel')} ({formMarkupType === 'PERCENT' ? '%' : 'Core'})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  required
                  value={formMarkupValue}
                  onChange={(e) => setFormMarkupValue(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.priceModeLabel')}
                </label>
                <select
                  value={formPriceMode}
                  onChange={(e) => setFormPriceMode(e.target.value === 'LOCKED' ? 'LOCKED' : 'FORMULA')}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                >
                  <option value="FORMULA">{t('sellerAffiliate.modeFormula')}</option>
                  <option value="LOCKED">{t('sellerAffiliate.modeLocked')}</option>
                </select>
              </div>

              {listingModalMode === 'edit' && formPriceMode === 'LOCKED' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    {t('sellerAffiliate.lockedPriceLabel')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={formLockedPrice}
                    onChange={(e) => setFormLockedPrice(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary font-bold"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {t('sellerAffiliate.lockedPriceHint')}
                  </p>
                </div>
              )}

              <label className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border cursor-pointer">
                <span className="text-xs font-semibold text-foreground">
                  {t('sellerAffiliate.showSupplierLabel')}
                </span>
                <input
                  type="checkbox"
                  checked={formShowSupplier}
                  onChange={(e) => setFormShowSupplier(e.target.checked)}
                  className="w-4 h-4 rounded text-primary focus:ring-primary"
                />
              </label>

              {listingModalMode === 'edit' && modalTargetItem.price_warning && (
                <p className="text-[11px] text-amber-600 dark:text-amber-300 bg-amber-500/10 rounded-xl p-2.5">
                  {t('sellerAffiliate.editUnconditionalClearNote')}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setListingModalMode(null)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted cursor-pointer"
                >
                  {t('sellerAffiliate.cancelBtn')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingListing}
                  className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSavingListing
                    ? t('sellerAffiliate.savingText')
                    : listingModalMode === 'edit'
                    ? t('sellerAffiliate.confirmSaveListingBtn')
                    : t('sellerAffiliate.confirmAssignBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE STORE WEBHOOK */}
      {showWebhookModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Webhook className="w-5 h-5 text-primary" />
                <span>{t('sellerAffiliate.whModalTitle')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                className="cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWebhook} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-muted-foreground mb-1">
                  {t('sellerAffiliate.whFieldName')}
                </label>
                <input
                  type="text"
                  required
                  value={whName}
                  onChange={(e) => setWhName(e.target.value)}
                  placeholder={t('sellerAffiliate.whFieldNamePlaceholder')}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                />
              </div>

              <div>
                <label className="block font-semibold text-muted-foreground mb-1">
                  {t('sellerAffiliate.whFieldUrl')}
                </label>
                <input
                  type="url"
                  required
                  value={whUrl}
                  onChange={(e) => setWhUrl(e.target.value)}
                  placeholder={t('sellerAffiliate.whFieldUrlPlaceholder')}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                />
              </div>

              <div>
                <label className="block font-semibold text-muted-foreground mb-1">
                  {t('sellerAffiliate.whFieldEvents')}
                </label>
                <select
                  value={whEvent}
                  onChange={(e) => setWhEvent(e.target.value === '*' ? '*' : 'order.paid')}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                >
                  <option value="order.paid">{t('sellerAffiliate.whEventOrderPaid')}</option>
                  <option value="*">{t('sellerAffiliate.whEventAllFuture')}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-muted-foreground mb-1">
                    {t('sellerAffiliate.whFieldTimeout')}
                  </label>
                  <input
                    type="number"
                    min="1000"
                    max="10000"
                    step="500"
                    value={whTimeoutMs}
                    onChange={(e) => setWhTimeoutMs(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-muted-foreground mb-1">
                    {t('sellerAffiliate.whFieldRetry')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={whRetryMax}
                    onChange={(e) => setWhRetryMax(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWebhookModal(false)}
                  className="px-4 py-2 rounded-xl border border-border font-semibold hover:bg-muted cursor-pointer"
                >
                  {t('sellerAffiliate.cancelBtn')}
                </button>
                <button
                  type="submit"
                  disabled={savingWebhook}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 cursor-pointer"
                >
                  {savingWebhook ? t('sellerAffiliate.savingText') : t('sellerAffiliate.whCreateBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ONE-TIME PAIR API KEY */}
      {revealedPairKeyData && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-primary/40 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-emerald-500">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-foreground">
                {t('sellerAffiliate.approvedModalTitle')}
              </h3>
            </div>

            <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs leading-relaxed font-semibold">
              {t('sellerAffiliate.approvedModalWarning')}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="text-muted-foreground">
                {t('sellerAffiliate.colPartnerName')}:{' '}
                <strong className="text-foreground">{revealedPairKeyData.partnerShopName}</strong>
              </div>
              <div className="relative flex items-center">
                <input
                  type="text"
                  readOnly
                  value={revealedPairKeyData.rawKey}
                  className="w-full font-mono text-xs px-3.5 py-2.5 pr-24 rounded-xl border border-primary/40 bg-muted/60 text-foreground font-bold focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(revealedPairKeyData.rawKey);
                    setCopiedPairKey(true);
                    setTimeout(() => setCopiedPairKey(false), 2500);
                  }}
                  className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1 shadow-sm hover:opacity-95 cursor-pointer"
                >
                  {copiedPairKey ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('sellerAffiliate.copiedBtn')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{t('sellerAffiliate.copyBtn')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setRevealedPairKeyData(null)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-foreground text-background font-bold text-xs shadow hover:opacity-90 cursor-pointer"
              >
                {t('sellerAffiliate.closeModalBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Resell settings modal for supplier products
export const ResellSettingsModal: React.FC<{
  product: any;
  isOpen: boolean;
  onClose: () => void;
  getHeaders: () => Record<string, string>;
  onSuccess: () => void;
  isEn: boolean;
  t: (key: string, params?: Record<string, any>) => string;
}> = ({ product, isOpen, onClose, getHeaders, onSuccess, t }) => {
  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;
  const [resellEnabled, setResellEnabled] = useState<boolean>(
    product?.resell_enabled === 1 || Boolean(product?.resell_enabled)
  );
  const [resellDiscountPct, setResellDiscountPct] = useState<string>(
    product?.resell_discount_pct != null ? String(product.resell_discount_pct) : '0'
  );
  const [resellCommissionPct, setResellCommissionPct] = useState<string>(
    product?.resell_commission_pct != null ? String(product.resell_commission_pct) : '0'
  );
  const [resellMapPrice, setResellMapPrice] = useState<string>(
    product?.resell_map_price != null ? String(product.resell_map_price) : ''
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  if (!isOpen || !product) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seller/products/${encodeURIComponent(product.id)}/resell`, {
        method: 'PUT',
        headers: getHeadersRef.current(),
        body: JSON.stringify({
          resell_enabled: resellEnabled,
          resell_discount_pct: parseFloat(resellDiscountPct) || 0,
          resell_commission_pct: parseFloat(resellCommissionPct) || 0,
          resell_map_price: resellMapPrice ? parseFloat(resellMapPrice) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMsg(data?.error || t('sellerAffiliate.actionFailed'));
      }
    } catch {
      setErrorMsg(t('sellerAffiliate.networkError'));
    }
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            <span>{t('sellerAffiliate.resellSettingsTitle')}</span>
          </h3>
          <button type="button" onClick={onClose} className="cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs font-semibold text-foreground truncate">{product.name}</div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('sellerAffiliate.resellSettingsDesc')}
        </p>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <label className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border cursor-pointer">
            <span className="text-xs font-semibold text-foreground">
              {t('sellerAffiliate.enableResell')}
            </span>
            <input
              type="checkbox"
              checked={resellEnabled}
              onChange={(e) => setResellEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary"
            />
          </label>

          {resellEnabled && (
            <div className="space-y-3 p-3.5 rounded-xl bg-background border border-border">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.discountPct')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={resellDiscountPct}
                  onChange={(e) => setResellDiscountPct(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('sellerAffiliate.discountPctDesc')}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.commissionPct')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={resellCommissionPct}
                  onChange={(e) => setResellCommissionPct(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('sellerAffiliate.commissionPctDesc')}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.mapPrice')}
                </label>
                <input
                  type="number"
                  min="0"
                  value={resellMapPrice}
                  onChange={(e) => setResellMapPrice(e.target.value)}
                  placeholder={t('sellerAffiliate.mapPlaceholder')}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('sellerAffiliate.mapPriceDesc')}
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted cursor-pointer"
            >
              {t('sellerAffiliate.cancelBtn')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? t('sellerAffiliate.savingText') : t('sellerAffiliate.saveSettingsBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
