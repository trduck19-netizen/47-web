import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  QrCode,
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lock,
  Landmark,
  Wifi,
  Coins,
  Send,
  Ban,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface SellerSepayManagerProps {
  getHeaders: () => Record<string, string>;
  onRefreshSeller?: () => void;
}

const POPULAR_BANKS = [
  'MBBank',
  'TPBank',
  'Vietcombank',
  'Techcombank',
  'ACB',
  'VPBank',
  'BIDV',
  'VietinBank',
  'Sacombank',
  'VIB',
  'MSB',
  'OCB',
  'HDBank',
  'SHB',
  'Agribank',
];

export const SellerSepayManager: React.FC<SellerSepayManagerProps> = ({
  getHeaders,
  onRefreshSeller,
}) => {
  const { t } = useLanguage();
  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [rotating, setRotating] = useState<boolean>(false);
  const [testingConn, setTestingConn] = useState<boolean>(false);
  const [payingDebt, setPayingDebt] = useState<boolean>(false);

  const [config, setConfig] = useState<any>(null);
  const [bankName, setBankName] = useState<string>('MBBank');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountHolder, setAccountHolder] = useState<string>('');
  const [paymentPrefix, setPaymentPrefix] = useState<string>('SHP');
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [apiTokenInput, setApiTokenInput] = useState<string>('');

  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [detectedAccounts, setDetectedAccounts] = useState<any[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Transactions state
  const [txFilter, setTxFilter] = useState<'all' | 'exceptions' | 'success'>('all');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txSummary, setTxSummary] = useState<{ total_count: number; open_exceptions: number; total_volume_vnd: number }>({
    total_count: 0,
    open_exceptions: 0,
    total_volume_vnd: 0,
  });
  const [loadingTx, setLoadingTx] = useState<boolean>(false);
  const [resolvingTxId, setResolvingTxId] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/seller/sepay', { headers: getHeadersRef.current(), cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.config) {
        setConfig(data.config);
        setBankName(data.config.bank_name || 'MBBank');
        setAccountNumber(data.config.account_number || '');
        setAccountHolder(data.config.account_holder || '');
        setPaymentPrefix(data.config.payment_prefix || 'SHP');
        setIsEnabled(Boolean(data.config.is_enabled));
      } else {
        setErrorMsg(data.error || t('sellerSepay.loadError'));
      }
    } catch {
      setErrorMsg(t('sellerSepay.connectionError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchTransactions = useCallback(async (filter: 'all' | 'exceptions' | 'success' = txFilter) => {
    setLoadingTx(true);
    try {
      const res = await fetch(`/api/seller/sepay/transactions?filter=${filter}&limit=50`, {
        headers: getHeadersRef.current(),
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions || []);
        if (data.summary) setTxSummary(data.summary);
      }
    } catch {
      // silent
    } finally {
      setLoadingTx(false);
    }
  }, [txFilter]);

  useEffect(() => {
    fetchConfig();
    fetchTransactions('all');
  }, [fetchConfig, fetchTransactions]);

  const handleCopy = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const payload: Record<string, any> = {
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        account_holder: accountHolder.trim().toUpperCase(),
        payment_prefix: paymentPrefix.trim().toUpperCase() || 'SHP',
        is_enabled: isEnabled,
      };
      if (apiTokenInput.trim()) {
        payload.api_token = apiTokenInput.trim();
      }
      const res = await fetch('/api/seller/sepay', {
        method: 'PUT',
        headers: getHeadersRef.current(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setApiTokenInput('');
        if (data.one_time_webhook_key) {
          setOneTimeKey(data.one_time_webhook_key);
        }
        setSuccessMsg(t('sellerSepay.saveSuccess'));
        onRefreshSeller?.();
      } else {
        setErrorMsg(data.error || t('sellerSepay.saveError'));
      }
    } catch {
      setErrorMsg(t('sellerSepay.connectionError'));
    } finally {
      setSaving(false);
    }
  };

  const handleRotateKey = async () => {
    if (!window.confirm(t('sellerSepay.rotateKeyConfirm'))) return;
    setRotating(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/seller/sepay/rotate-key', {
        method: 'POST',
        headers: getHeadersRef.current(),
      });
      const data = await res.json();
      if (data.success && data.one_time_webhook_key) {
        setOneTimeKey(data.one_time_webhook_key);
        setSuccessMsg(t('sellerSepay.rotateKeySuccess'));
        fetchConfig();
      } else {
        setErrorMsg(data.error || t('sellerSepay.rotateKeyError'));
      }
    } catch {
      setErrorMsg(t('sellerSepay.connectionError'));
    } finally {
      setRotating(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/seller/sepay/test-connection', {
        method: 'POST',
        headers: getHeadersRef.current(),
        body: JSON.stringify(apiTokenInput.trim() ? { api_token: apiTokenInput.trim() } : {}),
      });
      const data = await res.json();
      if (data.success) {
        setDetectedAccounts(data.accounts || []);
        setSuccessMsg(t('sellerSepay.testConnSuccess', { count: (data.accounts || []).length }));
        fetchConfig();
      } else {
        setErrorMsg(data.error || t('sellerSepay.testConnError'));
      }
    } catch {
      setErrorMsg(t('sellerSepay.connectionError'));
    } finally {
      setTestingConn(false);
    }
  };

  const handleClearApiToken = async () => {
    if (!window.confirm(t('sellerSepay.clearTokenConfirm'))) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/seller/sepay', {
        method: 'PUT',
        headers: getHeadersRef.current(),
        body: JSON.stringify({ clear_api_token: true }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setSuccessMsg(t('sellerSepay.clearTokenSuccess'));
      } else {
        setErrorMsg(data.error || t('sellerSepay.saveError'));
      }
    } catch {
      setErrorMsg(t('sellerSepay.connectionError'));
    } finally {
      setSaving(false);
    }
  };

  const handlePayDebt = async () => {
    if (!window.confirm(t('sellerSepay.payDebtConfirm', { amount: Number(config?.fee_debt_core || 0).toLocaleString() }))) return;
    setPayingDebt(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/seller/sepay/pay-debt', {
        method: 'POST',
        headers: getHeadersRef.current(),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(t('sellerSepay.payDebtSuccess'));
        fetchConfig();
        onRefreshSeller?.();
      } else {
        setErrorMsg(data.error || t('sellerSepay.payDebtError'));
      }
    } catch {
      setErrorMsg(t('sellerSepay.connectionError'));
    } finally {
      setPayingDebt(false);
    }
  };

  const handleResolveTx = async (tx: any, action: 'DELIVER_ORDER' | 'MARK_BANK_REFUNDED') => {
    const note = window.prompt(
      action === 'DELIVER_ORDER' ? t('sellerSepay.resolveDeliverPrompt') : t('sellerSepay.resolveRefundPrompt'),
      ''
    );
    if (note === null) return;
    setResolvingTxId(tx.id);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/seller/sepay/transactions/${encodeURIComponent(tx.id)}/resolve`, {
        method: 'POST',
        headers: getHeadersRef.current(),
        body: JSON.stringify({
          action,
          order_id: tx.matched_order_id || undefined,
          note: note.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(action === 'DELIVER_ORDER' ? t('sellerSepay.resolveDeliverOk') : t('sellerSepay.resolveRefundOk'));
        fetchTransactions(txFilter);
      } else {
        setErrorMsg(data.error || t('sellerSepay.resolveError'));
      }
    } catch {
      setErrorMsg(t('sellerSepay.connectionError'));
    } finally {
      setResolvingTxId(null);
    }
  };

  const isExceptionStatus = (status: string) =>
    ['UNDERPAID', 'EXPIRED_PAYMENT', 'DUPLICATE_PAYMENT', 'UNMATCHED', 'PENDING_MANUAL_CODE'].includes(status);

  if (loading && !config) {
    return (
      <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2 text-xs">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>{t('sellerSepay.loading')}</span>
      </div>
    );
  }

  const feePct = Number(config?.policy?.direct_sepay_fee_pct || 0);
  const feeDebt = Number(config?.fee_debt_core || 0);
  const debtLimit = Number(config?.policy?.direct_sepay_debt_limit_core || 0);

  return (
    <div className="space-y-5">
      {/* Top Status Banner & Alerts */}
      {config?.admin_locked && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start gap-2.5">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">{t('sellerSepay.adminLockedTitle')}</div>
            <p className="mt-0.5">{config.admin_lock_reason || t('sellerSepay.adminLockedDefault')}</p>
          </div>
        </div>
      )}

      {config?.affiliate_wholesale_warning && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">{t('sellerSepay.affiliateWholesaleWarnTitle')}</div>
            <p className="mt-0.5">
              {t('sellerSepay.affiliateWholesaleWarnDesc', {
                balance: Number(config.owner_core_balance || 0).toLocaleString(),
                needed: Number(config.affiliate_min_wholesale_core || 0).toLocaleString(),
              })}
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <XCircle className="w-4 h-4 shrink-0" /> {errorMsg}
          </span>
          <button type="button" onClick={() => setErrorMsg('')} className="text-[11px] font-bold underline cursor-pointer">
            {t('common.close')}
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMsg}
          </span>
          <button type="button" onClick={() => setSuccessMsg('')} className="text-[11px] font-bold underline cursor-pointer">
            {t('common.close')}
          </button>
        </div>
      )}

      {/* One-time Webhook Key Reveal Box */}
      {oneTimeKey && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border-2 border-emerald-500/50 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" /> {t('sellerSepay.oneTimeKeyTitle')}
            </span>
            <button
              type="button"
              onClick={() => setOneTimeKey(null)}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {t('sellerSepay.hideKeyBtn')}
            </button>
          </div>
          <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80">
            {t('sellerSepay.oneTimeKeyHint')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/40 font-mono text-xs font-bold text-slate-900 dark:text-emerald-300 break-all select-all">
              {oneTimeKey}
            </code>
            <button
              type="button"
              onClick={() => handleCopy(oneTimeKey, 'one_time_key')}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copiedField === 'one_time_key' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedField === 'one_time_key' ? t('sellerSepay.copied') : t('sellerSepay.copy')}
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards (4-column responsive) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-card border border-border">
          <div className="text-[11px] text-muted-foreground font-medium">{t('sellerSepay.kpiStatus')}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                config?.admin_locked
                  ? 'bg-destructive/15 text-destructive'
                  : config?.is_enabled
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {config?.admin_locked
                ? t('sellerSepay.statusLocked')
                : config?.is_enabled
                  ? t('sellerSepay.statusActive')
                  : t('sellerSepay.statusDisabled')}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-card border border-border">
          <div className="text-[11px] text-muted-foreground font-medium">{t('sellerSepay.kpiFeeRate')}</div>
          <div className="mt-1 text-lg font-black text-emerald-600 dark:text-emerald-400">
            {feePct === 0 ? t('sellerSepay.feeFreeLabel') : `${feePct}%`}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-card border border-border">
          <div className="text-[11px] text-muted-foreground font-medium">{t('sellerSepay.kpiDirectVolume')}</div>
          <div className="mt-1 text-lg font-black text-foreground">
            {Number(config?.total_direct_volume_vnd || 0).toLocaleString()}đ
          </div>
          <div className="text-[10px] text-muted-foreground">
            {t('sellerSepay.kpiOrderCount', { count: Number(config?.total_direct_orders || 0) })}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-card border border-border">
          <div className="text-[11px] text-muted-foreground font-medium flex items-center justify-between">
            <span>{t('sellerSepay.kpiDebtAndExceptions')}</span>
            {feeDebt > 0 && (
              <button
                type="button"
                disabled={payingDebt}
                onClick={handlePayDebt}
                className="text-[10px] font-bold text-primary hover:underline cursor-pointer disabled:opacity-50"
              >
                {t('sellerSepay.payDebtBtn')}
              </button>
            )}
          </div>
          <div className="mt-1 text-lg font-black text-foreground flex items-center gap-2">
            <span>{feeDebt.toLocaleString()} Core</span>
            {txSummary.open_exceptions > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                {t('sellerSepay.openExceptionsBadge', { count: txSummary.open_exceptions })}
              </span>
            )}
          </div>
          {debtLimit > 0 && feePct > 0 && (
            <div className="text-[10px] text-muted-foreground">
              {t('sellerSepay.debtLimitNote', { limit: debtLimit.toLocaleString() })}
            </div>
          )}
        </div>
      </div>

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Bank & SePay Config Form */}
        <form onSubmit={handleSaveConfig} className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-card border border-border space-y-4">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/70">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">{t('sellerSepay.configTitle')}</h3>
                <p className="text-[11px] text-muted-foreground">{t('sellerSepay.configSubtitle')}</p>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isEnabled}
                disabled={Boolean(config?.admin_locked)}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 rounded"
              />
              <span className="text-xs font-bold text-foreground">{t('sellerSepay.enableToggle')}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">{t('sellerSepay.bankNameLabel')}</label>
              <select
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs font-medium text-foreground focus:outline-none focus:border-primary"
              >
                {POPULAR_BANKS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">{t('sellerSepay.accountNumberLabel')}</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={t('sellerSepay.accountNumberPlaceholder')}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs font-mono text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">{t('sellerSepay.accountHolderLabel')}</label>
              <input
                type="text"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value.toUpperCase())}
                placeholder={t('sellerSepay.accountHolderPlaceholder')}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs uppercase text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">{t('sellerSepay.prefixLabel')}</label>
              <input
                type="text"
                maxLength={10}
                value={paymentPrefix}
                onChange={(e) => setPaymentPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="SHP"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs font-mono uppercase text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Optional SePay User API Token */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/80 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-primary" /> {t('sellerSepay.apiTokenSectionTitle')}
              </span>
              {config?.has_api_token && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                    {config.api_token_prefix}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearApiToken}
                    className="text-[10px] text-destructive font-semibold hover:underline cursor-pointer"
                  >
                    {t('sellerSepay.removeTokenBtn')}
                  </button>
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t('sellerSepay.apiTokenSectionDesc')}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={apiTokenInput}
                onChange={(e) => setApiTokenInput(e.target.value)}
                placeholder={config?.has_api_token ? t('sellerSepay.apiTokenReplacePlaceholder') : t('sellerSepay.apiTokenPlaceholder')}
                className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-xs font-mono text-foreground focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                disabled={testingConn || (!apiTokenInput.trim() && !config?.has_api_token)}
                onClick={handleTestConnection}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingConn ? 'animate-spin' : ''}`} />
                {testingConn ? t('sellerSepay.testingBtn') : t('sellerSepay.testConnBtn')}
              </button>
            </div>

            {detectedAccounts.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {t('sellerSepay.pickDetectedAccount')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {detectedAccounts.map((acc, idx) => (
                    <button
                      key={`${acc.account_number}_${idx}`}
                      type="button"
                      onClick={() => {
                        if (acc.bank_brand_name) setBankName(acc.bank_brand_name);
                        if (acc.account_number) setAccountNumber(acc.account_number);
                        if (acc.account_holder_name) setAccountHolder(acc.account_holder_name.toUpperCase());
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/30 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 cursor-pointer"
                    >
                      {acc.bank_brand_name} • {acc.account_number} ({acc.account_holder_name})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-primary hover:opacity-95 text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {saving ? t('sellerSepay.savingBtn') : t('sellerSepay.saveBtn')}
          </button>
        </form>

        {/* Right: Webhook Credentials & 3-Step SePay Setup Guide */}
        <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-card border border-border space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/70">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">{t('sellerSepay.webhookSetupTitle')}</h3>
              <p className="text-[11px] text-muted-foreground">{t('sellerSepay.webhookSetupSubtitle')}</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
                {t('sellerSepay.webhookUrlLabel')}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={config?.webhook_url || ''}
                  className="flex-1 px-2.5 py-2 rounded-lg border border-border bg-muted/50 font-mono text-[11px] text-foreground truncate"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(config?.webhook_url || '', 'webhook_url')}
                  className="px-2.5 py-2 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {copiedField === 'webhook_url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedField === 'webhook_url' ? t('sellerSepay.copied') : t('sellerSepay.copy')}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase">
                  {t('sellerSepay.webhookKeyLabel')}
                </label>
                <button
                  type="button"
                  disabled={rotating}
                  onClick={handleRotateKey}
                  className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${rotating ? 'animate-spin' : ''}`} />
                  {config?.has_webhook_key ? t('sellerSepay.rotateKeyBtn') : t('sellerSepay.generateKeyBtn')}
                </button>
              </div>
              <div className="px-3 py-2 rounded-lg border border-border bg-muted/50 font-mono text-[11px] text-foreground">
                {config?.webhook_key_prefix || t('sellerSepay.noKeyYet')}
              </div>
            </div>

            <ol className="space-y-1.5 text-[11px] text-muted-foreground list-decimal pl-4 pt-1 leading-relaxed">
              <li>{t('sellerSepay.guideStep1')}</li>
              <li>{t('sellerSepay.guideStep2')}</li>
              <li>{t('sellerSepay.guideStep3')}</li>
            </ol>

            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Coins className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{t('sellerSepay.directSepayIsolationNote')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Seller SePay Transaction & Exception Log Table (Rule 9: table-fixed w-full = 100%) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground">{t('sellerSepay.txTableTitle')}</h3>
            <p className="text-[11px] text-muted-foreground">{t('sellerSepay.txTableSubtitle')}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {(['all', 'exceptions', 'success'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setTxFilter(f);
                  fetchTransactions(f);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  txFilter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(`sellerSepay.filter_${f}`)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => fetchTransactions(txFilter)}
              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground cursor-pointer"
              title={t('sellerSepay.refreshBtn')}
              aria-label={t('sellerSepay.refreshBtn')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTx ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <table className="table-fixed w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border text-[11px] text-muted-foreground text-left">
              <th className="py-2 pr-2 w-[24%] font-bold">{t('sellerSepay.colTxTime')}</th>
              <th className="py-2 pr-2 w-[26%] font-bold">{t('sellerSepay.colMemo')}</th>
              <th className="py-2 pr-2 w-[14%] font-bold text-right">{t('sellerSepay.colAmount')}</th>
              <th className="py-2 pr-2 w-[16%] font-bold">{t('sellerSepay.colStatus')}</th>
              <th className="py-2 w-[20%] font-bold text-right">{t('sellerSepay.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                  {t('sellerSepay.noTxEmpty')}
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/30">
                  <td className="py-2.5 pr-2 align-top">
                    <div className="font-mono font-bold text-foreground truncate" title={tx.sepay_tx_id}>
                      {tx.sepay_tx_id}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {tx.gateway} • {tx.created_at ? new Date(tx.created_at).toLocaleString() : ''}
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
                      title={tx.status}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-2.5 align-top text-right">
                    {isExceptionStatus(tx.status) ? (
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {tx.matched_order_id && (
                          <button
                            type="button"
                            disabled={resolvingTxId === tx.id}
                            onClick={() => handleResolveTx(tx, 'DELIVER_ORDER')}
                            className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Send className="w-3 h-3" /> {t('sellerSepay.deliverBtn')}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={resolvingTxId === tx.id}
                          onClick={() => handleResolveTx(tx, 'MARK_BANK_REFUNDED')}
                          className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Ban className="w-3 h-3" /> {t('sellerSepay.refundedBankBtn')}
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
