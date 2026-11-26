import React, { useState, useEffect, useCallback } from 'react';
import {
  PlugZap,
  RefreshCw,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Webhook,
  BookOpen,
  FileSpreadsheet,
  Package,
  Trash2,
  Edit3,
  Play,
  RotateCcw,
  Coins,
  Copy,
  Check,
  X,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface SupplierConnectorsModuleProps {
  onShowToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

type SubTab = 'suppliers' | 'products' | 'ledger' | 'webhooks' | 'docs';

interface SupplierItem {
  id: string;
  name: string;
  code: string;
  mode: 'POSTPAID_CREDIT' | 'AFFILIATE_POSTBACK' | 'PREPAID_GUARD';
  base_url: string;
  auth_type: string;
  auth_header_name: string;
  api_key_prefix?: string | null;
  webhook_secret_prefix?: string | null;
  has_api_key?: number;
  has_webhook_secret?: number;
  catalog_path?: string | null;
  order_path?: string | null;
  balance_path?: string | null;
  supports_idempotency?: number;
  markup_type: 'PERCENT' | 'FIXED';
  markup_value: number;
  min_margin_core: number;
  credit_limit_core: number;
  credit_used_core: number;
  prepaid_balance_core: number;
  prepaid_min_balance: number;
  auto_pause_enabled: number;
  is_active: number;
  last_sync_at?: string | null;
  last_health_status?: string | null;
  last_error?: string | null;
}

interface SummaryData {
  total_suppliers: number;
  active_suppliers: number;
  total_credit_limit_core: number;
  total_credit_used_core: number;
  total_products: number;
  paused_products: number;
  total_profit_core: number;
  total_ledger_entries: number;
  total_webhooks: number;
  active_webhooks: number;
}

interface MappedProduct {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  external_sku: string;
  external_name: string;
  local_product_id?: string | null;
  supplier_cost_core: number;
  selling_price_core: number;
  profit_core: number;
  external_stock: number;
  anti_loss_paused: number;
  anti_loss_reason?: string | null;
  is_active: number;
  last_synced_at?: string | null;
}

interface LedgerEntry {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  order_code?: string | null;
  external_order_ref?: string | null;
  entry_type: 'ORDER_DEBIT' | 'SETTLEMENT_PAID' | 'REFUND_CREDIT' | 'AFFILIATE_COMMISSION';
  cost_core: number;
  selling_core: number;
  profit_core: number;
  balance_due_after: number;
  status: string;
  actor?: string | null;
  note?: string | null;
  created_at: string;
}

interface SupplierWebhook {
  id: string;
  seller_id: string;
  name: string;
  webhook_url: string;
  secret_prefix: string;
  events_json: string;
  is_active: number;
  timeout_ms: number;
  retry_max: number;
  last_status_code?: number | null;
  last_error?: string | null;
  last_triggered_at?: string | null;
}

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  webhook_name?: string;
  order_code?: string | null;
  event_type: string;
  http_status?: number | null;
  attempts: number;
  delivery_status: string;
  error_message?: string | null;
  created_at: string;
}

const DEFAULT_SUPPLIER_FORM = {
  name: '',
  code: '',
  mode: 'POSTPAID_CREDIT' as 'POSTPAID_CREDIT' | 'AFFILIATE_POSTBACK' | 'PREPAID_GUARD',
  base_url: '',
  auth_type: 'BEARER',
  auth_header_name: 'Authorization',
  api_key: '',
  webhook_secret: '',
  catalog_path: '/catalog',
  order_path: '/orders',
  balance_path: '/balance',
  markup_type: 'PERCENT' as 'PERCENT' | 'FIXED',
  markup_value: 15,
  min_margin_core: 2000,
  credit_limit_core: 5000000,
  supports_idempotency: false,
  auto_pause_enabled: true,
  is_active: true,
};

const DEFAULT_WEBHOOK_FORM = {
  seller_id: 'official_store',
  name: '',
  webhook_url: '',
  hmac_secret: '',
  timeout_ms: 5000,
  retry_max: 2,
};

export const SupplierConnectorsModule: React.FC<SupplierConnectorsModuleProps> = ({ onShowToast }) => {
  const { t, language } = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';

  const [activeTab, setActiveTab] = useState<SubTab>('suppliers');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [modeFilter, setModeFilter] = useState('');

  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [summary, setSummary] = useState<SummaryData>({
    total_suppliers: 0,
    active_suppliers: 0,
    total_credit_limit_core: 0,
    total_credit_used_core: 0,
    total_products: 0,
    paused_products: 0,
    total_profit_core: 0,
    total_ledger_entries: 0,
    total_webhooks: 0,
    active_webhooks: 0,
  });
  const [products, setProducts] = useState<MappedProduct[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [webhooks, setWebhooks] = useState<SupplierWebhook[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);

  // Modals
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState({ ...DEFAULT_SUPPLIER_FORM });
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ ...DEFAULT_WEBHOOK_FORM });
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);

  const [settleTarget, setSettleTarget] = useState<SupplierItem | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleRef, setSettleRef] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [savingSettle, setSavingSettle] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
        const [supRes, prodRes, ledRes, whRes] = await Promise.all([
          apiFetch('/api/admin/suppliers'),
          apiFetch('/api/admin/suppliers/all/products'),
          apiFetch('/api/admin/suppliers/all/ledger'),
          apiFetch('/api/admin/suppliers/webhooks'),
        ]);

        const [supData, prodData, ledData, whData] = await Promise.all([
          supRes.json().catch(() => ({})),
          prodRes.json().catch(() => ({})),
          ledRes.json().catch(() => ({})),
          whRes.json().catch(() => ({})),
        ]);

        if (supData?.success) {
          setSuppliers(Array.isArray(supData.suppliers) ? supData.suppliers : []);
          if (supData.summary) setSummary(supData.summary);
        }
        if (prodData?.success) {
          setProducts(Array.isArray(prodData.products) ? prodData.products : []);
        }
        if (ledData?.success) {
          setLedger(Array.isArray(ledData.ledger) ? ledData.ledger : []);
        }
        if (whData?.success) {
          setWebhooks(Array.isArray(whData.webhooks) ? whData.webhooks : []);
          setDeliveries(Array.isArray(whData.deliveries) ? whData.deliveries : []);
        }
        if (silent) {
          onShowToast?.(t('supplierConnectors.toastLoaded'), 'success');
        }
      } catch (err: any) {
        onShowToast?.(`${t('supplierConnectors.toastError')}: ${err?.message || ''}`, 'error');
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, onShowToast, t]
  );

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  const fmtNum = (val: number | undefined | null) =>
    Number(val || 0).toLocaleString(locale);

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

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onShowToast?.(t('supplierConnectors.toastCopied'), 'success');
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {}
  };

  const openCreateSupplier = () => {
    setEditingSupplierId(null);
    setSupplierForm({ ...DEFAULT_SUPPLIER_FORM });
    setShowSupplierModal(true);
  };

  const openEditSupplier = (item: SupplierItem) => {
    setEditingSupplierId(item.id);
    setSupplierForm({
      name: item.name,
      code: item.code,
      mode: item.mode,
      base_url: item.base_url,
      auth_type: item.auth_type || 'BEARER',
      auth_header_name: item.auth_header_name || 'Authorization',
      api_key: '',
      webhook_secret: '',
      catalog_path: item.catalog_path || '/catalog',
      order_path: item.order_path || '/orders',
      balance_path: item.balance_path || '/balance',
      markup_type: item.markup_type || 'PERCENT',
      markup_value: Number(item.markup_value ?? 15),
      min_margin_core: Number(item.min_margin_core ?? 0),
      credit_limit_core: Number(item.credit_limit_core ?? 0),
      supports_idempotency: Number(item.supports_idempotency) === 1,
      auto_pause_enabled: Number(item.auto_pause_enabled) === 1,
      is_active: Number(item.is_active) === 1,
    });
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSupplier(true);
    try {
      const url = editingSupplierId
        ? `/api/admin/suppliers/${encodeURIComponent(editingSupplierId)}`
        : '/api/admin/suppliers';
      const method = editingSupplierId ? 'PATCH' : 'POST';
      const payload: Record<string, any> = { ...supplierForm };
      if (editingSupplierId && !payload.api_key) delete payload.api_key;
      if (editingSupplierId && !payload.webhook_secret) delete payload.webhook_secret;

      const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setShowSupplierModal(false);
      onShowToast?.(
        editingSupplierId
          ? t('supplierConnectors.toastUpdatedSupplier')
          : t('supplierConnectors.toastCreatedSupplier'),
        'success'
      );
      await loadAll(false);
    } catch (err: any) {
      onShowToast?.(`${t('supplierConnectors.toastError')}: ${err?.message || ''}`, 'error');
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!window.confirm(t('supplierConnectors.confirmDeleteSupplier'))) return;
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/admin/suppliers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      onShowToast?.(t('supplierConnectors.toastDeletedSupplier'), 'success');
      await loadAll(false);
    } catch (err: any) {
      onShowToast?.(`${t('supplierConnectors.toastError')}: ${err?.message || ''}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSupplierAction = async (id: string, action: 'test' | 'sync') => {
    setBusyId(`${id}:${action}`);
    try {
      const res = await apiFetch(`/api/admin/suppliers/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      onShowToast?.(
        data?.success
          ? `${action.toUpperCase()} OK${data?.synced !== undefined ? ` (${data.synced})` : ''}`
          : `${action.toUpperCase()}: ${data?.error || data?.health_status || 'ERROR'}`,
        data?.success ? 'success' : 'warning'
      );
      await loadAll(false);
    } catch (err: any) {
      onShowToast?.(`${t('supplierConnectors.toastError')}: ${err?.message || ''}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTarget) return;
    setSavingSettle(true);
    try {
      const res = await apiFetch(`/api/admin/suppliers/${encodeURIComponent(settleTarget.id)}/settle`, {
        method: 'POST',
        body: JSON.stringify({
          amount_core: Number(settleAmount),
          reference: settleRef.trim() || undefined,
          note: settleNote.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      setSettleTarget(null);
      setSettleAmount('');
      setSettleRef('');
      setSettleNote('');
      onShowToast?.(t('supplierConnectors.toastSettled'), 'success');
      await loadAll(false);
    } catch (err: any) {
      onShowToast?.(`${t('supplierConnectors.toastError')}: ${err?.message || ''}`, 'error');
    } finally {
      setSavingSettle(false);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWebhook(true);
    try {
      const res = await apiFetch('/api/admin/suppliers/webhooks', {
        method: 'POST',
        body: JSON.stringify({
          ...webhookForm,
          events: ['order.paid'],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      setShowWebhookModal(false);
      setWebhookForm({ ...DEFAULT_WEBHOOK_FORM });
      if (data.raw_hmac_secret) setOneTimeSecret(String(data.raw_hmac_secret));
      onShowToast?.(t('supplierConnectors.toastCreatedWebhook'), 'success');
      await loadAll(false);
    } catch (err: any) {
      onShowToast?.(`${t('supplierConnectors.toastError')}: ${err?.message || ''}`, 'error');
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!window.confirm(t('supplierConnectors.confirmDeleteWebhook'))) return;
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/admin/suppliers/webhooks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      onShowToast?.(t('supplierConnectors.toastDeletedWebhook'), 'success');
      await loadAll(false);
    } catch (err: any) {
      onShowToast?.(`${t('supplierConnectors.toastError')}: ${err?.message || ''}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleTestWebhook = async (id: string) => {
    setBusyId(`wh-test:${id}`);
    try {
      const res = await apiFetch(`/api/admin/suppliers/webhooks/${encodeURIComponent(id)}/test`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      onShowToast?.(
        data?.success ? 'HMAC Ping: DELIVERED' : `HMAC Ping: FAILED (${data?.failed || 1})`,
        data?.success ? 'success' : 'warning'
      );
      await loadAll(false);
    } catch (err: any) {
      onShowToast?.(`${t('supplierConnectors.toastError')}: ${err?.message || ''}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRetryDelivery = async (deliveryId: string) => {
    setBusyId(`retry:${deliveryId}`);
    try {
      const res = await apiFetch(
        `/api/admin/suppliers/webhooks/deliveries/${encodeURIComponent(deliveryId)}/retry`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      onShowToast?.(
        data?.success ? 'Retry: DELIVERED' : `Retry: ${data?.error || 'FAILED'}`,
        data?.success ? 'success' : 'warning'
      );
      await loadAll(false);
    } catch (err: any) {
      onShowToast?.(`${t('supplierConnectors.toastError')}: ${err?.message || ''}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    if (modeFilter && s.mode !== modeFilter) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      s.base_url.toLowerCase().includes(q)
    );
  });

  const modeLabel = (mode: string) => {
    if (mode === 'POSTPAID_CREDIT') return t('supplierConnectors.modePostpaid');
    if (mode === 'AFFILIATE_POSTBACK') return t('supplierConnectors.modeAffiliate');
    return t('supplierConnectors.modePrepaid');
  };

  const entryTypeLabel = (type: string) => {
    if (type === 'ORDER_DEBIT') return t('supplierConnectors.entryOrderDebit');
    if (type === 'SETTLEMENT_PAID') return t('supplierConnectors.entrySettlement');
    if (type === 'REFUND_CREDIT') return t('supplierConnectors.entryRefund');
    return t('supplierConnectors.entryAffiliate');
  };

  const originBase = typeof window !== 'undefined' ? window.location.origin : 'https://universal-mall-shop.pages.dev';

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 truncate">
            <PlugZap className="w-5 h-5 text-indigo-500 shrink-0" />
            <span className="truncate">{t('supplierConnectors.pageTitle')}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('supplierConnectors.pageSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => loadAll(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('supplierConnectors.refreshBtn')}
          </button>
          <button
            type="button"
            onClick={() => setShowWebhookModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Webhook className="w-3.5 h-3.5" />
            {t('supplierConnectors.addWebhookBtn')}
          </button>
          <button
            type="button"
            onClick={openCreateSupplier}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('supplierConnectors.addSupplierBtn')}
          </button>
        </div>
      </div>

      {/* Phase 2 Status Banner */}
      <div className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs min-w-0">
          <div className="font-semibold text-amber-800 dark:text-amber-300">
            {t('supplierConnectors.phase2BannerTitle')}
          </div>
          <p className="text-amber-700 dark:text-amber-200/80 mt-0.5">
            {t('supplierConnectors.phase2BannerDesc')}
          </p>
        </div>
      </div>

      {/* One-time HMAC Secret Banner */}
      {oneTimeSecret && (
        <div className="rounded-xl border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
              {t('supplierConnectors.secretOnceNoticeTitle')}
            </div>
            <code className="block text-xs font-mono text-emerald-900 dark:text-emerald-200 break-all mt-1">
              {oneTimeSecret}
            </code>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleCopy('onetime', oneTimeSecret)}
              className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1"
            >
              {copiedKey === 'onetime' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {t('supplierConnectors.btnCopy')}
            </button>
            <button
              type="button"
              onClick={() => setOneTimeSecret(null)}
              className="p-1 rounded-md text-emerald-700 hover:bg-emerald-200/50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="text-[11px] font-medium text-slate-500">{t('supplierConnectors.kpiTotalSuppliers')}</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{summary.total_suppliers}</div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
            {t('supplierConnectors.kpiActive')}: {summary.active_suppliers}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="text-[11px] font-medium text-slate-500">{t('supplierConnectors.kpiCreditUsed')}</div>
          <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
            {fmtNum(summary.total_credit_used_core)} Core
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {t('supplierConnectors.kpiCreditLimit')}: {fmtNum(summary.total_credit_limit_core)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="text-[11px] font-medium text-slate-500">{t('supplierConnectors.kpiMappedProducts')}</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{summary.total_products}</div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
            {t('supplierConnectors.kpiPausedAntiLoss')}: {summary.paused_products}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="text-[11px] font-medium text-slate-500">{t('supplierConnectors.kpiProfitAndWebhooks')}</div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {fmtNum(summary.total_profit_core)} Core
          </div>
          <div className="text-[11px] text-teal-600 dark:text-teal-400 mt-0.5">
            Webhooks: {summary.active_webhooks}/{summary.total_webhooks}
          </div>
        </div>
      </div>

      {/* 5 Sub-Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
        {(
          [
            ['suppliers', t('supplierConnectors.tabSuppliers'), PlugZap],
            ['products', t('supplierConnectors.tabProducts'), Package],
            ['ledger', t('supplierConnectors.tabLedger'), FileSpreadsheet],
            ['webhooks', t('supplierConnectors.tabWebhooks'), Webhook],
            ['docs', t('supplierConnectors.tabDocs'), BookOpen],
          ] as Array<[SubTab, string, React.ComponentType<{ className?: string }>]>
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: EXTERNAL API SUPPLIERS */}
      {activeTab === 'suppliers' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('supplierConnectors.searchPlaceholder')}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
            >
              <option value="">{t('supplierConnectors.filterAllModes')}</option>
              <option value="POSTPAID_CREDIT">{t('supplierConnectors.modePostpaid')}</option>
              <option value="AFFILIATE_POSTBACK">{t('supplierConnectors.modeAffiliate')}</option>
              <option value="PREPAID_GUARD">{t('supplierConnectors.modePrepaid')}</option>
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <table className="table-fixed w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 uppercase">
                  <th className="w-[28%] px-3 py-2">{t('supplierConnectors.colSupplierInfo')}</th>
                  <th className="w-[18%] px-2 py-2">{t('supplierConnectors.colModeAuth')}</th>
                  <th className="w-[18%] px-2 py-2">{t('supplierConnectors.colPricingCredit')}</th>
                  <th className="w-[14%] px-2 py-2">{t('supplierConnectors.colHealth')}</th>
                  <th className="w-[22%] px-2 py-2 text-right">{t('supplierConnectors.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      {t('supplierConnectors.emptySuppliers')}
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900 dark:text-white truncate" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-mono truncate" title={item.code}>
                          {item.code}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate" title={item.base_url}>
                          {item.base_url}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[10px] font-semibold truncate max-w-full">
                          {modeLabel(item.mode)}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-1 truncate">
                          {item.auth_type} {item.api_key_prefix ? `• ${item.api_key_prefix}` : ''}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                          +{item.markup_value}
                          {item.markup_type === 'PERCENT' ? '%' : ' Core'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {fmtNum(item.credit_used_core)} / {fmtNum(item.credit_limit_core)}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            item.is_active
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-slate-500/10 text-slate-500'
                          }`}
                        >
                          {item.is_active
                            ? t('supplierConnectors.statusActive')
                            : t('supplierConnectors.statusInactive')}
                        </span>
                        <div
                          className="text-[10px] text-slate-500 mt-1 truncate"
                          title={item.last_error || item.last_health_status || ''}
                        >
                          {item.last_health_status || t('supplierConnectors.statusNeverSynced')}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => handleSupplierAction(item.id, 'test')}
                            title={t('supplierConnectors.btnTest')}
                            className="px-1.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] inline-flex items-center gap-0.5"
                          >
                            <Play className="w-3 h-3" />
                            {t('supplierConnectors.btnTest')}
                          </button>
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => handleSupplierAction(item.id, 'sync')}
                            title={t('supplierConnectors.btnSync')}
                            className="px-1.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-[11px] inline-flex items-center gap-0.5"
                          >
                            <RefreshCw className="w-3 h-3" />
                            {t('supplierConnectors.btnSync')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSettleTarget(item);
                              setSettleAmount(String(item.credit_used_core || ''));
                            }}
                            title={t('supplierConnectors.btnSettle')}
                            className="px-1.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[11px] inline-flex items-center gap-0.5"
                          >
                            <Coins className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditSupplier(item)}
                            title={t('supplierConnectors.btnEdit')}
                            className="p-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-300"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => handleDeleteSupplier(item.id)}
                            title={t('supplierConnectors.btnDelete')}
                            className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CATALOG & ANTI-LOSS */}
      {activeTab === 'products' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <table className="table-fixed w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 uppercase">
                <th className="w-[28%] px-3 py-2">{t('supplierConnectors.colProdSku')}</th>
                <th className="w-[22%] px-2 py-2">{t('supplierConnectors.colProdSupplier')}</th>
                <th className="w-[20%] px-2 py-2">{t('supplierConnectors.colProdCostSell')}</th>
                <th className="w-[15%] px-2 py-2">{t('supplierConnectors.colProdProfitStock')}</th>
                <th className="w-[15%] px-2 py-2 text-right">{t('supplierConnectors.colProdGuard')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {t('supplierConnectors.emptyProducts')}
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900 dark:text-white truncate" title={p.external_name}>
                        {p.external_name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 truncate">{p.external_sku}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="truncate text-slate-800 dark:text-slate-200">{p.supplier_name || p.supplier_id}</div>
                      <div className="text-[11px] text-slate-500 font-mono truncate">{p.local_product_id || '—'}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="text-slate-500 truncate">{fmtNum(p.supplier_cost_core)} Core</div>
                      <div className="font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                        {fmtNum(p.selling_price_core)} Core
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                        +{fmtNum(p.profit_core)}
                      </div>
                      <div className="text-[11px] text-slate-500">Stock: {fmtNum(p.external_stock)}</div>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {p.anti_loss_paused ? (
                        <span
                          title={p.anti_loss_reason || ''}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-semibold"
                        >
                          <ShieldAlert className="w-3 h-3" />
                          {t('supplierConnectors.antiLossPaused')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
                          <ShieldCheck className="w-3 h-3" />
                          {t('supplierConnectors.antiLossOk')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: CREDIT LEDGER & SETTLEMENT */}
      {activeTab === 'ledger' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <table className="table-fixed w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 uppercase">
                <th className="w-[24%] px-3 py-2">{t('supplierConnectors.colLedgerTime')}</th>
                <th className="w-[20%] px-2 py-2">{t('supplierConnectors.colLedgerSupplier')}</th>
                <th className="w-[18%] px-2 py-2">{t('supplierConnectors.colLedgerType')}</th>
                <th className="w-[22%] px-2 py-2">{t('supplierConnectors.colLedgerMoney')}</th>
                <th className="w-[16%] px-2 py-2 text-right">{t('supplierConnectors.colLedgerStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {t('supplierConnectors.emptyLedger')}
                  </td>
                </tr>
              ) : (
                ledger.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2.5">
                      <div className="text-slate-500 text-[11px]">{fmtTime(row.created_at)}</div>
                      <div className="font-mono text-[11px] text-slate-900 dark:text-white truncate" title={row.external_order_ref || row.order_code || ''}>
                        {row.external_order_ref || row.order_code || row.id}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 truncate">{row.supplier_name || row.supplier_id}</td>
                    <td className="px-2 py-2.5">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold truncate max-w-full">
                        {entryTypeLabel(row.entry_type)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="truncate">
                        {fmtNum(row.cost_core)} / <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+{fmtNum(row.profit_core)}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">Due: {fmtNum(row.balance_due_after)}</div>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[10px] font-semibold">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: SUPPLIER WEBHOOKS & DELIVERIES */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <table className="table-fixed w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 uppercase">
                  <th className="w-[30%] px-3 py-2">{t('supplierConnectors.colWhInfo')}</th>
                  <th className="w-[20%] px-2 py-2">{t('supplierConnectors.colWhSellerEvents')}</th>
                  <th className="w-[18%] px-2 py-2">{t('supplierConnectors.colWhSecret')}</th>
                  <th className="w-[12%] px-2 py-2">{t('supplierConnectors.colWhStatus')}</th>
                  <th className="w-[20%] px-2 py-2 text-right">{t('supplierConnectors.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {webhooks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      {t('supplierConnectors.emptyWebhooks')}
                    </td>
                  </tr>
                ) : (
                  webhooks.map((wh) => (
                    <tr key={wh.id}>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900 dark:text-white truncate" title={wh.name}>
                          {wh.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate" title={wh.webhook_url}>
                          {wh.webhook_url}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="font-mono text-[11px] truncate">{wh.seller_id}</div>
                        <div className="text-[10px] text-slate-500 truncate">{wh.events_json}</div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="font-mono text-[11px] truncate">{wh.secret_prefix}</div>
                        <div className="text-[10px] text-slate-500">
                          HTTP: {wh.last_status_code ?? '—'}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            wh.is_active
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-slate-500/10 text-slate-500'
                          }`}
                        >
                          {wh.is_active ? t('supplierConnectors.statusActive') : t('supplierConnectors.statusInactive')}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => handleTestWebhook(wh.id)}
                            className="px-2 py-1 rounded bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-300 text-[11px] inline-flex items-center gap-1"
                          >
                            <Play className="w-3 h-3" />
                            {t('supplierConnectors.btnTest')}
                          </button>
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => handleDeleteWebhook(wh.id)}
                            className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {t('supplierConnectors.deliveriesHeading')}
            </h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <table className="table-fixed w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 uppercase">
                    <th className="w-[26%] px-3 py-2">{t('supplierConnectors.colDelOrder')}</th>
                    <th className="w-[22%] px-2 py-2">{t('supplierConnectors.colDelWebhook')}</th>
                    <th className="w-[18%] px-2 py-2">{t('supplierConnectors.colDelHttp')}</th>
                    <th className="w-[18%] px-2 py-2">{t('supplierConnectors.colDelStatus')}</th>
                    <th className="w-[16%] px-2 py-2 text-right">{t('supplierConnectors.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        {t('supplierConnectors.emptyDeliveries')}
                      </td>
                    </tr>
                  ) : (
                    deliveries.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2">
                          <div className="font-mono text-[11px] truncate">{d.order_code || d.id}</div>
                          <div className="text-[10px] text-slate-500 truncate">{d.event_type}</div>
                        </td>
                        <td className="px-2 py-2 truncate">{d.webhook_name || d.webhook_id}</td>
                        <td className="px-2 py-2 text-[11px]">
                          HTTP {d.http_status ?? '—'} • #{d.attempts}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            title={d.error_message || ''}
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              d.delivery_status === 'DELIVERED'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {d.delivery_status}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          {d.delivery_status !== 'DELIVERED' && (
                            <button
                              type="button"
                              disabled={busyId !== null}
                              onClick={() => handleRetryDelivery(d.id)}
                              className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[11px] inline-flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              {t('supplierConnectors.btnRetry')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: POSTBACK & HMAC DOCS */}
      {activeTab === 'docs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('supplierConnectors.docsPostbackTitle')}
              </h3>
              <button
                type="button"
                onClick={() => handleCopy('postback-url', `${originBase}/api/webhooks/affiliate-postback`)}
                className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-[11px] inline-flex items-center gap-1"
              >
                {copiedKey === 'postback-url' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {t('supplierConnectors.btnCopy')}
              </button>
            </div>
            <code className="block p-2 rounded-lg bg-slate-950 text-emerald-400 text-[11px] font-mono break-all">
              POST {originBase}/api/webhooks/affiliate-postback
            </code>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('supplierConnectors.docsSignatureNote')}
            </p>
            <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 text-[11px] font-mono overflow-x-auto">
{`Headers:
  Content-Type: application/json
  X-WCG-Supplier-Code: <partner_code>
  X-WCG-Timestamp: 1795680000
  X-WCG-Signature: t=1795680000,v1=<hmac_sha256_hex>

Body:
{
  "external_order_ref": "PARTNER-ORD-1001",
  "order_amount_core": 250000,
  "commission_core": 25000,
  "sub_id": "member_123"
}`}
            </pre>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('supplierConnectors.docsInventoryPushTitle')}
              </h3>
              <button
                type="button"
                onClick={() => handleCopy('inv-url', `${originBase}/api/seller/affiliate/inventory-push`)}
                className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-[11px] inline-flex items-center gap-1"
              >
                {copiedKey === 'inv-url' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {t('supplierConnectors.btnCopy')}
              </button>
            </div>
            <code className="block p-2 rounded-lg bg-slate-950 text-sky-400 text-[11px] font-mono break-all">
              POST {originBase}/api/seller/affiliate/inventory-push
            </code>
            <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 text-[11px] font-mono overflow-x-auto">
{`Headers:
  Content-Type: application/json
  Authorization: Bearer <seller_or_pair_api_key>

Body:
{
  "items": [
    {
      "product_id": "sprod_xxx",
      "price_core": 120000,
      "stock_quantity": 50,
      "resell_enabled": true
    }
  ]
}`}
            </pre>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT SUPPLIER */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveSupplier}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingSupplierId
                  ? t('supplierConnectors.modalEditSupplierTitle')
                  : t('supplierConnectors.modalCreateSupplierTitle')}
              </h3>
              <button type="button" onClick={() => setShowSupplierModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldName')}</span>
                <input
                  required
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldCode')}</span>
                <input
                  required
                  disabled={Boolean(editingSupplierId)}
                  value={supplierForm.code}
                  onChange={(e) => setSupplierForm({ ...supplierForm, code: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-60"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldMode')}</span>
                <select
                  value={supplierForm.mode}
                  onChange={(e) => setSupplierForm({ ...supplierForm, mode: e.target.value as any })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="POSTPAID_CREDIT">{t('supplierConnectors.modePostpaid')}</option>
                  <option value="AFFILIATE_POSTBACK">{t('supplierConnectors.modeAffiliate')}</option>
                  <option value="PREPAID_GUARD">{t('supplierConnectors.modePrepaid')}</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldBaseUrl')}</span>
                <input
                  required
                  type="url"
                  placeholder="https://api.partner.example"
                  value={supplierForm.base_url}
                  onChange={(e) => setSupplierForm({ ...supplierForm, base_url: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldAuthType')}</span>
                <select
                  value={supplierForm.auth_type}
                  onChange={(e) => setSupplierForm({ ...supplierForm, auth_type: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="BEARER">BEARER</option>
                  <option value="API_KEY_HEADER">API_KEY_HEADER</option>
                  <option value="BASIC">BASIC</option>
                  <option value="NONE">NONE</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldAuthHeader')}</span>
                <input
                  value={supplierForm.auth_header_name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, auth_header_name: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldApiKey')}</span>
                <input
                  type="password"
                  value={supplierForm.api_key}
                  onChange={(e) => setSupplierForm({ ...supplierForm, api_key: e.target.value })}
                  placeholder={t('supplierConnectors.fieldApiKeyHint')}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldWebhookSecret')}</span>
                <input
                  type="password"
                  value={supplierForm.webhook_secret}
                  onChange={(e) => setSupplierForm({ ...supplierForm, webhook_secret: e.target.value })}
                  placeholder={t('supplierConnectors.fieldApiKeyHint')}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldMarkupType')}</span>
                <select
                  value={supplierForm.markup_type}
                  onChange={(e) => setSupplierForm({ ...supplierForm, markup_type: e.target.value as any })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="PERCENT">PERCENT (%)</option>
                  <option value="FIXED">FIXED (Core)</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldMarkupValue')}</span>
                <input
                  type="number"
                  min={0}
                  value={supplierForm.markup_value}
                  onChange={(e) => setSupplierForm({ ...supplierForm, markup_value: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldMinMargin')}</span>
                <input
                  type="number"
                  min={0}
                  value={supplierForm.min_margin_core}
                  onChange={(e) => setSupplierForm({ ...supplierForm, min_margin_core: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{t('supplierConnectors.fieldCreditLimit')}</span>
                <input
                  type="number"
                  min={0}
                  value={supplierForm.credit_limit_core}
                  onChange={(e) => setSupplierForm({ ...supplierForm, credit_limit_core: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </label>
            </div>

            <div className="space-y-1.5 text-xs pt-1">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={supplierForm.auto_pause_enabled}
                  onChange={(e) => setSupplierForm({ ...supplierForm, auto_pause_enabled: e.target.checked })}
                />
                <span>{t('supplierConnectors.fieldAutoPause')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={supplierForm.supports_idempotency}
                  onChange={(e) => setSupplierForm({ ...supplierForm, supports_idempotency: e.target.checked })}
                />
                <span>{t('supplierConnectors.fieldSupportsIdempotency')}</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800"
              >
                {t('supplierConnectors.btnCancel')}
              </button>
              <button
                type="submit"
                disabled={savingSupplier}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
              >
                {editingSupplierId ? t('supplierConnectors.btnSave') : t('supplierConnectors.btnCreate')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CREATE WEBHOOK */}
      {showWebhookModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateWebhook}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('supplierConnectors.modalCreateWebhookTitle')}
              </h3>
              <button type="button" onClick={() => setShowWebhookModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="font-medium">{t('supplierConnectors.fieldName')}</span>
              <input
                required
                value={webhookForm.name}
                onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">{t('supplierConnectors.fieldSellerId')}</span>
              <input
                required
                value={webhookForm.seller_id}
                onChange={(e) => setWebhookForm({ ...webhookForm, seller_id: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">{t('supplierConnectors.fieldWebhookUrl')}</span>
              <input
                required
                type="url"
                placeholder="https://bot.partner.example/webhook"
                value={webhookForm.webhook_url}
                onChange={(e) => setWebhookForm({ ...webhookForm, webhook_url: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">{t('supplierConnectors.fieldHmacSecret')}</span>
              <input
                type="password"
                value={webhookForm.hmac_secret}
                onChange={(e) => setWebhookForm({ ...webhookForm, hmac_secret: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">{t('supplierConnectors.fieldTimeoutMs')}</span>
              <input
                type="number"
                min={1000}
                max={10000}
                value={webhookForm.timeout_ms}
                onChange={(e) => setWebhookForm({ ...webhookForm, timeout_ms: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800"
              >
                {t('supplierConnectors.btnCancel')}
              </button>
              <button
                type="submit"
                disabled={savingWebhook}
                className="px-4 py-1.5 rounded-lg font-semibold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
              >
                {t('supplierConnectors.btnCreate')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: SETTLE CREDIT */}
      {settleTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveSettle}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('supplierConnectors.modalSettleTitle')}: {settleTarget.name}
              </h3>
              <button type="button" onClick={() => setSettleTarget(null)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="font-medium">{t('supplierConnectors.fieldSettleAmount')}</span>
              <input
                required
                type="number"
                min={1}
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">{t('supplierConnectors.fieldSettleRef')}</span>
              <input
                value={settleRef}
                onChange={(e) => setSettleRef(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">{t('supplierConnectors.fieldSettleNote')}</span>
              <input
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setSettleTarget(null)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                {t('supplierConnectors.btnCancel')}
              </button>
              <button
                type="submit"
                disabled={savingSettle}
                className="px-4 py-1.5 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {t('supplierConnectors.btnSave')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default SupplierConnectorsModule;
