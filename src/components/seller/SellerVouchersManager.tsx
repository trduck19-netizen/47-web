import React, { useEffect, useState } from 'react';
import {
  Ticket,
  Plus,
  Trash2,
  Power,
  Copy,
  Check,
  FolderKanban,
  AlertCircle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatCore } from '../../utils/textUtils';
import { parseSafeJsonArray } from '../../config/sellerIndustries';

interface SellerVouchersManagerProps {
  seller: any;
  getHeaders: () => Record<string, string>;
  onSellerUpdated: (nextSeller: any) => void;
  onNotify: (msg: string) => void;
}

export const SellerVouchersManager: React.FC<SellerVouchersManagerProps> = ({
  seller,
  getHeaders,
  onSellerUpdated,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string>('');

  // Create Voucher Form
  const [code, setCode] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENT'>('FIXED');
  const [discountValue, setDiscountValue] = useState<string>('20');
  const [maxDiscountCore] = useState<string>('');
  const [minOrderCore, setMinOrderCore] = useState<string>('0');
  const [usageLimit, setUsageLimit] = useState<string>('100');
  const [creating, setCreating] = useState<boolean>(false);

  // Shop Custom Collections
  const [collections, setCollections] = useState<string[]>(() =>
    parseSafeJsonArray<string>(seller?.shop_categories_json).filter((c) => typeof c === 'string' && c.trim())
  );
  const [newCollection, setNewCollection] = useState<string>('');
  const [savingCols, setSavingCols] = useState<boolean>(false);

  useEffect(() => {
    setCollections(
      parseSafeJsonArray<string>(seller?.shop_categories_json).filter((c) => typeof c === 'string' && c.trim())
    );
  }, [seller?.shop_categories_json]);

  const fetchVouchers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/seller/vouchers', { headers: getHeaders() });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setVouchers(data.vouchers || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchVouchers();
  }, []);

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setCreating(true);
    try {
      const res = await fetch('/api/seller/vouchers', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          title: title.trim(),
          discount_type: discountType,
          discount_value: parseInt(discountValue, 10) || 1,
          max_discount_core: maxDiscountCore ? parseInt(maxDiscountCore, 10) : null,
          min_order_core: parseInt(minOrderCore, 10) || 0,
          usage_limit: parseInt(usageLimit, 10) || 100,
        }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setCode('');
        setTitle('');
        fetchVouchers();
        onNotify(t('sellerVouchers.createSuccess'));
      } else {
        setErrorMsg(data?.error || t('sellerVouchers.actionFailed'));
      }
    } catch {
      setErrorMsg(t('sellerVouchers.actionFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleToggleVoucher = async (v: any) => {
    try {
      const res = await fetch(`/api/seller/vouchers/${v.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ is_active: v.is_active ? 0 : 1 }),
      });
      if (res.ok) {
        fetchVouchers();
      }
    } catch {}
  };

  const handleDeleteVoucher = async (v: any) => {
    try {
      const res = await fetch(`/api/seller/vouchers/${v.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        setVouchers((prev) => prev.filter((item) => item.id !== v.id));
      }
    } catch {}
  };

  const saveCollections = async (nextList: string[]) => {
    setSavingCols(true);
    try {
      const res = await fetch('/api/seller', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ shop_categories: nextList }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setCollections(nextList);
        if (data.seller) onSellerUpdated(data.seller);
        onNotify(t('sellerVouchers.collectionsSaved'));
      }
    } catch {}
    setSavingCols(false);
  };

  const handleAddCollection = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCollection.trim();
    if (!clean || collections.includes(clean) || collections.length >= 15) return;
    const next = [...collections, clean];
    setNewCollection('');
    saveCollections(next);
  };

  return (
    <div className="space-y-6">
      {/* 1. SHOP CUSTOM COLLECTIONS MANAGER */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <FolderKanban className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-foreground">{t('sellerVouchers.collectionsTitle')}</h2>
            <p className="text-xs text-muted-foreground">{t('sellerVouchers.collectionsSubtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleAddCollection} className="flex items-center gap-2 max-w-lg">
          <input
            type="text"
            maxLength={60}
            value={newCollection}
            onChange={(e) => setNewCollection(e.target.value)}
            placeholder={t('sellerVouchers.collectionPlaceholder')}
            className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!newCollection.trim() || savingCols || collections.length >= 15}
            className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1 disabled:opacity-50 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('sellerVouchers.addCollectionBtn')}</span>
          </button>
        </form>

        {collections.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('sellerVouchers.noCollectionsYet')}</p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {collections.map((col) => (
              <span
                key={col}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border text-xs font-semibold text-foreground"
              >
                <span>{col}</span>
                <button
                  type="button"
                  onClick={() => saveCollections(collections.filter((c) => c !== col))}
                  className="text-muted-foreground hover:text-destructive cursor-pointer"
                  aria-label={t('sellerVouchers.removeBtn')}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 2. SHOP VOUCHERS CREATOR & SINGLE-SCREEN TABLE */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
            <Ticket className="w-4 h-4" />
          </div>
          <div>
            <h2 id="seller-vouchers-heading" className="text-sm font-extrabold text-foreground">
              {t('sellerVouchers.vouchersTitle')}
            </h2>
            <p className="text-xs text-muted-foreground">{t('sellerVouchers.vouchersSubtitle')}</p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleCreateVoucher} className="p-3.5 rounded-xl bg-muted/30 border border-border grid grid-cols-2 sm:grid-cols-6 gap-2.5 items-end text-xs">
          <div>
            <label className="block font-semibold mb-1">{t('sellerVouchers.codeLabel')} *</label>
            <input
              type="text"
              required
              maxLength={24}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
              placeholder="SHOP20K"
              className="w-full px-2.5 py-2 rounded-lg border border-border bg-background font-mono font-bold uppercase"
            />
          </div>

          <div className="col-span-1 sm:col-span-2">
            <label className="block font-semibold mb-1">{t('sellerVouchers.programTitleLabel')} *</label>
            <input
              type="text"
              required
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('sellerVouchers.programTitlePlaceholder')}
              className="w-full px-2.5 py-2 rounded-lg border border-border bg-background"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">{t('sellerVouchers.discountLabel')} *</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                required
                min={1}
                max={discountType === 'PERCENT' ? 90 : 10000000}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-full px-2 py-2 rounded-lg border border-border bg-background font-bold"
              />
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'FIXED' | 'PERCENT')}
                className="px-1.5 py-2 rounded-lg border border-border bg-background font-bold"
              >
                <option value="FIXED">Core</option>
                <option value="PERCENT">%</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">{t('sellerVouchers.minOrderLabel')}</label>
            <input
              type="number"
              min={0}
              value={minOrderCore}
              onChange={(e) => setMinOrderCore(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-border bg-background"
            />
          </div>

          <div className="flex items-end gap-1.5">
            <div className="w-16 shrink-0">
              <label className="block font-semibold mb-1">{t('sellerVouchers.limitLabel')}</label>
              <input
                type="number"
                min={1}
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                className="w-full px-2 py-2 rounded-lg border border-border bg-background"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="flex-1 py-2 px-2.5 rounded-lg bg-primary text-primary-foreground font-extrabold shadow-xs hover:opacity-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              + {t('sellerVouchers.createBtn')}
            </button>
          </div>
        </form>

        {/* Rule 9 Single-Screen Table + MWG responsive-table region */}
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="seller-vouchers-heading"
          className="rounded-xl border border-border overflow-hidden max-h-[420px] overflow-y-auto"
        >
          <table className="table-fixed w-full text-xs text-left">
            <thead className="sticky top-0 z-10 bg-muted text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3 w-[28%]">{t('sellerVouchers.colVoucher')}</th>
                <th className="p-3 w-[22%]">{t('sellerVouchers.colDiscount')}</th>
                <th className="p-3 w-[16%] text-center">{t('sellerVouchers.colUsed')}</th>
                <th className="p-3 w-[14%] text-center">{t('sellerVouchers.colStatus')}</th>
                <th className="p-3 w-[20%] text-center">{t('sellerVouchers.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    {t('sellerVouchers.loading')}
                  </td>
                </tr>
              ) : vouchers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    {t('sellerVouchers.emptyList')}
                  </td>
                </tr>
              ) : (
                vouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/25">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <code className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono font-extrabold text-[11px]">
                          {v.code}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(v.code).catch(() => {});
                            setCopiedId(v.id);
                            setTimeout(() => setCopiedId(''), 1500);
                          }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground cursor-pointer"
                          title={t('sellerVouchers.copyCode')}
                        >
                          {copiedId === v.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5" title={v.title}>
                        {v.title}
                      </div>
                    </td>
                    <td className="p-3 font-bold text-foreground">
                      {v.discount_type === 'PERCENT'
                        ? `-${v.discount_value}%`
                        : `-${formatCore(v.discount_value, language)}`}
                      <div className="text-[10px] text-muted-foreground font-normal">
                        {t('sellerVouchers.minOrderShort')}: {formatCore(v.min_order_core || 0, language)}
                      </div>
                    </td>
                    <td className="p-3 text-center font-mono font-bold">
                      {v.used_count} / {v.usage_limit}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          v.is_active
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {v.is_active ? t('sellerVouchers.statusActive') : t('sellerVouchers.statusPaused')}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleVoucher(v)}
                          className="px-2 py-1 rounded-lg border border-border hover:bg-muted text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Power className="w-3 h-3" />
                          <span>{v.is_active ? t('sellerVouchers.pauseBtn') : t('sellerVouchers.enableBtn')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVoucher(v)}
                          aria-label={t('sellerVouchers.removeBtn')}
                          className="p-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
    </div>
  );
};
