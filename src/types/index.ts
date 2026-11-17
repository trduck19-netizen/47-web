export type ProductType = 'physical' | 'digital';

export interface ProductVariant {
  id: string;
  sku: string;
  variant_name: string;
  attributes: Record<string, string>; // e.g. { color: 'Đen', size: 'L' }
  price: number;
  original_price?: number;
  stock_quantity: number;
  image_url?: string;
}

export interface UniversalProduct {
  id: string;
  title: string;
  slug: string;
  industry_id: 'fashion' | 'beauty' | 'tech' | 'services' | 'lifestyle' | string;
  category_id: string;
  category_name?: string;
  product_type: ProductType;
  original_price: number;
  current_price: number;
  discount_percent: number;
  stock_quantity: number;
  thumbnail_url: string;
  images: string[];
  description: string;
  specifications?: Record<string, string>;
  brand_name: string;
  rating_avg: number;
  rating_count: number;
  sold_count: number;
  badge?: string;
  variants?: ProductVariant[];
  delivered_codes?: string[]; // Dành cho hàng số
  is_active: boolean;
}

export interface IndustryCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  matchKeywords?: string[];
}

export interface IndustryConfig {
  id: string;
  name: string;
  icon: string;
  badge: string;
  bannerTitle: string;
  bannerSubtitle: string;
  defaultAccent: string;
  categories: IndustryCategory[];
}

export interface CustomerShippingInfo {
  fullName: string;
  phone: string;
  email?: string;
  provinceCity: string;
  district: string;
  ward: string;
  streetAddress: string;
  note?: string;
}

export interface UniversalOrder {
  id: string;
  order_code: string;
  product_id: string;
  variant_id?: string;
  variant_name?: string;
  product_title: string;
  product_type: ProductType;
  quantity: number;
  unit_price: number;
  subtotal_amount: number;
  shipping_fee: number;
  discount_amount: number;
  voucher_code?: string;
  freeship_voucher_code?: string;
  total_amount: number;
  payment_method: 'vietqr' | 'wallet' | 'cod';
  payment_status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  shipping_status: 'PENDING' | 'PICKING' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED';
  shipping_carrier?: 'GHTK' | 'GHN' | 'VIETTEL_POST';
  tracking_code?: string;
  shipping_info: CustomerShippingInfo;
  delivered_codes?: string[];
  created_at: string;
}

export interface PlatformLead {
  id: string;
  lead_code: string;
  full_name: string;
  phone: string;
  email: string;
  package_type: 'startup' | 'pro' | 'buyout';
  domain_requested?: string;
  industry_focus?: string;
  note?: string;
  status: 'NEW' | 'CONTACTED' | 'DEPLOYED' | 'CANCELLED';
  created_at: string;
}
