/**
 * ============================================================================
 * HỆ THỐNG ĐĂNG KÝ VÀ QUẢN LÝ CÁC MỤC TRANG CHỦ (HOMEPAGE SECTIONS REGISTRY)
 * ============================================================================
 * 
 * 📖 HƯỚNG DẪN THÊM MỤC MỚI VÀO TRANG CHỦ (EXTENSIBILITY GUIDE):
 * Để thêm một mục hiển thị mới trên trang chủ Web Khách trong tương lai:
 * 
 * 1. Chỉ cần thêm 1 object vào mảng `HOMEPAGE_SECTIONS_REGISTRY` dưới đây:
 *    {
 *      id: 'ma_dinh_danh_duy_nhat',      // Mã mục (chữ thường, gạch dưới, VD: 'game_reviews')
 *      nameVi: 'Đánh Giá & Nhận Xét',    // Tên tiếng Việt hiển thị trên Bảng Quản Trị
 *      nameEn: 'Game Reviews & Ratings', // Tên tiếng Anh hiển thị trên Bảng Quản Trị
 *      descriptionVi: 'Khối hiển thị đánh giá cộng đồng game thủ...', // Mô tả tiếng Việt
 *      descriptionEn: 'Community reviews and star ratings...',       // Mô tả tiếng Anh
 *      defaultEnabled: true,             // Trạng thái mặc định (true = Hiện, false = Ẩn)
 *      defaultOrder: 10,                 // Thứ tự hiển thị mặc định từ trên xuống dưới
 *      icon: 'Star',                     // Tên icon Lucide
 *    }
 * 
 * 2. HỆ THỐNG TỰ ĐỘNG XỬ LÝ:
 *    - Tự động sinh công tắc Bật/Tắt trong phân hệ "Hiển Thị Trang Chủ" ở Bảng Quản Trị.
 *    - Tự động sinh nút Di chuyển Lên/Xuống để sắp xếp vị trí hiển thị.
 *    - Tự động đồng bộ và lưu vào kho dữ liệu D1 Cloudflare (bảng system_settings).
 *    - Cung cấp hàm kiểm tra nhanh `isSectionEnabled(id)` và danh sách sắp xếp cho Web Khách.
 * 
 * 3. TRÊN WEB KHÁCH (ShopeeTestView / App):
 *    - Chỉ cần bọc component mới bằng điều kiện:
 *      {isSectionEnabled('game_reviews') && <GameReviewsComponent />}
 * ============================================================================
 */

export interface HomepageSectionDefinition {
  id: string;
  nameVi: string;
  nameEn: string;
  descriptionVi: string;
  descriptionEn: string;
  defaultEnabled: boolean;
  defaultOrder: number;
  icon: string;
}

export interface HomepageSectionState {
  id: string;
  enabled: boolean;
  order: number;
}

/**
 * Danh sách 9 mục trang chủ đợt đầu của sàn Universal Mall
 */
export const HOMEPAGE_SECTIONS_REGISTRY: readonly HomepageSectionDefinition[] = [
  {
    id: 'top_announcement',
    nameVi: 'Thanh thông báo trên cùng',
    nameEn: 'Top Announcement Bar',
    descriptionVi: 'Thanh thông báo ghim trên đỉnh trang web thông báo sự kiện, hotline và phiên bản sàn',
    descriptionEn: 'Top announcement bar pinned at the very top for campaigns, hotline, and mall status',
    defaultEnabled: true,
    defaultOrder: 1,
    icon: 'Megaphone',
  },
  {
    id: 'main_hero_banner',
    nameVi: 'Banner lớn',
    nameEn: 'Hero Banner Carousel',
    descriptionVi: 'Banner động dạng carousel trình chiếu các chiến dịch mua sắm nổi bật và ưu đãi lớn',
    descriptionEn: 'Dynamic hero carousel showcase for featured campaigns and headline promotions',
    defaultEnabled: true,
    defaultOrder: 2,
    icon: 'SlidersHorizontal',
  },
  {
    id: 'categories_grid',
    nameVi: 'Lưới danh mục',
    nameEn: 'Categories Grid',
    descriptionVi: 'Lưới icon danh mục các ngành hàng: Thời trang, Làm đẹp, Thiết bị số, Dịch vụ game...',
    descriptionEn: 'Grid of categories: Fashion, Beauty, Digital Tech, Services, and Gaming',
    defaultEnabled: true,
    defaultOrder: 3,
    icon: 'LayoutGrid',
  },
  {
    id: 'flash_sale',
    nameVi: 'Flash Sale',
    nameEn: 'Flash Sale',
    descriptionVi: 'Khối Flash Sale Giờ Vàng kèm đồng hồ đếm ngược và sản phẩm trợ giá sốc',
    descriptionEn: 'Golden Hour Flash Sale with real-time countdown timer and discounted items',
    defaultEnabled: true,
    defaultOrder: 4,
    icon: 'Flame',
  },
  {
    id: 'vouchers_section',
    nameVi: 'Mã giảm giá',
    nameEn: 'Vouchers & Discounts',
    descriptionVi: 'Khối hiển thị mã giảm giá Shopee đa tầng và voucher miễn phí vận chuyển sàn',
    descriptionEn: 'Multi-tier Shopee-style discount vouchers and freeship vouchers',
    defaultEnabled: true,
    defaultOrder: 5,
    icon: 'Ticket',
  },
  {
    id: 'games_and_codes',
    nameVi: 'Khu Vực Game & Code',
    nameEn: 'Game Zone & Giftcodes',
    descriptionVi: 'Danh mục game có bản quyền ABEI G1/G234, nhận giftcode miễn phí 0đ và thẻ game',
    descriptionEn: 'Licensed game catalog, free giftcodes, and digital game cards',
    defaultEnabled: true,
    defaultOrder: 6,
    icon: 'Gamepad2',
  },
  {
    id: 'news_section',
    nameVi: 'Tin tức',
    nameEn: 'News & Articles',
    descriptionVi: 'Chuyên mục tin tức game, cẩm nang nhập giftcode và bài viết chuẩn SEO',
    descriptionEn: 'Game news, giftcode guides, and SEO-optimized articles',
    defaultEnabled: true,
    defaultOrder: 7,
    icon: 'Newspaper',
  },
  {
    id: 'floating_notification',
    nameVi: 'Thông báo nổi sao chép giftcode',
    nameEn: 'Floating Giftcode Notification',
    descriptionVi: 'Widget thông báo góc màn hình kích thích tương tác và sao chép mã tự động',
    descriptionEn: 'Corner floating widget for copy tracking, live proof, and social notifications',
    defaultEnabled: true,
    defaultOrder: 8,
    icon: 'BellRing',
  },
  {
    id: 'footer',
    nameVi: 'Chân trang',
    nameEn: 'Footer',
    descriptionVi: 'Chân trang 4 cột: Về Universal Mall, Chuyên mục, Hỗ trợ & Pháp lý, Ngôn ngữ',
    descriptionEn: '4-column footer: About, Categories, Support & Legal, and Language selector',
    defaultEnabled: true,
    defaultOrder: 9,
    icon: 'PanelBottom',
  },
] as const;

/**
 * Danh sách ID hợp lệ phục vụ xác thực nhanh O(1)
 */
export const VALID_HOMEPAGE_SECTION_IDS = new Set(
  HOMEPAGE_SECTIONS_REGISTRY.map((sec) => sec.id)
);

/**
 * Trả về cấu hình mặc định ban đầu
 */
export function getDefaultHomepageSectionsState(): HomepageSectionState[] {
  return HOMEPAGE_SECTIONS_REGISTRY.map((sec) => ({
    id: sec.id,
    enabled: sec.defaultEnabled,
    order: sec.defaultOrder,
  }));
}

/**
 * Hợp nhất an toàn cấu hình đã lưu trong D1 với registry mã nguồn
 * Giữ nguyên thứ tự và trạng thái đã lưu; tự động bổ sung mục mới nếu registry có thêm
 */
export function mergeHomepageSectionsConfig(
  savedConfig: any
): HomepageSectionState[] {
  if (!Array.isArray(savedConfig) || savedConfig.length === 0) {
    return getDefaultHomepageSectionsState();
  }

  const savedMap = new Map<string, { enabled: boolean; order: number }>();
  savedConfig.forEach((item, index) => {
    if (item && typeof item.id === 'string' && VALID_HOMEPAGE_SECTION_IDS.has(item.id)) {
      savedMap.set(item.id, {
        enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
        order: typeof item.order === 'number' ? item.order : index + 1,
      });
    }
  });

  const result: HomepageSectionState[] = [];
  let maxOrder = 0;

  // 1. Nạp các mục đã lưu hợp lệ
  HOMEPAGE_SECTIONS_REGISTRY.forEach((def) => {
    const saved = savedMap.get(def.id);
    if (saved) {
      result.push({
        id: def.id,
        enabled: saved.enabled,
        order: saved.order,
      });
      if (saved.order > maxOrder) maxOrder = saved.order;
    } else {
      // 2. Mục mới chưa từng được lưu trong DB -> Tự động nạp vào cuối
      maxOrder += 1;
      result.push({
        id: def.id,
        enabled: def.defaultEnabled,
        order: maxOrder,
      });
    }
  });

  // Sắp xếp theo order tăng dần
  return result.sort((a, b) => a.order - b.order);
}

/**
 * Kiểm tra tính hợp lệ của dữ liệu khi quản trị viên gửi lệnh lưu
 */
export function validateHomepageSectionsPayload(body: any): {
  valid: boolean;
  error?: string;
  sanitized?: HomepageSectionState[];
} {
  const sections = Array.isArray(body) ? body : body?.sections;
  if (!Array.isArray(sections)) {
    return { valid: false, error: 'Dữ liệu gửi lên phải là danh sách các mục (Array).' };
  }

  const seenIds = new Set<string>();
  const sanitized: HomepageSectionState[] = [];

  for (let i = 0; i < sections.length; i++) {
    const item = sections[i];
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `Mục thứ ${i + 1} không đúng định dạng object.` };
    }

    const id = String(item.id || '').trim();
    if (!VALID_HOMEPAGE_SECTION_IDS.has(id)) {
      return { valid: false, error: `Mã mục "${id}" không tồn tại trong danh mục hệ thống.` };
    }

    if (seenIds.has(id)) {
      return { valid: false, error: `Phát hiện mục trùng lặp: "${id}".` };
    }
    seenIds.add(id);

    if (typeof item.enabled !== 'boolean') {
      return { valid: false, error: `Trạng thái hiện/ẩn của mục "${id}" bắt buộc là đúng/sai (boolean).` };
    }

    const order = typeof item.order === 'number' && !isNaN(item.order) ? Math.round(item.order) : i + 1;
    sanitized.push({
      id,
      enabled: item.enabled,
      order,
    });
  }

  // Đảm bảo không bỏ sót mục nào trong registry
  HOMEPAGE_SECTIONS_REGISTRY.forEach((def, idx) => {
    if (!seenIds.has(def.id)) {
      sanitized.push({
        id: def.id,
        enabled: def.defaultEnabled,
        order: sanitized.length + idx + 1,
      });
    }
  });

  // Chuẩn hóa lại thứ tự liên tục 1..N
  sanitized.sort((a, b) => a.order - b.order);
  sanitized.forEach((item, idx) => {
    item.order = idx + 1;
  });

  return { valid: true, sanitized };
}
