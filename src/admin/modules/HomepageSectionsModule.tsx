import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Save,
  RotateCcw,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  HOMEPAGE_SECTIONS_REGISTRY,
  HomepageSectionConfig,
  mergeHomepageSectionsConfig,
  getDefaultHomepageSectionsState,
} from '../../config/homepageSections';
import { homepageSectionsService } from '../../services/homepageSectionsService';

interface HomepageSectionsModuleProps {
  onShowToast?: (...args: any[]) => void;
}

export const HomepageSectionsModule: React.FC<HomepageSectionsModuleProps> = ({ onShowToast }) => {
  const { language, t } = useLanguage();
  const isEn = language === 'en';

  const [sections, setSections] = useState<HomepageSectionConfig[]>(() =>
    homepageSectionsService.getSectionsSnapshot()
  );
  const [initialSnapshot, setInitialSnapshot] = useState<string>(() =>
    JSON.stringify(homepageSectionsService.getSectionsSnapshot())
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const triggerToast = useCallback(
    (type: 'success' | 'error' | 'info', title: string, message?: string) => {
      if (typeof onShowToast === 'function') {
        // Support both (type, msg) and (title, msg, type)
        try {
          if (onShowToast.length >= 3) {
            onShowToast(title, message, type);
          } else {
            onShowToast(type, message ? `${title}: ${message}` : title);
          }
        } catch {
          onShowToast(title, message, type);
        }
      }
    },
    [onShowToast]
  );

  const getAdminAuthToken = (): string => {
    if (typeof window === 'undefined') return '';
    return (
      localStorage.getItem('wcg_admin_token') ||
      localStorage.getItem('wcg_auth_token') ||
      sessionStorage.getItem('wcg_admin_token') ||
      sessionStorage.getItem('wcg_auth_token') ||
      ''
    );
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAdminAuthToken();
      const res = await fetch('/api/admin/homepage-sections', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.sections)) {
          const merged = mergeHomepageSectionsConfig(data.sections);
          setSections(merged);
          setInitialSnapshot(JSON.stringify(merged));
          homepageSectionsService.saveConfigLocally(merged);
          return;
        }
      }

      // Fallback
      const local = homepageSectionsService.getSectionsSnapshot();
      setSections(local);
      setInitialSnapshot(JSON.stringify(local));
    } catch {
      const local = homepageSectionsService.getSectionsSnapshot();
      setSections(local);
      setInitialSnapshot(JSON.stringify(local));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(sections) !== initialSnapshot;
  }, [sections, initialSnapshot]);

  const handleToggle = (id: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const updated = [...sections];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    const reordered = updated.map((item, idx) => ({
      ...item,
      order: idx + 1,
    }));

    setSections(reordered);
  };

  const handleResetDefaults = () => {
    const defaults = getDefaultHomepageSectionsState();
    setSections(defaults);
    triggerToast(
      'info',
      t('homepageSectionsModule.resetSuccess') || 'Đã khôi phục cài đặt mặc định.'
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getAdminAuthToken();
      const payload = {
        sections: sections.map((s, idx) => ({
          id: s.id,
          enabled: Boolean(s.enabled),
          order: idx + 1,
        })),
      };

      const res = await fetch('/api/admin/homepage-sections', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        const merged = mergeHomepageSectionsConfig(data.sections || payload.sections);
        setSections(merged);
        setInitialSnapshot(JSON.stringify(merged));
        homepageSectionsService.saveConfigLocally(merged);

        triggerToast(
          'success',
          t('homepageSectionsModule.saveSuccess') || 'Đã lưu cấu hình hiển thị trang chủ!'
        );
      } else {
        const errMsg =
          data?.error || t('homepageSectionsModule.saveError') || 'Lỗi lưu cấu hình hiển thị.';
        triggerToast('error', errMsg);
      }
    } catch (err: any) {
      triggerToast(
        'error',
        t('homepageSectionsModule.saveError') || 'Lỗi kết nối máy chủ khi lưu cấu hình.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleViewStorefront = () => {
    window.open('https://universal-mall-shop.pages.dev/', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Action Controls */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-lg">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                  {t('homepageSectionsModule.title') || 'Tùy Chỉnh Hiển Thị Trang Chủ'}
                </h2>
                {hasChanges ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    {t('homepageSectionsModule.unsavedChanges') || 'Có thay đổi chưa lưu'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('homepageSectionsModule.savedStatus') || 'Cấu hình đã đồng bộ'}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {t('homepageSectionsModule.subtitle') ||
                  'Quản trị bật/tắt và sắp xếp thứ tự hiển thị các khu vực trên trang chủ web khách theo thời gian thực.'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
          <button
            type="button"
            onClick={loadData}
            disabled={loading || saving}
            title={isEn ? 'Reload layout from server' : 'Tải lại cấu hình từ máy chủ'}
            className="p-2 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={loading || saving}
            className="px-3 py-1.5 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors text-xs font-medium flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-neutral-500" />
            <span>{t('homepageSectionsModule.resetDefaults') || 'Khôi Phục Mặc Định'}</span>
          </button>

          <button
            type="button"
            onClick={handleViewStorefront}
            className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 rounded-lg transition-colors text-xs font-medium flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5 text-primary-500" />
            <span>{t('homepageSectionsModule.viewStorefront') || 'Xem Trang Chủ'}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-all flex items-center gap-1.5 shadow-sm ${
              hasChanges
                ? 'bg-primary-600 hover:bg-primary-700 shadow-primary-500/20 animate-pulse'
                : 'bg-primary-600 hover:bg-primary-700'
            } disabled:opacity-60`}
          >
            {saving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>
              {saving
                ? t('homepageSectionsModule.saving') || 'Đang Lưu...'
                : t('homepageSectionsModule.saveChanges') || 'Lưu Cấu Hình'}
            </span>
          </button>
        </div>
      </div>

      {/* Info notice banner */}
      <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50 rounded-xl p-3 text-xs text-sky-800 dark:text-sky-300 flex items-center gap-2">
        <Info className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <span>
          {t('homepageSectionsModule.rule9Notice') ||
            'Hiển thị 100% trọn vẹn trong một màn hình — Các thay đổi sẽ phản ánh trên web khách trong vòng tối đa 30 giây.'}
        </span>
      </div>

      {/* Rule 9 Compliant Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm">
        <table className="table-fixed w-full border-collapse">
          <thead>
            <tr className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800 text-[11px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              {/* Total: 12% + 28% + 36% + 12% + 12% = 100% */}
              <th className="w-[12%] py-3 px-3 text-center">
                {t('homepageSectionsModule.colOrder') || 'Thứ Tự'}
              </th>
              <th className="w-[28%] py-3 px-3 text-left">
                {t('homepageSectionsModule.colName') || 'Khu Vực / Thành Phần'}
              </th>
              <th className="w-[36%] py-3 px-3 text-left">
                {t('homepageSectionsModule.colDescription') || 'Chức Năng & Vị Trí'}
              </th>
              <th className="w-[12%] py-3 px-3 text-center">
                {t('homepageSectionsModule.colStatus') || 'Trạng Thái'}
              </th>
              <th className="w-[12%] py-3 px-3 text-center">
                {t('homepageSectionsModule.colActions') || 'Bật / Tắt'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {sections.map((section, idx) => {
              const displayName = isEn ? section.nameEn : section.nameVi;
              const displayDesc = isEn ? section.descriptionEn : section.descriptionVi;
              const isFirst = idx === 0;
              const isLast = idx === sections.length - 1;

              return (
                <tr
                  key={section.id}
                  className={`transition-colors text-xs ${
                    section.enabled
                      ? 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                      : 'bg-neutral-50/60 dark:bg-neutral-900/40 opacity-70 hover:opacity-100'
                  }`}
                >
                  {/* Cột 1: Thứ tự & Nút Di chuyển (12%) */}
                  <td className="py-2.5 px-3 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 'up')}
                          disabled={isFirst}
                          title={t('homepageSectionsModule.moveUp') || 'Chuyển lên'}
                          className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 'down')}
                          disabled={isLast}
                          title={t('homepageSectionsModule.moveDown') || 'Chuyển xuống'}
                          className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Cột 2: Tên mục, icon, ID (28%) */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 ${
                          section.enabled
                            ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
                            : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div
                          className="font-semibold text-neutral-900 dark:text-white truncate"
                          title={displayName}
                        >
                          {displayName}
                        </div>
                        <div
                          className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 truncate"
                          title={section.id}
                        >
                          {section.id}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Cột 3: Mô tả chức năng (36%) */}
                  <td className="py-2.5 px-3">
                    <p
                      className="text-neutral-600 dark:text-neutral-300 text-xs truncate"
                      title={displayDesc}
                    >
                      {displayDesc}
                    </p>
                  </td>

                  {/* Cột 4: Trạng thái badge (12%) */}
                  <td className="py-2.5 px-3 text-center">
                    {section.enabled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Eye className="w-3 h-3" />
                        <span>{t('homepageSectionsModule.statusVisible') || 'Đang Hiện'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border border-neutral-500/20">
                        <EyeOff className="w-3 h-3" />
                        <span>{t('homepageSectionsModule.statusHidden') || 'Đang Ẩn'}</span>
                      </span>
                    )}
                  </td>

                  {/* Cột 5: Toggle Switch (12%) */}
                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(section.id)}
                      title={t('homepageSectionsModule.toggleVisibility') || 'Bật/Tắt hiển thị'}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        section.enabled ? 'bg-primary-600' : 'bg-neutral-300 dark:bg-neutral-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          section.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
