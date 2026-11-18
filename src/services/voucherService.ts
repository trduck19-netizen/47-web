/**
 * Voucher Service — Hệ Thống Mã Giảm Giá Đa Tầng Phong Cách Shopee (Shopee-Style Voucher Stacking)
 * Hỗ trợ áp dụng đồng thời:
 * 1. Voucher Vận Chuyển (Freeship Xtra / Giảm phí ship)
 * 2. Voucher Đơn Hàng (Voucher Sàn / Voucher Shop)
 */

export type VoucherType = 'freeship' | 'platform' | 'shop';
export type DiscountType = 'fixed' | 'percent';
export type VoucherScope = 'all' | 'physical_only' | 'digital_only' | 'category';

export interface VoucherItem {
  id: string;
  code: string;
  title: string;
  description: string;
  voucherType: VoucherType;
  discountType: DiscountType;
  discountValue: number; // e.g. 20000 (VND) hoặc 10 (%)
  maxDiscount?: number;  // Tối đa giảm bao nhiêu khi là %
  minOrderValue: number; // Giá trị đơn hàng tối thiểu
  scopeType: VoucherScope;
  targetCategory?: string;
  totalUsage: number;
  usedCount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  badgeText?: string;
  highlightColor?: string;
}

export interface VoucherStackingResult {
  productTotal: number;
  shippingFee: number;
  freeshipVoucher: VoucherItem | null;
  discountVoucher: VoucherItem | null;
  freeshipDiscount: number;
  productDiscount: number;
  finalShippingFee: number;
  finalProductTotal: number;
  finalTotal: number;
  totalSavings: number;
}

export const INITIAL_VOUCHERS: VoucherItem[] = [
  {
    id: 'v_free_01',
    code: 'FREESHIP30K',
    title: 'Freeship Toàn Quốc 30.000đ',
    description: 'Giảm 30.000đ phí vận chuyển cho đơn hàng từ 100.000đ',
    voucherType: 'freeship',
    discountType: 'fixed',
    discountValue: 30000,
    maxDiscount: 30000,
    minOrderValue: 100000,
    scopeType: 'all',
    totalUsage: 1000,
    usedCount: 0,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    isActive: true,
    badgeText: 'Freeship Xtra',
    highlightColor: '#00bfa5',
  },
  {
    id: 'v_free_02',
    code: 'FREESHIPMAX',
    title: 'Freeship Max 50.000đ',
    description: 'Giảm 50.000đ phí vận chuyển cho đơn hàng từ 300.000đ',
    voucherType: 'freeship',
    discountType: 'fixed',
    discountValue: 50000,
    maxDiscount: 50000,
    minOrderValue: 300000,
    scopeType: 'all',
    totalUsage: 1000,
    usedCount: 0,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    isActive: true,
    badgeText: 'Freeship Max',
    highlightColor: '#00bfa5',
  },
  {
    id: 'v_disc_01',
    code: 'MALL50K',
    title: 'Voucher Sàn Giảm 50.000đ',
    description: 'Giảm 50.000đ cho đơn hàng đa ngành từ 200.000đ',
    voucherType: 'platform',
    discountType: 'fixed',
    discountValue: 50000,
    maxDiscount: 50000,
    minOrderValue: 200000,
    scopeType: 'all',
    totalUsage: 1000,
    usedCount: 0,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    isActive: true,
    badgeText: 'Mall 50K',
    highlightColor: '#ee4d2d',
  },
  {
    id: 'v_disc_02',
    code: 'UNIVERSAL10',
    title: 'Siêu Hội Mua Sắm - Giảm 10%',
    description: 'Giảm 10% (tối đa 100.000đ) cho đơn hàng từ 150.000đ',
    voucherType: 'platform',
    discountType: 'percent',
    discountValue: 10,
    maxDiscount: 100000,
    minOrderValue: 150000,
    scopeType: 'all',
    totalUsage: 1000,
    usedCount: 0,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    isActive: true,
    badgeText: 'Giảm 10%',
    highlightColor: '#ee4d2d',
  },
];

class VoucherService {
  private vouchers: Map<string, VoucherItem> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    // 1. Nạp danh mục voucher thật mặc định khớp 100% CSDL D1
    INITIAL_VOUCHERS.forEach((v) => this.vouchers.set(v.id, v));

    // 2. Tự động đồng bộ trực tiếp từ Cloudflare D1 API /api/vouchers
    if (typeof window !== 'undefined') {
      this.fetchVouchersFromApi().catch(() => {});
    }
  }

  /**
   * Đồng bộ danh sách voucher thời gian thực từ CSDL D1 (/api/vouchers)
   */
  public async fetchVouchersFromApi(): Promise<VoucherItem[]> {
    try {
      const res = await fetch('/api/vouchers');
      if (res.ok) {
        const json: any = await res.json();
        if (json && json.success && Array.isArray(json.data)) {
          this.vouchers.clear();
          json.data.forEach((row: any) => {
            const codeUpper = String(row.code || '').toUpperCase().trim();
            const isFreeship = row.voucher_type === 'freeship' || codeUpper.startsWith('FREE');
            const item: VoucherItem = {
              id: row.id,
              code: codeUpper,
              title: isFreeship
                ? (row.discount_value >= 50000 ? 'Freeship Max 50.000đ' : 'Freeship Toàn Quốc 30.000đ')
                : (row.discount_type === 'percent' ? `Siêu Hội Mua Sắm - Giảm ${row.discount_value}%` : `Voucher Sàn Giảm ${Number(row.discount_value).toLocaleString('vi-VN')}đ`),
              description: isFreeship
                ? `Giảm ${Number(row.discount_value).toLocaleString('vi-VN')}đ phí vận chuyển cho đơn từ ${Number(row.min_order_amount).toLocaleString('vi-VN')}đ`
                : `Giảm ${row.discount_type === 'percent' ? `${row.discount_value}%` : `${Number(row.discount_value).toLocaleString('vi-VN')}đ`} cho đơn từ ${Number(row.min_order_amount).toLocaleString('vi-VN')}đ`,
              voucherType: isFreeship ? 'freeship' : 'platform',
              discountType: row.discount_type || 'fixed',
              discountValue: Number(row.discount_value) || 0,
              maxDiscount: row.max_discount_amount ? Number(row.max_discount_amount) : undefined,
              minOrderValue: Number(row.min_order_amount) || 0,
              scopeType: 'all',
              totalUsage: Number(row.usage_limit) || 1000,
              usedCount: Number(row.usage_count) || 0,
              startDate: row.start_date || '2026-01-01T00:00:00Z',
              endDate: row.end_date || '2026-12-31T23:59:59Z',
              isActive: row.is_active === 1 || row.is_active === true,
              badgeText: isFreeship ? 'Freeship Xtra' : 'Mall Voucher',
              highlightColor: isFreeship ? '#00bfa5' : '#ee4d2d',
            };
            this.vouchers.set(item.id, item);
          });
          return Array.from(this.vouchers.values());
        }
      }
    } catch (err) {
      console.warn('[VoucherService] sync from /api/vouchers error, keeping in-memory D1 vouchers:', err);
    }
    return Array.from(this.vouchers.values());
  }

  /**
   * Trừ lượt dùng voucher trong Cloudflare D1 khi đơn hàng thanh toán thành công
   */
  public async redeemVoucher(code: string, orderId?: string): Promise<boolean> {
    const cleanCode = code.trim().toUpperCase();
    try {
      const res = await fetch('/api/vouchers/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode, order_id: orderId }),
      });
      if (res.ok) {
        // Cập nhật số lượt dùng trong bộ nhớ cache
        const v = this.getByCode(cleanCode);
        if (v) {
          v.usedCount = (v.usedCount || 0) + 1;
        }
        return true;
      }
    } catch (err) {
      console.warn('[VoucherService] redeem voucher error:', err);
    }
    return false;
  }

  public getAll(): VoucherItem[] {
    return Array.from(this.vouchers.values());
  }

  public getById(id: string): VoucherItem | undefined {
    return this.vouchers.get(id);
  }

  public getByCode(code: string): VoucherItem | undefined {
    const cleanCode = code.trim().toUpperCase();
    return Array.from(this.vouchers.values()).find(
      (v) => v.code.toUpperCase() === cleanCode && v.isActive
    );
  }

  /**
   * Lọc và phân loại voucher theo điều kiện đơn hàng
   */
  public evaluateVouchers(params: {
    productTotal: number;
    shippingFee: number;
    isPhysical: boolean;
    categoryId?: string;
  }): {
    freeshipVouchers: { voucher: VoucherItem; eligible: boolean; diffNeeded: number }[];
    discountVouchers: { voucher: VoucherItem; eligible: boolean; diffNeeded: number }[];
  } {
    const { productTotal, isPhysical } = params;
    const all = this.getAll().filter((v) => v.isActive);

    const freeshipList: { voucher: VoucherItem; eligible: boolean; diffNeeded: number }[] = [];
    const discountList: { voucher: VoucherItem; eligible: boolean; diffNeeded: number }[] = [];

    all.forEach((v) => {
      // Check scope
      if (v.scopeType === 'physical_only' && !isPhysical) return;
      if (v.scopeType === 'digital_only' && isPhysical) return;

      const diff = Math.max(0, v.minOrderValue - productTotal);
      const eligible = diff === 0 && v.usedCount < v.totalUsage;

      const item = { voucher: v, eligible, diffNeeded: diff };

      if (v.voucherType === 'freeship') {
        freeshipList.push(item);
      } else {
        discountList.push(item);
      }
    });

    // Sắp xếp: Eligible lên trước, sau đó ưu tiên giá trị giảm cao hơn
    const sorter = (
      a: { voucher: VoucherItem; eligible: boolean; diffNeeded: number },
      b: { voucher: VoucherItem; eligible: boolean; diffNeeded: number }
    ) => {
      if (a.eligible && !b.eligible) return -1;
      if (!a.eligible && b.eligible) return 1;
      return b.voucher.discountValue - a.voucher.discountValue;
    };

    freeshipList.sort(sorter);
    discountList.sort(sorter);

    return { freeshipVouchers: freeshipList, discountVouchers: discountList };
  }

  /**
   * Tính toán voucher đa tầng (Shopee Stacking Calculation)
   * 1 Voucher Freeship + 1 Voucher Giảm giá
   */
  public calculateStacking(params: {
    productTotal: number;
    shippingFee: number;
    freeshipVoucher: VoucherItem | null;
    discountVoucher: VoucherItem | null;
  }): VoucherStackingResult {
    const { productTotal, shippingFee, freeshipVoucher, discountVoucher } = params;

    let freeshipDiscount = 0;
    if (freeshipVoucher && shippingFee > 0) {
      if (freeshipVoucher.discountType === 'fixed') {
        freeshipDiscount = Math.min(shippingFee, freeshipVoucher.discountValue);
      } else {
        const pctDiscount = Math.round((shippingFee * freeshipVoucher.discountValue) / 100);
        freeshipDiscount = Math.min(
          shippingFee,
          freeshipVoucher.maxDiscount ? Math.min(pctDiscount, freeshipVoucher.maxDiscount) : pctDiscount
        );
      }
    }

    let productDiscount = 0;
    if (discountVoucher && productTotal > 0) {
      if (discountVoucher.discountType === 'fixed') {
        productDiscount = Math.min(productTotal, discountVoucher.discountValue);
      } else {
        const pctDiscount = Math.round((productTotal * discountVoucher.discountValue) / 100);
        productDiscount = Math.min(
          productTotal,
          discountVoucher.maxDiscount ? Math.min(pctDiscount, discountVoucher.maxDiscount) : pctDiscount
        );
      }
    }

    const finalShippingFee = Math.max(0, shippingFee - freeshipDiscount);
    const finalProductTotal = Math.max(0, productTotal - productDiscount);
    const finalTotal = finalProductTotal + finalShippingFee;
    const totalSavings = freeshipDiscount + productDiscount;

    return {
      productTotal,
      shippingFee,
      freeshipVoucher,
      discountVoucher,
      freeshipDiscount,
      productDiscount,
      finalShippingFee,
      finalProductTotal,
      finalTotal,
      totalSavings,
    };
  }

  /**
   * Ghi nhận sử dụng voucher sau khi đặt hàng thành công
   */
  public recordUsage(code?: string, orderId?: string): void {
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();
    const v = this.getByCode(cleanCode);
    if (v) {
      v.usedCount = Math.min(v.totalUsage, (v.usedCount || 0) + 1);
      this.vouchers.set(v.id, v);
    }
    // Ghi nhận trực tiếp vào CSDL D1 qua endpoint /api/vouchers/redeem
    this.redeemVoucher(cleanCode, orderId).catch(() => {});
  }

  /**
   * Quản trị CRUD Voucher (Đồng bộ bộ nhớ RAM client)
   */
  public saveVoucher(item: Partial<VoucherItem> & { code: string; title: string }): VoucherItem {
    const existing = item.id ? this.vouchers.get(item.id) : undefined;
    const id = existing ? existing.id : `vc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullItem: VoucherItem = {
      id,
      code: item.code.trim().toUpperCase(),
      title: item.title,
      description: item.description || '',
      voucherType: item.voucherType || 'platform',
      discountType: item.discountType || 'fixed',
      discountValue: Number(item.discountValue) || 0,
      maxDiscount: item.maxDiscount ? Number(item.maxDiscount) : undefined,
      minOrderValue: Number(item.minOrderValue) || 0,
      scopeType: item.scopeType || 'all',
      targetCategory: item.targetCategory,
      totalUsage: Number(item.totalUsage) || 100,
      usedCount: existing ? existing.usedCount : 0,
      startDate: item.startDate || new Date().toISOString(),
      endDate: item.endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: item.isActive !== undefined ? item.isActive : true,
      badgeText: item.badgeText || (item.voucherType === 'freeship' ? 'Freeship Xtra' : 'Mã Giảm Giá'),
      highlightColor: item.highlightColor || (item.voucherType === 'freeship' ? '#00bfa5' : '#ee4d2d'),
    };
    this.vouchers.set(id, fullItem);
    return fullItem;
  }

  public deleteVoucher(id: string): boolean {
    return this.vouchers.delete(id);
  }

  public toggleVoucher(id: string): boolean {
    const item = this.vouchers.get(id);
    if (!item) return false;
    item.isActive = !item.isActive;
    return item.isActive;
  }
}

export const voucherService = new VoucherService();
