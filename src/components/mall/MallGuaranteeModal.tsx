import React, { useEffect } from 'react';
import { ShieldCheck, X, CheckCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface MallGuaranteeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MallGuaranteeModal: React.FC<MallGuaranteeModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();

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
      aria-labelledby="mall-guarantee-title"
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
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 id="mall-guarantee-title" className="font-bold text-lg leading-tight">
                {t('mall.guaranteeModal.title')}
              </h3>
              <p className="text-xs text-white/90">
                {t('mall.guaranteeModal.subtitle')}
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
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto overscroll-contain text-sm text-slate-700 dark:text-slate-300">
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-900 dark:text-amber-300">
                {t('mall.guaranteeModal.escrowTitle')}
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-400 mt-0.5">
                {t('mall.guaranteeModal.escrowDesc')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">
              {t('mall.guaranteeModal.benefitsHeading')}
            </h4>

            <div className="flex items-start gap-2.5">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {t('mall.guaranteeModal.benefit1Title')}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400 ml-1">
                  {t('mall.guaranteeModal.benefit1Desc')}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <RefreshCw className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {t('mall.guaranteeModal.benefit2Title')}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400 ml-1">
                  {t('mall.guaranteeModal.benefit2Desc')}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {t('mall.guaranteeModal.benefit3Title')}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400 ml-1">
                  {t('mall.guaranteeModal.benefit3Desc')}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400">
            💡 <strong>{t('mall.guaranteeModal.securityLabel')}</strong>: {t('mall.guaranteeModal.securityDesc')}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-[#ee4d2d] hover:bg-[#d73211] text-white font-bold px-6 py-2 rounded-xl text-xs shadow transition active:scale-95 cursor-pointer"
          >
            {t('mall.guaranteeModal.confirmBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};
