import {
  HomepageSectionState,
  getDefaultHomepageSectionsState,
  mergeHomepageSectionsConfig,
} from '../config/homepageSections';

const STORAGE_KEY = 'wcg_homepage_sections_v1';
const UPDATE_EVENT = 'wcg_homepage_sections_updated';

class HomepageSectionsService {
  private sections: HomepageSectionState[] = [];
  private isLoaded = false;
  private pollTimer: any = null;
  private lastFetchTime = 0;

  constructor() {
    this.sections = this.loadInitialFromStorage();
    if (typeof window !== 'undefined') {
      this.initBackgroundSync();
    }
  }

  private loadInitialFromStorage(): HomepageSectionState[] {
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

    // 2. Tự động kiểm tra cập nhật mỗi 20 giây (đáp ứng điều kiện cập nhật trong vòng tối đa 30 giây)
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

  public async fetchSections(force = false): Promise<HomepageSectionState[]> {
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

  public getSections(): HomepageSectionState[] {
    return [...this.sections];
  }

  public getSectionsSnapshot(): HomepageSectionState[] {
    return [...this.sections];
  }

  public saveConfigLocally(newSections: HomepageSectionState[]): void {
    this.sections = mergeHomepageSectionsConfig(newSections);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sections));
      } catch {}
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: this.sections }));
    }
  }

  public getOrderedSections(): HomepageSectionState[] {
    return [...this.sections].sort((a, b) => a.order - b.order);
  }

  public isSectionEnabled(id: string): boolean {
    const item = this.sections.find((s) => s.id === id);
    return item ? item.enabled : true;
  }

  public subscribe(callback: (sections: HomepageSectionState[]) => void): () => void {
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
    newSections: HomepageSectionState[],
    adminToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const token =
        adminToken ||
        localStorage.getItem('wcg_auth_token') ||
        sessionStorage.getItem('wcg_auth_token') ||
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
