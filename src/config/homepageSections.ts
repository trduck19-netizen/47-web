/**
 * ============================================================================
 * HỆ THỐNG ĐĂNG KÝ VÀ QUẢN LÝ CÁC MỤC TRANG CHỦ & MỤC CON (HOMEPAGE SECTIONS & SUBSECTIONS REGISTRY)
 * ============================================================================
 * 
 * 📖 HƯỚNG DẪN THÊM MỤC LỚN HOẶC MỤC CON MỚI VÀO TRANG CHỦ (EXTENSIBILITY GUIDE):
 * 
 * 1. THÊM MỤC LỚN MỚI (MAJOR SECTION):
 *    - Thêm 1 object vào mảng `HOMEPAGE_SECTIONS_REGISTRY` bên dưới:
 *      {
 *        id: 'ten_ma_muc',
 *        nameVi: 'Tên Tiếng Việt',
 *        nameEn: 'English Name',
 *        descriptionVi: 'Mô tả 1 câu về chức năng và vị trí...',
 *        descriptionEn: 'One sentence description of function and position...',
 *        defaultEnabled: true,
 *        defaultOrder: 10,
 *        icon: 'LayoutGrid',
 *      }
 * 
 * 2. THÊM MỤC CON MỚI (SUBSECTION):
 *    - Thêm 1 object vào mảng `HOMEPAGE_SUBSECTIONS_REGISTRY` bên dưới:
 *      {
 *        id: 'shortcut_zalo_support',             // Mã định danh mục con duy nhất
 *        parentId: 'categories_grid',             // Mã mục lớn chứa mục con này
 *        group: 'shortcuts',                      // Nhóm phân loại (navigation | shortcuts | categories | sorting)
 *        groupNameVi: 'Hàng Lối Tắt',             // Tên nhóm tiếng Việt
 *        groupNameEn: 'Quick Shortcuts',          // Tên nhóm tiếng Anh
 *        nameVi: 'Hỗ Trợ Zalo',                   // Tên hiển thị tiếng Việt
 *        nameEn: 'Zalo Support',                  // Tên hiển thị tiếng Anh
 *        descriptionVi: 'Lối tắt kết nối chat tư vấn Zalo...', // Mô tả tiếng Việt
 *        descriptionEn: 'Shortcut to Zalo consultation...',    // Mô tả tiếng Anh
 *        defaultEnabled: true,                    // Trạng thái mặc định (true = Hiện, false = Ẩn)
 *        defaultOrder: 9,                         // Thứ tự mặc định trong nhóm của nó
 *        icon: 'MessageCircle',                   // Icon đại diện
 *      }
 * 
 * 3. HỆ THỐNG TỰ ĐỘNG XỬ LÝ (ZERO CODE BACKEND/ADMIN):
 *    - Tự động sinh công tắc Bật/Tắt riêng cho mục con trong bảng quản trị (mục lớn mở rộng ra).
 *    - Tự động sinh nút Di chuyển Lên/Xuống sắp xếp thứ tự trong nhóm của nó.
 *    - Tự động lưu và đồng bộ qua API và D1 (bảng system_settings, khóa homepage_sections).
 *    - Tự động tuân theo quy tắc: tắt mục lớn thì ẩn cả cụm mục con, bật mục lớn thì chỉ hiện mục con đang bật.
 * 
 * 4. TRÊN WEB KHÁCH (ShopeeTestView / App):
 *    - Bọc component mục con bằng điều kiện:
 *      {isSubsectionEnabled('categories_grid', 'shortcut_zalo_support') && <ZaloSupportShortcut />}
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
  // Trường mở rộng tùy chỉnh (Đợt 1/3 & 2/3)
  internal_name?: string;
  title_vi?: string;
  title_en?: string;
  link_url?: string;
  link_type?: 'internal' | 'system' | 'external';
  link_target?: '_self' | '_blank';
  description_vi?: string;
  description_en?: string;
  badge_vi?: string;
  badge_en?: string;
  image_url?: string;
  image_alt_vi?: string;
  image_alt_en?: string;
  image_compression_status?: 'uncompressed' | 'compressing' | 'compressed' | 'original_fallback' | 'failed';
  image_original_size?: number;
  image_compressed_size?: number;
  image_compression_error?: string;
}

export interface HomepageSubsectionDefinition {
  id: string;
  parentId: string;
  group: 'navigation' | 'shortcuts' | 'categories' | 'sorting' | string;
  groupNameVi: string;
  groupNameEn: string;
  nameVi: string;
  nameEn: string;
  descriptionVi: string;
  descriptionEn: string;
  defaultEnabled: boolean;
  defaultOrder: number;
  icon?: string;
  // Trường mở rộng tùy chỉnh
  internal_name?: string;
  title_vi?: string;
  title_en?: string;
  link_url?: string;
  link_type?: 'internal' | 'system' | 'external';
  link_target?: '_self' | '_blank';
  description_vi?: string;
  description_en?: string;
  badge_vi?: string;
  badge_en?: string;
  is_custom?: boolean;
  // Trường ảnh mở rộng (Đợt 2/3 - Nhóm 1)
  image_url?: string;
  image_alt_vi?: string;
  image_alt_en?: string;
  image_compression_status?: 'uncompressed' | 'compressing' | 'compressed' | 'original_fallback' | 'failed';
  image_original_size?: number;
  image_compressed_size?: number;
  image_compression_error?: string;
}

export interface HomepageSubsectionState {
  id: string;
  parentId: string;
  group: string;
  enabled: boolean;
  order: number;
  nameVi?: string;
  nameEn?: string;
  descriptionVi?: string;
  descriptionEn?: string;
  groupNameVi?: string;
  groupNameEn?: string;
  icon?: string;
  // Trường mở rộng tùy chỉnh (Nhóm 1)
  internal_name?: string;
  title_vi?: string;
  title_en?: string;
  link_url?: string;
  link_type?: 'internal' | 'system' | 'external';
  link_target?: '_self' | '_blank';
  description_vi?: string;
  description_en?: string;
  badge_vi?: string;
  badge_en?: string;
  is_custom?: boolean;
  // Trường ảnh mở rộng (Đợt 2/3 - Nhóm 1)
  image_url?: string;
  image_alt_vi?: string;
  image_alt_en?: string;
  image_compression_status?: 'uncompressed' | 'compressing' | 'compressed' | 'original_fallback' | 'failed';
  image_original_size?: number;
  image_compressed_size?: number;
  image_compression_error?: string;
}

export type HomepageSubsectionConfig = HomepageSubsectionState & Partial<HomepageSubsectionDefinition>;

export interface HomepageSectionState {
  id: string;
  enabled: boolean;
  order: number;
  nameVi?: string;
  nameEn?: string;
  descriptionVi?: string;
  descriptionEn?: string;
  icon?: string;
  subsections?: HomepageSubsectionState[];
  // Trường mở rộng tùy chỉnh (Nhóm 1)
  internal_name?: string;
  title_vi?: string;
  title_en?: string;
  link_url?: string;
  link_type?: 'internal' | 'system' | 'external';
  link_target?: '_self' | '_blank';
  description_vi?: string;
  description_en?: string;
  badge_vi?: string;
  badge_en?: string;
  // Trường ảnh mở rộng (Đợt 2/3 - Nhóm 1)
  image_url?: string;
  image_alt_vi?: string;
  image_alt_en?: string;
  image_compression_status?: 'uncompressed' | 'compressing' | 'compressed' | 'original_fallback' | 'failed';
  image_original_size?: number;
  image_compressed_size?: number;
  image_compression_error?: string;
}

export type HomepageSectionConfig = HomepageSectionState & Partial<HomepageSectionDefinition> & {
  subsections?: HomepageSubsectionConfig[];
};

/**
 * Danh sách 9 mục trang chủ đợt đầu của sàn Universal Mall
 */
export const HOMEPAGE_SECTIONS_REGISTRY: readonly HomepageSectionDefinition[] = [
  {
    id: 'top_announcement',
    nameVi: 'Thanh thông báo trên cùng',
    nameEn: 'Top Announcement Bar',
    descriptionVi: 'Thanh cảnh báo ghim trên đỉnh trang web khách, thông báo các chương trình ưu đãi, hotline CSKH và trạng thái sàn.',
    descriptionEn: 'Announcement bar pinned at the very top of the storefront, displaying promotional notices, hotline, and mall status.',
    defaultEnabled: true,
    defaultOrder: 1,
    icon: 'Megaphone',
  },
  {
    id: 'main_hero_banner',
    nameVi: 'Banner lớn',
    nameEn: 'Hero Banner Carousel',
    descriptionVi: 'Khối banner chuyển động nằm ngay dưới thanh tìm kiếm, quảng bá các chiến dịch mua sắm nổi bật và ưu đãi lớn.',
    descriptionEn: 'Hero banner carousel located directly below the search bar, highlighting headline shopping campaigns and major deals.',
    defaultEnabled: true,
    defaultOrder: 2,
    icon: 'SlidersHorizontal',
  },
  {
    id: 'categories_grid',
    nameVi: 'Lưới danh mục',
    nameEn: 'Categories Grid',
    descriptionVi: 'Lưới danh mục nằm ngay sau banner chính, hỗ trợ điều hướng nhanh đến các ngành hàng thời trang, mỹ phẩm và đồ số.',
    descriptionEn: 'Category grid situated directly below the hero banner, providing quick navigation to fashion, beauty, and digital goods.',
    defaultEnabled: true,
    defaultOrder: 3,
    icon: 'LayoutGrid',
  },
  {
    id: 'flash_sale',
    nameVi: 'Flash Sale',
    nameEn: 'Flash Sale',
    descriptionVi: 'Khu vực Giờ Vàng nằm giữa trang chủ, đếm ngược thời gian thực và giới thiệu các sản phẩm trợ giá sốc.',
    descriptionEn: 'Flash sale section positioned in the center of the homepage, featuring real-time countdown and heavily discounted products.',
    defaultEnabled: true,
    defaultOrder: 4,
    icon: 'Flame',
  },
  {
    id: 'vouchers_section',
    nameVi: 'Mã giảm giá',
    nameEn: 'Vouchers & Discounts',
    descriptionVi: 'Khối biểu ngữ nằm tiếp sau Flash Sale, tổng hợp kho voucher Shopee đa tầng và mã miễn phí vận chuyển toàn sàn.',
    descriptionEn: 'Voucher promotional banner located after Flash Sale, featuring multi-tier platform vouchers and freeship coupon codes.',
    defaultEnabled: true,
    defaultOrder: 5,
    icon: 'Ticket',
  },
  {
    id: 'games_and_codes',
    nameVi: 'Khu Vực Game & Code',
    nameEn: 'Game Zone & Giftcodes',
    descriptionVi: 'Kệ hàng đa ngành nằm tại thân trang, phân loại sản phẩm vật lý, tài khoản số và danh mục Game Zone có bản quyền.',
    descriptionEn: 'Multi-industry merchandise showcase in the page body, categorizing physical goods, digital accounts, and licensed games.',
    defaultEnabled: true,
    defaultOrder: 6,
    icon: 'Gamepad2',
  },
  {
    id: 'news_section',
    nameVi: 'Tin tức',
    nameEn: 'News & Articles',
    descriptionVi: 'Khối tin tức nằm gần chân trang, cập nhật các bài viết sự kiện, tin tức game và cẩm nang mua sắm mới nhất.',
    descriptionEn: 'Featured news section positioned near the footer, highlighting event updates, gaming articles, and shopping guides.',
    defaultEnabled: true,
    defaultOrder: 7,
    icon: 'Newspaper',
  },
  {
    id: 'floating_notification',
    nameVi: 'Thông báo nổi sao chép giftcode',
    nameEn: 'Floating Giftcode Notification',
    descriptionVi: 'Cửa sổ thông báo ghim tại góc dưới màn hình, hiển thị đơn hàng thành công theo thời gian thực và hỗ trợ sao chép mã nhanh.',
    descriptionEn: 'Floating popup pinned to the corner of the screen, showcasing real-time order alerts and enabling quick code copying.',
    defaultEnabled: true,
    defaultOrder: 8,
    icon: 'BellRing',
  },
  {
    id: 'footer',
    nameVi: 'Chân trang',
    nameEn: 'Footer',
    descriptionVi: 'Khối chân trang ghim ở đáy website, chứa thông tin pháp lý sàn, chính sách bảo chứng giao dịch và liên hệ hỗ trợ.',
    descriptionEn: 'Four-column footer anchored at the bottom of the page, presenting platform credentials, escrow policy, and support links.',
    defaultEnabled: true,
    defaultOrder: 9,
    icon: 'PanelBottom',
  },
] as const;

/**
 * Danh sách 24 mục con đợt đầu của sàn Universal Mall
 */
export const HOMEPAGE_SUBSECTIONS_REGISTRY: readonly HomepageSubsectionDefinition[] = [
  // ==========================================================================
  // NHÓM 1: THANH ĐIỀU HƯỚNG TRÊN CÙNG (9 MỤC CON - Parent: top_announcement)
  // ==========================================================================
  {
    id: 'nav_home',
    parentId: 'top_announcement',
    group: 'navigation',
    groupNameVi: 'Thanh Điều Hướng',
    groupNameEn: 'Navigation Bar',
    nameVi: 'Trang Chủ Sàn',
    nameEn: 'Mall Home',
    descriptionVi: 'Nút điều hướng về trang chủ sàn thương mại điện tử Universal Mall.',
    descriptionEn: 'Navigation link to Universal Mall marketplace homepage.',
    defaultEnabled: true,
    defaultOrder: 1,
    icon: 'Store',
  },
  {
    id: 'nav_store',
    parentId: 'top_announcement',
    group: 'navigation',
    groupNameVi: 'Thanh Điều Hướng',
    groupNameEn: 'Navigation Bar',
    nameVi: 'Cửa Hàng Đa Ngành',
    nameEn: 'Multi-Industry Store',
    descriptionVi: 'Nút mở danh mục các gian hàng và sản phẩm chính hãng toàn sàn.',
    descriptionEn: 'Navigation link to multi-industry official stores and products.',
    defaultEnabled: true,
    defaultOrder: 2,
    icon: 'ShoppingBag',
  },
  {
    id: 'nav_seller',
    parentId: 'top_announcement',
    group: 'navigation',
    groupNameVi: 'Thanh Điều Hướng',
    groupNameEn: 'Navigation Bar',
    nameVi: 'Kênh Người Bán',
    nameEn: 'Seller Center',
    descriptionVi: 'Nút truy cập cổng quản trị gian hàng và mở bán hàng dành cho đối tác.',
    descriptionEn: 'Portal access for seller management and vendor onboarding.',
    defaultEnabled: true,
    defaultOrder: 3,
    icon: 'Store',
  },
  {
    id: 'nav_account',
    parentId: 'top_announcement',
    group: 'navigation',
    groupNameVi: 'Thanh Điều Hướng',
    groupNameEn: 'Navigation Bar',
    nameVi: 'Tài Khoản & Ví',
    nameEn: 'Account & Wallet',
    descriptionVi: 'Nút mở hồ sơ cá nhân, số dư ví Core và lịch sử giao dịch.',
    descriptionEn: 'Access user profile, Core wallet balance, and transaction history.',
    defaultEnabled: true,
    defaultOrder: 4,
    icon: 'User',
  },
  {
    id: 'nav_game_zone',
    parentId: 'top_announcement',
    group: 'navigation',
    groupNameVi: 'Thanh Điều Hướng',
    groupNameEn: 'Navigation Bar',
    nameVi: 'Game Zone',
    nameEn: 'Game Zone',
    descriptionVi: 'Nút chuyển nhanh sang phân khu 593 tựa game có giấy phép ABEI.',
    descriptionEn: 'Quick link to the licensed 593-game portal and game catalog.',
    defaultEnabled: true,
    defaultOrder: 5,
    icon: 'Sparkles',
  },
  {
    id: 'nav_missions',
    parentId: 'top_announcement',
    group: 'navigation',
    groupNameVi: 'Thanh Điều Hướng',
    groupNameEn: 'Navigation Bar',
    nameVi: 'Nhiệm Vụ',
    nameEn: 'Missions',
    descriptionVi: 'Nút mở trung tâm nhiệm vụ điểm danh và săn thưởng Core hàng ngày.',
    descriptionEn: 'Daily check-in quests and Core reward center.',
    defaultEnabled: true,
    defaultOrder: 6,
    icon: 'Trophy',
  },
  {
    id: 'nav_telegram',
    parentId: 'top_announcement',
    group: 'navigation',
    groupNameVi: 'Thanh Điều Hướng',
    groupNameEn: 'Navigation Bar',
    nameVi: 'Telegram',
    nameEn: 'Telegram',
    descriptionVi: 'Nút kết nối cộng đồng game thủ và kênh nhận thông báo bot Telegram.',
    descriptionEn: 'Connect to Telegram gaming community and instant notification bot.',
    defaultEnabled: true,
    defaultOrder: 7,
    icon: 'Send',
  },
  {
    id: 'nav_a_z',
    parentId: 'top_announcement',
    group: 'navigation',
    groupNameVi: 'Thanh Điều Hướng',
    groupNameEn: 'Navigation Bar',
    nameVi: 'Mục Lục A-Z',
    nameEn: 'A-Z Index',
    descriptionVi: 'Nút tra cứu danh bạ toàn bộ tựa game theo bảng chữ cái A-Z.',
    descriptionEn: 'Comprehensive alphabetical directory of all licensed games.',
    defaultEnabled: true,
    defaultOrder: 8,
    icon: 'List',
  },
  {
    id: 'nav_submit_code',
    parentId: 'top_announcement',
    group: 'navigation',
    groupNameVi: 'Thanh Điều Hướng',
    groupNameEn: 'Navigation Bar',
    nameVi: 'Gửi Mã Mới',
    nameEn: 'Submit Code',
    descriptionVi: 'Nút mở cửa sổ gửi giftcode cộng đồng đóng góp nhận thưởng.',
    descriptionEn: 'Action button to contribute community giftcodes and earn rewards.',
    defaultEnabled: true,
    defaultOrder: 9,
    icon: 'Plus',
  },

  // ==========================================================================
  // NHÓM 2: HÀNG LỐI TẮT DỊCH VỤ (8 MỤC CON - Parent: categories_grid)
  // ==========================================================================
  {
    id: 'shortcut_instant_delivery',
    parentId: 'categories_grid',
    group: 'shortcuts',
    groupNameVi: 'Hàng Lối Tắt',
    groupNameEn: 'Quick Shortcuts',
    nameVi: 'Giao Mã 0s',
    nameEn: 'Instant Delivery 0s',
    descriptionVi: 'Lối tắt mở tủ mã cá nhân và xem các đơn hàng giao mã tự động tức thì.',
    descriptionEn: 'Quick shortcut to view auto-delivered digital codes and orders.',
    defaultEnabled: true,
    defaultOrder: 1,
    icon: 'Zap',
  },
  {
    id: 'shortcut_courier_shipping',
    parentId: 'categories_grid',
    group: 'shortcuts',
    groupNameVi: 'Hàng Lối Tắt',
    groupNameEn: 'Quick Shortcuts',
    nameVi: 'Giao Bưu Chính',
    nameEn: 'Courier Shipping',
    descriptionVi: 'Lối tắt cuộn nhanh xuống danh mục hàng vật lý vận chuyển bưu điện.',
    descriptionEn: 'Quick shortcut scrolling down to physical courier-shipped goods.',
    defaultEnabled: true,
    defaultOrder: 2,
    icon: 'Truck',
  },
  {
    id: 'shortcut_protection_168h',
    parentId: 'categories_grid',
    group: 'shortcuts',
    groupNameVi: 'Hàng Lối Tắt',
    groupNameEn: 'Quick Shortcuts',
    nameVi: 'Bảo Hộ 168H',
    nameEn: '168H Protection',
    descriptionVi: 'Lối tắt mở chính sách ký quỹ bảo hiểm giao dịch an toàn 7 ngày.',
    descriptionEn: 'Shortcut to 7-day escrow protection and trade insurance policy.',
    defaultEnabled: true,
    defaultOrder: 3,
    icon: 'ShieldCheck',
  },
  {
    id: 'shortcut_vietqr_topup',
    parentId: 'categories_grid',
    group: 'shortcuts',
    groupNameVi: 'Hàng Lối Tắt',
    groupNameEn: 'Quick Shortcuts',
    nameVi: 'Nạp VietQR',
    nameEn: 'VietQR Topup',
    descriptionVi: 'Lối tắt mở cửa sổ nạp tiền tự động qua mã VietQR chuẩn ngân hàng.',
    descriptionEn: 'Quick shortcut to bank transfer topup via standard VietQR.',
    defaultEnabled: true,
    defaultOrder: 4,
    icon: 'CreditCard',
  },
  {
    id: 'shortcut_lucky_wheel',
    parentId: 'categories_grid',
    group: 'shortcuts',
    groupNameVi: 'Hàng Lối Tắt',
    groupNameEn: 'Quick Shortcuts',
    nameVi: 'Vòng Quay Xu',
    nameEn: 'Lucky Wheel',
    descriptionVi: 'Lối tắt tham gia vòng quay may mắn trúng xu Core và quà tặng sàn.',
    descriptionEn: 'Shortcut to lucky spin wheel for winning Core coins and prizes.',
    defaultEnabled: true,
    defaultOrder: 5,
    icon: 'CircleDot',
  },
  {
    id: 'shortcut_vouchers',
    parentId: 'categories_grid',
    group: 'shortcuts',
    groupNameVi: 'Hàng Lối Tắt',
    groupNameEn: 'Quick Shortcuts',
    nameVi: 'Mã Giảm Giá',
    nameEn: 'Vouchers & Coupons',
    descriptionVi: 'Lối tắt mở kho voucher Shopee đa tầng và mã giảm giá toàn sàn.',
    descriptionEn: 'Shortcut to platform coupon vault and multi-tier discount vouchers.',
    defaultEnabled: true,
    defaultOrder: 6,
    icon: 'Ticket',
  },
  {
    id: 'shortcut_game_zone',
    parentId: 'categories_grid',
    group: 'shortcuts',
    groupNameVi: 'Hàng Lối Tắt',
    groupNameEn: 'Quick Shortcuts',
    nameVi: 'Game Zone',
    nameEn: 'Game Zone',
    descriptionVi: 'Lối tắt chuyển vào khu vực game bản quyền và săn giftcode miễn phí.',
    descriptionEn: 'Shortcut to licensed game portal and free giftcode giveaways.',
    defaultEnabled: true,
    defaultOrder: 7,
    icon: 'Gamepad2',
  },
  {
    id: 'shortcut_support_247',
    parentId: 'categories_grid',
    group: 'shortcuts',
    groupNameVi: 'Hàng Lối Tắt',
    groupNameEn: 'Quick Shortcuts',
    nameVi: 'Hỗ Trợ 24/7',
    nameEn: '24/7 Support',
    descriptionVi: 'Lối tắt mở kênh liên hệ chăm sóc khách hàng và giải quyết khiếu nại.',
    descriptionEn: 'Shortcut to 24/7 customer care and dispute resolution hotline.',
    defaultEnabled: true,
    defaultOrder: 8,
    icon: 'Headphones',
  },

  // ==========================================================================
  // NHÓM 3: TAB NGÀNH HÀNG TOÀN SÀN (6 MỤC CON - Parent: categories_grid)
  // ==========================================================================
  {
    id: 'cat_all',
    parentId: 'categories_grid',
    group: 'categories',
    groupNameVi: 'Tab Ngành Hàng',
    groupNameEn: 'Category Tabs',
    nameVi: 'Tất Cả',
    nameEn: 'All Categories',
    descriptionVi: 'Tab hiển thị toàn bộ các sản phẩm thuộc mọi ngành hàng trên sàn.',
    descriptionEn: 'Category tab displaying all products across all mall industries.',
    defaultEnabled: true,
    defaultOrder: 1,
    icon: 'Package',
  },
  {
    id: 'cat_fashion',
    parentId: 'categories_grid',
    group: 'categories',
    groupNameVi: 'Tab Ngành Hàng',
    groupNameEn: 'Category Tabs',
    nameVi: 'Thời Trang & Phụ Kiện',
    nameEn: 'Fashion & Accessories',
    descriptionVi: 'Tab lọc các sản phẩm áo quần, giày dép, túi xách và phụ kiện nam nữ.',
    descriptionEn: 'Filter tab for apparel, footwear, bags, and fashion accessories.',
    defaultEnabled: true,
    defaultOrder: 2,
    icon: 'Shirt',
  },
  {
    id: 'cat_beauty',
    parentId: 'categories_grid',
    group: 'categories',
    groupNameVi: 'Tab Ngành Hàng',
    groupNameEn: 'Category Tabs',
    nameVi: 'Mỹ Phẩm & Sắc Đẹp',
    nameEn: 'Beauty & Cosmetics',
    descriptionVi: 'Tab lọc các sản phẩm chăm sóc da mặt, trang điểm và nước hoa cao cấp.',
    descriptionEn: 'Filter tab for skincare, cosmetics, and premium perfumes.',
    defaultEnabled: true,
    defaultOrder: 3,
    icon: 'Sparkles',
  },
  {
    id: 'cat_tech',
    parentId: 'categories_grid',
    group: 'categories',
    groupNameVi: 'Tab Ngành Hàng',
    groupNameEn: 'Category Tabs',
    nameVi: 'Thiết Bị Số & Công Nghệ',
    nameEn: 'Digital Tech & Gadgets',
    descriptionVi: 'Tab lọc các thiết bị điện thoại, cáp sạc, tai nghe và phụ kiện máy tính.',
    descriptionEn: 'Filter tab for mobile devices, charging gear, audio, and PC peripherals.',
    defaultEnabled: true,
    defaultOrder: 4,
    icon: 'Smartphone',
  },
  {
    id: 'cat_services',
    parentId: 'categories_grid',
    group: 'categories',
    groupNameVi: 'Tab Ngành Hàng',
    groupNameEn: 'Category Tabs',
    nameVi: 'Khóa Học & Dịch Vụ',
    nameEn: 'Courses & Services',
    descriptionVi: 'Tab lọc các khóa học trực tuyến, tài khoản phần mềm và dịch vụ số.',
    descriptionEn: 'Filter tab for online courses, software licenses, and digital services.',
    defaultEnabled: true,
    defaultOrder: 5,
    icon: 'GraduationCap',
  },
  {
    id: 'cat_gaming',
    parentId: 'categories_grid',
    group: 'categories',
    groupNameVi: 'Tab Ngành Hàng',
    groupNameEn: 'Category Tabs',
    nameVi: 'Gaming & Thẻ Nạp',
    nameEn: 'Gaming & Recharge',
    descriptionVi: 'Tab lọc các sản phẩm thẻ cào game, tài khoản VIP và vật phẩm game.',
    descriptionEn: 'Filter tab for gaming recharge cards, VIP accounts, and game items.',
    defaultEnabled: true,
    defaultOrder: 6,
    icon: 'Gamepad2',
  },

  // ==========================================================================
  // NHÓM 4: THANH SẮP XẾP SẢN PHẨM (1 MỤC CON - Parent: categories_grid)
  // ==========================================================================
  {
    id: 'sort_bar',
    parentId: 'categories_grid',
    group: 'sorting',
    groupNameVi: 'Thanh Sắp Xếp',
    groupNameEn: 'Sorting Bar',
    nameVi: 'Thanh Sắp Xếp (Mới nhất / Bán chạy)',
    nameEn: 'Sorting Bar (Newest / Best Selling)',
    descriptionVi: 'Cụm nút chuyển đổi thứ tự sắp xếp sản phẩm theo Mới nhất hoặc Bán chạy nhất.',
    descriptionEn: 'Toggle controls for sorting products by Newest arrival or Best Selling.',
    defaultEnabled: true,
    defaultOrder: 1,
    icon: 'ArrowUpDown',
  },
] as const;

/**
 * Danh sách ID hợp lệ phục vụ xác thực nhanh O(1)
 */
export const VALID_HOMEPAGE_SECTION_IDS = new Set<string>(
  HOMEPAGE_SECTIONS_REGISTRY.map((sec) => sec.id)
);

export const VALID_HOMEPAGE_SUBSECTION_IDS = new Set<string>(
  HOMEPAGE_SUBSECTIONS_REGISTRY.map((sub) => sub.id)
);

/**
 * Trả về danh sách mục con mặc định cho một mục lớn
 */
export function getDefaultSubsectionsForParent(parentId: string): HomepageSubsectionConfig[] {
  return HOMEPAGE_SUBSECTIONS_REGISTRY
    .filter((sub) => sub.parentId === parentId)
    .map((sub) => ({
      ...sub,
      enabled: sub.defaultEnabled,
      order: sub.defaultOrder,
    }))
    .sort((a, b) => a.order - b.order);
}

/**
 * Trả về cấu hình mặc định ban đầu đầy đủ (bao gồm cả mục lớn và mục con)
 */
export function getDefaultHomepageSectionsState(): HomepageSectionConfig[] {
  return HOMEPAGE_SECTIONS_REGISTRY.map((sec) => ({
    ...sec,
    enabled: sec.defaultEnabled,
    order: sec.defaultOrder,
    subsections: getDefaultSubsectionsForParent(sec.id),
  }));
}

/**
 * Danh sách trang hệ thống có sẵn phục vụ việc chọn nhanh (Khỏi gõ tay sai)
 */
export interface SystemPageOption {
  value: string;
  labelVi: string;
  labelEn: string;
  category: 'core' | 'catalog' | 'services' | 'account' | 'legal';
}

export const SYSTEM_PAGE_OPTIONS: readonly SystemPageOption[] = [
  { value: '/', labelVi: 'Trang Chủ Sàn (Universal Mall)', labelEn: 'Mall Homepage', category: 'core' },
  { value: '/store', labelVi: 'Cửa Hàng Đa Ngành Chính Hãng', labelEn: 'Multi-Industry Store', category: 'core' },
  { value: '/seller-center', labelVi: 'Kênh Người Bán (Seller Center)', labelEn: 'Seller Center Portal', category: 'core' },
  { value: '/game', labelVi: 'Game Zone (593 Game Bản Quyền)', labelEn: 'Game Zone Portal', category: 'catalog' },
  { value: '/news', labelVi: 'Tin Tức & Bài Viết', labelEn: 'News & Articles', category: 'catalog' },
  { value: '/giveaways', labelVi: 'Giveaways & Quà Tặng VIP', labelEn: 'VIP Giveaways', category: 'catalog' },
  { value: '/utilities', labelVi: 'Kho Tiện Ích & Dịch Vụ Số', labelEn: 'Digital Utilities', category: 'services' },
  { value: '/missions', labelVi: 'Trung Tâm Nhiệm Vụ & Điểm Danh', labelEn: 'Mission Center', category: 'services' },
  { value: '/telegram', labelVi: 'Cộng Đồng Telegram & Bot Alert', labelEn: 'Telegram Community', category: 'services' },
  { value: '#/profile', labelVi: 'Hồ Sơ Cá Nhân & Số Dư Ví', labelEn: 'User Profile & Wallet', category: 'account' },
  { value: '#/orders', labelVi: 'Đơn Hàng & Tủ Mã Cá Nhân (Giao 0s)', labelEn: 'My Orders & Vault (0s)', category: 'account' },
  { value: '#/vouchers', labelVi: 'Kho Mã Giảm Giá & Freeship', labelEn: 'Voucher & Freeship Vault', category: 'services' },
  { value: '#/spin', labelVi: 'Vòng Quay Xu May Mắn', labelEn: 'Lucky Wheel Spin', category: 'services' },
  { value: '#/guarantee', labelVi: 'Bảo Chứng Giao Dịch Sàn 168 Giờ', labelEn: '168H Escrow Protection', category: 'legal' },
  { value: '#/terms', labelVi: 'Điều Khoản Dịch Vụ', labelEn: 'Terms of Service', category: 'legal' },
  { value: '#/privacy', labelVi: 'Chính Sách Bảo Mật Thông Tin', labelEn: 'Privacy Policy', category: 'legal' },
];

const VALID_INTERNAL_PREFIXES = [
  '/',
  '/store',
  '/seller-center',
  '/game',
  '/news',
  '/giveaways',
  '/utilities',
  '/missions',
  '/telegram',
  '#/profile',
  '#/orders',
  '#/vouchers',
  '#/spin',
  '#/guarantee',
  '#/terms',
  '#/privacy',
  '#/cart',
  '#/security',
  '#/help',
  '/download',
  '/auth',
  '/admin',
];

/**
 * Kiểm tra tính hợp lệ của đường dẫn liên kết
 */
export function validateLinkUrl(url?: string, type: 'internal' | 'system' | 'external' = 'internal'): {
  valid: boolean;
  warning?: string;
  isUnknownRoute?: boolean;
} {
  if (!url || !url.trim()) return { valid: true };
  const trimmed = url.trim();
  if (type === 'external') {
    if (!/^https?:\/\//i.test(trimmed)) {
      return { valid: false, warning: 'Link ngoài phải bắt đầu bằng http:// hoặc https://' };
    }
    return { valid: true };
  }
  if (type === 'internal' || type === 'system') {
    if (!trimmed.startsWith('/') && !trimmed.startsWith('#')) {
      return { valid: false, warning: 'Link nội bộ phải bắt đầu bằng "/" hoặc "#"' };
    }
    const isKnownSystemPage = SYSTEM_PAGE_OPTIONS.some((opt) => opt.value === trimmed);
    const matchesPrefix = VALID_INTERNAL_PREFIXES.some((prefix) =>
      prefix === '/' ? trimmed === '/' : trimmed.startsWith(prefix)
    );
    if (!isKnownSystemPage && !matchesPrefix) {
      return {
        valid: true,
        warning: 'Trang nội bộ này có thể chưa tồn tại trên hệ thống. Vui lòng kiểm tra lại đường dẫn.',
        isUnknownRoute: true,
      };
    }
    return { valid: true };
  }
  return { valid: true };
}

/**
 * Hợp nhất an toàn cấu hình mục con đã lưu trong D1 với registry mã nguồn
 * Bảo toàn các trường mở rộng và hỗ trợ các mục con tự thêm (is_custom: true)
 */
export function mergeSubsectionsConfig(
  parentId: string,
  savedSubsections: any
): HomepageSubsectionConfig[] {
  const registeredDefs = HOMEPAGE_SUBSECTIONS_REGISTRY.filter((s) => s.parentId === parentId);

  if (!Array.isArray(savedSubsections) || savedSubsections.length === 0) {
    return getDefaultSubsectionsForParent(parentId);
  }

  const savedMap = new Map<string, any>();
  const customItems: HomepageSubsectionConfig[] = [];

  savedSubsections.forEach((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string') return;
    const isCustom = Boolean(item.is_custom || item.id.startsWith('custom_') || !VALID_HOMEPAGE_SUBSECTION_IDS.has(item.id));

    if (VALID_HOMEPAGE_SUBSECTION_IDS.has(item.id) && !isCustom) {
      savedMap.set(item.id, {
        enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
        order: typeof item.order === 'number' ? item.order : index + 1,
        internal_name: item.internal_name,
        title_vi: item.title_vi,
        title_en: item.title_en,
        link_url: item.link_url,
        link_type: item.link_type,
        link_target: item.link_target,
        description_vi: item.description_vi,
        description_en: item.description_en,
        badge_vi: item.badge_vi,
        badge_en: item.badge_en,
      });
    } else if (isCustom && (item.parentId === parentId || !item.parentId)) {
      // Bảo toàn mục con tùy chỉnh do người dùng thêm
      customItems.push({
        id: item.id,
        parentId,
        group: item.group || 'shortcuts',
        groupNameVi: item.groupNameVi || 'Mục Tự Thêm',
        groupNameEn: item.groupNameEn || 'Custom Items',
        nameVi: item.title_vi || item.internal_name || item.nameVi || 'Mục con mới',
        nameEn: item.title_en || item.internal_name || item.nameEn || 'New Subsection',
        descriptionVi: item.description_vi || item.descriptionVi || '',
        descriptionEn: item.description_en || item.descriptionEn || '',
        enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
        order: typeof item.order === 'number' ? item.order : 99 + index,
        icon: item.icon || 'Sparkles',
        internal_name: item.internal_name,
        title_vi: item.title_vi,
        title_en: item.title_en,
        link_url: item.link_url,
        link_type: item.link_type || 'internal',
        link_target: item.link_target || '_self',
        description_vi: item.description_vi,
        description_en: item.description_en,
        badge_vi: item.badge_vi,
        badge_en: item.badge_en,
        is_custom: true,
      });
    }
  });

  const allGroups = new Set<string>([
    ...registeredDefs.map((d) => d.group),
    ...customItems.map((c) => c.group),
  ]);

  const result: HomepageSubsectionConfig[] = [];

  allGroups.forEach((groupKey) => {
    const groupDefs = registeredDefs.filter((d) => d.group === groupKey);
    const groupCustoms = customItems.filter((c) => c.group === groupKey);
    let maxOrder = 0;
    const groupItems: HomepageSubsectionConfig[] = [];

    groupDefs.forEach((def) => {
      const saved = savedMap.get(def.id);
      if (saved) {
        groupItems.push({
          ...def,
          enabled: saved.enabled,
          order: saved.order,
          internal_name: saved.internal_name,
          title_vi: saved.title_vi,
          title_en: saved.title_en,
          link_url: saved.link_url,
          link_type: saved.link_type,
          link_target: saved.link_target,
          description_vi: saved.description_vi,
          description_en: saved.description_en,
          badge_vi: saved.badge_vi,
          badge_en: saved.badge_en,
          image_url: saved.image_url,
          image_alt_vi: saved.image_alt_vi,
          image_alt_en: saved.image_alt_en,
          image_compression_status: saved.image_compression_status,
          image_original_size: saved.image_original_size,
          image_compressed_size: saved.image_compressed_size,
          image_compression_error: saved.image_compression_error,
        });
        if (saved.order > maxOrder) maxOrder = saved.order;
      } else {
        maxOrder += 1;
        groupItems.push({
          ...def,
          enabled: def.defaultEnabled,
          order: maxOrder,
        });
      }
    });

    groupCustoms.forEach((c) => {
      groupItems.push(c);
      if (c.order > maxOrder) maxOrder = c.order;
    });

    groupItems.sort((a, b) => a.order - b.order);
    result.push(...groupItems);
  });

  return result;
}

/**
 * Hợp nhất an toàn cấu hình đã lưu trong D1 với registry mã nguồn
 * Giữ nguyên thứ tự, trạng thái và toàn bộ các trường mở rộng đã lưu
 */
export function mergeHomepageSectionsConfig(
  savedConfig: any
): HomepageSectionConfig[] {
  if (!Array.isArray(savedConfig) || savedConfig.length === 0) {
    return getDefaultHomepageSectionsState();
  }

  const savedMap = new Map<string, any>();
  savedConfig.forEach((item, index) => {
    if (item && typeof item.id === 'string' && VALID_HOMEPAGE_SECTION_IDS.has(item.id)) {
      savedMap.set(item.id, {
        enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
        order: typeof item.order === 'number' ? item.order : index + 1,
        subsections: Array.isArray(item.subsections) ? item.subsections : undefined,
        internal_name: item.internal_name,
        title_vi: item.title_vi,
        title_en: item.title_en,
        link_url: item.link_url,
        link_type: item.link_type,
        link_target: item.link_target,
        description_vi: item.description_vi,
        description_en: item.description_en,
        badge_vi: item.badge_vi,
        badge_en: item.badge_en,
        image_url: item.image_url,
        image_alt_vi: item.image_alt_vi,
        image_alt_en: item.image_alt_en,
        image_compression_status: item.image_compression_status,
        image_original_size: item.image_original_size,
        image_compressed_size: item.image_compressed_size,
        image_compression_error: item.image_compression_error,
      });
    }
  });

  const result: HomepageSectionConfig[] = [];
  let maxOrder = 0;

  // 1. Nạp các mục lớn hợp lệ
  HOMEPAGE_SECTIONS_REGISTRY.forEach((def) => {
    const saved = savedMap.get(def.id);
    const subsections = mergeSubsectionsConfig(def.id, saved?.subsections);

    if (saved) {
      result.push({
        ...def,
        enabled: saved.enabled,
        order: saved.order,
        subsections,
        internal_name: saved.internal_name,
        title_vi: saved.title_vi,
        title_en: saved.title_en,
        link_url: saved.link_url,
        link_type: saved.link_type,
        link_target: saved.link_target,
        description_vi: saved.description_vi,
        description_en: saved.description_en,
        badge_vi: saved.badge_vi,
        badge_en: saved.badge_en,
        image_url: saved.image_url,
        image_alt_vi: saved.image_alt_vi,
        image_alt_en: saved.image_alt_en,
        image_compression_status: saved.image_compression_status,
        image_original_size: saved.image_original_size,
        image_compressed_size: saved.image_compressed_size,
        image_compression_error: saved.image_compression_error,
      });
      if (saved.order > maxOrder) maxOrder = saved.order;
    } else {
      // 2. Mục mới chưa từng được lưu trong DB -> Tự động nạp vào cuối
      maxOrder += 1;
      result.push({
        ...def,
        enabled: def.defaultEnabled,
        order: maxOrder,
        subsections,
      });
    }
  });

  // Sắp xếp theo order tăng dần
  return result.sort((a, b) => a.order - b.order);
}

/**
 * Kiểm tra tính hợp lệ của dữ liệu khi quản trị viên gửi lệnh lưu (cả mục lớn và mục con)
 * Bảo toàn và làm sạch an toàn các trường mở rộng mới
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

    // Kiểm tra & vệ sinh danh sách mục con (nếu có)
    let sanitizedSubs: HomepageSubsectionState[] | undefined = undefined;
    const registeredSubDefs = HOMEPAGE_SUBSECTIONS_REGISTRY.filter((s) => s.parentId === id);

    if (Array.isArray(item.subsections)) {
      sanitizedSubs = [];
      const seenSubIds = new Set<string>();
      const rawSubs = item.subsections;

      for (let j = 0; j < rawSubs.length; j++) {
        const subItem = rawSubs[j];
        if (!subItem || typeof subItem !== 'object') continue;
        const subId = String(subItem.id || '').trim();
        if (!subId || seenSubIds.has(subId)) continue;

        const isCustom = Boolean(subItem.is_custom || subId.startsWith('custom_') || !VALID_HOMEPAGE_SUBSECTION_IDS.has(subId));
        const def = registeredSubDefs.find((d) => d.id === subId);

        // Bỏ qua nếu không phải mục con đăng ký và cũng không phải mục con tùy chỉnh hợp lệ
        if (!def && !isCustom) continue;
        seenSubIds.add(subId);

        const subEnabled = typeof subItem.enabled === 'boolean' ? subItem.enabled : true;
        const subOrder = typeof subItem.order === 'number' && !isNaN(subItem.order) ? Math.round(subItem.order) : j + 1;

        const subImageUrl = typeof subItem.image_url === 'string' ? subItem.image_url.trim().slice(0, 1000) : undefined;
        if (subImageUrl) {
          const imgCheck = validateImageUrl(subImageUrl);
          if (!imgCheck.valid) {
            return { valid: false, error: `Mục con "${subId}": ${imgCheck.error}` };
          }
        }

        sanitizedSubs.push({
          id: subId,
          parentId: id,
          group: String(subItem.group || def?.group || 'shortcuts').slice(0, 50),
          enabled: subEnabled,
          order: subOrder,
          internal_name: typeof subItem.internal_name === 'string' ? subItem.internal_name.trim().slice(0, 100) : undefined,
          title_vi: typeof subItem.title_vi === 'string' ? subItem.title_vi.trim().slice(0, 100) : undefined,
          title_en: typeof subItem.title_en === 'string' ? subItem.title_en.trim().slice(0, 100) : undefined,
          link_url: typeof subItem.link_url === 'string' ? subItem.link_url.trim().slice(0, 500) : undefined,
          link_type: ['internal', 'system', 'external'].includes(subItem.link_type) ? subItem.link_type : 'internal',
          link_target: ['_self', '_blank'].includes(subItem.link_target) ? subItem.link_target : '_self',
          description_vi: typeof subItem.description_vi === 'string' ? subItem.description_vi.trim().slice(0, 255) : undefined,
          description_en: typeof subItem.description_en === 'string' ? subItem.description_en.trim().slice(0, 255) : undefined,
          badge_vi: typeof subItem.badge_vi === 'string' ? subItem.badge_vi.trim().slice(0, 30) : undefined,
          badge_en: typeof subItem.badge_en === 'string' ? subItem.badge_en.trim().slice(0, 30) : undefined,
          is_custom: isCustom || undefined,
          icon: typeof subItem.icon === 'string' ? subItem.icon.slice(0, 50) : undefined,
          groupNameVi: typeof subItem.groupNameVi === 'string' ? subItem.groupNameVi.slice(0, 50) : undefined,
          groupNameEn: typeof subItem.groupNameEn === 'string' ? subItem.groupNameEn.slice(0, 50) : undefined,
          image_url: subImageUrl,
          image_alt_vi: typeof subItem.image_alt_vi === 'string' ? subItem.image_alt_vi.trim().slice(0, 200) : undefined,
          image_alt_en: typeof subItem.image_alt_en === 'string' ? subItem.image_alt_en.trim().slice(0, 200) : undefined,
          image_compression_status: ['uncompressed', 'compressing', 'compressed', 'original_fallback', 'failed'].includes(subItem.image_compression_status) ? subItem.image_compression_status : undefined,
          image_original_size: typeof subItem.image_original_size === 'number' ? subItem.image_original_size : undefined,
          image_compressed_size: typeof subItem.image_compressed_size === 'number' ? subItem.image_compressed_size : undefined,
          image_compression_error: typeof subItem.image_compression_error === 'string' ? subItem.image_compression_error.trim().slice(0, 500) : undefined,
        });
      }

      // Đảm bảo không bỏ sót mục con đăng ký gốc nào thuộc parent
      registeredSubDefs.forEach((def, subIdx) => {
        if (!seenSubIds.has(def.id)) {
          sanitizedSubs!.push({
            id: def.id,
            parentId: def.parentId,
            group: def.group,
            enabled: def.defaultEnabled,
            order: sanitizedSubs!.length + subIdx + 1,
          });
        }
      });

      // Sắp xếp lại thứ tự mục con chuẩn theo group
      const allGroups = Array.from(new Set(sanitizedSubs.map((s) => s.group)));
      const sortedSubs: HomepageSubsectionState[] = [];
      allGroups.forEach((g) => {
        const inGroup = sanitizedSubs!.filter((s) => s.group === g);
        inGroup.sort((a, b) => a.order - b.order);
        inGroup.forEach((sub, idx) => {
          sub.order = idx + 1;
        });
        sortedSubs.push(...inGroup);
      });
      sanitizedSubs = sortedSubs;
    } else if (registeredSubDefs.length > 0) {
      sanitizedSubs = getDefaultSubsectionsForParent(id);
    }

    const secImageUrl = typeof item.image_url === 'string' ? item.image_url.trim().slice(0, 1000) : undefined;
    if (secImageUrl) {
      const imgCheck = validateImageUrl(secImageUrl);
      if (!imgCheck.valid) {
        return { valid: false, error: `Mục "${id}": ${imgCheck.error}` };
      }
    }

    sanitized.push({
      id,
      enabled: item.enabled,
      order,
      ...(sanitizedSubs ? { subsections: sanitizedSubs } : {}),
      internal_name: typeof item.internal_name === 'string' ? item.internal_name.trim().slice(0, 100) : undefined,
      title_vi: typeof item.title_vi === 'string' ? item.title_vi.trim().slice(0, 100) : undefined,
      title_en: typeof item.title_en === 'string' ? item.title_en.trim().slice(0, 100) : undefined,
      link_url: typeof item.link_url === 'string' ? item.link_url.trim().slice(0, 500) : undefined,
      link_type: ['internal', 'system', 'external'].includes(item.link_type) ? item.link_type : 'internal',
      link_target: ['_self', '_blank'].includes(item.link_target) ? item.link_target : '_self',
      description_vi: typeof item.description_vi === 'string' ? item.description_vi.trim().slice(0, 255) : undefined,
      description_en: typeof item.description_en === 'string' ? item.description_en.trim().slice(0, 255) : undefined,
      badge_vi: typeof item.badge_vi === 'string' ? item.badge_vi.trim().slice(0, 30) : undefined,
      badge_en: typeof item.badge_en === 'string' ? item.badge_en.trim().slice(0, 30) : undefined,
      image_url: secImageUrl,
      image_alt_vi: typeof item.image_alt_vi === 'string' ? item.image_alt_vi.trim().slice(0, 200) : undefined,
      image_alt_en: typeof item.image_alt_en === 'string' ? item.image_alt_en.trim().slice(0, 200) : undefined,
      image_compression_status: ['uncompressed', 'compressing', 'compressed', 'original_fallback', 'failed'].includes(item.image_compression_status) ? item.image_compression_status : undefined,
      image_original_size: typeof item.image_original_size === 'number' ? item.image_original_size : undefined,
      image_compressed_size: typeof item.image_compressed_size === 'number' ? item.image_compressed_size : undefined,
      image_compression_error: typeof item.image_compression_error === 'string' ? item.image_compression_error.trim().slice(0, 500) : undefined,
    });
  }

  // Đảm bảo không bỏ sót mục lớn nào trong registry
  HOMEPAGE_SECTIONS_REGISTRY.forEach((def, idx) => {
    if (!seenIds.has(def.id)) {
      sanitized.push({
        id: def.id,
        enabled: def.defaultEnabled,
        order: sanitized.length + idx + 1,
        subsections: getDefaultSubsectionsForParent(def.id),
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

/**
 * Kiểm tra tính an toàn và hợp lệ của đường dẫn ảnh
 * Ngăn chặn tuyệt đối các đường dẫn thực thi script (javascript:, data: nguy hiểm)
 */
export function validateImageUrl(url?: string): { valid: boolean; error?: string } {
  if (!url || !url.trim()) return { valid: true };
  const trimmed = url.trim();
  if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) {
    return { valid: false, error: 'URL ảnh không an toàn (chặn javascript/data URL).' };
  }
  if (!/^(\/|https?:\/\/)/i.test(trimmed)) {
    return { valid: false, error: 'Đường dẫn ảnh phải bắt đầu bằng / hoặc https://' };
  }
  return { valid: true };
}

/**
 * Helper kiểm tra trạng thái bật/tắt của mục lớn
 */
export function isSectionEnabled(
  sections: HomepageSectionConfig[] | null | undefined,
  sectionId: string
): boolean {
  if (!sections || !Array.isArray(sections)) return true;
  const found = sections.find((s) => s.id === sectionId);
  return found ? Boolean(found.enabled) : true;
}

/**
 * Helper kiểm tra trạng thái bật/tắt của mục con
 * Nguyên tắc: Mục lớn tắt => Toàn bộ mục con tự động ẩn
 */
export function isSubsectionEnabled(
  sections: HomepageSectionConfig[] | null | undefined,
  sectionId: string,
  subsectionId: string
): boolean {
  if (!sections || !Array.isArray(sections)) return true;
  const parent = sections.find((s) => s.id === sectionId);
  if (!parent) return true;
  if (!parent.enabled) return false;
  if (!parent.subsections || !Array.isArray(parent.subsections)) return true;
  const sub = parent.subsections.find((s) => s.id === subsectionId);
  return sub ? Boolean(sub.enabled) : true;
}

/**
 * Helper lấy danh sách mục con đã sắp xếp theo thứ tự (có thể lọc theo nhóm con)
 */
export function getOrderedSubsections(
  sections: HomepageSectionConfig[] | null | undefined,
  sectionId: string,
  group?: string
): HomepageSubsectionConfig[] {
  if (!sections || !Array.isArray(sections)) {
    const defs = getDefaultSubsectionsForParent(sectionId);
    return group ? defs.filter((s) => s.group === group) : defs;
  }
  const parent = sections.find((s) => s.id === sectionId);
  if (!parent || !parent.subsections) {
    const defs = getDefaultSubsectionsForParent(sectionId);
    return group ? defs.filter((s) => s.group === group) : defs;
  }
  const list = group ? parent.subsections.filter((s) => s.group === group) : parent.subsections;
  return [...list].sort((a, b) => a.order - b.order);
}
