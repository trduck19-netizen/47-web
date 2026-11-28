import React, { useState, useEffect } from 'react';
import {
  Palette,
  Save,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Clock,
  Megaphone,
  Store,
  Sparkles,
  AlertCircle,
  Eye,
  QrCode,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ImageUploadInput } from '../../admin/components/ui/ImageUploadInput';
import {
  STOREFRONT_BANNER_PRESETS,
  type StorefrontBannerPresetId,
  getStorefrontBannerPreset,
} from './storefrontThemes';

interface SellerStorefrontStudioProps {
  seller: any;
  sepayOnline?: boolean;
  getHeaders: () => Record<string, string>;
  onUpdated: (updatedSeller: any) => void;
}

export const SellerStorefrontStudio: React.FC<SellerStorefrontStudioProps> = ({
  seller,
  sepayOnline = false,
  getHeaders,
  onUpdated,
}) => {
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  const [name, setName] = useState<string>(seller?.name || '');
  const [avatarUrl, setAvatarUrl] = useState<string>(seller?.avatar_url || '');
  const [coverUrl, setCoverUrl] = useState<string>(seller?.cover_url || '');
  const [bannerPreset, setBannerPreset] = useState<StorefrontBannerPresetId>(
    (seller?.banner_preset as StorefrontBannerPresetId) || 'aurora_indigo'
  );
  const [pinnedNotice, setPinnedNotice] = useState<string>(seller?.pinned_notice || '');
  const [description, setDescription] = useState<string>(seller?.description || '');
  const [supportHours, setSupportHours] = useState<string>(seller?.support_hours || '08:00 - 22:00');
  const [contactPhone, setContactPhone] = useState<string>(seller?.contact_phone || '');
  const [warrantyPolicy, setWarrantyPolicy] = useState<string>(seller?.warranty_policy || '');
  const [refundPolicy, setRefundPolicy] = useState<string>(seller?.refund_policy || '');

  const [saving, setSaving] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!seller) return;
    setName(seller.name || '');
    setAvatarUrl(seller.avatar_url || '');
    setCoverUrl(seller.cover_url || '');
    setBannerPreset((seller.banner_preset as StorefrontBannerPresetId) || 'aurora_indigo');
    setPinnedNotice(seller.pinned_notice || '');
    setDescription(seller.description || '');
    setSupportHours(seller.support_hours || '08:00 - 22:00');
    setContactPhone(seller.contact_phone || '');
    setWarrantyPolicy(seller.warranty_policy || '');
    setRefundPolicy(seller.refund_policy || '');
  }, [seller?.id, seller?.updated_at]);

  const activePreset = getStorefrontBannerPreset(bannerPreset);
  const storePath = isEn ? `/en/gian-hang/${seller?.slug || ''}` : `/gian-hang/${seller?.slug || ''}`;
  const fullStoreUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${storePath}` : storePath;

  const handleCopyStoreLink = async () => {
    try {
      await navigator.clipboard.writeText(fullStoreUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/seller', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          name: name.trim(),
          avatar_url: avatarUrl.trim(),
          cover_url: coverUrl.trim(),
          banner_preset: bannerPreset,
          pinned_notice: pinnedNotice.trim(),
          description: description.trim(),
          support_hours: supportHours.trim() || '08:00 - 22:00',
          contact_phone: contactPhone.trim(),
          warranty_policy: warrantyPolicy.trim(),
          refund_policy: refundPolicy.trim(),
        }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        const nextSeller = data.seller || {
          ...seller,
          name: name.trim(),
          avatar_url: avatarUrl.trim() || null,
          cover_url: coverUrl.trim() || null,
          banner_preset: bannerPreset,
          pinned_notice: pinnedNotice.trim() || null,
          description: description.trim(),
          support_hours: supportHours.trim() || '08:00 - 22:00',
          contact_phone: contactPhone.trim(),
          warranty_policy: warrantyPolicy.trim(),
          refund_policy: refundPolicy.trim(),
          updated_at: new Date().toISOString(),
        };
        onUpdated(nextSeller);
        setFeedback({ type: 'success', text: t('sellerStoreStudio.saveSuccess') });
      } else {
        setFeedback({ type: 'error', text: data?.error || t('sellerStoreStudio.saveError') });
      }
    } catch {
      setFeedback({ type: 'error', text: t('sellerStoreStudio.saveError') });
    } finally {
      setSaving(false);
    }
  };

  const previewName = name.trim() || seller?.name || 'Shop';

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      {/* Studio Header */}
      <div className="p-4 sm:p-5 border-b border-border bg-gradient-to-r from-indigo-500/5 via-transparent to-orange-500/5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ee4d2d] to-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Palette className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-extrabold text-foreground truncate">
              {t('sellerStoreStudio.title')}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('sellerStoreStudio.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyStoreLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground transition cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? t('sellerStoreStudio.copiedLink') : t('sellerStoreStudio.copyLink')}</span>
          </button>
          <a
            href={storePath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{t('sellerStoreStudio.openPublicStore')}</span>
          </a>
        </div>
      </div>

      {feedback && feedback.type === 'error' && (
        <div className="mx-4 sm:mx-5 mt-4 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 border bg-destructive/10 border-destructive/30 text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="p-4 sm:p-5 grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT (7/12): Configuration Form */}
        <div className="xl:col-span-7 space-y-5 min-w-0">
          {/* 1. Banner Theme Presets */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-foreground">
              {t('sellerStoreStudio.bannerPresetLabel')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {STOREFRONT_BANNER_PRESETS.map((preset) => {
                const selected = bannerPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setBannerPreset(preset.id)}
                    aria-pressed={selected}
                    className={`relative rounded-xl overflow-hidden text-left border-2 transition-all cursor-pointer ${
                      selected
                        ? 'border-primary shadow-md'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div
                      className={`h-12 bg-gradient-to-r ${preset.gradientClass} relative`}
                      style={{ backgroundImage: preset.meshOverlay }}
                    >
                      {selected && (
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white text-slate-900 flex items-center justify-center shadow">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <div className="px-2.5 py-1.5 bg-background text-[11px] font-bold text-foreground truncate">
                      {isEn ? preset.labelEn : preset.labelVi}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Avatar & Cover Uploaders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImageUploadInput
              label={t('sellerStoreStudio.avatarLabel')}
              value={avatarUrl}
              onChange={setAvatarUrl}
              helperText={t('sellerStoreStudio.avatarHint')}
              maxWidth={360}
              maxHeight={360}
              quality={0.82}
            />
            <ImageUploadInput
              label={t('sellerStoreStudio.coverLabel')}
              value={coverUrl}
              onChange={setCoverUrl}
              helperText={t('sellerStoreStudio.coverHint')}
              maxWidth={1280}
              maxHeight={420}
              quality={0.78}
            />
          </div>

          {/* 3. Basic Store Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {t('sellerStoreStudio.storeNameLabel')}
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={50}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {t('sellerStoreStudio.supportHoursLabel')}
              </label>
              <input
                type="text"
                maxLength={80}
                value={supportHours}
                onChange={(e) => setSupportHours(e.target.value)}
                placeholder="08:00 - 22:00"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {t('sellerStoreStudio.contactPhoneLabel')}
              </label>
              <input
                type="text"
                maxLength={40}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="0900 123 456"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {t('sellerStoreStudio.pinnedNoticeLabel')}
              </label>
              <input
                type="text"
                maxLength={240}
                value={pinnedNotice}
                onChange={(e) => setPinnedNotice(e.target.value)}
                placeholder={t('sellerStoreStudio.pinnedNoticePlaceholder')}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-foreground mb-1">
              {t('sellerStoreStudio.descriptionLabel')}
            </label>
            <textarea
              rows={2}
              maxLength={600}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('sellerStoreStudio.descriptionPlaceholder')}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {t('sellerStoreStudio.warrantyLabel')}
              </label>
              <textarea
                rows={2}
                maxLength={400}
                value={warrantyPolicy}
                onChange={(e) => setWarrantyPolicy(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                {t('sellerStoreStudio.refundLabel')}
              </label>
              <textarea
                rows={2}
                maxLength={400}
                value={refundPolicy}
                onChange={(e) => setRefundPolicy(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ee4d2d] to-amber-500 text-white text-xs font-extrabold shadow-md hover:opacity-95 transition disabled:opacity-60 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? t('sellerStoreStudio.savingBtn') : t('sellerStoreStudio.saveBtn')}</span>
            </button>
          </div>
        </div>

        {/* RIGHT (5/12): Live Storefront Header Preview */}
        <div className="xl:col-span-5 space-y-3 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            <Eye className="w-4 h-4 text-primary" />
            <span>{t('sellerStoreStudio.livePreviewTitle')}</span>
          </div>

          <div className="rounded-2xl overflow-hidden border border-border bg-background shadow-md">
            {/* Simulated Flagship Cover */}
            <div className={`relative h-32 bg-gradient-to-r ${activePreset.gradientClass} overflow-hidden`}>
              <div className="absolute inset-0" style={{ backgroundImage: activePreset.meshOverlay }} />
              {coverUrl && (
                <img
                  src={coverUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-45"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
              <div className="relative z-10 p-3.5 h-full flex items-end gap-3">
                <div className="w-14 h-14 rounded-2xl border-2 border-white/80 bg-slate-900 shadow-lg flex items-center justify-center text-white font-black text-xl overflow-hidden shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={previewName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="bg-gradient-to-br from-white/25 to-white/5 w-full h-full flex items-center justify-center">
                      {previewName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-white">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-extrabold text-sm truncate max-w-[165px]">{previewName}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/25 border border-emerald-300/40 text-emerald-100 inline-flex items-center gap-0.5">
                      <ShieldCheck className="w-2.5 h-2.5" /> {seller?.reputation_score || 100}
                    </span>
                    {sepayOnline && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-white/20 border border-white/30 text-white inline-flex items-center gap-0.5">
                        <QrCode className="w-2.5 h-2.5" /> VietQR 0s
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-white/80 flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {supportHours || '08:00 - 22:00'}
                    </span>
                    <span>•</span>
                    <span className="truncate">/gian-hang/{seller?.slug}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Simulated Pinned Notice + Protection Strip */}
            <div className="p-3.5 space-y-2.5 text-[11px]">
              {pinnedNotice.trim() && (
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 flex items-start gap-1.5 font-medium">
                  <Megaphone className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{pinnedNotice}</span>
                </div>
              )}

              {description.trim() ? (
                <p className="text-muted-foreground line-clamp-2 leading-relaxed">{description}</p>
              ) : (
                <p className="text-muted-foreground/70 italic">{t('sellerStoreStudio.previewEmptyBio')}</p>
              )}

              <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold truncate">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span className="truncate">{warrantyPolicy || t('publicStore.defaultWarranty')}</span>
                </span>
                <span className="inline-flex items-center gap-1 shrink-0 font-semibold">
                  <Store className="w-3 h-3" /> {seller?.status === 'ACTIVE' ? 'OFFICIAL' : 'TRIAL'}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t('sellerStoreStudio.livePreviewHint')}
          </p>
        </div>
      </form>
    </div>
  );
};
