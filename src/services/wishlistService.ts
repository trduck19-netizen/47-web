/**
 * Wishlist Service - Quản lý Danh Sách Yêu Thích (Client-side & Server D1 Sync)
 * Hỗ trợ offline/khách vãng lai qua localStorage và tự động đồng bộ lên D1 khi đăng nhập.
 */

export interface WishlistTargetItem {
  target_id: string;
  target_type: 'game' | 'product';
  title?: string;
  price?: number;
  original_price?: number;
  image_url?: string;
  category?: string;
  slug?: string;
  rating?: number;
}

export interface WishlistRecord {
  id: string;
  user_id?: string;
  target_type: 'game' | 'product';
  target_id: string;
  metadata?: WishlistTargetItem;
  created_at: string;
}

class WishlistService {
  private readonly STORAGE_KEY = 'pine_user_wishlist_local';
  private inMemoryWishlist: WishlistRecord[] = [];
  private isLoaded = false;

  constructor() {
    this.loadFromLocalStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('pine_user_registered', () => {
        this.syncWishlistToServer().catch(() => {});
      });
      window.addEventListener('pine_auth_state_changed', () => {
        if (this.getAuthToken()) {
          this.fetchFromServer().catch(() => {});
        } else {
          this.inMemoryWishlist = [];
          this.saveToLocalStorage();
        }
      });
    }
  }

  private loadFromLocalStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.inMemoryWishlist = Array.isArray(parsed)
          ? parsed.filter((item: any) => item && typeof item.target_id === 'string' && item.target_id.trim() !== '')
          : [];
      }
    } catch {
      this.inMemoryWishlist = [];
    }
    this.isLoaded = true;
  }

  private saveToLocalStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.inMemoryWishlist));
      window.dispatchEvent(
        new CustomEvent('pine_wishlist_updated', {
          detail: { items: this.inMemoryWishlist, count: this.inMemoryWishlist.length },
        })
      );
    } catch (e) {
      console.warn('[WishlistService] Save localStorage error:', e);
    }
  }

  private getAuthToken(): string {
    if (typeof window === 'undefined') return '';
    return (
      localStorage.getItem('pine_auth_token') ||
      sessionStorage.getItem('pine_auth_token') ||
      ''
    );
  }

  /**
   * Lấy toàn bộ danh sách yêu thích
   */
  public async getWishlist(): Promise<WishlistRecord[]> {
    const token = this.getAuthToken();
    if (token) {
      await this.fetchFromServer();
    } else if (!this.isLoaded) {
      this.loadFromLocalStorage();
    }
    return [...this.inMemoryWishlist];
  }

  /**
   * Lấy số lượng yêu thích
   */
  public getCount(): number {
    return this.inMemoryWishlist.length;
  }

  /**
   * Kiểm tra xem 1 sản phẩm/game có trong danh sách yêu thích hay không
   */
  public isInWishlist(targetId: string, targetType: 'game' | 'product' = 'product'): boolean {
    if (!targetId) return false;
    return this.inMemoryWishlist.some(
      (item) => item.target_id === targetId && item.target_type === targetType
    );
  }

  /**
   * Thêm hoặc bỏ thích (Toggle Wishlist)
   */
  public async toggleWishlist(target: WishlistTargetItem): Promise<{
    inWishlist: boolean;
    count: number;
    message?: string;
  }> {
    if (!target?.target_id) {
      return { inWishlist: false, count: this.inMemoryWishlist.length };
    }

    const type = target.target_type || 'product';
    const existingIdx = this.inMemoryWishlist.findIndex(
      (item) => item.target_id === target.target_id && item.target_type === type
    );

    let inWishlist = false;

    if (existingIdx >= 0) {
      // Đã có -> Xóa bỏ
      this.inMemoryWishlist.splice(existingIdx, 1);
      inWishlist = false;
    } else {
      // Chưa có -> Thêm vào
      const newRecord: WishlistRecord = {
        id: `wsh_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        target_type: type,
        target_id: target.target_id,
        metadata: target,
        created_at: new Date().toISOString(),
      };
      this.inMemoryWishlist.unshift(newRecord);
      inWishlist = true;
    }

    this.saveToLocalStorage();

    // Nếu đã đăng nhập, gọi API D1 đồng bộ
    const token = this.getAuthToken();
    if (token) {
      try {
        const res = await fetch('/api/user/wishlist/toggle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            target_id: target.target_id,
            target_type: type,
            metadata: target,
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          if (data && typeof data.in_wishlist === 'boolean') {
            inWishlist = data.in_wishlist;
          }
        }
      } catch (err) {
        console.warn('[WishlistService] Sync toggle to server error:', err);
      }
    }

    return {
      inWishlist,
      count: this.inMemoryWishlist.length,
      message: inWishlist ? 'Đã thêm vào danh sách yêu thích' : 'Đã xóa khỏi danh sách yêu thích',
    };
  }

  /**
   * Tải danh sách yêu thích từ Server D1
   */
  public async fetchFromServer(): Promise<WishlistRecord[]> {
    const token = this.getAuthToken();
    if (!token) return this.inMemoryWishlist;

    try {
      const res = await fetch('/api/user/wishlist', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data: any = await res.json();
        if (data && data.success && Array.isArray(data.items)) {
          this.inMemoryWishlist = data.items;
          this.saveToLocalStorage();
          return this.inMemoryWishlist;
        }
      }
    } catch (err) {
      console.warn('[WishlistService] Fetch from server error:', err);
    }
    return this.inMemoryWishlist;
  }

  /**
   * Đồng bộ toàn bộ danh sách localStorage lên Server D1 khi người dùng vừa đăng nhập
   */
  public async syncWishlistToServer(): Promise<void> {
    const token = this.getAuthToken();
    if (!token || this.inMemoryWishlist.length === 0) return;

    try {
      const payload = {
        items: this.inMemoryWishlist.map((item) => ({
          target_id: item.target_id,
          target_type: item.target_type,
          metadata: item.metadata || {},
        })),
      };

      const res = await fetch('/api/user/wishlist/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data: any = await res.json();
        if (data && data.success && Array.isArray(data.items)) {
          this.inMemoryWishlist = data.items;
          this.saveToLocalStorage();
        }
      }
    } catch (err) {
      console.warn('[WishlistService] Sync batch to server error:', err);
    }
  }

  /**
   * Xóa sạch danh sách yêu thích
   */
  public async clearWishlist(): Promise<void> {
    this.inMemoryWishlist = [];
    this.saveToLocalStorage();

    const token = this.getAuthToken();
    if (token) {
      try {
        await fetch('/api/user/wishlist', {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.warn('[WishlistService] Clear wishlist server error:', err);
      }
    }
  }
}

export const wishlistService = new WishlistService();
