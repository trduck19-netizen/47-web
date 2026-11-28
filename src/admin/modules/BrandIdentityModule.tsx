import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  Save,
  RotateCcw,
  RefreshCw,
  Globe,
  Store,
  ShieldCheck,
  Bot,
  Coins,
  Palette,
  Mail,
  Phone,
  Send,
  Search,
  CheckCircle2,
  Eye,
  Layers,
  Image as ImageIcon,
  Wand2,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useBrand } from '../../context/BrandContext';
import {
  DEFAULT_BRAND_IDENTITY,
  type BrandIdentityConfig,
  type BrandThemeAccent,
  deriveShortName,
  extractPrimaryBrandWord,
} from '../../utils/brandRuntime';
import { ImageUploadInput } from '../components/ui/ImageUploadInput';
import { adminDataService } from '../services/adminDataService';

interface BrandIdentityModuleProps {
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
}

const CORE_UNIT_PRESETS = ['Core', 'Xu', 'Point', 'Coin', 'Gem'] as const;

const ACCENT_PALETTES: Array<{
  id: BrandThemeAccent;
  swatch: string;
  headerGradient: string;
  badgeText: string;
}> = [
  { id: 'orange', swatch: 'bg-[#ee4d2d]', headerGradient: 'from-[#ee4d2d] to-[#ff7337]', badgeText: 'text-[#ee4d2d]' },
  { id: 'blue', swatch: 'bg-blue-600', headerGradient: 'from-blue-600 to-indigo-600', badgeText: 'text-blue-700' },
  { id: 'red', swatch: 'bg-rose-600', headerGradient: 'from-rose-600 to-red-600', badgeText: 'text-rose-700' },
  { id: 'green', swatch: 'bg-emerald-600', headerGradient: 'from-emerald-600 to-teal-600', badgeText: 'text-emerald-700' },
  { id: 'purple', swatch: 'bg-purple-600', headerGradient: 'from-purple-600 to-violet-600', badgeText: 'text-purple-700' },
];

function getAdminAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('pine_auth_token') || sessionStorage.getItem('pine_auth_token') || '';
    const syncKey = localStorage.getItem('pine_admin_sync_key') || sessionStorage.getItem('pine_admin_sync_key') || '';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (syncKey) headers['X-Sync-Key'] = syncKey;
  }
  return headers;
}

export const BrandIdentityModule: React.FC<BrandIdentityModuleProps> = ({ onShowToast }) => {
  const { t, language } = useLanguage();
  const { brand, updateBrandLocal } = useBrand();
  const isEn = language === 'en';

  const [form, setForm] = useState<BrandIdentityConfig>(() => ({ ...brand }));
  const [autoDerive, setAutoDerive] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<{ epoch?: string; ms?: number } | null>(null);

  const loadFromServer = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/brand?_t=${Date.now()}`, {
        headers: getAdminAuthHeaders(),
        cache: 'no-store',
      });
      if (res.ok) {
        const data: any = await res.json();
        if (data?.success && data?.brand) {
          setForm({ ...DEFAULT_BRAND_IDENTITY, ...data.brand });
          updateBrandLocal(data.brand, false);
        }
      }
    } catch {
      // Keep local brand snapshot if offline
    } finally {
      setIsLoading(false);
    }
  }, [updateBrandLocal]);

  useEffect(() => {
    loadFromServer();
  }, [loadFromServer]);

  const handleBrandNameChange = (val: string) => {
    setForm((prev) => {
      const next: BrandIdentityConfig = { ...prev, brandName: val };
      if (autoDerive) {
        const trimmed = val.trim();
        if (trimmed) {
          const derivedShort = deriveShortName(trimmed);
          const primaryWord = extractPrimaryBrandWord(derivedShort || trimmed);
          next.shortName = derivedShort;
          next.sellerPortalName = `${primaryWord} Seller Center`;
          next.adminPortalName = `${trimmed} Admin`;
          next.aiBrandName = `${primaryWord} AI`;
          next.copyrightHolder = trimmed;
        }
      }
      return next;
    });
  };

  const handleShortNameChange = (val: string) => {
    setForm((prev) => {
      const next: BrandIdentityConfig = { ...prev, shortName: val };
      if (autoDerive && val.trim()) {
        const primaryWord = extractPrimaryBrandWord(val.trim());
        next.sellerPortalName = `${primaryWord} Seller Center`;
        next.aiBrandName = `${primaryWord} AI`;
      }
      return next;
    });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    const startMs = performance.now();
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PUT',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify(form),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        onShowToast(
          t('brandIdentity.toastErrorTitle'),
          data?.error || `HTTP ${res.status}`,
          'error'
        );
        return;
      }

      const elapsedMs = Math.round(performance.now() - startMs);
      const savedBrand: BrandIdentityConfig = { ...DEFAULT_BRAND_IDENTITY, ...data.brand };
      setForm(savedBrand);
      updateBrandLocal(savedBrand, true);
      setLastSyncInfo({ epoch: data.catalogEpoch, ms: elapsedMs });

      // Refresh legacy CMS cache so ContentCMSModule stays aligned immediately
      adminDataService.fetchFreshContentFromCloudflare().catch(() => {});

      onShowToast(
        t('brandIdentity.toastSavedTitle'),
        t('brandIdentity.toastSavedDesc', {
          brand: savedBrand.brandName,
          ai: savedBrand.aiBrandName,
          unit: savedBrand.coreUnitName,
          epoch: data.catalogEpoch || 'live',
        }),
        'success'
      );
    } catch (err: any) {
      onShowToast(t('brandIdentity.toastErrorTitle'), err?.message || 'Network error', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm(t('brandIdentity.resetConfirm'))) return;
    setIsSaving(true);
    const startMs = performance.now();
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PUT',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({ reset: true }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        onShowToast(t('brandIdentity.toastErrorTitle'), data?.error || `HTTP ${res.status}`, 'error');
        return;
      }
      const elapsedMs = Math.round(performance.now() - startMs);
      const restored: BrandIdentityConfig = { ...DEFAULT_BRAND_IDENTITY, ...data.brand };
      setForm(restored);
      updateBrandLocal(restored, true);
      setLastSyncInfo({ epoch: data.catalogEpoch, ms: elapsedMs });
      adminDataService.fetchFreshContentFromCloudflare().catch(() => {});
      onShowToast(t('brandIdentity.toastResetTitle'), restored.brandName, 'info');
    } catch (err: any) {
      onShowToast(t('brandIdentity.toastErrorTitle'), err?.message || 'Network error', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const activeAccent = useMemo(
    () => ACCENT_PALETTES.find((p) => p.id === form.themeAccent) || ACCENT_PALETTES[0],
    [form.themeAccent]
  );

  const previewBrand = form.brandName.trim() || DEFAULT_BRAND_IDENTITY.brandName;
  const previewShort = form.shortName.trim() || deriveShortName(previewBrand);
  const previewSeller = form.sellerPortalName.trim() || `${extractPrimaryBrandWord(previewShort)} Seller Center`;
  const previewAdmin = form.adminPortalName.trim() || `${previewBrand} Admin`;
  const previewAi = form.aiBrandName.trim() || `${extractPrimaryBrandWord(previewShort)} AI`;
  const previewUnit = form.coreUnitName.trim() || 'Core';
  const previewTagline = isEn
    ? form.taglineEn.trim() || DEFAULT_BRAND_IDENTITY.taglineEn
    : form.taglineVi.trim() || DEFAULT_BRAND_IDENTITY.taglineVi;
  const previewCopyright = form.copyrightHolder.trim() || previewBrand;

  const coverageRows = useMemo(
    () => [
      {
        channel: t('brandIdentity.channelClient'),
        preview: `${previewBrand}${form.brandBadge ? ` [${form.brandBadge}]` : ''} • ${previewShort}`,
        scope: t('brandIdentity.channelClientScope'),
      },
      {
        channel: t('brandIdentity.channelWallet'),
        preview: isEn
          ? `50,000 ${previewUnit} (1 ${previewUnit} = 1 VND)`
          : `50.000 ${previewUnit} (1 ${previewUnit} = 1 VNĐ)`,
        scope: t('brandIdentity.channelWalletScope'),
      },
      {
        channel: t('brandIdentity.channelSeller'),
        preview: previewSeller,
        scope: t('brandIdentity.channelSellerScope'),
      },
      {
        channel: t('brandIdentity.channelAdmin'),
        preview: `${previewAdmin} • ${previewAi}`,
        scope: t('brandIdentity.channelAdminScope'),
      },
      {
        channel: t('brandIdentity.channelSeo'),
        preview: `<title>${previewBrand}</title> • PWA: ${previewShort}`,
        scope: t('brandIdentity.channelSeoScope'),
      },
      {
        channel: t('brandIdentity.channelEmail'),
        preview: `[${previewBrand}] OTP & Broadcast`,
        scope: t('brandIdentity.channelEmailScope'),
      },
      {
        channel: t('brandIdentity.channelTelegram'),
        preview: `Bot ${previewBrand}`,
        scope: t('brandIdentity.channelTelegramScope'),
      },
    ],
    [t, previewBrand, form.brandBadge, previewShort, previewUnit, previewSeller, previewAdmin, previewAi]
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-200 max-w-full overflow-x-clip">
      {/* Top Action Header */}
      <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
              {t('brandIdentity.pageTitle')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              {t('brandIdentity.pageSubtitle')}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
                <CheckCircle2 className="w-3 h-3" />
                <span>{t('brandIdentity.syncLatencyHint')}</span>
              </span>
              {lastSyncInfo?.epoch && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25">
                  Epoch: {lastSyncInfo.epoch} ({lastSyncInfo.ms}ms)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadFromServer}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{t('brandIdentity.refreshButton')}</span>
          </button>
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-xs font-bold text-rose-700 dark:text-rose-300 cursor-pointer transition disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('brandIdentity.resetButton')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white text-xs font-extrabold shadow-md shadow-indigo-500/25 cursor-pointer transition disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? t('brandIdentity.savingButton') : t('brandIdentity.saveButton')}</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace (Form + Sticky 5-Surface Live Preview) */}
      <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN (7/12): Configuration Form */}
        <div className="xl:col-span-7 space-y-5 min-w-0">
          {/* Card 1: Core Platform & Portal Names */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 shrink-0">
                <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-slate-900 dark:text-white whitespace-nowrap">
                  {t('brandIdentity.sectionIdentityTitle')}
                </h4>
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoDerive}
                  onChange={(e) => setAutoDerive(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-indigo-400 text-indigo-600 focus:ring-0 shrink-0"
                />
                <Wand2 className="w-3.5 h-3.5 shrink-0" />
                <span>{t('brandIdentity.autoDeriveLabel')}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
              <div className="sm:col-span-7">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  {t('brandIdentity.brandNameLabel')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={form.brandName}
                  onChange={(e) => handleBrandNameChange(e.target.value)}
                  placeholder={t('brandIdentity.brandNamePlaceholder')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 outline-none"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t('brandIdentity.brandNameHelp')}</p>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  {t('brandIdentity.shortNameLabel')}
                </label>
                <input
                  type="text"
                  maxLength={28}
                  value={form.shortName}
                  onChange={(e) => handleShortNameChange(e.target.value)}
                  placeholder={t('brandIdentity.shortNamePlaceholder')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:border-indigo-500 outline-none"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t('brandIdentity.shortNameHelp')}</p>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  {t('brandIdentity.brandBadgeLabel')}
                </label>
                <input
                  type="text"
                  maxLength={14}
                  value={form.brandBadge}
                  onChange={(e) => setForm((p) => ({ ...p, brandBadge: e.target.value }))}
                  placeholder={t('brandIdentity.brandBadgePlaceholder')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold uppercase text-slate-900 dark:text-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  {t('brandIdentity.sellerPortalNameLabel')}
                </label>
                <input
                  type="text"
                  maxLength={48}
                  value={form.sellerPortalName}
                  onChange={(e) => setForm((p) => ({ ...p, sellerPortalName: e.target.value }))}
                  placeholder={t('brandIdentity.sellerPortalNamePlaceholder')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  {t('brandIdentity.adminPortalNameLabel')}
                </label>
                <input
                  type="text"
                  maxLength={56}
                  value={form.adminPortalName}
                  onChange={(e) => setForm((p) => ({ ...p, adminPortalName: e.target.value }))}
                  placeholder={t('brandIdentity.adminPortalNamePlaceholder')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Card 2: AI Label & Wallet Unit Name */}
          <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <Coins className="w-4 h-4 text-amber-500" />
              <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
                {t('brandIdentity.sectionAiWalletTitle')}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <Bot className="w-3.5 h-3.5 text-purple-500" />
                  <span>{t('brandIdentity.aiBrandNameLabel')}</span>
                </label>
                <input
                  type="text"
                  maxLength={32}
                  value={form.aiBrandName}
                  onChange={(e) => setForm((p) => ({ ...p, aiBrandName: e.target.value }))}
                  placeholder={t('brandIdentity.aiBrandNamePlaceholder')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:border-purple-500 outline-none"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t('brandIdentity.aiBrandNameHelp')}</p>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span>{t('brandIdentity.coreUnitNameLabel')}</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={1}
                  maxLength={14}
                  value={form.coreUnitName}
                  onChange={(e) => setForm((p) => ({ ...p, coreUnitName: e.target.value }))}
                  placeholder={t('brandIdentity.coreUnitNamePlaceholder')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-extrabold text-amber-700 dark:text-amber-300 focus:border-amber-500 outline-none"
                />
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    {t('brandIdentity.coreUnitQuickPick')}
                  </span>
                  {CORE_UNIT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, coreUnitName: preset }))}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                        form.coreUnitName === preset
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  {t('brandIdentity.coreUnitRateHint', { unit: previewUnit })}
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Taglines, Copyright, Contact, Logos & Theme */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <ImageIcon className="w-4 h-4 text-emerald-500" />
              <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
                {t('brandIdentity.sectionMetaTitle')}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  {t('brandIdentity.taglineViLabel')}
                </label>
                <input
                  type="text"
                  maxLength={140}
                  value={form.taglineVi}
                  onChange={(e) => setForm((p) => ({ ...p, taglineVi: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  {t('brandIdentity.taglineEnLabel')}
                </label>
                <input
                  type="text"
                  maxLength={140}
                  value={form.taglineEn}
                  onChange={(e) => setForm((p) => ({ ...p, taglineEn: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  {t('brandIdentity.copyrightLabel')}
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={form.copyrightHolder}
                  onChange={(e) => setForm((p) => ({ ...p, copyrightHolder: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <Phone className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{t('brandIdentity.hotlineLabel')}</span>
                </label>
                <input
                  type="text"
                  maxLength={32}
                  value={form.supportHotline}
                  onChange={(e) => setForm((p) => ({ ...p, supportHotline: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <Mail className="w-3.5 h-3.5 text-amber-500" />
                  <span>{t('brandIdentity.supportEmailLabel')}</span>
                </label>
                <input
                  type="email"
                  maxLength={80}
                  value={form.supportEmail}
                  onChange={(e) => setForm((p) => ({ ...p, supportEmail: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <Send className="w-3.5 h-3.5 text-sky-500" />
                  <span>{t('brandIdentity.telegramLabel')}</span>
                </label>
                <input
                  type="url"
                  maxLength={250}
                  value={form.telegramUrl}
                  onChange={(e) => setForm((p) => ({ ...p, telegramUrl: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Logo & Favicon WebP Uploaders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <ImageUploadInput
                label={t('brandIdentity.logoUrlLabel')}
                value={form.logoUrl}
                onChange={(val) => setForm((p) => ({ ...p, logoUrl: val }))}
                maxWidth={400}
                maxHeight={400}
                quality={0.9}
              />
              <ImageUploadInput
                label={t('brandIdentity.faviconUrlLabel')}
                value={form.faviconUrl}
                onChange={(val) => setForm((p) => ({ ...p, faviconUrl: val }))}
                maxWidth={256}
                maxHeight={256}
                quality={0.85}
              />
            </div>

            {/* Currency Mode + Theme Accent + Official Store Sync */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('brandIdentity.currencyModeLabel')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, currencyMode: 'VND' }))}
                    className={`px-3 py-2 rounded-xl border text-xs font-bold text-left cursor-pointer transition ${
                      form.currencyMode === 'VND'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t('brandIdentity.currencyVnd')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, currencyMode: 'CORE' }))}
                    className={`px-3 py-2 rounded-xl border text-xs font-bold text-left cursor-pointer transition ${
                      form.currencyMode === 'CORE'
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t('brandIdentity.currencyCore', { unit: previewUnit })}
                  </button>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  <Palette className="w-3.5 h-3.5 text-purple-500" />
                  <span>{t('brandIdentity.themeAccentLabel')}</span>
                </label>
                <div className="flex items-center gap-2">
                  {ACCENT_PALETTES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, themeAccent: p.id }))}
                      aria-label={p.id}
                      className={`w-8 h-8 rounded-xl ${p.swatch} cursor-pointer transition flex items-center justify-center ${
                        form.themeAccent === p.id ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-slate-900 scale-105' : 'opacity-75 hover:opacity-100'
                      }`}
                    >
                      {form.themeAccent === p.id && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.syncOfficialStoreName}
                onChange={(e) => setForm((p) => ({ ...p, syncOfficialStoreName: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0"
              />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {t('brandIdentity.syncOfficialStoreLabel', { brand: previewBrand })}
              </span>
            </label>
          </div>
        </div>

        {/* RIGHT COLUMN (5/12): Sticky Live 5-Surface Preview */}
        <div className="xl:col-span-5 space-y-3.5 xl:sticky xl:top-20 min-w-0">
          <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
                    {t('brandIdentity.previewTitle')}
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {t('brandIdentity.previewSubtitle')}
                  </p>
                </div>
              </div>
            </div>

            {/* Surface 1: Storefront Header + Wallet Pill */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t('brandIdentity.previewSurface1')}
              </div>
              <div className={`rounded-xl bg-gradient-to-r ${activeAccent.headerGradient} p-3 text-white space-y-2 shadow-sm`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white overflow-hidden flex items-center justify-center shrink-0">
                      <img src={form.logoUrl || '/logo.webp'} alt={previewBrand} className="w-full h-full object-contain p-0.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-xs truncate">{previewBrand}</span>
                        {form.brandBadge && (
                          <span className={`bg-white ${activeAccent.badgeText} px-1 py-0.5 rounded text-[8px] font-black uppercase shrink-0`}>
                            {form.brandBadge}
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-white/90 truncate">{previewTagline}</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-white/20 text-[10px] font-bold whitespace-nowrap shrink-0">
                    {t('brandIdentity.previewWalletSample', { unit: previewUnit })}
                  </span>
                </div>
                <div className="bg-white rounded-md px-2.5 py-1.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <Search className="w-3 h-3 shrink-0" />
                  <span className="truncate">{t('brandIdentity.previewSearchPlaceholder', { brand: previewBrand })}</span>
                </div>
              </div>
            </div>

            {/* Surface 2: Browser Tab & Google SEO */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t('brandIdentity.previewSurface2')}
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-t-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-800 dark:text-slate-100 max-w-full">
                  <img src={form.faviconUrl || '/logo.webp'} alt="" className="w-3.5 h-3.5 rounded-sm object-cover shrink-0" />
                  <span className="truncate">{previewBrand} - {previewTagline}</span>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-lg p-2 border border-slate-200/80 dark:border-slate-700">
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono truncate">
                    https://universal-mall-shop.pages.dev/ • PWA: {previewShort}
                  </div>
                  <div className="text-xs font-bold text-blue-700 dark:text-blue-400 truncate mt-0.5">
                    {previewBrand} — {previewTagline}
                  </div>
                </div>
              </div>
            </div>

            {/* Surface 3: Seller Portal (/seller) */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t('brandIdentity.previewSurface3')}
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[#ee4d2d] text-white flex items-center justify-center shrink-0">
                    <Store className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">{previewSeller}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {t('brandIdentity.previewSellerShared', { unit: previewUnit, brand: previewBrand })}
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-orange-500/10 text-[#ee4d2d] text-[10px] font-mono font-bold shrink-0">
                  /seller
                </span>
              </div>
            </div>

            {/* Surface 4: Admin Sidebar & AI Brand */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t('brandIdentity.previewSurface4')}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 flex items-center justify-between gap-2 text-white">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{previewAdmin}</div>
                    <div className="text-[10px] text-indigo-400 font-semibold truncate">PRO PORTAL v2.5</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-200 text-[10px] font-bold shrink-0">
                  <Bot className="w-3 h-3" />
                  {previewAi}
                </span>
              </div>
            </div>

            {/* Surface 5: Footer & Email Subject */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t('brandIdentity.previewSurface5')}
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2.5 space-y-1.5 text-[11px]">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100 truncate">
                  <Mail className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">{t('brandIdentity.previewEmailSubject', { brand: previewBrand })}</span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/80 dark:border-slate-700 truncate">
                  {t('brandIdentity.previewCopyright', { holder: previewCopyright })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Bottom Rule-9 Single-Screen Coverage Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
            {t('brandIdentity.coverageTitle')}
          </h4>
        </div>

        <div className="overflow-x-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="table-fixed w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="w-[22%] px-3 py-2.5 font-bold">{t('brandIdentity.coverageColChannel')}</th>
                <th className="w-[28%] px-3 py-2.5 font-bold">{t('brandIdentity.coverageColPreview')}</th>
                <th className="w-[36%] px-3 py-2.5 font-bold">{t('brandIdentity.coverageColScope')}</th>
                <th className="w-[14%] px-3 py-2.5 font-bold text-right">{t('brandIdentity.coverageColStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {coverageRows.map((row) => (
                <tr key={row.channel} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white truncate" title={row.channel}>
                    {row.channel}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-indigo-700 dark:text-indigo-300 truncate" title={row.preview}>
                    {row.preview}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 truncate" title={row.scope}>
                    {row.scope}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                      {t('brandIdentity.coverageStatusReady')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
