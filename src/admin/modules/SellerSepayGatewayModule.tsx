import React, { useState, useEffect, useCallback } from 'react';
import {
  QrCode,
  ShieldCheck,
  Lock,
  Unlock,
  RefreshCw,
  AlertTriangle,
  Sliders,
  CheckCircle2,
  Coins,
  Store,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface SellerSepayGatewayModuleProps {
  onShowToast?: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const SellerSepayGatewayModule: React.FC<SellerSepayGatewayModuleProps> = ({ onShowToast }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState<boolean>(true);
  const [savingPolicy, setSavingPolicy] = useState<boolean>(false);
  const [lockingId, setLockingId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'gateways' | 'transactions'>('gateways');
  const [txFilter, setTxFilter] = useState<'all' | 'exceptions' | 'success'>('all');

  const [kpi, setKpi] = useState<any>(null);
  const [configs, setConfigs] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  const [globalEnabled, setGlobalEnabled] = useState<boolean>(true);
  const [feePct, setFeePct] = useState<number>(0);
  const [debtLimit, setDebtLimit] = useState<number>(500000);

  const getAdminHeaders = () => {
    const token = localStorage.getItem('pine_auth_token') || sessionStorage.getItem('pine_auth_token') || '';
    const syncKey = localStorage.getItem('pine_admin_sync_key') || sessionStorage.getItem('pine_admin_sync_key') || '';
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (syncKey) h['X-Admin-Key'] = syncKey;
    return h;
  };

  const fetchOverview = useCallback(async (filter: 'all' | 'exceptions' | 'success' = txFilter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/seller-sepay?tx_filter=${filter}&limit=60`, {
        headers: getAdminHeaders(),
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        setKpi(data.kpi || null);
        setConfigs(data.configs || []);
        setTransactions(data.transactions || []);
        if (data.policy) {
          setGlobalEnabled(Boolean(data.policy.direct_sepay_global_enabled));
          setFeePct(Number(data.policy.direct_sepay_fee_pct || 0));
          setDebtLimit(Number(data.policy.direct_sepay_debt_limit_core || 0));
        }
      } else {
        onShowToast?.(t('adminSellerSepay.loadErrorTitle'), data.error || t('adminSellerSepay.loadErrorDesc'), 'error');
      }
    } catch {
      onShowToast?.(t('adminSellerSepay.loadErrorTitle'), t('adminSellerSepay.connectionError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [txFilter, onShowToast, t]);

  useEffect(() => {
    fetchOverview('all');
  }, [fetchOverview]);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      const res = await fetch('/api/admin/seller-sepay/policy', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          direct_sepay_global_enabled: globalEnabled,
          direct_sepay_fee_pct: Math.min(50, Math.max(0, Number(feePct) || 0)),
          direct_sepay_debt_limit_core: Math.max(0, Math.round(Number(debtLimit) || 0)),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onShowToast?.(t('adminSellerSepay.policySavedTitle'), t('adminSellerSepay.policySavedDesc'), 'success');
        fetchOverview(txFilter);
      } else {
        onShowToast?.(t('adminSellerSepay.policySaveErrorTitle'), data.error || t('adminSellerSepay.connectionError'), 'error');
      }
    } catch {
      onShowToast?.(t('adminSellerSepay.policySaveErrorTitle'), t('adminSellerSepay.connectionError'), 'error');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleToggleLock = async (row: any) => {
    const nextLocked = Number(row.admin_locked) !== 1;
    let reason = '';
    if (nextLocked) {
      const promptVal = window.prompt(t('adminSellerSepay.lockReasonPrompt', { shop: row.seller_name || row.seller_id }), '');
      if (promptVal === null) return;
      reason = promptVal.trim();
    } else {
      if (!window.confirm(t('adminSellerSepay.unlockConfirm', { shop: row.seller_name || row.seller_id }))) return;
    }

    setLockingId(row.seller_id);
    try {
      const res = await fetch(`/api/admin/seller-sepay/${encodeURIComponent(row.seller_id)}/lock`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ locked: nextLocked, reason }),
      });
      const data = await res.json();
      if (data.success) {
        onShowToast?.(
          nextLocked ? t('adminSellerSepay.lockedSuccessTitle') : t('adminSellerSepay.unlockedSuccessTitle'),
          data.message,
          'success'
        );
        fetchOverview(txFilter);
      } else {
        onShowToast?.(t('adminSellerSepay.lockErrorTitle'), data.error || t('adminSellerSepay.connectionError'), 'error');
      }
    } catch {
      onShowToast?.(t('adminSellerSepay.lockErrorTitle'), t('adminSellerSepay.connectionError'), 'error');
    } finally {
      setLockingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header + 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-card border border-border">
          <div className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-emerald-500" /> {t('adminSellerSepay.kpiActiveGateways')}
          </div>
          <div className="mt-1 text-2xl font-black text-foreground">
            {loading && !kpi ? '…' : `${Number(kpi?.active_gateways || 0)} / ${Number(kpi?.total_configured || 0)}`}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {t('adminSellerSepay.kpiLockedCount', { count: Number(kpi?.locked_gateways || 0) })}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border">
          <div className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5 text-primary" /> {t('adminSellerSepay.kpiTotalVolume')}
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {loading && !kpi ? '…' : `${Number(kpi?.total_direct_volume_vnd || 0).toLocaleString()}đ`}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {t('adminSellerSepay.kpiOrderCount', { count: Number(kpi?.total_direct_orders || 0) })}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border">
          <div className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-500" /> {t('adminSellerSepay.kpiTotalDebt')}
          </div>
          <div className="mt-1 text-2xl font-black text-foreground">
            {loading && !kpi ? '…' : `${Number(kpi?.total_fee_debt_core || 0).toLocaleString()} Core`}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {feePct === 0 ? t('adminSellerSepay.kpiCurrentFeeFree') : t('adminSellerSepay.kpiCurrentFeePct', { pct: feePct })}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border">
          <div className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> {t('adminSellerSepay.kpiOpenExceptions')}
          </div>
          <div className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400">
            {loading && !kpi ? '…' : Number(kpi?.open_exceptions || 0)}
          </div>
          <div className="text-[10px] text-muted-foreground">{t('adminSellerSepay.kpiOpenExceptionsHint')}</div>
        </div>
      </div>

      {/* Global Policy Control Bar */}
      <form
        onSubmit={handleSavePolicy}
        className="p-4 rounded-2xl bg-card border border-border flex flex-wrap items-end justify-between gap-3"
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 pb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={globalEnabled}
              onChange={(e) => setGlobalEnabled(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-primary" /> {t('adminSellerSepay.policyGlobalToggle')}
            </span>
          </label>

          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
              {t('adminSellerSepay.policyFeePctLabel')}
            </label>
            <input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={feePct}
              onChange={(e) => setFeePct(Number(e.target.value))}
              className="w-28 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-mono font-bold text-foreground"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
              {t('adminSellerSepay.policyDebtLimitLabel')}
            </label>
            <input
              type="number"
              min={0}
              step={10000}
              value={debtLimit}
              onChange={(e) => setDebtLimit(Number(e.target.value))}
              className="w-40 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-mono font-bold text-foreground"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchOverview(txFilter)}
            className="px-3 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('adminSellerSepay.refreshBtn')}
          </button>
          <button
            type="submit"
            disabled={savingPolicy}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {savingPolicy ? t('adminSellerSepay.savingBtn') : t('adminSellerSepay.savePolicyBtn')}
          </button>
        </div>
      </form>

      {/* Sub-Tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('gateways')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
              activeSubTab === 'gateways' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60'
            }`}
          >
            {t('adminSellerSepay.tabGateways', { count: configs.length })}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('transactions')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
              activeSubTab === 'transactions' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60'
            }`}
          >
            {t('adminSellerSepay.tabTransactions', { count: transactions.length })}
          </button>
        </div>

        {activeSubTab === 'transactions' && (
          <div className="flex items-center gap-1">
            {(['all', 'exceptions', 'success'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setTxFilter(f);
                  fetchOverview(f);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  txFilter === f ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground'
                }`}
              >
                {t(`sellerSepay.filter_${f}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab 1: Seller Gateways Table (Rule 9: table-fixed w-full = 100%) */}
      {activeSubTab === 'gateways' && (
        <div className="rounded-2xl bg-card border border-border p-4">
          <table className="table-fixed w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-[11px] text-muted-foreground text-left">
                <th className="py-2 pr-2 w-[26%] font-bold">{t('adminSellerSepay.colSeller')}</th>
                <th className="py-2 pr-2 w-[24%] font-bold">{t('adminSellerSepay.colBankInfo')}</th>
                <th className="py-2 pr-2 w-[16%] font-bold">{t('adminSellerSepay.colKeys')}</th>
                <th className="py-2 pr-2 w-[16%] font-bold text-right">{t('adminSellerSepay.colVolumeDebt')}</th>
                <th className="py-2 w-[18%] font-bold text-right">{t('adminSellerSepay.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {configs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    {t('adminSellerSepay.emptyGateways')}
                  </td>
                </tr>
              ) : (
                configs.map((row) => {
                  const isLocked = Number(row.admin_locked) === 1;
                  const isOn = Number(row.is_enabled) === 1;
                  return (
                    <tr key={row.seller_id} className="hover:bg-muted/30">
                      <td className="py-2.5 pr-2 align-top">
                        <div className="font-bold text-foreground truncate" title={row.seller_name || row.seller_id}>
                          {row.seller_name || row.seller_id}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isLocked
                                ? 'bg-destructive/15 text-destructive'
                                : isOn
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isLocked
                              ? t('sellerSepay.statusLocked')
                              : isOn
                                ? t('sellerSepay.statusActive')
                                : t('sellerSepay.statusDisabled')}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground truncate">{row.seller_id}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 align-top">
                        <div className="font-semibold text-foreground truncate" title={`${row.bank_name} ${row.account_number}`}>
                          {row.bank_name || '—'} • <span className="font-mono">{row.account_number || '—'}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase truncate" title={row.account_holder}>
                          {row.account_holder || '—'} ({row.payment_prefix || 'SHP'})
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 align-top">
                        <div className="font-mono text-[10px] text-foreground truncate" title={row.webhook_key_prefix || ''}>
                          WH: {row.webhook_key_prefix || '—'}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          {Number(row.connection_verified) === 1 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 font-semibold">
                              <CheckCircle2 className="w-3 h-3" /> {t('adminSellerSepay.verifiedBadge')}
                            </span>
                          ) : (
                            <span>{t('adminSellerSepay.webhookOnlyBadge')}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 align-top text-right">
                        <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {Number(row.total_direct_volume_vnd || 0).toLocaleString()}đ
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {t('adminSellerSepay.rowOrdersAndDebt', {
                            orders: Number(row.total_direct_orders || 0),
                            debt: Number(row.fee_debt_core || 0).toLocaleString(),
                          })}
                        </div>
                      </td>
                      <td className="py-2.5 align-top text-right">
                        <button
                          type="button"
                          disabled={lockingId === row.seller_id}
                          onClick={() => handleToggleLock(row)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                            isLocked
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-rose-600 hover:bg-rose-700 text-white'
                          }`}
                        >
                          {isLocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {isLocked ? t('adminSellerSepay.unlockBtn') : t('adminSellerSepay.lockBtn')}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Global Direct SePay Audit Transactions (Rule 9: table-fixed w-full = 100%) */}
      {activeSubTab === 'transactions' && (
        <div className="rounded-2xl bg-card border border-border p-4">
          <table className="table-fixed w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-[11px] text-muted-foreground text-left">
                <th className="py-2 pr-2 w-[22%] font-bold">{t('adminSellerSepay.colTxSeller')}</th>
                <th className="py-2 pr-2 w-[28%] font-bold">{t('sellerSepay.colMemo')}</th>
                <th className="py-2 pr-2 w-[16%] font-bold text-right">{t('sellerSepay.colAmount')}</th>
                <th className="py-2 pr-2 w-[16%] font-bold">{t('sellerSepay.colStatus')}</th>
                <th className="py-2 w-[18%] font-bold text-right">{t('adminSellerSepay.colTxTime')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    {t('sellerSepay.noTxEmpty')}
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/30">
                    <td className="py-2.5 pr-2 align-top">
                      <div className="font-bold text-foreground truncate" title={tx.seller_name || tx.seller_id}>
                        {tx.seller_name || tx.seller_id}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground truncate" title={tx.sepay_tx_id}>
                        {tx.sepay_tx_id}
                      </div>
                    </td>
                    <td className="py-2.5 pr-2 align-top">
                      <div className="font-mono text-[11px] text-foreground truncate" title={tx.transaction_content}>
                        {tx.transaction_content || '—'}
                      </div>
                      {tx.seller_resolution_note && (
                        <div className="text-[10px] text-muted-foreground truncate" title={tx.seller_resolution_note}>
                          {tx.seller_resolution_note}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 align-top text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{Number(tx.amount_in || 0).toLocaleString()}đ
                    </td>
                    <td className="py-2.5 pr-2 align-top">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold truncate max-w-full ${
                          tx.status === 'SUCCESS' || tx.status === 'RESOLVED_DELIVERED' || tx.status === 'RESOLVED_REFUNDED_BANK'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : tx.status === 'UNAUTHORIZED'
                              ? 'bg-destructive/15 text-destructive'
                              : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-2.5 align-top text-right text-[10px] text-muted-foreground font-mono">
                      {tx.created_at ? new Date(tx.created_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
