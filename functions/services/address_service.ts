/**
 * Cloudflare Edge Address Service (Address Book API)
 * Quản lý sổ địa chỉ nhận hàng của người dùng trên CSDL D1.
 */

export interface UserAddressRecord {
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

export interface CreateAddressParams {
  recipient_name?: string;
  recipientName?: string;
  phone_number?: string;
  phoneNumber?: string;
  phone?: string;
  province_city?: string;
  provinceCity?: string;
  province?: string;
  district?: string;
  ward?: string;
  detail_address?: string;
  detailAddress?: string;
  street_address?: string;
  address?: string;
  address_type?: 'HOME' | 'OFFICE' | 'OTHER';
  addressType?: 'HOME' | 'OFFICE' | 'OTHER';
  is_default?: boolean | number;
  isDefault?: boolean | number;
}

/**
 * Tạo địa chỉ đầy đủ (full_address) từ các thành phần
 */
function buildFullAddress(detail: string, ward: string, district: string, province: string): string {
  const parts = [detail, ward, district, province].map((p) => (p || '').trim()).filter(Boolean);
  return parts.join(', ');
}

/**
 * Lấy danh sách địa chỉ nhận hàng của user
 */
export async function listAddressesForUser(db: D1Database, userId: string): Promise<UserAddressRecord[]> {
  const res = await db
    .prepare('SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC')
    .bind(userId)
    .all<UserAddressRecord>();

  return res?.results || [];
}

/**
 * Thêm địa chỉ nhận hàng mới
 */
export async function createAddress(
  db: D1Database,
  userId: string,
  params: CreateAddressParams
): Promise<{ success: boolean; message: string; address?: UserAddressRecord }> {
  try {
    const recipient_name = (params.recipient_name || params.recipientName || '').trim();
    const phone_number = (params.phone_number || params.phoneNumber || params.phone || '').trim();
    const province_city = (params.province_city || params.provinceCity || params.province || '').trim();
    const district = (params.district || '').trim();
    const ward = (params.ward || '').trim();
    const detail_address = (params.detail_address || params.detailAddress || params.street_address || params.address || '').trim();

    if (!recipient_name || !phone_number || !province_city || !detail_address) {
      return { success: false, message: 'Vui lòng điền đầy đủ họ tên, số điện thoại, tỉnh thành và địa chỉ chi tiết.' };
    }

    // Đếm số địa chỉ hiện có
    const countRes = await db
      .prepare('SELECT COUNT(*) as count FROM user_addresses WHERE user_id = ?')
      .bind(userId)
      .first<{ count: number }>();
    const isFirst = (countRes?.count || 0) === 0;

    const makeDefault = Boolean(params.is_default ?? params.isDefault) || isFirst;

    if (makeDefault) {
      // Đặt tất cả địa chỉ cũ của user thành phụ
      await db.prepare('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?').bind(userId).run();
    }

    const id = `addr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();
    const fullAddr = buildFullAddress(detail_address, ward, district, province_city);
    const addrType = params.address_type || params.addressType || 'HOME';

    await db
      .prepare(`
        INSERT INTO user_addresses (
          id, user_id, recipient_name, phone_number, province_city,
          district, ward, detail_address, full_address, address_type,
          is_default, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        userId,
        recipient_name.trim(),
        phone_number.trim(),
        province_city.trim(),
        (district || '').trim(),
        (ward || '').trim(),
        detail_address.trim(),
        fullAddr,
        addrType,
        makeDefault ? 1 : 0,
        nowIso,
        nowIso
      )
      .run();

    const created = await db
      .prepare('SELECT * FROM user_addresses WHERE id = ?')
      .bind(id)
      .first<UserAddressRecord>();

    return {
      success: true,
      message: 'Thêm địa chỉ nhận hàng thành công.',
      address: created || undefined,
    };
  } catch (err: any) {
    return { success: false, message: 'Lỗi khi lưu địa chỉ: ' + (err?.message || String(err)) };
  }
}

/**
 * Cập nhật địa chỉ nhận hàng
 */
export async function updateAddress(
  db: D1Database,
  userId: string,
  addressId: string,
  params: Partial<CreateAddressParams>
): Promise<{ success: boolean; message: string; address?: UserAddressRecord }> {
  try {
    const existing = await db
      .prepare('SELECT * FROM user_addresses WHERE id = ? AND user_id = ?')
      .bind(addressId, userId)
      .first<UserAddressRecord>();

    if (!existing) {
      return { success: false, message: 'Không tìm thấy địa chỉ cần cập nhật.' };
    }

    const recipient_name = (params.recipient_name ?? existing.recipient_name).trim();
    const phone_number = (params.phone_number ?? existing.phone_number).trim();
    const province_city = (params.province_city ?? existing.province_city).trim();
    const district = (params.district ?? existing.district).trim();
    const ward = (params.ward ?? existing.ward).trim();
    const detail_address = (params.detail_address ?? existing.detail_address).trim();
    const full_address = buildFullAddress(detail_address, ward, district, province_city);
    const address_type = params.address_type || existing.address_type;
    const nowIso = new Date().toISOString();

    let isDefaultVal = existing.is_default;
    if (params.is_default !== undefined) {
      const wantDefault = Boolean(params.is_default);
      if (wantDefault) {
        await db.prepare('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?').bind(userId).run();
        isDefaultVal = 1;
      } else {
        isDefaultVal = 0;
      }
    }

    await db
      .prepare(`
        UPDATE user_addresses SET
          recipient_name = ?,
          phone_number = ?,
          province_city = ?,
          district = ?,
          ward = ?,
          detail_address = ?,
          full_address = ?,
          address_type = ?,
          is_default = ?,
          updated_at = ?
        WHERE id = ? AND user_id = ?
      `)
      .bind(
        recipient_name,
        phone_number,
        province_city,
        district,
        ward,
        detail_address,
        full_address,
        address_type,
        isDefaultVal,
        nowIso,
        addressId,
        userId
      )
      .run();

    const updated = await db
      .prepare('SELECT * FROM user_addresses WHERE id = ?')
      .bind(addressId)
      .first<UserAddressRecord>();

    return {
      success: true,
      message: 'Cập nhật địa chỉ nhận hàng thành công.',
      address: updated || undefined,
    };
  } catch (err: any) {
    return { success: false, message: 'Lỗi khi cập nhật địa chỉ: ' + (err?.message || String(err)) };
  }
}

/**
 * Xóa một địa chỉ nhận hàng
 */
export async function deleteAddress(
  db: D1Database,
  userId: string,
  addressId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const existing = await db
      .prepare('SELECT id, is_default FROM user_addresses WHERE id = ? AND user_id = ?')
      .bind(addressId, userId)
      .first<{ id: string; is_default: number }>();

    if (!existing) {
      return { success: false, message: 'Không tìm thấy địa chỉ cần xóa.' };
    }

    await db.prepare('DELETE FROM user_addresses WHERE id = ? AND user_id = ?').bind(addressId, userId).run();

    // Nếu vừa xóa địa chỉ mặc định, tự động gán địa chỉ còn lại mới nhất thành mặc định
    if (existing.is_default === 1) {
      const nextAddr = await db
        .prepare('SELECT id FROM user_addresses WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1')
        .bind(userId)
        .first<{ id: string }>();

      if (nextAddr) {
        await db
          .prepare('UPDATE user_addresses SET is_default = 1 WHERE id = ?')
          .bind(nextAddr.id)
          .run();
      }
    }

    return { success: true, message: 'Đã xóa địa chỉ thành công.' };
  } catch (err: any) {
    return { success: false, message: 'Lỗi khi xóa địa chỉ: ' + (err?.message || String(err)) };
  }
}

/**
 * Đặt một địa chỉ làm mặc định
 */
export async function setDefaultAddress(
  db: D1Database,
  userId: string,
  addressId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const existing = await db
      .prepare('SELECT id FROM user_addresses WHERE id = ? AND user_id = ?')
      .bind(addressId, userId)
      .first<{ id: string }>();

    if (!existing) {
      return { success: false, message: 'Không tìm thấy địa chỉ.' };
    }

    await db.prepare('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?').bind(userId).run();
    await db
      .prepare('UPDATE user_addresses SET is_default = 1, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
      .bind(addressId, userId)
      .run();

    return { success: true, message: 'Đã đặt địa chỉ làm mặc định thành công.' };
  } catch (err: any) {
    return { success: false, message: 'Lỗi khi đặt địa chỉ mặc định: ' + (err?.message || String(err)) };
  }
}
