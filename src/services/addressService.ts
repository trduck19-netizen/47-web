/**
 * Client Address Service
 * Giao tiếp với API /api/user/addresses để quản lý sổ địa chỉ nhận hàng trên D1.
 */

export interface UserAddress {
  id: string;
  user_id: string;
  recipient_name: string;
  phone_number: string;
  province_city: string;
  district: string;
  ward: string;
  detail_address: string;
  full_address: string;
  address_type: 'HOME' | 'OFFICE' | 'OTHER';
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAddressPayload {
  recipient_name: string;
  phone_number: string;
  province_city: string;
  district?: string;
  ward?: string;
  detail_address: string;
  address_type?: 'HOME' | 'OFFICE' | 'OTHER';
  is_default?: boolean | number;
}

class AddressService {
  private getHeaders(): HeadersInit {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pine_auth_token') || '' : '';
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Lấy danh sách địa chỉ của người dùng
   */
  public async getAddresses(): Promise<UserAddress[]> {
    if (typeof window === 'undefined') return [];
    const token = localStorage.getItem('pine_auth_token');
    if (!token) return [];

    try {
      const res = await fetch('/api/user/addresses', {
        headers: this.getHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data?.success && Array.isArray(data?.addresses) ? data.addresses : [];
    } catch (err) {
      console.warn('[AddressService getAddresses error]', err);
      return [];
    }
  }

  /**
   * Thêm địa chỉ nhận hàng mới
   */
  public async createAddress(payload: CreateAddressPayload): Promise<{ success: boolean; message: string; address?: UserAddress }> {
    try {
      const res = await fetch('/api/user/addresses', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi kết nối khi thêm địa chỉ.' };
    }
  }

  /**
   * Cập nhật địa chỉ nhận hàng
   */
  public async updateAddress(id: string, payload: Partial<CreateAddressPayload>): Promise<{ success: boolean; message: string; address?: UserAddress }> {
    try {
      const res = await fetch(`/api/user/addresses/${id}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi kết nối khi cập nhật địa chỉ.' };
    }
  }

  /**
   * Xóa địa chỉ nhận hàng
   */
  public async deleteAddress(id: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`/api/user/addresses/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi kết nối khi xóa địa chỉ.' };
    }
  }

  /**
   * Đặt địa chỉ làm mặc định
   */
  public async setDefaultAddress(id: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`/api/user/addresses/${id}/default`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, message: err?.message || 'Lỗi kết nối khi đặt địa chỉ mặc định.' };
    }
  }
}

export const addressService = new AddressService();
