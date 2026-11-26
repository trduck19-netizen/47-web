const INVALID_TOKENS = new Set(['', 'undefined', 'null', 'nan', 'false']);

/**
 * Loại bỏ các URL rỗng hoặc bị dựng sai từ giá trị undefined/null
 * (ví dụ `/game_icons/undefined.webp`).
 */
export function sanitizeImageUrl(url?: string | null): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (INVALID_TOKENS.has(lower)) return '';
  if (
    lower.includes('/game_icons/undefined.webp') ||
    lower.includes('/game_icons/null.webp') ||
    lower.includes('/game_icons/.webp')
  ) {
    return '';
  }
  return trimmed;
}

/**
 * Chỉ dựng `/game_icons/${slug}.webp` khi slug là chuỗi hợp lệ;
 * ngược lại trả trực tiếp fallback để không bao giờ phát sinh URL chứa "undefined".
 */
export function safeGameIconUrl(
  slug?: string | null,
  fallback: string = '/package-placeholder.svg'
): string {
  if (typeof slug !== 'string') return fallback;
  const clean = slug.trim();
  if (!clean || INVALID_TOKENS.has(clean.toLowerCase())) {
    return fallback;
  }
  return `/game_icons/${clean}.webp`;
}

/**
 * Phân giải ảnh bìa chuẩn cho mọi object sản phẩm (từ sync-lite, /api/products, hoặc localStorage).
 * Ưu tiên ảnh thật đã làm sạch -> fallback `/game_icons/physical-default.webp` cho hàng vật lý -> safeGameIconUrl.
 */
export function resolveProductCoverImage(
  product: any,
  fallback: string = '/package-placeholder.svg'
): string {
  if (!product || typeof product !== 'object') return fallback;

  const isPhysical = product.product_type === 'physical';
  const candidates = [
    product.cover_image_url,
    Array.isArray(product.product_images) ? product.product_images[0] : '',
    product.thumbnail_url,
    Array.isArray(product.images) ? product.images[0] : '',
    product.game_icon_url,
    product.icon_url,
    product.image_url,
  ];

  for (const candidate of candidates) {
    const clean = sanitizeImageUrl(candidate);
    if (clean) return clean;
  }

  if (isPhysical) {
    return '/game_icons/physical-default.webp';
  }

  return safeGameIconUrl(product.game_slug, fallback);
}
