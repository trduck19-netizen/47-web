import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Link2,
  RefreshCw,
  Plus,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  PauseCircle,
  Ban,
  RotateCcw,
  SlidersHorizontal,
  Package,
  Store,
  AlertTriangle,
  Edit3,
  Search,
  Save,
  Undo2,
  X,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface InterShopAffiliateModuleProps {
  onShowToast?: (
    title: string,
    message?: string,
    type?: 'success' | 'error' | 'info'
  ) => void;
}

type SubTab = 'partnerships' | 'listings' | 'policy';
type PartnershipStatus =
  | 'PENDING_ADMIN'
  | 'PENDING'
  | 'APPROVED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'REJECTED';
type ListingStatus = 'ACTIVE' | 'HIDDEN' | 'SUPPLIER_DISABLED' | 'OUT_OF_STOCK';

interface AffiliatePolicyConfig {
  affiliate_enabled: boolean;
  affiliate_digital_fee_pct: number;
  affiliate_physical_fee_pct: number;
  affiliate_auto_pause_on_loss: boolean;
  affiliate_require_admin_approval: boolean;
  affiliate_max_markup_pct: number;
  affiliate_rate_limit_rpm: number;
}

interface AffiliateKpis {
  total_partnerships: number;
  pending_admin_count: number;
  pending_supplier_count: number;
  approved_count: number;
  suspended_count: number;
  revoked_count: number;
  total_listings: number;
  active_listings: number;
  anti_loss_paused_count: number;
  out_of_stock_count: number;
}

interface PartnershipItem {
  id: string;
  supplier_seller_id: string;
  reseller_seller_id: string;
  status: PartnershipStatus;
  api_key_prefix?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  revoked_at?: string | null;
  supplier_name?: string | null;
  supplier_slug?: string | null;
  reseller_name?: string | null;
  reseller_slug?: string | null;
  active_listings_count?: number | null;
}

interface ListingItem {
  id: string;
  partnership_id: string;
  supplier_seller_id: string;
  reseller_seller_id: string;
  supplier_product_id: string;
  reseller_product_id: string;
  markup_type: 'PERCENT' | 'FIXED';
  markup_value: number;
  price_mode: 'FORMULA' | 'LOCKED';
  locked_price?: number | null;
  show_supplier: number;
  status: ListingStatus;
  price_warning?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  product_name?: string | null;
  cover_url?: string | null;
  product_type?: string | null;
  origin_price?: number | null;
  origin_stock_quantity?: number | null;
  resell_map_price?: number | null;
  resell_discount_pct?: number | null;
  resell_commission_pct?: number | null;
  selling_price?: number | null;
  reseller_product_status?: string | null;
  supplier_name?: string | null;
  reseller_name?: string | null;
}

interface ActiveSellerOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

const DEFAULT_AFFILIATE_POLICY: AffiliatePolicyConfig = {
  affiliate_enabled: true,
  affiliate_digital_fee_pct: 5,
  affiliate_physical_fee_pct: 2,
  affiliate_auto_pause_on_loss: true,
  affiliate_require_admin_approval: true,
  affiliate_max_markup_pct: 500,
  affiliate_rate_limit_rpm: 600,
};

const EMPTY_KPIS: AffiliateKpis = {
  total_partnerships: 0,
  pending_admin_count: 0,
  pending_supplier_count: 0,
  approved_count: 0,
  suspended_count: 0,
  revoked_count: 0,
  total_listings: 0,
  active_listings: 0,
  anti_loss_paused_count: 0,
  out_of_stock_count: 0,
};

function normalizePolicy(raw: any): AffiliatePolicyConfig {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    affiliate_enabled:
      typeof src.affiliate_enabled === 'boolean'
        ? src.affiliate_enabled
        : DEFAULT_AFFILIATE_POLICY.affiliate_enabled,
    affiliate_digital_fee_pct: Number.isFinite(Number(src.affiliate_digital_fee_pct))
      ? Number(src.affiliate_digital_fee_pct)
      : DEFAULT_AFFILIATE_POLICY.affiliate_digital_fee_pct,
    affiliate_physical_fee_pct: Number.isFinite(Number(src.affiliate_physical_fee_pct))
      ? Number(src.affiliate_physical_fee_pct)
      : DEFAULT_AFFILIATE_POLICY.affiliate_physical_fee_pct,
    affiliate_auto_pause_on_loss:
      typeof src.affiliate_auto_pause_on_loss === 'boolean'
        ? src.affiliate_auto_pause_on_loss
        : DEFAULT_AFFILIATE_POLICY.affiliate_auto_pause_on_loss,
    affiliate_require_admin_approval:
      typeof src.affiliate_require_admin_approval === 'boolean'
        ? src.affiliate_require_admin_approval
        : DEFAULT_AFFILIATE_POLICY.affiliate_require_admin_approval,
    affiliate_max_markup_pct: Number.isFinite(Number(src.affiliate_max_markup_pct))
      ? Number(src.affiliate_max_markup_pct)
      : DEFAULT_AFFILIATE_POLICY.affiliate_max_markup_pct,
    affiliate_rate_limit_rpm: Number.isFinite(Number(src.affiliate_rate_limit_rpm))
      ? Number(src.affiliate_rate_limit_rpm)
      : DEFAULT_AFFILIATE_POLICY.affiliate_rate_limit_rpm,
  };
}

export const InterShopAffiliateModule: React.FC<InterShopAffiliateModuleProps> = ({
  onShowToast,
}) => {
  const { t, language } = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';

  const [activeTab, setActiveTab] = useState<SubTab>('partnerships');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [serverPolicy, setServerPolicy] = useState<AffiliatePolicyConfig>(DEFAULT_AFFILIATE_POLICY);
  const [policyForm, setPolicyForm] = useState<AffiliatePolicyConfig>(DEFAULT_AFFILIATE_POLICY);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const [kpis, setKpis] = useState<AffiliateKpis>(EMPTY_KPIS);
  const [partnerships, setPartnerships] = useState<PartnershipItem[]>([]);
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [sellers, setSellers] = useState<ActiveSellerOption[]>([]);

  // Filters
  const [pSearch, setPSearch] = useState('');
  const [pStatusFilter, setPStatusFilter] = useState<string>('ALL');
  const [sellerFilter, setSellerFilter] = useState<string>('');

  const [lSearch, setLSearch] = useState('');
  const [lStatusFilter, setLStatusFilter] = useState<string>('ALL');

  // Create partnership modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSupplierId, setCreateSupplierId] = useState('');
  const [createResellerId, setCreateResellerId] = useState('');
  const [createAutoApprove, setCreateAutoApprove] = useState(true);
  const [creatingPair, setCreatingPair] = useState(false);

  // Edit listing modal
  const [editingListing, setEditingListing] = useState<ListingItem | null>(null);
  const [editForm, setEditForm] = useState({
    price_mode: 'FORMULA' as 'FORMULA' | 'LOCKED',
    markup_type: 'PERCENT' as 'PERCENT' | 'FIXED',
    markup_value: 15,
    locked_price: 0,
    status: 'ACTIVE' as ListingStatus,
    show_supplier: true,
    clear_warning: false,
  });
  const [savingListing, setSavingListing] = useState(false);

  const notify = useCallback(
    (type: 'success' | 'error' | 'info', message: string) => {
      const title =
        type === 'error'
          ? t('intershopAffiliate.toastErrorTitle')
          : type === 'info'
          ? t('intershopAffiliate.toastInfoTitle')
          : t('intershopAffiliate.toastSuccessTitle');
      onShowToast?.(title, message, type);
    },
    [onShowToast, t]
  );

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const token =
        localStorage.getItem('pine_auth_token') ||
        sessionStorage.getItem('pine_auth_token') ||
        '';
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }, []);

  const loadAll = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        // Fetch unfiltered overview so platform KPIs remain accurate before client filtering
        const res = await apiFetch('/api/admin/affiliate');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        const normalizedPolicy = normalizePolicy(data.config);
        setServerPolicy(normalizedPolicy);
        setPolicyForm(normalizedPolicy);
        setKpis(data.kpis || EMPTY_KPIS);
        setPartnerships(Array.isArray(data.partnerships) ? data.partnerships : []);
        setListings(Array.isArray(data.listings) ? data.listings : []);
        setSellers(Array.isArray(data.sellers) ? data.sellers : []);
        if (silent) {
          notify('success', t('intershopAffiliate.toastRefreshed'));
        }
      } catch (err: any) {
        notify('error', err?.message || `Load error`);
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, notify, t]
  );

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  const fmtNum = (val: number | null | undefined) => Number(val || 0).toLocaleString(locale);

  const fmtTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(locale, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const policyDirty = useMemo(() => {
    return (
      policyForm.affiliate_enabled !== serverPolicy.affiliate_enabled ||
      policyForm.affiliate_require_admin_approval !== serverPolicy.affiliate_require_admin_approval ||
      policyForm.affiliate_auto_pause_on_loss !== serverPolicy.affiliate_auto_pause_on_loss ||
      policyForm.affiliate_digital_fee_pct !== serverPolicy.affiliate_digital_fee_pct ||
      policyForm.affiliate_physical_fee_pct !== serverPolicy.affiliate_physical_fee_pct ||
      policyForm.affiliate_max_markup_pct !== serverPolicy.affiliate_max_markup_pct ||
      policyForm.affiliate_rate_limit_rpm !== serverPolicy.affiliate_rate_limit_rpm
    );
  }, [policyForm, serverPolicy]);

  const filteredPartnerships = useMemo(() => {
    const q = pSearch.trim().toLowerCase();
    return partnerships.filter((p) => {
      if (pStatusFilter !== 'ALL' && p.status !== pStatusFilter) return false;
      if (
        sellerFilter &&
        p.supplier_seller_id !== sellerFilter &&
        p.reseller_seller_id !== sellerFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        String(p.supplier_name || '').toLowerCase().includes(q) ||
        String(p.reseller_name || '').toLowerCase().includes(q) ||
        String(p.supplier_slug || '').toLowerCase().includes(q) ||
        String(p.reseller_slug || '').toLowerCase().includes(q) ||
        String(p.id || '').toLowerCase().includes(q) ||
        String(p.api_key_prefix || '').toLowerCase().includes(q)
      );
    });
  }, [partnerships, pSearch, pStatusFilter, sellerFilter]);

  const filteredListings = useMemo(() => {
    const q = lSearch.trim().toLowerCase();
    return listings.filter((l) => {
      if (lStatusFilter === 'ANTI_LOSS_PAUSED') {
        if (l.price_warning !== 'ANTI_LOSS_PAUSED') return false;
      } else if (lStatusFilter !== 'ALL' && l.status !== lStatusFilter) {
        return false;
      }
      if (
        sellerFilter &&
        l.supplier_seller_id !== sellerFilter &&
        l.reseller_seller_id !== sellerFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        String(l.product_name || '').toLowerCase().includes(q) ||
        String(l.supplier_name || '').toLowerCase().includes(q) ||
        String(l.reseller_name || '').toLowerCase().includes(q) ||
        String(l.id || '').toLowerCase().includes(q)
      );
    });
  }, [listings, lSearch, lStatusFilter, sellerFilter]);

  const handleUpdatePartnership = async (
    item: PartnershipItem,
    nextStatus: 'APPROVED' | 'SUSPENDED' | 'REVOKED' | 'REJECTED',
    rotateKey = false
  ) => {
    const supName = item.supplier_name || item.supplier_seller_id;
    const resName = item.reseller_name || item.reseller_seller_id;

    if (nextStatus === 'REVOKED') {
      if (
        !window.confirm(
          t('intershopAffiliate.confirmRevoke', { supplier: supName, reseller: resName })
        )
      ) {
        return;
      }
    } else if (nextStatus === 'SUSPENDED') {
      if (
        !window.confirm(
          t('intershopAffiliate.confirmSuspend', { supplier: supName, reseller: resName })
        )
      ) {
        return;
      }
    } else if (nextStatus === 'REJECTED') {
      if (
        !window.confirm(
          t('intershopAffiliate.confirmReject', { supplier: supName, reseller: resName })
        )
      ) {
        return;
      }
    }

    setBusyId(`p:${item.id}:${nextStatus}`);
    try {
      const res = await apiFetch(`/api/admin/affiliate/partnerships/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, rotate_key: rotateKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const restoredCount = Number(data?.partnership?.restored_listings_count || 0);
      if (restoredCount > 0) {
        notify('success', t('intershopAffiliate.toastRestoredCount', { count: restoredCount }));
      } else if (nextStatus === 'APPROVED' && item.status === 'REVOKED') {
        // Reactivating from REVOKED issues a new key; backend only auto-restores listings from SUSPENDED
        notify('info', t('intershopAffiliate.toastRevokedManualRestoreNote'));
      } else {
        notify('success', t('intershopAffiliate.toastPartnershipUpdated', { status: nextStatus }));
      }

      await loadAll(false);
    } catch (err: any) {
      notify('error', err?.message || `HTTP Error`);
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenCreateModal = () => {
    setCreateSupplierId('');
    setCreateResellerId('');
    setCreateAutoApprove(true);
    setShowCreateModal(true);
  };

  const handleCreatePartnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createSupplierId || !createResellerId || createSupplierId === createResellerId) {
      notify('error', t('intershopAffiliate.validationSameShop'));
      return;
    }

    setCreatingPair(true);
    try {
      const res = await apiFetch('/api/admin/affiliate/partnerships', {
        method: 'POST',
        body: JSON.stringify({
          supplier_seller_id: createSupplierId,
          reseller_seller_id: createResellerId,
          auto_approve: createAutoApprove,
        }),
      });
      const data = await res.json().catch(() => ({}));
      // Handle both 201 (new row) and 200 (reused non-APPROVED pair); 409/4xx triggers error toast
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setShowCreateModal(false);
      notify('success', data?.message || t('intershopAffiliate.toastCreatedPartnership'));
      await loadAll(false);
    } catch (err: any) {
      notify('error', err?.message || `HTTP Error`);
    } finally {
      setCreatingPair(false);
    }
  };

  const openEditListing = (item: ListingItem) => {
    setEditingListing(item);
    setEditForm({
      price_mode: item.price_mode === 'LOCKED' ? 'LOCKED' : 'FORMULA',
      markup_type: item.markup_type === 'FIXED' ? 'FIXED' : 'PERCENT',
      markup_value: Number(item.markup_value ?? 0),
      locked_price: Number(item.locked_price ?? item.selling_price ?? item.origin_price ?? 0),
      status: item.status || 'ACTIVE',
      show_supplier: Number(item.show_supplier ?? 1) === 1,
      clear_warning: Boolean(item.price_warning),
    });
  };

  const handleSaveListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingListing) return;

    setSavingListing(true);
    try {
      const payload: Record<string, any> = {
        markup_type: editForm.markup_type,
        markup_value: Math.max(0, Number(editForm.markup_value) || 0),
        price_mode: editForm.price_mode,
        show_supplier: editForm.show_supplier,
        status: editForm.status,
        clear_warning: editForm.clear_warning,
      };
      if (editForm.price_mode === 'LOCKED') {
        payload.locked_price = Math.max(0, Math.round(Number(editForm.locked_price) || 0));
      }

      const res = await apiFetch(
        `/api/admin/affiliate/listings/${encodeURIComponent(editingListing.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setEditingListing(null);
      notify(
        'success',
        t('intershopAffiliate.toastListingUpdated', {
          price: `${fmtNum(data?.listing?.selling_price)} Core`,
        })
      );
      await loadAll(false);
    } catch (err: any) {
      notify('error', err?.message || `HTTP Error`);
    } finally {
      setSavingListing(false);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      const payload: AffiliatePolicyConfig = {
        affiliate_enabled: Boolean(policyForm.affiliate_enabled),
        affiliate_require_admin_approval: Boolean(policyForm.affiliate_require_admin_approval),
        affiliate_auto_pause_on_loss: Boolean(policyForm.affiliate_auto_pause_on_loss),
        affiliate_digital_fee_pct: Math.min(50, Math.max(0, Number(policyForm.affiliate_digital_fee_pct) || 0)),
        affiliate_physical_fee_pct: Math.min(50, Math.max(0, Number(policyForm.affiliate_physical_fee_pct) || 0)),
        affiliate_max_markup_pct: Math.min(2000, Math.max(0, Number(policyForm.affiliate_max_markup_pct) || 0)),
        affiliate_rate_limit_rpm: Math.min(6000, Math.max(10, Math.round(Number(policyForm.affiliate_rate_limit_rpm) || 10))),
      };

      const res = await apiFetch('/api/admin/seller-config', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const nextPolicy = normalizePolicy(data.config || payload);
      setServerPolicy(nextPolicy);
      setPolicyForm(nextPolicy);
      notify('success', t('intershopAffiliate.toastPolicySaved'));
    } catch (err: any) {
      notify('error', err?.message || `HTTP Error`);
    } finally {
      setSavingPolicy(false);
    }
  };

  const partnershipStatusBadge = (status: PartnershipStatus) => {
    switch (status) {
      case 'PENDING_ADMIN':
        return {
          cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
          label: t('intershopAffiliate.statusPendingAdmin'),
        };
      case 'PENDING':
        return {
          cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
          label: t('intershopAffiliate.statusPending'),
        };
      case 'APPROVED':
        return {
          cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
          label: t('intershopAffiliate.statusApproved'),
        };
      case 'SUSPENDED':
        return {
          cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
          label: t('intershopAffiliate.statusSuspended'),
        };
      case 'REVOKED':
        return {
          cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
          label: t('intershopAffiliate.statusRevoked'),
        };
      default:
        return {
          cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30',
          label: t('intershopAffiliate.statusRejected'),
        };
    }
  };

  const listingStatusBadge = (status: ListingStatus) => {
    switch (status) {
      case 'ACTIVE':
        return {
          cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
          label: t('intershopAffiliate.listingActive'),
        };
      case 'SUPPLIER_DISABLED':
        return {
          cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
          label: t('intershopAffiliate.listingDisabled'),
        };
      case 'OUT_OF_STOCK':
        return {
          cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
          label: t('intershopAffiliate.listingOutOfStock'),
        };
      default:
        return {
          cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30',
          label: t('intershopAffiliate.listingHidden'),
        };
    }
  };

  const warningLabel = (warning?: string | null) => {
    if (!warning) return null;
    if (warning === 'ANTI_LOSS_PAUSED') return t('intershopAffiliate.warnAntiLoss');
    if (warning === 'ADMIN_SUSPENDED') return t('intershopAffiliate.warnAdminSuspended');
    if (warning === 'PARTNERSHIP_REVOKED') return t('intershopAffiliate.warnPartnershipRevoked');
    return warning;
  };

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 truncate">
            <Link2 className="w-5 h-5 text-indigo-500 shrink-0" />
            <span className="truncate">{t('intershopAffiliate.pageTitle')}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('intershopAffiliate.pageSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => loadAll(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('intershopAffiliate.refreshBtn')}
          </button>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('intershopAffiliate.createPartnershipBtn')}
          </button>
        </div>
      </div>

      {/* Live Status Alerts */}
      {!serverPolicy.affiliate_enabled && (
        <div className="rounded-xl border border-rose-300/60 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-950/30 p-3 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs min-w-0">
              <div className="font-semibold text-rose-800 dark:text-rose-300">
                {t('intershopAffiliate.bannerDisabledTitle')}
              </div>
              <p className="text-rose-700 dark:text-rose-200/80 mt-0.5">
                {t('intershopAffiliate.bannerDisabledDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('policy')}
            className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
          >
            {t('intershopAffiliate.bannerGoPolicyBtn')}
          </button>
        </div>
      )}

      {kpis.pending_admin_count > 0 && (
        <div className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs min-w-0">
              <div className="font-semibold text-amber-800 dark:text-amber-300">
                {t('intershopAffiliate.bannerPendingAdminTitle', { count: kpis.pending_admin_count })}
              </div>
              <p className="text-amber-700 dark:text-amber-200/80 mt-0.5">
                {t('intershopAffiliate.bannerPendingAdminDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('partnerships');
              setPStatusFilter('PENDING_ADMIN');
            }}
            className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
          >
            {t('intershopAffiliate.bannerViewQueueBtn')}
          </button>
        </div>
      )}

      {kpis.anti_loss_paused_count > 0 && (
        <div className="rounded-xl border border-orange-300/60 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-950/30 p-3 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
            <div className="text-xs min-w-0">
              <div className="font-semibold text-orange-800 dark:text-orange-300">
                {t('intershopAffiliate.bannerAntiLossTitle', { count: kpis.anti_loss_paused_count })}
              </div>
              <p className="text-orange-700 dark:text-orange-200/80 mt-0.5">
                {t('intershopAffiliate.bannerAntiLossDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('listings');
              setLStatusFilter('ANTI_LOSS_PAUSED');
            }}
            className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white cursor-pointer"
          >
            {t('intershopAffiliate.bannerViewAntiLossBtn')}
          </button>
        </div>
      )}

      {/* 5 KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={() => {
            setActiveTab('partnerships');
            setPStatusFilter('PENDING_ADMIN');
          }}
          className="text-left rounded-xl border border-amber-200/80 dark:border-amber-800/50 bg-white dark:bg-slate-900 p-3 hover:border-amber-400 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400 truncate">
            {t('intershopAffiliate.kpiPendingAdmin')}
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {fmtNum(kpis.pending_admin_count)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {t('intershopAffiliate.kpiPendingAdminHint')}
          </div>
        </button>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 truncate">
            {t('intershopAffiliate.kpiApproved')}
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {fmtNum(kpis.approved_count)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {t('intershopAffiliate.kpiApprovedOf', { total: fmtNum(kpis.total_partnerships) })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
            {t('intershopAffiliate.kpiSuspendedRevoked')}
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {fmtNum(kpis.suspended_count + kpis.revoked_count)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {t('intershopAffiliate.kpiSuspendedRevokedDetail', {
              suspended: fmtNum(kpis.suspended_count),
              revoked: fmtNum(kpis.revoked_count),
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 truncate">
            {t('intershopAffiliate.kpiActiveListings')}
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {fmtNum(kpis.active_listings)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {t('intershopAffiliate.kpiActiveListingsOf', { total: fmtNum(kpis.total_listings) })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setActiveTab('listings');
            setLStatusFilter('ANTI_LOSS_PAUSED');
          }}
          className="text-left rounded-xl border border-rose-200/80 dark:border-rose-800/50 bg-white dark:bg-slate-900 p-3 hover:border-rose-400 transition-colors cursor-pointer col-span-2 sm:col-span-1"
        >
          <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400 truncate">
            {t('intershopAffiliate.kpiAntiLoss')}
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {fmtNum(kpis.anti_loss_paused_count)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {t('intershopAffiliate.kpiAntiLossHint')}
          </div>
        </button>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('partnerships')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'partnerships'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Store className="w-3.5 h-3.5" />
          <span>{t('intershopAffiliate.tabPartnerships')}</span>
          {kpis.pending_admin_count > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950">
              {kpis.pending_admin_count}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('listings')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'listings'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>{t('intershopAffiliate.tabListings')}</span>
          {kpis.anti_loss_paused_count > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
              {kpis.anti_loss_paused_count}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('policy')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'policy'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{t('intershopAffiliate.tabPolicy')}</span>
          {policyDirty && <span className="w-2 h-2 rounded-full bg-amber-400" />}
        </button>
      </div>

      {/* TAB 1: PARTNERSHIPS */}
      {activeTab === 'partnerships' && (
        <div className="space-y-3">
          {/* Toolbar & Status Filter Chips */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'ALL', label: t('intershopAffiliate.filterAll'), count: kpis.total_partnerships },
                {
                  key: 'PENDING_ADMIN',
                  label: t('intershopAffiliate.filterPendingAdmin'),
                  count: kpis.pending_admin_count,
                  highlight: 'amber',
                },
                {
                  key: 'PENDING',
                  label: t('intershopAffiliate.filterPendingSupplier'),
                  count: kpis.pending_supplier_count,
                },
                { key: 'APPROVED', label: t('intershopAffiliate.filterApproved'), count: kpis.approved_count },
                { key: 'SUSPENDED', label: t('intershopAffiliate.filterSuspended'), count: kpis.suspended_count },
                { key: 'REVOKED', label: t('intershopAffiliate.filterRevoked'), count: kpis.revoked_count },
                { key: 'REJECTED', label: t('intershopAffiliate.filterRejected'), count: undefined },
              ].map((chip) => {
                const active = pStatusFilter === chip.key;
                const isAmberHighlight = chip.highlight === 'amber' && !active && (chip.count || 0) > 0;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setPStatusFilter(chip.key)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : isAmberHighlight
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{chip.label}</span>
                    {typeof chip.count === 'number' && (
                      <span className="opacity-80">({chip.count})</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={pSearch}
                  onChange={(e) => setPSearch(e.target.value)}
                  placeholder={t('intershopAffiliate.searchPartnershipPlaceholder')}
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <select
                value={sellerFilter}
                onChange={(e) => setSellerFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t('intershopAffiliate.allSellersOption')}</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rule 9 Single-Screen Partnerships Table: 32 + 20 + 10 + 14 + 24 = 100% */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <table className="table-fixed w-full border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="w-[32%] text-left font-semibold px-3 py-2.5">
                    {t('intershopAffiliate.colPairShops')}
                  </th>
                  <th className="w-[20%] text-left font-semibold px-3 py-2.5">
                    {t('intershopAffiliate.colStatusAndKey')}
                  </th>
                  <th className="w-[10%] text-center font-semibold px-2 py-2.5">
                    {t('intershopAffiliate.colActiveProducts')}
                  </th>
                  <th className="w-[14%] text-left font-semibold px-3 py-2.5">
                    {t('intershopAffiliate.colUpdatedAt')}
                  </th>
                  <th className="w-[24%] text-right font-semibold px-3 py-2.5">
                    {t('intershopAffiliate.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPartnerships.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                      {t('intershopAffiliate.emptyPartnerships')}
                    </td>
                  </tr>
                ) : (
                  filteredPartnerships.map((p) => {
                    const badge = partnershipStatusBadge(p.status);
                    const supLabel = p.supplier_name || p.supplier_seller_id;
                    const resLabel = p.reseller_name || p.reseller_seller_id;
                    const isBusy = busyId?.startsWith(`p:${p.id}:`);

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-3 py-2.5 align-middle">
                          <div
                            className="flex items-center gap-1 font-semibold text-slate-900 dark:text-white min-w-0"
                            title={`${supLabel} -> ${resLabel}`}
                          >
                            <span className="truncate">{supLabel}</span>
                            <ArrowRight className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span className="truncate">{resLabel}</span>
                          </div>
                          <div
                            className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5"
                            title={`${p.supplier_slug || p.supplier_seller_id} / ${p.reseller_slug || p.reseller_seller_id} (${p.id})`}
                          >
                            {p.supplier_slug || p.supplier_seller_id} → {p.reseller_slug || p.reseller_seller_id}
                          </div>
                        </td>

                        <td className="px-3 py-2.5 align-middle">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                          <div
                            className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-1"
                            title={p.api_key_prefix || t('intershopAffiliate.keyNotIssued')}
                          >
                            {p.api_key_prefix || t('intershopAffiliate.keyNotIssued')}
                          </div>
                        </td>

                        <td className="px-2 py-2.5 text-center align-middle font-semibold text-slate-800 dark:text-slate-200">
                          {fmtNum(p.active_listings_count)}
                        </td>

                        <td className="px-3 py-2.5 align-middle text-[11px] text-slate-500 dark:text-slate-400 truncate" title={p.updated_at || p.created_at || ''}>
                          {fmtTime(p.updated_at || p.created_at)}
                        </td>

                        <td className="px-3 py-2.5 align-middle text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1">
                            {(p.status === 'PENDING_ADMIN' || p.status === 'PENDING') && (
                              <>
                                <button
                                  type="button"
                                  disabled={Boolean(isBusy)}
                                  onClick={() => handleUpdatePartnership(p, 'APPROVED')}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  {t('intershopAffiliate.btnApprove')}
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(isBusy)}
                                  onClick={() => handleUpdatePartnership(p, 'REJECTED')}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 disabled:opacity-50 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                  {t('intershopAffiliate.btnReject')}
                                </button>
                              </>
                            )}

                            {p.status === 'APPROVED' && (
                              <>
                                <button
                                  type="button"
                                  disabled={Boolean(isBusy)}
                                  onClick={() => handleUpdatePartnership(p, 'SUSPENDED')}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 disabled:opacity-50 cursor-pointer"
                                >
                                  <PauseCircle className="w-3 h-3" />
                                  {t('intershopAffiliate.btnSuspend')}
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(isBusy)}
                                  onClick={() => handleUpdatePartnership(p, 'REVOKED')}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 cursor-pointer"
                                >
                                  <Ban className="w-3 h-3" />
                                  {t('intershopAffiliate.btnRevoke')}
                                </button>
                              </>
                            )}

                            {p.status === 'SUSPENDED' && (
                              <>
                                <button
                                  type="button"
                                  disabled={Boolean(isBusy)}
                                  onClick={() => handleUpdatePartnership(p, 'APPROVED')}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  {t('intershopAffiliate.btnResume')}
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(isBusy)}
                                  onClick={() => handleUpdatePartnership(p, 'REVOKED')}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 cursor-pointer"
                                >
                                  <Ban className="w-3 h-3" />
                                  {t('intershopAffiliate.btnRevoke')}
                                </button>
                              </>
                            )}

                            {(p.status === 'REVOKED' || p.status === 'REJECTED') && (
                              <button
                                type="button"
                                disabled={Boolean(isBusy)}
                                onClick={() => handleUpdatePartnership(p, 'APPROVED', true)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                {t('intershopAffiliate.btnReactivate')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: RESELLER LISTINGS */}
      {activeTab === 'listings' && (
        <div className="space-y-3">
          {/* Toolbar & Filters */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'ALL', label: t('intershopAffiliate.filterAll'), count: kpis.total_listings },
                {
                  key: 'ANTI_LOSS_PAUSED',
                  label: t('intershopAffiliate.filterAntiLoss'),
                  count: kpis.anti_loss_paused_count,
                  highlight: 'rose',
                },
                { key: 'ACTIVE', label: t('intershopAffiliate.filterListingActive'), count: kpis.active_listings },
                { key: 'SUPPLIER_DISABLED', label: t('intershopAffiliate.filterListingDisabled') },
                { key: 'OUT_OF_STOCK', label: t('intershopAffiliate.filterListingOos'), count: kpis.out_of_stock_count },
                { key: 'HIDDEN', label: t('intershopAffiliate.filterListingHidden') },
              ].map((chip) => {
                const active = lStatusFilter === chip.key;
                const isRoseHighlight = chip.highlight === 'rose' && !active && (chip.count || 0) > 0;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setLStatusFilter(chip.key)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : isRoseHighlight
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{chip.label}</span>
                    {typeof chip.count === 'number' && (
                      <span className="opacity-80">({chip.count})</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={lSearch}
                  onChange={(e) => setLSearch(e.target.value)}
                  placeholder={t('intershopAffiliate.searchListingPlaceholder')}
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <select
                value={sellerFilter}
                onChange={(e) => setSellerFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t('intershopAffiliate.allSellersOption')}</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rule 9 Single-Screen Listings Table: 26 + 20 + 18 + 14 + 12 + 10 = 100% */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <table className="table-fixed w-full border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="w-[26%] text-left font-semibold px-3 py-2.5">
                    {t('intershopAffiliate.colProductAndType')}
                  </th>
                  <th className="w-[20%] text-left font-semibold px-3 py-2.5">
                    {t('intershopAffiliate.colShopsArrow')}
                  </th>
                  <th className="w-[18%] text-left font-semibold px-3 py-2.5">
                    {t('intershopAffiliate.colPricingMap')}
                  </th>
                  <th className="w-[14%] text-left font-semibold px-3 py-2.5">
                    {t('intershopAffiliate.colModeMargin')}
                  </th>
                  <th className="w-[12%] text-left font-semibold px-2 py-2.5">
                    {t('intershopAffiliate.colListingStatus')}
                  </th>
                  <th className="w-[10%] text-right font-semibold px-3 py-2.5">
                    {t('intershopAffiliate.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredListings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                      {t('intershopAffiliate.emptyListings')}
                    </td>
                  </tr>
                ) : (
                  filteredListings.map((l) => {
                    const isPhysical = String(l.product_type || '').toLowerCase() === 'physical';
                    const stBadge = listingStatusBadge(l.status);
                    const warnText = warningLabel(l.price_warning);
                    const supLabel = l.supplier_name || l.supplier_seller_id;
                    const resLabel = l.reseller_name || l.reseller_seller_id;

                    return (
                      <tr
                        key={l.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-3 py-2.5 align-middle">
                          <div
                            className="font-semibold text-slate-900 dark:text-white truncate"
                            title={l.product_name || l.supplier_product_id}
                          >
                            {l.product_name || l.supplier_product_id}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 min-w-0">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                                isPhysical
                                  ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                  : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                              }`}
                            >
                              {isPhysical
                                ? t('intershopAffiliate.badgePhysical')
                                : t('intershopAffiliate.badgeDigital')}
                            </span>
                            {isPhysical && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {t('intershopAffiliate.stockShort', {
                                  count: fmtNum(l.origin_stock_quantity),
                                })}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-2.5 align-middle">
                          <div
                            className="flex items-center gap-1 text-slate-800 dark:text-slate-200 min-w-0"
                            title={`${supLabel} -> ${resLabel}`}
                          >
                            <span className="truncate">{supLabel}</span>
                            <ArrowRight className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span className="truncate">{resLabel}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {Number(l.show_supplier ?? 1) === 1
                              ? t('intershopAffiliate.showSupplierYes')
                              : t('intershopAffiliate.showSupplierNo')}
                          </div>
                        </td>

                        <td className="px-3 py-2.5 align-middle text-[11px]">
                          <div className="text-slate-500 dark:text-slate-400 truncate">
                            {t('intershopAffiliate.priceOriginLabel')} {fmtNum(l.origin_price)}
                          </div>
                          <div className="font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                            {t('intershopAffiliate.priceSellLabel')} {fmtNum(l.selling_price)}
                          </div>
                          {Number(l.resell_map_price || 0) > 0 && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 truncate">
                              {t('intershopAffiliate.priceMapLabel')} {fmtNum(l.resell_map_price)}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-2.5 align-middle text-[11px]">
                          <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {l.price_mode === 'LOCKED'
                              ? t('intershopAffiliate.modeLocked')
                              : t('intershopAffiliate.modeFormula')}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {l.markup_type === 'PERCENT'
                              ? `+${Number(l.markup_value || 0)}%`
                              : `+${fmtNum(l.markup_value)} Core`}
                          </div>
                        </td>

                        <td className="px-2 py-2.5 align-middle">
                          <span
                            className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold border truncate max-w-full ${stBadge.cls}`}
                            title={stBadge.label}
                          >
                            {stBadge.label}
                          </span>
                          {warnText && (
                            <div
                              className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 truncate mt-1"
                              title={warnText}
                            >
                              {warnText}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-2.5 align-middle text-right">
                          <button
                            type="button"
                            onClick={() => openEditListing(l)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            {t('intershopAffiliate.btnEdit')}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DYNAMIC 7-FIELD POLICY */}
      {activeTab === 'policy' && (
        <form
          onSubmit={handleSavePolicy}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                <span>{t('intershopAffiliate.policyTitle')}</span>
                {policyDirty && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    {t('intershopAffiliate.policyDirtyBadge')}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('intershopAffiliate.policySubtitle')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!policyDirty || savingPolicy}
                onClick={() => setPolicyForm(serverPolicy)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                {t('intershopAffiliate.btnResetPolicy')}
              </button>
              <button
                type="submit"
                disabled={savingPolicy}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {t('intershopAffiliate.btnSavePolicy')}
              </button>
            </div>
          </div>

          {/* Boolean Toggles */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 cursor-pointer">
              <input
                type="checkbox"
                checked={policyForm.affiliate_enabled}
                onChange={(e) =>
                  setPolicyForm((prev) => ({ ...prev, affiliate_enabled: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {t('intershopAffiliate.policyToggleEnabled')}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('intershopAffiliate.policyToggleEnabledDesc')}
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-200/80 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/20 cursor-pointer">
              <input
                type="checkbox"
                checked={policyForm.affiliate_require_admin_approval}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    affiliate_require_admin_approval: e.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {t('intershopAffiliate.policyToggleRequireAdmin')}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('intershopAffiliate.policyToggleRequireAdminDesc')}
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 cursor-pointer">
              <input
                type="checkbox"
                checked={policyForm.affiliate_auto_pause_on_loss}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    affiliate_auto_pause_on_loss: e.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {t('intershopAffiliate.policyToggleAutoPause')}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('intershopAffiliate.policyToggleAutoPauseDesc')}
                </p>
              </div>
            </label>
          </div>

          {/* Numeric Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {t('intershopAffiliate.policyFieldDigitalFee')}
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={50}
                value={policyForm.affiliate_digital_fee_pct}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    affiliate_digital_fee_pct: Number(e.target.value),
                  }))
                }
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {t('intershopAffiliate.policyFieldDigitalFeeHint')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {t('intershopAffiliate.policyFieldPhysicalFee')}
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={50}
                value={policyForm.affiliate_physical_fee_pct}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    affiliate_physical_fee_pct: Number(e.target.value),
                  }))
                }
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {t('intershopAffiliate.policyFieldPhysicalFeeHint')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {t('intershopAffiliate.policyFieldMaxMarkup')}
              </label>
              <input
                type="number"
                step="1"
                min={0}
                max={2000}
                value={policyForm.affiliate_max_markup_pct}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    affiliate_max_markup_pct: Number(e.target.value),
                  }))
                }
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {t('intershopAffiliate.policyFieldMaxMarkupHint')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {t('intershopAffiliate.policyFieldRateLimit')}
              </label>
              <input
                type="number"
                step="10"
                min={10}
                max={6000}
                value={policyForm.affiliate_rate_limit_rpm}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    affiliate_rate_limit_rpm: Number(e.target.value),
                  }))
                }
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {t('intershopAffiliate.policyFieldRateLimitHint')}
              </p>
            </div>
          </div>
        </form>
      )}

      {/* MODAL: CREATE PARTNERSHIP */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('intershopAffiliate.createModalTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePartnership} className="p-4 space-y-3 text-xs">
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                {t('intershopAffiliate.createModalSubtitle')}
              </p>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  {t('intershopAffiliate.fieldSupplierShop')}
                </label>
                <select
                  required
                  value={createSupplierId}
                  onChange={(e) => {
                    const nextSup = e.target.value;
                    setCreateSupplierId(nextSup);
                    if (createResellerId === nextSup) setCreateResellerId('');
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="">{t('intershopAffiliate.selectShopPlaceholder')}</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  {t('intershopAffiliate.fieldResellerShop')}
                </label>
                <select
                  required
                  value={createResellerId}
                  onChange={(e) => setCreateResellerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="">{t('intershopAffiliate.selectShopPlaceholder')}</option>
                  {sellers
                    .filter((s) => s.id !== createSupplierId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status})
                      </option>
                    ))}
                </select>
              </div>

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createAutoApprove}
                  onChange={(e) => setCreateAutoApprove(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {t('intershopAffiliate.fieldAutoApprove')}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('intershopAffiliate.fieldAutoApproveHint')}
                  </p>
                </div>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {t('intershopAffiliate.btnCancel')}
                </button>
                <button
                  type="submit"
                  disabled={creatingPair}
                  className="px-3.5 py-1.5 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 cursor-pointer"
                >
                  {t('intershopAffiliate.btnSubmitCreate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT LISTING */}
      {editingListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate pr-2">
                {t('intershopAffiliate.editModalTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setEditingListing(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveListing} className="p-4 space-y-3 text-xs">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white truncate">
                  {editingListing.product_name || editingListing.supplier_product_id}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('intershopAffiliate.editRefSupplier')}:{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {editingListing.supplier_name || editingListing.supplier_seller_id} →{' '}
                    {editingListing.reseller_name || editingListing.reseller_seller_id}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                  <div>
                    <span className="text-slate-500">{t('intershopAffiliate.editRefOriginPrice')}: </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {fmtNum(editingListing.origin_price)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">{t('intershopAffiliate.editRefDiscount')}: </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {Number(editingListing.resell_discount_pct || 0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">{t('intershopAffiliate.editRefCommission')}: </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {Number(editingListing.resell_commission_pct || 0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">{t('intershopAffiliate.editRefMapPrice')}: </span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {fmtNum(editingListing.resell_map_price)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    {t('intershopAffiliate.fieldPriceMode')}
                  </label>
                  <select
                    value={editForm.price_mode}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        price_mode: e.target.value === 'LOCKED' ? 'LOCKED' : 'FORMULA',
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="FORMULA">{t('intershopAffiliate.modeFormula')}</option>
                    <option value="LOCKED">{t('intershopAffiliate.modeLocked')}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    {t('intershopAffiliate.fieldListingStatus')}
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        status: e.target.value as ListingStatus,
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="ACTIVE">{t('intershopAffiliate.listingActive')}</option>
                    <option value="SUPPLIER_DISABLED">{t('intershopAffiliate.listingDisabled')}</option>
                    <option value="OUT_OF_STOCK">{t('intershopAffiliate.listingOutOfStock')}</option>
                    <option value="HIDDEN">{t('intershopAffiliate.listingHidden')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    {t('intershopAffiliate.fieldMarkupType')}
                  </label>
                  <select
                    value={editForm.markup_type}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        markup_type: e.target.value === 'FIXED' ? 'FIXED' : 'PERCENT',
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="PERCENT">{t('intershopAffiliate.markupPercentOpt')}</option>
                    <option value="FIXED">{t('intershopAffiliate.markupFixedOpt')}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    {t('intershopAffiliate.fieldMarkupValue')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={editForm.markup_value}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        markup_value: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {editForm.price_mode === 'LOCKED' && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    {t('intershopAffiliate.fieldLockedPrice')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="100"
                    value={editForm.locked_price}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        locked_price: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.show_supplier}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, show_supplier: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-slate-800 dark:text-slate-200 font-medium">
                  {t('intershopAffiliate.fieldShowSupplier')}
                </span>
              </label>

              {editForm.status !== 'ACTIVE' && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.clear_warning}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, clear_warning: e.target.checked }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-slate-700 dark:text-slate-300">
                    {t('intershopAffiliate.fieldClearWarning')}
                  </span>
                </label>
              )}

              {editForm.status === 'ACTIVE' && editingListing.price_warning && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-2.5 py-1.5">
                  {t('intershopAffiliate.fieldClearWarningNote')}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingListing(null)}
                  className="px-3 py-1.5 rounded-lg font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {t('intershopAffiliate.btnCancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingListing}
                  className="px-3.5 py-1.5 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 cursor-pointer"
                >
                  {t('intershopAffiliate.btnSave')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
