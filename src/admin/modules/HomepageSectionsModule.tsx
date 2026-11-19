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
  ChevronDown,
  ChevronRight,
  CornerDownRight,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  HOMEPAGE_SECTIONS_REGISTRY,
  HOMEPAGE_SUBSECTIONS_REGISTRY,
  HomepageSectionConfig,
  HomepageSubsectionConfig,
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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    top_announcement: false,
    categories_grid: false,
  });

  const toggleExpand = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const triggerToast = useCallback(
    (type: 'success' | 'error' | 'info', title: string, message?: string) => {
      if (typeof onShowToast === 'function') {
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

  const handleSubsectionToggle = (parentId: string, subId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== parentId || !sec.subsections) return sec;
        return {
          ...sec,
          subsections: sec.subsections.map((sub) =>
            sub.id === subId ? { ...sub, enabled: !sub.enabled } : sub
          ),
        };
      })
    );
  };

  const handleSubsectionMove = (parentId: string, subId: string, direction: 'up' | 'down') => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== parentId || !sec.subsections) return sec;
        const targetSub = sec.subsections.find((s) => s.id === subId);
        if (!targetSub) return sec;

        const group = targetSub.group;
        const groupSubs = sec.subsections.filter((s) => s.group === group);
        const subIndexInGroup = groupSubs.findIndex((s) => s.id === subId);
        const targetIndexInGroup = direction === 'up' ? subIndexInGroup - 1 : subIndexInGroup + 1;
        if (targetIndexInGroup < 0 || targetIndexInGroup >= groupSubs.length) return sec;

        const reorderedGroup = [...groupSubs];
        const temp = reorderedGroup[subIndexInGroup];
        reorderedGroup[subIndexInGroup] = reorderedGroup[targetIndexInGroup];
        reorderedGroup[targetIndexInGroup] = temp;
        reorderedGroup.forEach((item, idx) => {
          item.order = idx + 1;
        });

        // Reassemble all subsections preserving other groups
        const otherSubs = sec.subsections.filter((s) => s.group !== group);
        return {
          ...sec,
          subsections: [...otherSubs, ...reorderedGroup],
        };
      })
    );
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
          ...(s.subsections
            ? {
                subsections: s.subsections.map((sub, sIdx) => ({
                  id: sub.id,
                  parentId: sub.parentId,
                  group: sub.group,
                  enabled: Boolean(sub.enabled),
                  order: sub.order || sIdx + 1,
                })),
              }
            : {}),
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
    } catch {
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
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    {t('homepageSectionsModule.savedStatus') || 'Cấu hình đã đồng bộ'}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {t('homepageSectionsModule.subtitle') ||
                  'Quản trị bật/tắt và sắp xếp thứ tự hiển thị các khu vực trên trang chủ web khách Universal Mall theo thời gian thực.'}
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
            className="px-3 py-1.5 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-neutral-500" />
            <span>{t('homepageSectionsModule.resetDefaults') || 'Khôi Phục Mặc Định'}</span>
          </button>

          <button
            type="button"
            onClick={handleViewStorefront}
            className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 rounded-lg transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-primary-500" />
            <span>{t('homepageSectionsModule.viewStorefront') || 'Xem Trang Chủ'}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${
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
              const reg = HOMEPAGE_SECTIONS_REGISTRY.find((r) => r.id === section.id);
              const displayName =
                t(`homepageSectionsModule.sections.${section.id}.name`) ||
                (isEn ? (section.nameEn || reg?.nameEn) : (section.nameVi || reg?.nameVi)) ||
                section.id;
              const displayDesc =
                t(`homepageSectionsModule.sections.${section.id}.description`) ||
                (isEn ? (section.descriptionEn || reg?.descriptionEn) : (section.descriptionVi || reg?.descriptionVi)) ||
                '';
              const isFirst = idx === 0;
              const isLast = idx === sections.length - 1;
              const hasSubsections = Boolean(section.subsections && section.subsections.length > 0);
              const isExpanded = Boolean(expandedSections[section.id]);

              return (
                <React.Fragment key={section.id}>
                  <tr
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

                    {/* Cột 2: Tên mục, icon, ID & Nút mở rộng mục con (28%) */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                            section.enabled
                              ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
                              : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
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

                          {/* Nút mở rộng mục con */}
                          {hasSubsections && (
                            <button
                              type="button"
                              onClick={() => toggleExpand(section.id)}
                              className="mt-1 text-[11px] font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 inline-flex items-center gap-1 cursor-pointer transition-colors"
                              title={
                                isExpanded
                                  ? t('homepageSectionsModule.collapseSubsections') || 'Thu gọn mục con'
                                  : t('homepageSectionsModule.expandSubsections') || 'Mở rộng mục con'
                              }
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-primary-500" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-primary-500" />
                              )}
                              <span>
                                {t('homepageSectionsModule.subsectionsCount', {
                                  count: section.subsections!.length,
                                }) || `${section.subsections!.length} mục con`}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Cột 3: Mô tả chức năng & vị trí (36%) */}
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

                  {/* Accordion Row hiển thị danh sách mục con */}
                  {hasSubsections && isExpanded && (
                    <tr className="bg-neutral-50/80 dark:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800">
                      <td colSpan={5} className="py-3 px-4">
                        <div className="pl-3 sm:pl-5 border-l-2 border-primary-500/50 space-y-3">
                          {/* Cảnh báo khi mục lớn đang bị tắt */}
                          {!section.enabled && (
                            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {t('homepageSectionsModule.parentDisabledNotice') ||
                                  'Mục lớn đang tắt — các mục con sẽ bị ẩn đồng thời trên web khách.'}
                              </span>
                            </div>
                          )}

                          {/* Nhóm các mục con theo group */}
                          {(() => {
                            const groups = Array.from(
                              new Set(section.subsections!.map((s) => s.group))
                            );
                            return groups.map((grpKey) => {
                              const groupSubs = section.subsections!.filter(
                                (s) => s.group === grpKey
                              );
                              const grpName =
                                t(`homepageSectionsModule.groups.${grpKey}`) ||
                                groupSubs[0]?.groupNameVi ||
                                grpKey;

                              return (
                                <div
                                  key={grpKey}
                                  className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden shadow-2xs"
                                >
                                  <div className="bg-neutral-100 dark:bg-neutral-800/60 px-3 py-1.5 text-[11px] font-bold text-neutral-700 dark:text-neutral-300 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800">
                                    <span className="flex items-center gap-1.5">
                                      <CornerDownRight className="w-3.5 h-3.5 text-primary-500" />
                                      <span>{grpName}</span>
                                    </span>
                                    <span className="text-[10px] text-neutral-400 font-normal">
                                      {groupSubs.length} mục
                                    </span>
                                  </div>

                                  <table className="table-fixed w-full border-collapse">
                                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                      {groupSubs.map((sub, subIdx) => {
                                        const subReg = HOMEPAGE_SUBSECTIONS_REGISTRY.find(
                                          (r) => r.id === sub.id
                                        );
                                        const subName =
                                          t(`homepageSectionsModule.subsections.${sub.id}.name`) ||
                                          (isEn
                                            ? sub.nameEn || subReg?.nameEn
                                            : sub.nameVi || subReg?.nameVi) ||
                                          sub.id;
                                        const subDesc =
                                          t(
                                            `homepageSectionsModule.subsections.${sub.id}.description`
                                          ) ||
                                          (isEn
                                            ? sub.descriptionEn || subReg?.descriptionEn
                                            : sub.descriptionVi || subReg?.descriptionVi) ||
                                          '';
                                        const isSubFirst = subIdx === 0;
                                        const isSubLast = subIdx === groupSubs.length - 1;
                                        const isEffectivelyEnabled =
                                          section.enabled && sub.enabled;

                                        return (
                                          <tr
                                            key={sub.id}
                                            className={`text-xs transition-colors ${
                                              !section.enabled
                                                ? 'opacity-50'
                                                : sub.enabled
                                                ? 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                                                : 'bg-neutral-50/50 dark:bg-neutral-900/30 opacity-60'
                                            }`}
                                          >
                                            {/* Cột 1 (12%): Thứ tự & Nút di chuyển trong nhóm */}
                                            <td className="w-[12%] py-2 px-3 text-center">
                                              <div className="inline-flex items-center gap-1">
                                                <span className="w-5 h-5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-bold text-[11px] flex items-center justify-center">
                                                  {subIdx + 1}
                                                </span>
                                                <div className="flex flex-col gap-0.5">
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleSubsectionMove(
                                                        section.id,
                                                        sub.id,
                                                        'up'
                                                      )
                                                    }
                                                    disabled={isSubFirst}
                                                    title={
                                                      t('homepageSectionsModule.moveUp') ||
                                                      'Chuyển lên'
                                                    }
                                                    className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                  >
                                                    <ArrowUp className="w-2.5 h-2.5" />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleSubsectionMove(
                                                        section.id,
                                                        sub.id,
                                                        'down'
                                                      )
                                                    }
                                                    disabled={isSubLast}
                                                    title={
                                                      t('homepageSectionsModule.moveDown') ||
                                                      'Chuyển xuống'
                                                    }
                                                    className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                  >
                                                    <ArrowDown className="w-2.5 h-2.5" />
                                                  </button>
                                                </div>
                                              </div>
                                            </td>

                                            {/* Cột 2 (28%): Tên mục con & ID */}
                                            <td className="w-[28%] py-2 px-3">
                                              <div className="min-w-0">
                                                <div
                                                  className="font-medium text-neutral-900 dark:text-white truncate"
                                                  title={subName}
                                                >
                                                  {subName}
                                                </div>
                                                <div
                                                  className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 truncate"
                                                  title={sub.id}
                                                >
                                                  {sub.id}
                                                </div>
                                              </div>
                                            </td>

                                            {/* Cột 3 (36%): Mô tả chức năng & vị trí */}
                                            <td className="w-[36%] py-2 px-3">
                                              <p
                                                className="text-neutral-600 dark:text-neutral-400 text-xs truncate"
                                                title={subDesc}
                                              >
                                                {subDesc}
                                              </p>
                                            </td>

                                            {/* Cột 4 (12%): Trạng thái badge */}
                                            <td className="w-[12%] py-2 px-3 text-center">
                                              {isEffectivelyEnabled ? (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                  <Eye className="w-2.5 h-2.5" />
                                                  <span>
                                                    {t(
                                                      'homepageSectionsModule.statusVisible'
                                                    ) || 'Đang Hiện'}
                                                  </span>
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border border-neutral-500/20">
                                                  <EyeOff className="w-2.5 h-2.5" />
                                                  <span>
                                                    {t(
                                                      'homepageSectionsModule.statusHidden'
                                                    ) || 'Đang Ẩn'}
                                                  </span>
                                                </span>
                                              )}
                                            </td>

                                            {/* Cột 5 (12%): Toggle switch */}
                                            <td className="w-[12%] py-2 px-3 text-center">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleSubsectionToggle(
                                                    section.id,
                                                    sub.id
                                                  )
                                                }
                                                title={
                                                  t(
                                                    'homepageSectionsModule.toggleVisibility'
                                                  ) || 'Bật/Tắt hiển thị'
                                                }
                                                className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                  sub.enabled
                                                    ? 'bg-primary-600'
                                                    : 'bg-neutral-300 dark:bg-neutral-700'
                                                }`}
                                              >
                                                <span
                                                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    sub.enabled
                                                      ? 'translate-x-4'
                                                      : 'translate-x-0'
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
                              );
                            });
                          })()}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
