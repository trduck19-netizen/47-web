import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Sparkles,
  Truck,
  Zap,
  Wrench,
  Layers,
  ListChecks,
  Tag,
  AlertCircle,
  Star,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  SELLER_INDUSTRY_OPTIONS,
  getSellerIndustryById,
  parseSafeJsonArray,
  type ProductSpecItem,
  type ProductVariantItem,
} from '../../config/sellerIndustries';
import { SellerProductGalleryUploader } from './SellerProductGalleryUploader';

interface SellerProductEditorModalProps {
  isOpen: boolean;
  editingProduct: any | null;
  sellerData: any;
  shopCategories: string[];
  getHeaders: () => Record<string, string>;
  onClose: () => void;
  onSaved: (message: string) => void;
}

type FulfillmentModeUi = 'SHIPPING' | 'AUTO_VAULT' | 'MANUAL_SERVICE' | 'WEBHOOK';

export const SellerProductEditorModal: React.FC<SellerProductEditorModalProps> = ({
  isOpen,
  editingProduct,
  sellerData,
  shopCategories,
  getHeaders,
  onClose,
  onSaved,
}) => {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isEditMode = Boolean(editingProduct?.id);

  const [name, setName] = useState<string>('');
  const [industryId, setIndustryId] = useState<string>('fashion');
  const [categoryName, setCategoryName] = useState<string>('');
  const [shopCategory, setShopCategory] = useState<string>('');
  const [sku, setSku] = useState<string>('');
  const [images, setImages] = useState<string[]>([]);
  const [priceCore, setPriceCore] = useState<string>('');
  const [originalPriceCore, setOriginalPriceCore] = useState<string>('');
  const [stockQuantity, setStockQuantity] = useState<string>('20');
  const [description, setDescription] = useState<string>('');
  const [isFeatured, setIsFeatured] = useState<boolean>(false);

  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentModeUi>('SHIPPING');
  const [weightGrams, setWeightGrams] = useState<string>('500');
  const [lengthCm, setLengthCm] = useState<string>('20');
  const [widthCm, setWidthCm] = useState<string>('15');
  const [heightCm, setHeightCm] = useState<string>('10');
  const [warehouseAddress, setWarehouseAddress] = useState<string>('');
  const [codAllowed, setCodAllowed] = useState<boolean>(true);
  const [warrantyHours, setWarrantyHours] = useState<number>(24);
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(2);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [buyerNotePrompt, setBuyerNotePrompt] = useState<string>('');

  const [variants, setVariants] = useState<ProductVariantItem[]>([]);
  const [specs, setSpecs] = useState<ProductSpecItem[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');

    if (editingProduct) {
      const p = editingProduct;
      const initInd = p.industry_id || (String(p.product_type).toLowerCase() === 'physical' ? 'other' : 'digital_service');
      const indOpt = getSellerIndustryById(initInd);
      setName(p.name || '');
      setIndustryId(indOpt.id);
      setCategoryName(p.category_name || p.game_name || (isEn ? indOpt.labelEn : indOpt.labelVi));
      setShopCategory(p.shop_category || '');
      setSku(p.sku || '');

      const parsedImgs = Array.isArray(p.images)
        ? p.images
        : parseSafeJsonArray<string>(p.images_json);
      setImages(parsedImgs.length > 0 ? parsedImgs : p.cover_url ? [p.cover_url] : []);

      setPriceCore(String(p.price_core || ''));
      setOriginalPriceCore(p.original_price_core ? String(p.original_price_core) : '');
      setStockQuantity(String(p.stock_quantity ?? 10));
      setDescription(p.description || '');
      setIsFeatured(Number(p.is_featured || 0) === 1);

      const resolvedMode: FulfillmentModeUi =
        String(p.product_type).toLowerCase() === 'physical'
          ? 'SHIPPING'
          : String(p.fulfillment_mode || '').toUpperCase() === 'MANUAL_SERVICE' || p.delivery_type === 'MANUAL'
            ? 'MANUAL_SERVICE'
            : String(p.fulfillment_mode || '').toUpperCase() === 'WEBHOOK' || p.delivery_mode === 'WEBHOOK'
              ? 'WEBHOOK'
              : 'AUTO_VAULT';
      setFulfillmentMode(resolvedMode);

      setWeightGrams(String(p.weight_grams || 500));
      setLengthCm(String(p.length_cm || 20));
      setWidthCm(String(p.width_cm || 15));
      setHeightCm(String(p.height_cm || 10));
      setWarehouseAddress(
        p.warehouse_address || t('sellerProductEditor.defaultWarehouse')
      );
      setCodAllowed(Boolean(p.cod_allowed ?? true));
      setWarrantyHours(Number(p.warranty_hours || 24));
      setLowStockThreshold(Number(p.low_stock_threshold || 2));
      setWebhookUrl(p.webhook_url || '');
      setBuyerNotePrompt(p.buyer_note_prompt || '');

      const parsedVars = Array.isArray(p.variants)
        ? p.variants
        : parseSafeJsonArray<ProductVariantItem>(p.variants_json);
      setVariants(parsedVars);

      const parsedSpecs = Array.isArray(p.specs)
        ? p.specs
        : parseSafeJsonArray<ProductSpecItem>(p.specs_json);
      setSpecs(parsedSpecs);
    } else {
      const defInd = SELLER_INDUSTRY_OPTIONS[0];
      setName('');
      setIndustryId(defInd.id);
      setCategoryName(isEn ? defInd.labelEn : defInd.labelVi);
      setShopCategory('');
      setSku('');
      setImages([]);
      setPriceCore('');
      setOriginalPriceCore('');
      setStockQuantity('20');
      setDescription('');
      setIsFeatured(false);
      setFulfillmentMode('SHIPPING');
      setWeightGrams('500');
      setLengthCm('20');
      setWidthCm('15');
      setHeightCm('10');
      setWarehouseAddress(t('sellerProductEditor.defaultWarehouse'));
      setCodAllowed(true);
      setWarrantyHours(24);
      setLowStockThreshold(2);
      setWebhookUrl('');
      setBuyerNotePrompt('');
      setVariants([]);
      setSpecs([]);
    }
  }, [isOpen, editingProduct, isEn]);

  const activeIndustry = getSellerIndustryById(industryId);

  const handleSelectIndustry = (nextId: string) => {
    const opt = getSellerIndustryById(nextId);
    setIndustryId(opt.id);
    setCategoryName(isEn ? opt.labelEn : opt.labelVi);
    if (!isEditMode) {
      setFulfillmentMode(opt.defaultProductType === 'physical' ? 'SHIPPING' : 'MANUAL_SERVICE');
    }
  };

  const handleApplySuggestedSpecs = () => {
    const templates = isEn ? activeIndustry.suggestedSpecsEn : activeIndustry.suggestedSpecsVi;
    const existingLabels = new Set(specs.map((s) => s.label.toLowerCase()));
    const additions: ProductSpecItem[] = templates
      .filter((tpl) => !existingLabels.has(tpl.label.toLowerCase()))
      .map((tpl) => ({ label: tpl.label, value: '' }));
    setSpecs([...specs, ...additions].slice(0, 15));
  };

  const handleAddVariant = () => {
    if (variants.length >= 20) return;
    setVariants([
      ...variants,
      {
        id: `var_${Date.now().toString(36)}_${variants.length + 1}`,
        name: '',
        price_core: parseInt(priceCore, 10) || 50,
        stock_quantity: 10,
        sku: '',
      },
    ]);
  };

  const handleUpdateVariant = (idx: number, patch: Partial<ProductVariantItem>) => {
    setVariants(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const handleAddSpec = () => {
    if (specs.length >= 15) return;
    setSpecs([...specs, { label: '', value: '' }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (images.length === 0) {
      setErrorMsg(t('sellerProductEditor.requireAtLeastOneImage'));
      return;
    }

    const parsedPrice = parseInt(priceCore, 10);
    if (!parsedPrice || parsedPrice <= 0) {
      setErrorMsg(t('sellerProductEditor.invalidPrice'));
      return;
    }

    setSubmitting(true);
    try {
      const productType = fulfillmentMode === 'SHIPPING' ? 'physical' : 'digital';
      const cleanSpecs = specs.filter((s) => s.label.trim() && s.value.trim());
      const cleanVars = variants.filter((v) => v.name.trim());

      const payload: any = {
        name: name.trim(),
        industry_id: industryId,
        category_name: categoryName.trim() || (isEn ? activeIndustry.labelEn : activeIndustry.labelVi),
        shop_category: shopCategory.trim() || null,
        sku: sku.trim() || null,
        images,
        cover_url: images[0],
        price_core: parsedPrice,
        original_price_core: originalPriceCore ? parseInt(originalPriceCore, 10) : null,
        description: description.trim(),
        is_featured: isFeatured,
        product_type: productType,
        fulfillment_mode: fulfillmentMode,
        warranty_hours: warrantyHours,
        warranty_type: `${warrantyHours}H`,
        low_stock_threshold: lowStockThreshold,
        specs: cleanSpecs,
        variants: cleanVars,
        buyer_note_prompt: buyerNotePrompt.trim() || null,
      };

      if (fulfillmentMode === 'SHIPPING') {
        payload.stock_quantity = Math.max(0, parseInt(stockQuantity, 10) || 0);
        payload.weight_grams = Math.max(1, parseInt(weightGrams, 10) || 500);
        payload.length_cm = Math.max(1, parseInt(lengthCm, 10) || 10);
        payload.width_cm = Math.max(1, parseInt(widthCm, 10) || 10);
        payload.height_cm = Math.max(1, parseInt(heightCm, 10) || 10);
        payload.warehouse_address = warehouseAddress.trim();
        payload.cod_allowed = codAllowed;
      } else if (fulfillmentMode === 'MANUAL_SERVICE') {
        payload.stock_quantity = Math.max(0, parseInt(stockQuantity, 10) || 0);
        payload.delivery_type = 'MANUAL';
        payload.delivery_mode = 'MANUAL';
      } else if (fulfillmentMode === 'WEBHOOK') {
        payload.delivery_type = 'AUTO';
        payload.delivery_mode = 'WEBHOOK';
        payload.webhook_url = webhookUrl.trim();
      } else {
        payload.delivery_type = 'AUTO';
        payload.delivery_mode = 'INVENTORY';
      }

      const endpoint = isEditMode ? `/api/seller/products/${editingProduct.id}` : '/api/seller/products';
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      const data: any = await res.json().catch(() => ({}));

      if (res.ok && data?.success) {
        onSaved(data.message || t('sellerProductEditor.saveSuccess'));
        onClose();
      } else {
        setErrorMsg(data?.error || t('sellerProductEditor.saveFailed'));
      }
    } catch {
      setErrorMsg(t('sellerProductEditor.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="seller-prod-editor-title"
      onClose={onClose}
      className="m-auto w-full max-w-4xl rounded-2xl border border-border bg-card text-foreground p-0 shadow-2xl [overscroll-behavior:contain] backdrop:bg-black/65 backdrop:backdrop-blur-xs backdrop:overflow-hidden backdrop:[overscroll-behavior:contain]"
    >
      {isOpen && (
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
          {/* Sticky Dialog Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 bg-card sticky top-0 z-10">
            <div>
              <h1 id="seller-prod-editor-title" className="text-base sm:text-lg font-extrabold text-foreground">
                {isEditMode
                  ? t('sellerProductEditor.editTitle')
                  : t('sellerProductEditor.createTitle')}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('sellerProductEditor.subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('sellerProductEditor.closeBtn')}
              className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Form Body */}
          <div className="p-5 overflow-y-auto space-y-6 text-xs">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 1. GALLERY UP TO 10 PHOTOS */}
            <SellerProductGalleryUploader
              images={images}
              onChange={setImages}
              getHeaders={getHeaders}
            />

            {/* 2. BASIC MULTI-INDUSTRY IDENTITY */}
            <div className="p-4 rounded-2xl bg-muted/25 border border-border space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-primary" />
                  <span>{t('sellerProductEditor.basicSectionTitle')}</span>
                </span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-amber-600 dark:text-amber-400">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="rounded text-primary"
                  />
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span>{t('sellerProductEditor.pinFeaturedLabel')}</span>
                </label>
              </div>

              <div>
                <label className="block font-semibold mb-1">{t('sellerProductEditor.productNameLabel')} *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={160}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('sellerProductEditor.productNamePlaceholder')}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">{t('sellerProductEditor.industryLabel')} *</label>
                  <select
                    value={industryId}
                    onChange={(e) => handleSelectIndustry(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background font-medium focus:outline-none focus:border-primary"
                  >
                    {SELLER_INDUSTRY_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.icon} {isEn ? opt.labelEn : opt.labelVi}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">{t('sellerProductEditor.shopCollectionLabel')}</label>
                  <input
                    type="text"
                    maxLength={60}
                    list="seller-shop-collections-datalist"
                    value={shopCategory}
                    onChange={(e) => setShopCategory(e.target.value)}
                    placeholder={t('sellerProductEditor.shopCollectionPlaceholder')}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:border-primary"
                  />
                  <datalist id="seller-shop-collections-datalist">
                    {shopCategories.map((col) => (
                      <option key={col} value={col} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block font-semibold mb-1">{t('sellerProductEditor.skuLabel')}</label>
                  <input
                    type="text"
                    maxLength={50}
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="SKU-001"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {shopCategories.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">{t('sellerProductEditor.quickPickCollection')}:</span>
                  {shopCategories.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setShopCategory(col)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer ${
                        shopCategory === col
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {col}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1">{t('sellerProductEditor.descriptionLabel')}</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('sellerProductEditor.descriptionPlaceholder')}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background focus:outline-none focus:border-primary leading-relaxed"
                />
              </div>
            </div>

            {/* 3. PRICING, STOCK & STRUCTURED VARIANTS */}
            <div className="p-4 rounded-2xl bg-muted/25 border border-border space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-primary" />
                  <span>{t('sellerProductEditor.pricingVariantsTitle')}</span>
                </span>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('sellerProductEditor.addVariantBtn')}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">{t('sellerProductEditor.sellingPriceLabel')} *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={sellerData?.status === 'TRIAL' ? sellerData.trial_order_max || 200 : 100000000}
                    value={priceCore}
                    onChange={(e) => setPriceCore(e.target.value)}
                    placeholder="99"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background font-bold focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">{t('sellerProductEditor.originalPriceLabel')}</label>
                  <input
                    type="number"
                    min={1}
                    value={originalPriceCore}
                    onChange={(e) => setOriginalPriceCore(e.target.value)}
                    placeholder="150"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:border-primary"
                  />
                </div>
                {fulfillmentMode !== 'AUTO_VAULT' && (
                  <div>
                    <label className="block font-semibold mb-1">{t('sellerProductEditor.stockQuantityLabel')} *</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>

              {variants.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-[11px] text-muted-foreground font-medium">
                    {t('sellerProductEditor.variantsHelper')}
                  </div>
                  {variants.map((v, idx) => (
                    <div
                      key={v.id}
                      className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl bg-background border border-border"
                    >
                      <input
                        type="text"
                        value={v.name}
                        onChange={(e) => handleUpdateVariant(idx, { name: e.target.value })}
                        placeholder={t('sellerProductEditor.variantNamePlaceholder')}
                        className="col-span-5 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30"
                      />
                      <input
                        type="number"
                        min={1}
                        value={v.price_core}
                        onChange={(e) => handleUpdateVariant(idx, { price_core: parseInt(e.target.value, 10) || 1 })}
                        placeholder={t('sellerProductEditor.sellingPriceLabel')}
                        className="col-span-3 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 font-bold"
                      />
                      <input
                        type="number"
                        min={0}
                        value={v.stock_quantity ?? 10}
                        onChange={(e) =>
                          handleUpdateVariant(idx, { stock_quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })
                        }
                        placeholder="SL"
                        className="col-span-3 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30"
                      />
                      <button
                        type="button"
                        onClick={() => setVariants(variants.filter((_, i) => i !== idx))}
                        className="col-span-1 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. CUSTOM SPECIFICATIONS KEY-VALUE BUILDER */}
            <div className="p-4 rounded-2xl bg-muted/25 border border-border space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <ListChecks className="w-4 h-4 text-primary" />
                  <span>{t('sellerProductEditor.specsSectionTitle')}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleApplySuggestedSpecs}
                    className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>{t('sellerProductEditor.suggestSpecsBtn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddSpec}
                    className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('sellerProductEditor.addSpecBtn')}</span>
                  </button>
                </div>
              </div>

              {specs.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">{t('sellerProductEditor.specsEmptyHint')}</p>
              ) : (
                <div className="space-y-2">
                  {specs.map((sp, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={sp.label}
                        onChange={(e) =>
                          setSpecs(specs.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item)))
                        }
                        placeholder={t('sellerProductEditor.specKeyPlaceholder')}
                        className="col-span-4 px-2.5 py-1.5 rounded-lg border border-border bg-background font-semibold"
                      />
                      <input
                        type="text"
                        value={sp.value}
                        onChange={(e) =>
                          setSpecs(specs.map((item, i) => (i === idx ? { ...item, value: e.target.value } : item)))
                        }
                        placeholder={t('sellerProductEditor.specValPlaceholder')}
                        className="col-span-7 px-2.5 py-1.5 rounded-lg border border-border bg-background"
                      />
                      <button
                        type="button"
                        onClick={() => setSpecs(specs.filter((_, i) => i !== idx))}
                        className="col-span-1 p-1.5 rounded-lg text-muted-foreground hover:text-destructive flex justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5. FULFILLMENT & DELIVERY MODE */}
            <div className="p-4 rounded-2xl bg-muted/25 border border-border space-y-3.5">
              <div className="font-bold text-foreground">{t('sellerProductEditor.fulfillmentSectionTitle')}</div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setFulfillmentMode('SHIPPING')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    fulfillmentMode === 'SHIPPING'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-extrabold text-xs">
                    <Truck className="w-4 h-4 text-primary shrink-0" />
                    <span>{t('sellerProductEditor.modeShippingTitle')}</span>
                  </div>
                  <p className="text-[11px] opacity-85 mt-1">{t('sellerProductEditor.modeShippingDesc')}</p>
                </button>

                <button
                  type="button"
                  onClick={() => setFulfillmentMode('MANUAL_SERVICE')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    fulfillmentMode === 'MANUAL_SERVICE'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-extrabold text-xs">
                    <Wrench className="w-4 h-4 text-primary shrink-0" />
                    <span>{t('sellerProductEditor.modeManualTitle')}</span>
                  </div>
                  <p className="text-[11px] opacity-85 mt-1">{t('sellerProductEditor.modeManualDesc')}</p>
                </button>

                <button
                  type="button"
                  onClick={() => setFulfillmentMode('AUTO_VAULT')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    fulfillmentMode === 'AUTO_VAULT' || fulfillmentMode === 'WEBHOOK'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-extrabold text-xs">
                    <Zap className="w-4 h-4 text-primary shrink-0" />
                    <span>{t('sellerProductEditor.modeAutoTitle')}</span>
                  </div>
                  <p className="text-[11px] opacity-85 mt-1">{t('sellerProductEditor.modeAutoDesc')}</p>
                </button>
              </div>

              {fulfillmentMode === 'SHIPPING' && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold mb-1">{t('sellerProductEditor.weightGramsLabel')} *</label>
                      <input
                        type="number"
                        required
                        min={1}
                        value={weightGrams}
                        onChange={(e) => setWeightGrams(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">{t('sellerProductEditor.dimensionsLabel')}</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <input
                          type="number"
                          min={1}
                          value={lengthCm}
                          onChange={(e) => setLengthCm(e.target.value)}
                          placeholder="L"
                          className="px-2 py-2 rounded-xl border border-border bg-background text-center"
                        />
                        <input
                          type="number"
                          min={1}
                          value={widthCm}
                          onChange={(e) => setWidthCm(e.target.value)}
                          placeholder="W"
                          className="px-2 py-2 rounded-xl border border-border bg-background text-center"
                        />
                        <input
                          type="number"
                          min={1}
                          value={heightCm}
                          onChange={(e) => setHeightCm(e.target.value)}
                          placeholder="H"
                          className="px-2 py-2 rounded-xl border border-border bg-background text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block font-semibold mb-1">{t('sellerProductEditor.warehouseLabel')} *</label>
                      <input
                        type="text"
                        required
                        value={warehouseAddress}
                        onChange={(e) => setWarehouseAddress(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                      />
                    </div>
                    <div className="pt-4">
                      <label className="inline-flex items-center gap-2 cursor-pointer font-semibold">
                        <input
                          type="checkbox"
                          checked={codAllowed}
                          onChange={(e) => setCodAllowed(e.target.checked)}
                          className="w-4 h-4 rounded text-primary"
                        />
                        <span>{t('sellerProductEditor.codAllowedLabel')}</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {fulfillmentMode === 'MANUAL_SERVICE' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block font-semibold mb-1">{t('sellerProductEditor.buyerPromptLabel')}</label>
                    <input
                      type="text"
                      maxLength={180}
                      value={buyerNotePrompt}
                      onChange={(e) => setBuyerNotePrompt(e.target.value)}
                      placeholder={t('sellerProductEditor.buyerPromptPlaceholder')}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">{t('sellerProductEditor.warrantyHoursLabel')}</label>
                    <select
                      value={warrantyHours}
                      onChange={(e) => setWarrantyHours(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                    >
                      <option value={24}>24h</option>
                      <option value={72}>72h (3 {t('sellerProductEditor.daysUnit')})</option>
                      <option value={168}>168h (7 {t('sellerProductEditor.daysUnit')})</option>
                    </select>
                  </div>
                </div>
              )}

              {(fulfillmentMode === 'AUTO_VAULT' || fulfillmentMode === 'WEBHOOK') && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold mb-1">{t('sellerProductEditor.autoSourceLabel')}</label>
                      <select
                        value={fulfillmentMode}
                        onChange={(e) => setFulfillmentMode(e.target.value as FulfillmentModeUi)}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                      >
                        <option value="AUTO_VAULT">{t('sellerProductEditor.autoSourceVault')}</option>
                        <option value="WEBHOOK">{t('sellerProductEditor.autoSourceWebhook')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">{t('sellerProductEditor.warrantyHoursLabel')}</label>
                      <select
                        value={warrantyHours}
                        onChange={(e) => setWarrantyHours(parseInt(e.target.value, 10))}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                      >
                        <option value={24}>24h</option>
                        <option value={48}>48h</option>
                        <option value={72}>72h</option>
                        <option value={168}>168h</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">{t('sellerProductEditor.lowStockAlertLabel')}</label>
                      <input
                        type="number"
                        min={1}
                        value={lowStockThreshold}
                        onChange={(e) => setLowStockThreshold(parseInt(e.target.value, 10) || 2)}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background"
                      />
                    </div>
                  </div>

                  {fulfillmentMode === 'WEBHOOK' && (
                    <div>
                      <label className="block font-semibold mb-1">{t('sellerProductEditor.webhookUrlLabel')} *</label>
                      <input
                        type="url"
                        required
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background font-mono"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sticky Dialog Footer */}
          <div className="px-5 py-3.5 border-t border-border bg-card flex items-center justify-end gap-2.5 sticky bottom-0 z-10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border hover:bg-muted text-xs font-semibold cursor-pointer"
            >
              {t('sellerProductEditor.cancelBtn')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold shadow-sm hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              {submitting
                ? t('sellerProductEditor.savingBtn')
                : isEditMode
                  ? t('sellerProductEditor.saveChangesBtn')
                  : t('sellerProductEditor.publishProductBtn')}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
};
