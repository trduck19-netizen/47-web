import React, { useEffect } from 'react';
import { HelpCircle, X, Send, PhoneCall, ShieldAlert, BookOpen, MessageSquare } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useBrand } from '../../context/BrandContext';

interface MallSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenReceivedCodes?: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const MallSupportModal: React.FC<MallSupportModalProps> = ({
  isOpen,
  onClose,
  onOpenReceivedCodes,
  onShowToast
}) => {
  const { t } = useLanguage();
  const { brand } = useBrand();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mall-support-title"
      onClick={onClose}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overscroll-contain animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden overscroll-contain"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#ee4d2d] via-[#f53d2d] to-[#ff7337] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
              <HelpCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 id="mall-support-title" className="font-bold text-lg leading-tight">
                {t('mall.supportModal.title')}
              </h3>
              <p className="text-xs text-white/90">
                {t('mall.supportModal.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/30 text-white flex items-center justify-center transition cursor-pointer shrink-0"
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto overscroll-contain text-sm">
          {/* Quick Support Channels */}
          <div className="grid grid-cols-2 gap-3">
            <a
              href={brand.telegramUrl || 'https://t.me/webcodegame_vn'}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition flex flex-col items-center text-center group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center mb-2 shadow-sm group-hover:scale-105 transition">
                <Send className="w-5 h-5" />
              </div>
              <div className="font-bold text-blue-900 dark:text-blue-300 text-xs">
                {t('mall.supportModal.telegramTitle')}
              </div>
              <div className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
                {t('mall.supportModal.telegramDesc')}
              </div>
            </a>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(brand.supportHotline || '0987.654.321').catch(() => {});
                onShowToast(t('mall.supportModal.hotlineCopied'), 'success');
              }}
              className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 transition flex flex-col items-center text-center group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center mb-2 shadow-sm group-hover:scale-105 transition">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div className="font-bold text-emerald-900 dark:text-emerald-300 text-xs">
                {t('mall.supportModal.hotlineTitle')}
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                {t('mall.supportModal.hotlineDesc')}
              </div>
            </button>
          </div>

          {/* Common Troubles */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
              {t('mall.supportModal.faqHeading')}
            </h4>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <span>{t('mall.supportModal.faq1Title')}</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 pl-5">
                {t('mall.supportModal.faq1Desc')}
              </p>
              {onOpenReceivedCodes && (
                <div className="pl-5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenReceivedCodes();
                    }}
                    className="text-[#ee4d2d] hover:underline font-semibold text-[11px] cursor-pointer"
                  >
                    {t('mall.supportModal.openVaultBtn')}
                  </button>
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span>{t('mall.supportModal.faq2Title')}</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 pl-5">
                {t('mall.supportModal.faq2Desc')}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>{t('mall.supportModal.faq3Title')}</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 pl-5">
                {t('mall.supportModal.faq3Desc')}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-[#ee4d2d] hover:bg-[#d73211] text-white font-bold px-6 py-2 rounded-xl text-xs shadow transition active:scale-95 cursor-pointer"
          >
            {t('mall.supportModal.closeBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};
