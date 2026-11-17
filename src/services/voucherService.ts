export interface Voucher {
  id: string;
  code: string;
  title: string;
  description: string;
  voucher_type: 'freeship' | 'discount';
  discount_type: 'fixed' | 'percent';
  discount_value: number;
  min_order_amount: number;
  max_discount_amount?: number;
  is_active: boolean;
}

export const INITIAL_VOUCHERS: Voucher[] = [
  {
    id: 'v_free_01',
    code: 'FREESHIP30K',
    title: 'Miễn Phí Vận Chuyển 30.000đ',
    description: 'Áp dụng cho đơn hàng vật lý từ 100.000đ trở lên trên toàn quốc.',
    voucher_type: 'freeship',
    discount_type: 'fixed',
    discount_value: 30000,
    min_order_amount: 100000,
    max_discount_amount: 30000,
    is_active: true,
  },
  {
    id: 'v_free_02',
    code: 'FREESHIPMAX',
    title: 'Freeship Xtra Giảm 50.000đ',
    description: 'Áp dụng cho đơn hàng từ 300.000đ, miễn 100% phí giao bưu điện.',
    voucher_type: 'freeship',
    discount_type: 'fixed',
    discount_value: 50000,
    min_order_amount: 300000,
    max_discount_amount: 50000,
    is_active: true,
  },
  {
    id: 'v_disc_01',
    code: 'MALL50K',
    title: 'Voucher Sàn Giảm 50.000đ',
    description: 'Giảm thẳng 50.000đ vào tiền hàng cho đơn từ 250.000đ.',
    voucher_type: 'discount',
    discount_type: 'fixed',
    discount_value: 50000,
    min_order_amount: 250000,
    max_discount_amount: 50000,
    is_active: true,
  },
  {
    id: 'v_disc_02',
    code: 'UNIVERSAL10',
    title: 'Voucher Giảm 10% Tối Đa 100.000đ',
    description: 'Giảm 10% giá trị đơn hàng mọi ngành hàng từ 150.000đ.',
    voucher_type: 'discount',
    discount_type: 'percent',
    discount_value: 10,
    min_order_amount: 150000,
    max_discount_amount: 100000,
    is_active: true,
  },
];

class VoucherService {
  private vouchers: Voucher[] = INITIAL_VOUCHERS;

  getVouchers(): Voucher[] {
    return this.vouchers.filter(v => v.is_active);
  }

  calculateDiscount(voucher: Voucher, subtotal: number): number {
    if (subtotal < voucher.min_order_amount) return 0;
    if (voucher.discount_type === 'fixed') {
      return voucher.discount_value;
    }
    const percentAmount = Math.round((subtotal * voucher.discount_value) / 100);
    if (voucher.max_discount_amount && percentAmount > voucher.max_discount_amount) {
      return voucher.max_discount_amount;
    }
    return percentAmount;
  }

  calculateShippingDiscount(freeshipVoucher: Voucher, shippingFee: number, subtotal: number): number {
    if (subtotal < freeshipVoucher.min_order_amount) return 0;
    return Math.min(shippingFee, freeshipVoucher.discount_value);
  }
}

export const voucherService = new VoucherService();
