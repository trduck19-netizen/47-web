import React, { useRef, useState } from 'react';
import {
  Upload,
  Link as LinkIcon,
  Star,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { compressImage } from '../../utils/imageCompressor';
import { MAX_PRODUCT_IMAGES } from '../../config/sellerIndustries';

interface SellerProductGalleryUploaderProps {
  images: string[];
  onChange: (nextImages: string[]) => void;
  getHeaders: () => Record<string, string>;
}

export const SellerProductGalleryUploader: React.FC<SellerProductGalleryUploaderProps> = ({
  images,
  onChange,
  getHeaders,
}) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState<number>(0);
  const [urlInput, setUrlInput] = useState<string>('');
  const [showUrlBar, setShowUrlBar] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const remainingSlots = Math.max(0, MAX_PRODUCT_IMAGES - images.length);

  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setErrorText('');

    if (images.length >= MAX_PRODUCT_IMAGES) {
      setErrorText(t('sellerProductEditor.maxImagesReached'));
      return;
    }

    const allowedCount = Math.min(files.length, MAX_PRODUCT_IMAGES - images.length);
    const slice = files.slice(0, allowedCount);
    if (files.length > allowedCount) {
      setErrorText(t('sellerProductEditor.maxImagesTrimmed', { max: MAX_PRODUCT_IMAGES }));
    }

    setUploadingCount(slice.length);
    const uploadedUrls: string[] = [];

    try {
      for (const file of slice) {
        const compressed = await compressImage(file, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.82,
        });

        const res = await fetch('/api/seller/media/upload', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ data_url: compressed.dataUrl }),
        });
        const data: any = await res.json().catch(() => ({}));
        if (res.ok && data?.success && data?.url) {
          uploadedUrls.push(data.url);
        } else {
          setErrorText(data?.error || t('sellerProductEditor.uploadFailed'));
        }
      }

      if (uploadedUrls.length > 0) {
        const merged = [...images];
        for (const u of uploadedUrls) {
          if (!merged.includes(u) && merged.length < MAX_PRODUCT_IMAGES) {
            merged.push(u);
          }
        }
        onChange(merged);
      }
    } catch {
      setErrorText(t('sellerProductEditor.uploadFailed'));
    } finally {
      setUploadingCount(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddExternalUrl = async () => {
    const raw = urlInput.trim();
    if (!raw) return;
    setErrorText('');
    if (images.length >= MAX_PRODUCT_IMAGES) {
      setErrorText(t('sellerProductEditor.maxImagesReached'));
      return;
    }
    setUploadingCount(1);
    try {
      const res = await fetch('/api/seller/media/upload', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ image_url: raw }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data?.success && data?.url) {
        if (!images.includes(data.url)) {
          onChange([...images, data.url].slice(0, MAX_PRODUCT_IMAGES));
        }
        setUrlInput('');
        setShowUrlBar(false);
      } else if (raw.startsWith('https://') || raw.startsWith('/')) {
        if (!images.includes(raw)) {
          onChange([...images, raw].slice(0, MAX_PRODUCT_IMAGES));
        }
        setUrlInput('');
        setShowUrlBar(false);
      } else {
        setErrorText(data?.error || t('sellerProductEditor.invalidImageUrl'));
      }
    } catch {
      setErrorText(t('sellerProductEditor.uploadFailed'));
    } finally {
      setUploadingCount(0);
    }
  };

  const handleSetAsCover = (idx: number) => {
    if (idx <= 0 || idx >= images.length) return;
    const next = [...images];
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    onChange(next);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    const tmp = next[idx];
    next[idx] = next[target];
    next[target] = tmp;
    onChange(next);
  };

  const handleRemove = (idx: number) => {
    onChange(images.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-bold text-foreground">
            {t('sellerProductEditor.galleryLabel')}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-primary/10 text-primary border border-primary/20">
            {images.length} / {MAX_PRODUCT_IMAGES}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={remainingSlots === 0 || uploadingCount > 0}
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold flex items-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <Upload className="w-3 h-3" />
            <span>{t('sellerProductEditor.uploadFromDeviceBtn')}</span>
          </button>
          <button
            type="button"
            disabled={remainingSlots === 0 || uploadingCount > 0}
            onClick={() => setShowUrlBar((prev) => !prev)}
            className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-[11px] font-semibold flex items-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <LinkIcon className="w-3 h-3" />
            <span>{t('sellerProductEditor.pasteUrlBtn')}</span>
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          if (e.target.files) uploadFiles(e.target.files);
        }}
        className="hidden"
      />

      {showUrlBar && remainingSlots > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/50 border border-border">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://..."
            className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={!urlInput.trim() || uploadingCount > 0}
            onClick={handleAddExternalUrl}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 cursor-pointer shrink-0"
          >
            {t('sellerProductEditor.addUrlConfirmBtn')}
          </button>
        </div>
      )}

      {errorText && (
        <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-[11px] font-semibold flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorText}</span>
        </div>
      )}

      {/* 10-Slot Shopee Seller Centre Photo Grid */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer?.files?.length) {
            uploadFiles(e.dataTransfer.files);
          }
        }}
        className={`p-3 rounded-2xl border-2 border-dashed transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
        }`}
      >
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {Array.from({ length: MAX_PRODUCT_IMAGES }).map((_, slotIdx) => {
            const imgUrl = images[slotIdx];
            if (imgUrl) {
              return (
                <div
                  key={`${slotIdx}-${imgUrl}`}
                  className={`group relative aspect-square rounded-xl overflow-hidden border-2 bg-background shadow-2xs ${
                    slotIdx === 0 ? 'border-primary' : 'border-border'
                  }`}
                >
                  <img
                    src={imgUrl}
                    alt={`${slotIdx + 1}`}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />

                  <span
                    className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-extrabold shadow ${
                      slotIdx === 0
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-black/65 text-white'
                    }`}
                  >
                    {slotIdx === 0
                      ? t('sellerProductEditor.coverBadge')
                      : `${slotIdx + 1}/${MAX_PRODUCT_IMAGES}`}
                  </span>

                  {/* Hover Action Toolbar */}
                  <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/85 via-black/60 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-between gap-1">
                    <div className="flex items-center gap-0.5">
                      {slotIdx > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSetAsCover(slotIdx)}
                          title={t('sellerProductEditor.setAsCoverHint')}
                          aria-label={t('sellerProductEditor.setAsCoverHint')}
                          className="p-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer"
                        >
                          <Star className="w-3 h-3 fill-current" />
                        </button>
                      )}
                      {slotIdx > 0 && (
                        <button
                          type="button"
                          onClick={() => handleMove(slotIdx, -1)}
                          title={t('sellerProductEditor.moveLeftHint')}
                          aria-label={t('sellerProductEditor.moveLeftHint')}
                          className="p-1 rounded bg-white/20 hover:bg-white/35 text-white cursor-pointer"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                      )}
                      {slotIdx < images.length - 1 && (
                        <button
                          type="button"
                          onClick={() => handleMove(slotIdx, 1)}
                          title={t('sellerProductEditor.moveRightHint')}
                          aria-label={t('sellerProductEditor.moveRightHint')}
                          className="p-1 rounded bg-white/20 hover:bg-white/35 text-white cursor-pointer"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemove(slotIdx)}
                      title={t('sellerProductEditor.removeImageHint')}
                      aria-label={t('sellerProductEditor.removeImageHint')}
                      className="p-1 rounded bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            }

            const isNextUploadSlot = slotIdx === images.length;
            return (
              <button
                key={`empty-${slotIdx}`}
                type="button"
                disabled={uploadingCount > 0}
                onClick={() => fileInputRef.current?.click()}
                className={`aspect-square rounded-xl border border-dashed flex flex-col items-center justify-center gap-1 p-2 transition cursor-pointer ${
                  isNextUploadSlot
                    ? 'border-primary/60 bg-primary/5 hover:bg-primary/10 text-primary'
                    : 'border-border/80 bg-background/50 hover:border-primary/40 text-muted-foreground'
                }`}
              >
                {isNextUploadSlot && uploadingCount > 0 ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-[10px] font-bold text-center">
                      {t('sellerProductEditor.uploadingLabel')}
                    </span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span className="text-[10px] font-semibold">
                      {slotIdx === 0
                        ? t('sellerProductEditor.coverSlotLabel')
                        : `#${slotIdx + 1}`}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground mt-2.5">
          {t('sellerProductEditor.galleryHelper')}
        </p>
      </div>
    </div>
  );
};
