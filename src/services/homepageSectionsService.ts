import {
  HomepageSectionConfig,
  HomepageSubsectionConfig,
  getDefaultHomepageSectionsState,
  mergeHomepageSectionsConfig,
  isSubsectionEnabled as checkSubEnabled,
  getOrderedSubsections as getSubs,
} from '../config/homepageSections';

const STORAGE_KEY = 'pine_homepage_sections_v1';
const UPDATE_EVENT = 'pine_homepage_sections_updated';

class HomepageSectionsService {
  private sections: HomepageSectionConfig[] = [];
  private isLoaded = false;
  private pollTimer: any = null;
  private lastFetchTime = 0;

  constructor() {
    this.sections = this.loadInitialFromStorage();
    if (typeof window !== 'undefined') {
      this.initBackgroundSync();
    }
  }

  private loadInitialFromStorage(): HomepageSectionConfig[] {
    if (typeof window === 'undefined') {
      return getDefaultHomepageSectionsState();
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return mergeHomepageSectionsConfig(parsed);
      }
    } catch {}
    return getDefaultHomepageSectionsState();
  }

  private initBackgroundSync(): void {
    // 1. Tải ngay lần đầu tiên
    this.fetchSections(true);

    // 2. Tự động kiểm tra cập nhật định kỳ (đồng bộ lên web khách khoảng 1–2 phút do cơ chế cache CDN và trình duyệt)
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => {
        this.fetchSections(false);
      }, 20000);
    }

    // 3. Tải lại ngay khi người dùng chuyển tab hoặc quay lại cửa sổ
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - this.lastFetchTime > 5000) {
          this.fetchSections(true);
        }
      }
    });

    window.addEventListener('focus', () => {
      const now = Date.now();
      if (now - this.lastFetchTime > 5000) {
        this.fetchSections(true);
      }
    });
  }

  public async fetchSections(force = false): Promise<HomepageSectionConfig[]> {
    const now = Date.now();
    if (!force && this.isLoaded && now - this.lastFetchTime < 10000) {
      return this.sections;
    }

    try {
      const res = await fetch('/api/homepage-sections', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data: any = await res.json();
        if (data.success && Array.isArray(data.sections)) {
          const merged = mergeHomepageSectionsConfig(data.sections);
          const changed = JSON.stringify(this.sections) !== JSON.stringify(merged);
          this.sections = merged;
          this.isLoaded = true;
          this.lastFetchTime = now;

          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            } catch {}

            if (changed) {
              window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: merged }));
            }
          }
          return this.sections;
        }
      }
    } catch (e) {
      console.warn('[HomepageSectionsService] Failed to fetch sections from server, using cached config:', e);
    }

    this.isLoaded = true;
    return this.sections;
  }

  public getSections(): HomepageSectionConfig[] {
    return [...this.sections];
  }

  public getSectionsSnapshot(): HomepageSectionConfig[] {
    return [...this.sections];
  }

  public saveConfigLocally(newSections: HomepageSectionConfig[]): void {
    this.sections = mergeHomepageSectionsConfig(newSections);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sections));
      } catch {}
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: this.sections }));
    }
  }

  public getOrderedSections(): HomepageSectionConfig[] {
    return [...this.sections].sort((a, b) => a.order - b.order);
  }

  public isSectionEnabled(id: string): boolean {
    const item = this.sections.find((s) => s.id === id);
    return item ? item.enabled : true;
  }

  public isSubsectionEnabled(parentId: string, subId: string): boolean {
    return checkSubEnabled(this.sections, parentId, subId);
  }

  public getOrderedSubsections(parentId: string, group?: string): HomepageSubsectionConfig[] {
    return getSubs(this.sections, parentId, group);
  }

  public subscribe(callback: (sections: HomepageSectionConfig[]) => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const handler = (e: any) => {
      callback(e.detail || this.sections);
    };

    window.addEventListener(UPDATE_EVENT, handler);
    return () => {
      window.removeEventListener(UPDATE_EVENT, handler);
    };
  }

  public async saveAdminSections(
    newSections: HomepageSectionConfig[],
    adminToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const token =
        adminToken ||
        localStorage.getItem('pine_auth_token') ||
        sessionStorage.getItem('pine_auth_token') ||
        '';

      const res = await fetch('/api/admin/homepage-sections', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
          'X-Admin-Key': token,
        },
        body: JSON.stringify({ sections: newSections }),
      });

      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        this.sections = mergeHomepageSectionsConfig(data.sections || newSections);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sections));
        } catch {}
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: this.sections }));
        }
        return { success: true };
      }
      return { success: false, error: data.error || 'Không thể lưu cấu hình.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Lỗi kết nối máy chủ.' };
    }
  }
}

export const homepageSectionsService = new HomepageSectionsService();
