import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GripVertical,
  Pencil,
  Trash2,
  Plus,
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
  Link as LinkIcon,
  Globe,
  Monitor,
  X,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  HOMEPAGE_SECTIONS_REGISTRY,
  HOMEPAGE_SUBSECTIONS_REGISTRY,
  HomepageSectionConfig,
  HomepageSubsectionConfig,
  SYSTEM_PAGE_OPTIONS,
  validateLinkUrl,
  mergeHomepageSectionsConfig,
  getDefaultHomepageSectionsState,
} from '../../config/homepageSections';
import { homepageSectionsService } from '../../services/homepageSectionsService';

interface HomepageSectionsModuleProps {
  onShowToast?: (...args: any[]) => void;
}

interface EditFormState {
  isParent: boolean;
  parentId?: string;
  id: string;
  internal_name: string;
  title_vi: string;
  title_en: string;
  description_vi: string;
  description_en: string;
  badge_vi: string;
  badge_en: string;
  link_type: 'system' | 'internal' | 'external';
  link_url: string;
  link_target: '_self' | '_blank';
}

interface AddSubsectionFormState {
  parentId: string;
  group: string;
  groupNameVi: string;
  groupNameEn: string;
  internal_name: string;
  title_vi: string;
  title_en: string;
  description_vi: string;
  description_en: string;
  badge_vi: string;
  badge_en: string;
  link_type: 'system' | 'internal' | 'external';
  link_url: string;
  link_target: '_self' | '_blank';
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
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [previewLang, setPreviewLang] = useState<'vi' | 'en'>(language === 'en' ? 'en' : 'vi');

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    top_announcement: true,
    categories_grid: true,
  });

  // Modal Sửa
  const [editingItem, setEditingItem] = useState<EditFormState | null>(null);

  // Modal Thêm mục con
  const [isAddingSub, setIsAddingSub] = useState<boolean>(false);
  const [newSubForm, setNewSubForm] = useState<AddSubsectionFormState>({
    parentId: 'categories_grid',
    group: 'shortcuts',
    groupNameVi: 'Hàng Lối Tắt Dịch Vụ',
    groupNameEn: 'Quick Shortcuts',
    internal_name: '',
    title_vi: '',
    title_en: '',
    description_vi: '',
    description_en: '',
    badge_vi: '',
    badge_en: '',
    link_type: 'system',
    link_url: '',
    link_target: '_self',
  });

  // Modal Xác nhận xóa
  const [deletingSub, setDeletingSub] = useState<{ parentId: string; sub: HomepageSubsectionConfig } | null>(null);

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

      // Fallback local
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

  // Cảnh báo người dùng khi có thay đổi chưa lưu
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

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
          internal_name: s.internal_name,
          title_vi: s.title_vi,
          title_en: s.title_en,
          link_url: s.link_url,
          link_type: s.link_type,
          link_target: s.link_target,
          description_vi: s.description_vi,
          description_en: s.description_en,
          badge_vi: s.badge_vi,
          badge_en: s.badge_en,
          ...(s.subsections
            ? {
                subsections: s.subsections.map((sub, sIdx) => ({
                  id: sub.id,
                  parentId: sub.parentId,
                  group: sub.group,
                  enabled: Boolean(sub.enabled),
                  order: sub.order || sIdx + 1,
                  internal_name: sub.internal_name,
                  title_vi: sub.title_vi,
                  title_en: sub.title_en,
                  link_url: sub.link_url,
                  link_type: sub.link_type,
                  link_target: sub.link_target,
                  description_vi: sub.description_vi,
                  description_en: sub.description_en,
                  badge_vi: sub.badge_vi,
                  badge_en: sub.badge_en,
                  is_custom: sub.is_custom,
                  icon: sub.icon,
                  groupNameVi: sub.groupNameVi,
                  groupNameEn: sub.groupNameEn,
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

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setLastSavedTime(timeStr);

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

  // Mở modal sửa mục lớn hoặc mục con
  const handleOpenEdit = (isParent: boolean, item: HomepageSectionConfig | HomepageSubsectionConfig, parentId?: string) => {
    setEditingItem({
      isParent,
      parentId,
      id: item.id,
      internal_name: item.internal_name || '',
      title_vi: item.title_vi || '',
      title_en: item.title_en || '',
      description_vi: item.description_vi || '',
      description_en: item.description_en || '',
      badge_vi: item.badge_vi || '',
      badge_en: item.badge_en || '',
      link_type: (item.link_type as any) || (item.link_url?.startsWith('http') ? 'external' : item.link_url?.startsWith('/') || item.link_url?.startsWith('#') ? 'system' : 'internal'),
      link_url: item.link_url || '',
      link_target: item.link_target || (item.link_url?.startsWith('http') ? '_blank' : '_self'),
    });
  };

  // Lưu thông tin từ modal sửa
  const handleSaveEdit = () => {
    if (!editingItem) return;

    if (editingItem.isParent) {
      setSections((prev) =>
        prev.map((sec) => {
          if (sec.id !== editingItem.id) return sec;
          return {
            ...sec,
            internal_name: editingItem.internal_name.trim() || undefined,
            title_vi: editingItem.title_vi.trim() || undefined,
            title_en: editingItem.title_en.trim() || undefined,
            description_vi: editingItem.description_vi.trim() || undefined,
            description_en: editingItem.description_en.trim() || undefined,
            badge_vi: editingItem.badge_vi.trim() || undefined,
            badge_en: editingItem.badge_en.trim() || undefined,
            link_type: editingItem.link_type,
            link_url: editingItem.link_url.trim() || undefined,
            link_target: editingItem.link_target,
          };
        })
      );
    } else {
      const pId = editingItem.parentId;
      setSections((prev) =>
        prev.map((sec) => {
          if (sec.id !== pId || !sec.subsections) return sec;
          return {
            ...sec,
            subsections: sec.subsections.map((sub) => {
              if (sub.id !== editingItem.id) return sub;
              return {
                ...sub,
                internal_name: editingItem.internal_name.trim() || undefined,
                title_vi: editingItem.title_vi.trim() || undefined,
                title_en: editingItem.title_en.trim() || undefined,
                description_vi: editingItem.description_vi.trim() || undefined,
                description_en: editingItem.description_en.trim() || undefined,
                badge_vi: editingItem.badge_vi.trim() || undefined,
                badge_en: editingItem.badge_en.trim() || undefined,
                link_type: editingItem.link_type,
                link_url: editingItem.link_url.trim() || undefined,
                link_target: editingItem.link_target,
              };
            }),
          };
        })
      );
    }

    setEditingItem(null);
    triggerToast('info', isEn ? 'Item details updated in local state.' : 'Đã cập nhật thông tin mục vào bảng.');
  };

  // Mở modal thêm mục con
  const handleOpenAddSubsection = (defaultParentId?: string) => {
    const parentId = defaultParentId || 'categories_grid';
    let group = 'shortcuts';
    if (parentId === 'top_announcement') group = 'navigation';
    else if (parentId === 'categories_grid') group = 'shortcuts';
    else group = 'custom';

    setNewSubForm({
      parentId,
      group,
      groupNameVi: group === 'navigation' ? 'Thanh Điều Hướng' : group === 'shortcuts' ? 'Hàng Lối Tắt Dịch Vụ' : 'Mục Tự Thêm',
      groupNameEn: group === 'navigation' ? 'Navigation Bar' : group === 'shortcuts' ? 'Quick Shortcuts' : 'Custom Group',
      internal_name: '',
      title_vi: '',
      title_en: '',
      description_vi: '',
      description_en: '',
      badge_vi: '',
      badge_en: '',
      link_type: 'system',
      link_url: '',
      link_target: '_self',
    });
    setIsAddingSub(true);
  };

  // Tạo mục con mới
  const handleCreateSubsection = () => {
    const title = newSubForm.title_vi.trim() || newSubForm.internal_name.trim();
    if (!title) {
      triggerToast('error', isEn ? 'Please enter a title or internal name.' : 'Vui lòng nhập tiêu đề hoặc tên nội bộ.');
      return;
    }

    const customId = `custom_sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newSub: HomepageSubsectionConfig = {
      id: customId,
      parentId: newSubForm.parentId,
      group: newSubForm.group || 'shortcuts',
      groupNameVi: newSubForm.groupNameVi || 'Mục Tự Thêm',
      groupNameEn: newSubForm.groupNameEn || 'Custom Items',
      nameVi: newSubForm.title_vi.trim() || newSubForm.internal_name.trim(),
      nameEn: newSubForm.title_en.trim() || newSubForm.internal_name.trim() || 'New Item',
      descriptionVi: newSubForm.description_vi.trim(),
      descriptionEn: newSubForm.description_en.trim(),
      enabled: true,
      order: 99,
      icon: 'Sparkles',
      internal_name: newSubForm.internal_name.trim() || undefined,
      title_vi: newSubForm.title_vi.trim() || undefined,
      title_en: newSubForm.title_en.trim() || undefined,
      link_url: newSubForm.link_url.trim() || undefined,
      link_type: newSubForm.link_type,
      link_target: newSubForm.link_target,
      description_vi: newSubForm.description_vi.trim() || undefined,
      description_en: newSubForm.description_en.trim() || undefined,
      badge_vi: newSubForm.badge_vi.trim() || undefined,
      badge_en: newSubForm.badge_en.trim() || undefined,
      is_custom: true,
    };

    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== newSubForm.parentId) return sec;
        const currentSubs = sec.subsections ? [...sec.subsections] : [];
        newSub.order = currentSubs.length + 1;
        return {
          ...sec,
          subsections: [...currentSubs, newSub],
        };
      })
    );

    // Tự động mở rộng mục cha
    setExpandedSections((prev) => ({ ...prev, [newSubForm.parentId]: true }));
    setIsAddingSub(false);
    triggerToast('success', isEn ? 'New subsection added!' : 'Đã thêm mục con mới vào nhóm!');
  };

  // Xác nhận xóa mục con
  const handleConfirmDelete = () => {
    if (!deletingSub) return;
    const { parentId, sub } = deletingSub;

    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== parentId || !sec.subsections) return sec;
        const filtered = sec.subsections.filter((s) => s.id !== sub.id);
        filtered.forEach((s, idx) => {
          s.order = idx + 1;
        });
        return {
          ...sec,
          subsections: filtered,
        };
      })
    );

    setDeletingSub(null);
    triggerToast('info', isEn ? 'Subsection deleted.' : 'Đã xóa mục con khỏi cấu hình.');
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
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                  {t('homepageSectionsModule.title') || 'Tùy Chỉnh Hiển Thị Trang Chủ'}
                </h2>
                {hasChanges ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    {t('homepageSectionsModule.unsavedChangesNotice') || 'Có thay đổi chưa lưu (Nhấn "Lưu Cấu Hình" để áp dụng)'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    {lastSavedTime
                      ? t('homepageSectionsModule.savedStatusWithTime', { time: lastSavedTime }) || `Đã lưu lúc ${lastSavedTime}`
                      : t('homepageSectionsModule.savedStatus') || 'Cấu hình đã đồng bộ'}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {t('homepageSectionsModule.subtitle') ||
                  'Quản trị bật/tắt, sắp xếp thứ tự, đổi tên, gắn link và thêm mục con hiển thị trên trang chủ web khách theo thời gian thực.'}
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
            className="p-2 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors text-xs flex items-center gap-1.5 cursor-pointer"
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
            onClick={() => handleOpenAddSubsection()}
            className="px-3 py-1.5 bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 border border-primary-200 dark:border-primary-800 rounded-lg transition-colors text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('homepageSectionsModule.addSubsection') || 'Thêm Mục Con'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPreview((prev) => !prev)}
            className={`px-3 py-1.5 border rounded-lg transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
              showPreview
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 border-neutral-300 dark:border-neutral-700'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>{showPreview ? (t('homepageSectionsModule.hidePreview') || 'Đóng Xem Trước') : (t('homepageSectionsModule.togglePreview') || 'Khung Xem Trước')}</span>
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
                ? 'bg-primary-600 hover:bg-primary-700 shadow-primary-500/20 ring-2 ring-primary-500/30'
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
            'Các thay đổi sẽ phản ánh trên web khách trong vòng tối đa 2 phút.'}
        </span>
      </div>

      {/* Main Grid View (Table + Mini Preview) */}
      <div className={`grid grid-cols-1 ${showPreview ? 'lg:grid-cols-12' : ''} gap-4 items-start`}>
        {/* Table Container */}
        <div className={`${showPreview ? 'lg:col-span-8' : 'w-full'} bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm`}>
          <div className="max-h-[calc(100vh-270px)] overflow-y-auto">
            <table className="table-fixed w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 shadow-2xs">
                <tr className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                  {/* Total: 14% + 28% + 26% + 12% + 20% = 100% */}
                  <th className="w-[14%] py-3 px-3 text-center">
                    {t('homepageSectionsModule.colOrder') || 'Thứ Tự'}
                  </th>
                  <th className="w-[28%] py-3 px-3 text-left">
                    {t('homepageSectionsModule.colName') || 'Khu Vực / Thành Phần'}
                  </th>
                  <th className="w-[26%] py-3 px-3 text-left">
                    {isEn ? 'Link / Target' : 'Liên Kết Đích'}
                  </th>
                  <th className="w-[12%] py-3 px-3 text-center">
                    {t('homepageSectionsModule.colStatus') || 'Trạng Thái'}
                  </th>
                  <th className="w-[20%] py-3 px-3 text-center">
                    {t('homepageSectionsModule.colActions') || 'Thao Tác'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {sections.map((section, idx) => {
                  const reg = HOMEPAGE_SECTIONS_REGISTRY.find((r) => r.id === section.id);
                  const customTitle = isEn ? section.title_en : section.title_vi;
                  const displayName =
                    customTitle ||
                    section.internal_name ||
                    t(`homepageSectionsModule.sections.${section.id}.name`) ||
                    (isEn ? (section.nameEn || reg?.nameEn) : (section.nameVi || reg?.nameVi)) ||
                    section.id;
                  const displayDesc =
                    (isEn ? section.description_en : section.description_vi) ||
                    t(`homepageSectionsModule.sections.${section.id}.description`) ||
                    (isEn ? (section.descriptionEn || reg?.descriptionEn) : (section.descriptionVi || reg?.descriptionVi)) ||
                    '';
                  const badge = isEn ? section.badge_en : section.badge_vi;
                  const isFirst = idx === 0;
                  const isLast = idx === sections.length - 1;
                  const hasSubsections = Boolean(section.subsections && section.subsections.length > 0);
                  const isExpanded = Boolean(expandedSections[section.id]);
                  const linkValidation = validateLinkUrl(section.link_url, section.link_type);

                  return (
                    <React.Fragment key={section.id}>
                      <tr
                        className={`transition-colors text-xs ${
                          section.enabled
                            ? 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                            : 'bg-neutral-50/60 dark:bg-neutral-900/40 opacity-70 hover:opacity-100'
                        }`}
                      >
                        {/* Cột 1: Thứ tự & Tay kéo (14%) */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <span
                              title={t('homepageSectionsModule.dragTooltip') || 'Kéo thả hoặc dùng mũi tên để đổi thứ tự'}
                              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-grab active:cursor-grabbing p-0.5"
                            >
                              <GripVertical className="w-4 h-4" />
                            </span>
                            <span className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold text-xs flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => handleMove(idx, 'up')}
                                disabled={isFirst}
                                title={t('homepageSectionsModule.moveUp') || 'Chuyển lên'}
                                className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMove(idx, 'down')}
                                disabled={isLast}
                                title={t('homepageSectionsModule.moveDown') || 'Chuyển xuống'}
                                className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* Cột 2: Tên mục, icon, ID & Nút mở rộng mục con (28%) */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-start gap-2 min-w-0">
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
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="font-semibold text-neutral-900 dark:text-white truncate max-w-[180px]"
                                  title={displayName}
                                >
                                  {displayName}
                                </span>
                                {badge && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                    {badge}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 truncate" title={section.id}>
                                {section.id}
                              </div>
                              {section.internal_name && (
                                <div className="text-[10px] text-primary-600 dark:text-primary-400 truncate italic">
                                  [{section.internal_name}]
                                </div>
                              )}

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

                        {/* Cột 3: Link rút gọn (26%) */}
                        <td className="py-2.5 px-3">
                          {section.link_url ? (
                            <div className="flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-300 min-w-0">
                              <LinkIcon className="w-3.5 h-3.5 shrink-0 text-primary-500" />
                              <span className="font-mono text-[11px] truncate max-w-[140px]" title={section.link_url}>
                                {section.link_url}
                              </span>
                              {section.link_target === '_blank' && (
                                <span className="text-[10px] text-neutral-400 shrink-0 font-mono">↗</span>
                              )}
                              {!linkValidation.valid && (
                                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" title={linkValidation.warning} />
                              )}
                            </div>
                          ) : (
                            <span className="text-neutral-400 dark:text-neutral-500 italic text-[11px]">
                              {t('homepageSectionsModule.noLink') || 'Chưa gắn link'}
                            </span>
                          )}
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

                        {/* Cột 5: Bút chì Sửa + Toggle Switch (20%) */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(true, section)}
                              title={t('homepageSectionsModule.editItem') || 'Chỉnh sửa mục'}
                              className="p-1.5 rounded-lg text-neutral-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

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
                          </div>
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
                                      {/* Header nhóm con rõ ràng theo Nhóm 4 */}
                                      <div className="bg-neutral-100 dark:bg-neutral-800/80 px-3 py-1.5 text-[11px] font-bold text-neutral-700 dark:text-neutral-300 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800">
                                        <span className="flex items-center gap-1.5">
                                          <CornerDownRight className="w-3.5 h-3.5 text-primary-500" />
                                          <span>
                                            {t('homepageSectionsModule.parentGroupHeader', {
                                              parent: displayName,
                                              group: grpName,
                                            }) || `Thuộc mục: ${displayName} ➔ Phân nhóm: ${grpName}`}
                                          </span>
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenAddSubsection(section.id)}
                                            className="text-[10px] text-primary-600 hover:text-primary-700 dark:text-primary-400 font-bold inline-flex items-center gap-0.5 cursor-pointer"
                                          >
                                            <Plus className="w-3 h-3" />
                                            <span>{t('homepageSectionsModule.addSubsection') || 'Thêm mục con'}</span>
                                          </button>
                                          <span className="text-[10px] text-neutral-400 font-normal">
                                            ({groupSubs.length} mục)
                                          </span>
                                        </div>
                                      </div>

                                      <table className="table-fixed w-full border-collapse">
                                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                          {groupSubs.map((sub, subIdx) => {
                                            const subReg = HOMEPAGE_SUBSECTIONS_REGISTRY.find(
                                              (r) => r.id === sub.id
                                            );
                                            const customSubTitle = isEn ? sub.title_en : sub.title_vi;
                                            const subName =
                                              customSubTitle ||
                                              sub.internal_name ||
                                              t(`homepageSectionsModule.subsections.${sub.id}.name`) ||
                                              (isEn
                                                ? sub.nameEn || subReg?.nameEn
                                                : sub.nameVi || subReg?.nameVi) ||
                                              sub.id;
                                            const subBadge = isEn ? sub.badge_en : sub.badge_vi;
                                            const isSubFirst = subIdx === 0;
                                            const isSubLast = subIdx === groupSubs.length - 1;
                                            const isEffectivelyEnabled =
                                              section.enabled && sub.enabled;
                                            const subLinkValidation = validateLinkUrl(sub.link_url, sub.link_type);

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
                                                {/* Cột 1 (14%): Thứ tự phân cấp 1.1, 1.2... */}
                                                <td className="w-[14%] py-2 px-3 text-center">
                                                  <div className="inline-flex items-center gap-1">
                                                    <span
                                                      title={t('homepageSectionsModule.dragTooltip') || 'Kéo thả hoặc dùng mũi tên để đổi thứ tự'}
                                                      className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-grab p-0.5"
                                                    >
                                                      <GripVertical className="w-3.5 h-3.5" />
                                                    </span>
                                                    <span className="w-5 h-5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-bold text-[10px] flex items-center justify-center">
                                                      {idx + 1}.{subIdx + 1}
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
                                                        title={t('homepageSectionsModule.moveUp') || 'Chuyển lên'}
                                                        className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
                                                        title={t('homepageSectionsModule.moveDown') || 'Chuyển xuống'}
                                                        className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                                      >
                                                        <ArrowDown className="w-2.5 h-2.5" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                </td>

                                                {/* Cột 2 (28%): Tên mục con, ID & Badge */}
                                                <td className="w-[28%] py-2 px-3">
                                                  <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span
                                                        className="font-medium text-neutral-900 dark:text-white truncate max-w-[160px]"
                                                        title={subName}
                                                      >
                                                        {subName}
                                                      </span>
                                                      {sub.is_custom && (
                                                        <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                                          {t('homepageSectionsModule.customBadge') || 'Tự thêm'}
                                                        </span>
                                                      )}
                                                      {subBadge && (
                                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                          {subBadge}
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 truncate" title={sub.id}>
                                                      {sub.id}
                                                    </div>
                                                    {sub.internal_name && (
                                                      <div className="text-[10px] text-primary-600 dark:text-primary-400 truncate italic">
                                                        [{sub.internal_name}]
                                                      </div>
                                                    )}
                                                  </div>
                                                </td>

                                                {/* Cột 3 (26%): Link rút gọn */}
                                                <td className="w-[26%] py-2 px-3">
                                                  {sub.link_url ? (
                                                    <div className="flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-300 min-w-0">
                                                      <LinkIcon className="w-3 h-3 shrink-0 text-primary-500" />
                                                      <span className="font-mono text-[10px] truncate max-w-[130px]" title={sub.link_url}>
                                                        {sub.link_url}
                                                      </span>
                                                      {sub.link_target === '_blank' && (
                                                        <span className="text-[9px] text-neutral-400 shrink-0 font-mono">↗</span>
                                                      )}
                                                      {!subLinkValidation.valid && (
                                                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" title={subLinkValidation.warning} />
                                                      )}
                                                    </div>
                                                  ) : (
                                                    <span className="text-neutral-400 dark:text-neutral-500 italic text-[10px]">
                                                      {t('homepageSectionsModule.noLink') || 'Chưa gắn link'}
                                                    </span>
                                                  )}
                                                </td>

                                                {/* Cột 4 (12%): Trạng thái badge */}
                                                <td className="w-[12%] py-2 px-3 text-center">
                                                  {isEffectivelyEnabled ? (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                      <Eye className="w-2.5 h-2.5" />
                                                      <span>{t('homepageSectionsModule.statusVisible') || 'Đang Hiện'}</span>
                                                    </span>
                                                  ) : (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border border-neutral-500/20">
                                                      <EyeOff className="w-2.5 h-2.5" />
                                                      <span>{t('homepageSectionsModule.statusHidden') || 'Đang Ẩn'}</span>
                                                    </span>
                                                  )}
                                                </td>

                                                {/* Cột 5 (20%): Thao tác Sửa, Xóa, Toggle */}
                                                <td className="w-[20%] py-2 px-3 text-center">
                                                  <div className="inline-flex items-center justify-center gap-1.5">
                                                    <button
                                                      type="button"
                                                      onClick={() => handleOpenEdit(false, sub, section.id)}
                                                      title={t('homepageSectionsModule.editItem') || 'Chỉnh sửa mục con'}
                                                      className="p-1 rounded text-neutral-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                                                    >
                                                      <Pencil className="w-3 h-3" />
                                                    </button>

                                                    {/* Nút xóa (cho phép xóa mục con) */}
                                                    <button
                                                      type="button"
                                                      onClick={() => setDeletingSub({ parentId: section.id, sub })}
                                                      title={t('homepageSectionsModule.deleteSubsection') || 'Xóa mục con'}
                                                      className="p-1 rounded text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                                                    >
                                                      <Trash2 className="w-3 h-3" />
                                                    </button>

                                                    <button
                                                      type="button"
                                                      onClick={() => handleSubsectionToggle(section.id, sub.id)}
                                                      title={t('homepageSectionsModule.toggleVisibility') || 'Bật/Tắt hiển thị'}
                                                      className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                        sub.enabled ? 'bg-primary-600' : 'bg-neutral-300 dark:bg-neutral-700'
                                                      }`}
                                                    >
                                                      <span
                                                        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                          sub.enabled ? 'translate-x-4' : 'translate-x-0'
                                                        }`}
                                                      />
                                                    </button>
                                                  </div>
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

        {/* Mini Storefront Preview (Nhóm 5) */}
        {showPreview && (
          <div className="lg:col-span-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm flex flex-col max-h-[calc(100vh-270px)] sticky top-4">
            {/* Header Preview */}
            <div className="p-3 bg-neutral-100 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-primary-500" />
                  <span className="text-xs font-bold text-neutral-900 dark:text-white">
                    {t('homepageSectionsModule.previewTitle') || 'Xem Trước Trang Chủ Thu Nhỏ'}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {t('homepageSectionsModule.previewSubtitle') || 'Mô phỏng thời gian thực theo cấu hình đang chỉnh'}
                </div>
              </div>

              {/* Ngôn ngữ preview */}
              <div className="flex items-center gap-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewLang('vi')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition ${
                    previewLang === 'vi' ? 'bg-primary-600 text-white' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  VI
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewLang('en')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition ${
                    previewLang === 'en' ? 'bg-primary-600 text-white' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            {/* Thân Preview Container */}
            <div className="p-3 overflow-y-auto space-y-2.5 bg-neutral-50 dark:bg-neutral-950 flex-1 text-xs">
              <div className="text-[10px] text-neutral-400 italic">
                {t('homepageSectionsModule.previewClickNotice') || 'Bấm thử vào mục có link để kiểm tra đích đến:'}
              </div>

              {sections.map((sec, sIdx) => {
                const isSecEn = previewLang === 'en';
                const sTitle = (isSecEn ? sec.title_en : sec.title_vi) || sec.internal_name || (isSecEn ? sec.nameEn : sec.nameVi) || sec.id;
                const sBadge = isSecEn ? sec.badge_en : sec.badge_vi;
                const isEnabled = sec.enabled;

                if (!isEnabled) {
                  return (
                    <div
                      key={sec.id}
                      className="p-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-800 bg-neutral-200/40 dark:bg-neutral-900/40 opacity-50 flex items-center justify-between text-[11px]"
                    >
                      <span className="line-through text-neutral-400">{sIdx + 1}. {sTitle}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-300 dark:bg-neutral-800 text-neutral-500">ẨN</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={sec.id}
                    className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-1.5"
                  >
                    {/* Header mục */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-neutral-900 dark:text-white text-[11px]">
                        <span>{sIdx + 1}.</span>
                        <span>{sTitle}</span>
                        {sBadge && (
                          <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                            {sBadge}
                          </span>
                        )}
                      </div>
                      {sec.link_url && (
                        <a
                          href={sec.link_url}
                          target={sec.link_target || '_self'}
                          rel="noreferrer"
                          onClick={(e) => {
                            if (sec.link_type !== 'external') {
                              e.preventDefault();
                              triggerToast('info', `Link thử nghiệm: ${sec.link_url}`);
                            }
                          }}
                          className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
                        >
                          <LinkIcon className="w-2.5 h-2.5" />
                          <span>Link ↗</span>
                        </a>
                      )}
                    </div>

                    {/* Danh sách mục con trong preview */}
                    {sec.subsections && sec.subsections.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                        {sec.subsections.map((sub) => {
                          const subTitle = (isSecEn ? sub.title_en : sub.title_vi) || sub.internal_name || (isSecEn ? sub.nameEn : sub.nameVi) || sub.id;
                          const subBadge = isSecEn ? sub.badge_en : sub.badge_vi;
                          if (!sub.enabled) return null;

                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => {
                                if (sub.link_url) {
                                  if (sub.link_target === '_blank') {
                                    window.open(sub.link_url, '_blank', 'noopener,noreferrer');
                                  } else {
                                    triggerToast('info', `Điều hướng đến: ${sub.link_url}`);
                                  }
                                } else {
                                  triggerToast('info', `Mục "${subTitle}" chưa gắn link`);
                                }
                              }}
                              className={`px-2 py-1 rounded text-[10px] font-medium border transition flex items-center gap-1 cursor-pointer ${
                                sub.link_url
                                  ? 'bg-neutral-100 dark:bg-neutral-800 hover:bg-primary-50 dark:hover:bg-primary-950/40 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700'
                                  : 'bg-neutral-50 dark:bg-neutral-900 text-neutral-400 border-neutral-200 dark:border-neutral-800 cursor-default'
                              }`}
                            >
                              <span>{subTitle}</span>
                              {subBadge && (
                                <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-600 font-bold">
                                  {subBadge}
                                </span>
                              )}
                              {sub.link_url && <span className="text-[9px] text-primary-500">↗</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal Chỉnh Sửa Thông Tin Mục (Nhóm 2) */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header Modal */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-400">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    {t('homepageSectionsModule.editModalTitle') || 'Chỉnh Sửa Thông Tin Hiển Thị & Link'}
                  </h3>
                  <p className="text-[10px] font-mono text-neutral-400">{editingItem.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body Form */}
            <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
              {/* Tên nội bộ */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  {t('homepageSectionsModule.internalName') || 'Tên nội bộ (Chỉ Admin thấy)'}
                </label>
                <input
                  type="text"
                  value={editingItem.internal_name}
                  onChange={(e) => setEditingItem({ ...editingItem, internal_name: e.target.value })}
                  placeholder="Ví dụ: Banner Chiến Dịch Tết, Lối Tắt Nạp Tiền..."
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              {/* Tiêu đề VI / EN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('homepageSectionsModule.titleVi') || 'Tiêu đề Tiếng Việt (Khách thấy)'}
                  </label>
                  <input
                    type="text"
                    value={editingItem.title_vi}
                    onChange={(e) => setEditingItem({ ...editingItem, title_vi: e.target.value })}
                    placeholder="Tiêu đề hiển thị tiếng Việt"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('homepageSectionsModule.titleEn') || 'Tiêu đề Tiếng Anh (Khách thấy)'}
                  </label>
                  <input
                    type="text"
                    value={editingItem.title_en}
                    onChange={(e) => setEditingItem({ ...editingItem, title_en: e.target.value })}
                    placeholder="English Display Title"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              {/* Mô tả VI / EN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('homepageSectionsModule.descriptionVi') || 'Mô tả ngắn Tiếng Việt'}
                  </label>
                  <textarea
                    rows={2}
                    value={editingItem.description_vi}
                    onChange={(e) => setEditingItem({ ...editingItem, description_vi: e.target.value })}
                    placeholder="Mô tả 1 câu về mục này..."
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('homepageSectionsModule.descriptionEn') || 'Mô tả ngắn Tiếng Anh'}
                  </label>
                  <textarea
                    rows={2}
                    value={editingItem.description_en}
                    onChange={(e) => setEditingItem({ ...editingItem, description_en: e.target.value })}
                    placeholder="Short description in English..."
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                  />
                </div>
              </div>

              {/* Huy hiệu Badge VI / EN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('homepageSectionsModule.badgeVi') || 'Huy hiệu Tiếng Việt (vd: Mới, Hot, -50%)'}
                  </label>
                  <input
                    type="text"
                    value={editingItem.badge_vi}
                    onChange={(e) => setEditingItem({ ...editingItem, badge_vi: e.target.value })}
                    placeholder="HOT, MỚI, -30%..."
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('homepageSectionsModule.badgeEn') || 'Huy hiệu Tiếng Anh (vd: New, Hot, -50%)'}
                  </label>
                  <input
                    type="text"
                    value={editingItem.badge_en}
                    onChange={(e) => setEditingItem({ ...editingItem, badge_en: e.target.value })}
                    placeholder="HOT, NEW, 50% OFF..."
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              {/* Cấu hình Liên Kết (Link) */}
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5 text-xs">
                  <LinkIcon className="w-3.5 h-3.5 text-primary-500" />
                  <span>{t('homepageSectionsModule.linkType') || 'Cấu hình liên kết điều hướng'}</span>
                </div>

                {/* Chọn loại link */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, link_type: 'system' })}
                    className={`p-2 rounded-lg border text-center transition font-semibold text-[11px] cursor-pointer ${
                      editingItem.link_type === 'system'
                        ? 'bg-primary-50 dark:bg-primary-950/40 border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    Trang Hệ Thống
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, link_type: 'internal' })}
                    className={`p-2 rounded-lg border text-center transition font-semibold text-[11px] cursor-pointer ${
                      editingItem.link_type === 'internal'
                        ? 'bg-primary-50 dark:bg-primary-950/40 border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    Đường Dẫn Nội Bộ
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, link_type: 'external', link_target: '_blank' })}
                    className={`p-2 rounded-lg border text-center transition font-semibold text-[11px] cursor-pointer ${
                      editingItem.link_type === 'external'
                        ? 'bg-primary-50 dark:bg-primary-950/40 border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    Liên Kết Ngoài
                  </button>
                </div>

                {/* Trường nhập link tương ứng */}
                {editingItem.link_type === 'system' ? (
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      {t('homepageSectionsModule.selectSystemPage') || 'Chọn trang hệ thống có sẵn:'}
                    </label>
                    <select
                      value={editingItem.link_url}
                      onChange={(e) => setEditingItem({ ...editingItem, link_url: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs focus:outline-none"
                    >
                      <option value="">-- {t('homepageSectionsModule.noLink') || 'Chưa gắn link'} --</option>
                      {SYSTEM_PAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {isEn ? opt.labelEn : opt.labelVi} ({opt.value})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      {editingItem.link_type === 'external' ? 'URL liên kết ngoài (https://...):' : 'Đường dẫn nội bộ (/...):'}
                    </label>
                    <input
                      type="text"
                      value={editingItem.link_url}
                      onChange={(e) => setEditingItem({ ...editingItem, link_url: e.target.value })}
                      placeholder={editingItem.link_type === 'external' ? 'https://zalo.me/...' : '/danh-muc/thoi-trang'}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono text-xs focus:outline-none"
                    />
                  </div>
                )}

                {/* Cách mở liên kết Target */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-neutral-600 dark:text-neutral-400 font-medium">
                    {t('homepageSectionsModule.linkTarget') || 'Mở liên kết trong:'}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="edit_target"
                        checked={editingItem.link_target === '_self'}
                        onChange={() => setEditingItem({ ...editingItem, link_target: '_self' })}
                        className="text-primary-600"
                      />
                      <span>Cùng tab (_self)</span>
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="edit_target"
                        checked={editingItem.link_target === '_blank'}
                        onChange={() => setEditingItem({ ...editingItem, link_target: '_blank' })}
                        className="text-primary-600"
                      />
                      <span>Tab mới (_blank)</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-medium transition cursor-pointer"
              >
                {t('homepageSectionsModule.cancel') || 'Hủy bỏ'}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-bold transition shadow-sm cursor-pointer"
              >
                {t('homepageSectionsModule.saveItem') || 'Cập nhật mục'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm Mục Con Mới (Nhóm 2) */}
      {isAddingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header Modal */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    {t('homepageSectionsModule.addSubsectionModalTitle') || 'Thêm Mục Con Mới'}
                  </h3>
                  <p className="text-[10px] text-neutral-500">Tạo mục con tùy chỉnh xuất hiện trên giao diện trang chủ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingSub(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body Form */}
            <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
              {/* Chọn mục cha */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  {t('homepageSectionsModule.parentSection') || 'Mục cha'}
                </label>
                <select
                  value={newSubForm.parentId}
                  onChange={(e) => {
                    const p = e.target.value;
                    let grp = 'shortcuts';
                    if (p === 'top_announcement') grp = 'navigation';
                    else if (p === 'categories_grid') grp = 'shortcuts';
                    setNewSubForm({ ...newSubForm, parentId: p, group: grp });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs focus:outline-none"
                >
                  {sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {isEn ? sec.nameEn : sec.nameVi} ({sec.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tên nội bộ */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  {t('homepageSectionsModule.internalName') || 'Tên nội bộ (Chỉ Admin thấy)'}
                </label>
                <input
                  type="text"
                  value={newSubForm.internal_name}
                  onChange={(e) => setNewSubForm({ ...newSubForm, internal_name: e.target.value })}
                  placeholder="Ví dụ: Lối tắt hỗ trợ Zalo, Nút nạp ví nhanh..."
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>

              {/* Tiêu đề VI / EN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('homepageSectionsModule.titleVi') || 'Tiêu đề Tiếng Việt (Khách thấy)'} *
                  </label>
                  <input
                    type="text"
                    value={newSubForm.title_vi}
                    onChange={(e) => setNewSubForm({ ...newSubForm, title_vi: e.target.value })}
                    placeholder="Tên hiển thị khách thấy"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('homepageSectionsModule.titleEn') || 'Tiêu đề Tiếng Anh (Khách thấy)'}
                  </label>
                  <input
                    type="text"
                    value={newSubForm.title_en}
                    onChange={(e) => setNewSubForm({ ...newSubForm, title_en: e.target.value })}
                    placeholder="English Display Title"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Huy hiệu Badge VI / EN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('homepageSectionsModule.badgeVi') || 'Huy hiệu Tiếng Việt'}
                  </label>
                  <input
                    type="text"
                    value={newSubForm.badge_vi}
                    onChange={(e) => setNewSubForm({ ...newSubForm, badge_vi: e.target.value })}
                    placeholder="HOT, MỚI..."
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {t('homepageSectionsModule.badgeEn') || 'Huy hiệu Tiếng Anh'}
                  </label>
                  <input
                    type="text"
                    value={newSubForm.badge_en}
                    onChange={(e) => setNewSubForm({ ...newSubForm, badge_en: e.target.value })}
                    placeholder="HOT, NEW..."
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Cấu hình Liên Kết (Link) */}
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5 text-xs">
                  <LinkIcon className="w-3.5 h-3.5 text-primary-500" />
                  <span>{t('homepageSectionsModule.linkType') || 'Cấu hình liên kết điều hướng'}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewSubForm({ ...newSubForm, link_type: 'system' })}
                    className={`p-2 rounded-lg border text-center transition font-semibold text-[11px] cursor-pointer ${
                      newSubForm.link_type === 'system'
                        ? 'bg-primary-50 dark:bg-primary-950/40 border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    Trang Hệ Thống
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSubForm({ ...newSubForm, link_type: 'internal' })}
                    className={`p-2 rounded-lg border text-center transition font-semibold text-[11px] cursor-pointer ${
                      newSubForm.link_type === 'internal'
                        ? 'bg-primary-50 dark:bg-primary-950/40 border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    Đường Dẫn Nội Bộ
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSubForm({ ...newSubForm, link_type: 'external', link_target: '_blank' })}
                    className={`p-2 rounded-lg border text-center transition font-semibold text-[11px] cursor-pointer ${
                      newSubForm.link_type === 'external'
                        ? 'bg-primary-50 dark:bg-primary-950/40 border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    Liên Kết Ngoài
                  </button>
                </div>

                {newSubForm.link_type === 'system' ? (
                  <div>
                    <select
                      value={newSubForm.link_url}
                      onChange={(e) => setNewSubForm({ ...newSubForm, link_url: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs focus:outline-none"
                    >
                      <option value="">-- {t('homepageSectionsModule.selectSystemPage') || 'Chọn trang hệ thống có sẵn'} --</option>
                      {SYSTEM_PAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {isEn ? opt.labelEn : opt.labelVi} ({opt.value})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={newSubForm.link_url}
                      onChange={(e) => setNewSubForm({ ...newSubForm, link_url: e.target.value })}
                      placeholder={newSubForm.link_type === 'external' ? 'https://zalo.me/...' : '/danh-muc/...'}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono text-xs focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-neutral-600 dark:text-neutral-400 font-medium">Mở liên kết trong:</span>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="new_target"
                        checked={newSubForm.link_target === '_self'}
                        onChange={() => setNewSubForm({ ...newSubForm, link_target: '_self' })}
                        className="text-primary-600"
                      />
                      <span>Cùng tab (_self)</span>
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="new_target"
                        checked={newSubForm.link_target === '_blank'}
                        onChange={() => setNewSubForm({ ...newSubForm, link_target: '_blank' })}
                        className="text-primary-600"
                      />
                      <span>Tab mới (_blank)</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingSub(false)}
                className="px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-medium transition cursor-pointer"
              >
                {t('homepageSectionsModule.cancel') || 'Hủy bỏ'}
              </button>
              <button
                type="button"
                onClick={handleCreateSubsection}
                className="px-4 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-bold transition shadow-sm cursor-pointer"
              >
                {t('homepageSectionsModule.createSubsection') || 'Tạo mục con'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Xóa Mục Con (Nhóm 2) */}
      {deletingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  {t('homepageSectionsModule.confirmDeleteTitle') || 'Xác Nhận Xóa Mục Con'}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {t('homepageSectionsModule.confirmDeleteMessage', {
                    name: deletingSub.sub.title_vi || deletingSub.sub.internal_name || deletingSub.sub.nameVi || deletingSub.sub.id,
                  }) || `Bạn có chắc chắn muốn xóa mục con "${deletingSub.sub.title_vi || deletingSub.sub.nameVi || deletingSub.sub.id}" khỏi cấu hình?`}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-neutral-100 dark:bg-neutral-800/60 text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
              ID: {deletingSub.sub.id} (Thuộc: {deletingSub.parentId})
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingSub(null)}
                className="px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer"
              >
                {t('homepageSectionsModule.cancel') || 'Hủy bỏ'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                {t('homepageSectionsModule.confirm') || 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
