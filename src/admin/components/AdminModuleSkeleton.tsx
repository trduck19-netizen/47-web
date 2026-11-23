import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Loader2 } from 'lucide-react';

export const AdminModuleSkeleton: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="w-full h-full p-4 sm:p-6 space-y-5 animate-pulse select-none">
      {/* Top Header Placeholder */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-primary-500">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          </div>
          <div className="space-y-1.5">
            <div className="h-6 w-48 sm:w-64 rounded-md bg-slate-200 dark:bg-slate-800" />
            <div className="h-3.5 w-32 sm:w-40 rounded bg-slate-200/70 dark:bg-slate-800/70" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="h-9 w-24 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-9 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>

      {/* Filter / Search Bar Placeholder */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="h-10 rounded-lg bg-slate-200/80 dark:bg-slate-800/80 col-span-1 sm:col-span-2" />
        <div className="h-10 rounded-lg bg-slate-200/80 dark:bg-slate-800/80" />
      </div>

      {/* Stats Cards Placeholder */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 space-y-2">
            <div className="h-3.5 w-20 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-7 w-24 rounded-md bg-slate-300 dark:bg-slate-700" />
          </div>
        ))}
      </div>

      {/* Main Table / Data Area Placeholder */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 p-4 space-y-3 min-h-[300px] flex flex-col justify-between">
        <div className="space-y-3">
          <div className="h-10 rounded-lg bg-slate-200/60 dark:bg-slate-800/60 w-full" />
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800/40 w-full flex items-center px-4 space-x-4">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
              <div className="h-4 w-1/4 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-1/4 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-1/6 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-1/6 rounded bg-slate-200 dark:bg-slate-700 ml-auto" />
            </div>
          ))}
        </div>

        {/* Loading notice text at bottom */}
        <div className="flex items-center justify-center space-x-2 py-3 text-xs text-slate-400 dark:text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          <span>{t('admin.loadingModule', 'Đang tải phân hệ quản trị...')}</span>
        </div>
      </div>
    </div>
  );
};
