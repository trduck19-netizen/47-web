import type { IndustryConfig } from '../types';

export const INDUSTRY_CONFIGS: Record<string, IndustryConfig> = {
  fashion: {
    id: 'fashion',
    name: 'Thời Trang & Phụ Kiện',
    icon: '👕',
    badge: 'Xu Hướng Hot',
    bannerTitle: 'Siêu Hội Thời Trang Streetwear & Thiết Kế',
    bannerSubtitle: 'Đổi Trả 7 Ngày Miễn Phí • Chuẩn Size Quốc Tế • Voucher 50K',
    defaultAccent: 'orange',
    categories: [
      { id: 'all', label: 'Tất Cả Thời Trang', icon: '🛍️', description: 'Toàn bộ thời trang hot trend' },
      { id: 'ao-nam-nu', label: 'Áo Nam & Nữ', icon: '👕', description: 'Áo hoodie, thun oversize, polo, jacket' },
      { id: 'quan-jeans-kaki', label: 'Quần Jeans & Baggy', icon: '👖', description: 'Quần bò ống rộng, kaki, jogger' },
      { id: 'giay-sneaker', label: 'Giày & Sneaker', icon: '👟', description: 'Sneaker chunky, retro, giày thể thao' },
      { id: 'tui-phu-kien', label: 'Túi & Phụ Kiện', icon: '🎒', description: 'Túi canvas, balo laptop, thắt lưng' },
    ],
  },

  beauty: {
    id: 'beauty',
    name: 'Mỹ Phẩm & Sắc Đẹp',
    icon: '💄',
    badge: 'Chính Hãng 100%',
    bannerTitle: 'Thế Giới Dưỡng Da & Mỹ Phẩm Cao Cấp',
    bannerSubtitle: 'Đầy Đủ Giấy Kiểm Định • Hoàn Tiền 200% Nếu Giả • Freeship Toàn Quốc',
    defaultAccent: 'pink',
    categories: [
      { id: 'all', label: 'Tất Cả Mỹ Phẩm', icon: '✨', description: 'Sản phẩm chăm sóc sắc đẹp toàn diện' },
      { id: 'duong-da', label: 'Serum & Dưỡng Da', icon: '🧴', description: 'Serum phục hồi, toner, kem ẩm, chống nắng' },
      { id: 'trang-diem', label: 'Son & Trang Điểm', icon: '💄', description: 'Son kem lì velvet, cushion, phấn phủ' },
      { id: 'nuoc-hoa', label: 'Nước Hoa Chính Hãng', icon: '🌸', description: 'Nước hoa nam nữ cao cấp lưu hương lâu' },
      { id: 'dung-cu', label: 'Dụng Cụ Làm Đẹp', icon: '🪞', description: 'Máy rửa mặt sóng âm, cọ trang điểm' },
    ],
  },

  tech: {
    id: 'tech',
    name: 'Thiết Bị Số & Công Nghệ',
    icon: '📱',
    badge: 'Bảo Hành 1 Đổi 1',
    bannerTitle: 'Đại Tiệc Gaming Gear & Công Nghệ Số',
    bannerSubtitle: 'Cảm Biến 26K DPI • Kết Nối Không Dây Sub-1ms • Bảo Hành 12 Tháng',
    defaultAccent: 'blue',
    categories: [
      { id: 'all', label: 'Tất Cả Thiết Bị', icon: '⚡', description: 'Đồ công nghệ đỉnh cao' },
      { id: 'chuot-phim', label: 'Chuột & Bàn Phím', icon: '⌨️', description: 'Chuột gaming siêu nhẹ, phím cơ wireless' },
      { id: 'tai-nghe', label: 'Tai Nghe & Âm Thanh', icon: '🎧', description: 'Tai nghe Bluetooth chống ồn ANC' },
      { id: 'phu-kien-so', label: 'Phụ Kiện Sạc & Cáp', icon: '🔋', description: 'Củ sạc nhanh GaN, sạc dự phòng 20000mAh' },
      { id: 'smart-gadget', label: 'Đồng Hồ & Smart Gadget', icon: '⌚', description: 'Smartwatch đo nhịp tim, smart ring' },
    ],
  },

  services: {
    id: 'services',
    name: 'Dịch Vụ Số & Khóa Học',
    icon: '📚',
    badge: 'Giao Mã 0 Giây',
    bannerTitle: 'Nâng Tầm Kỹ Năng & Giải Pháp Trực Tuyến',
    bannerSubtitle: 'Kích Hoạt Tức Thì 0 Giây • Hỗ Trợ 1-1 Cùng Chuyên Gia',
    defaultAccent: 'purple',
    categories: [
      { id: 'all', label: 'Tất Cả Dịch Vụ', icon: '🚀', description: 'Dịch vụ và gói phần mềm số' },
      { id: 'khoa-hoc', label: 'Khóa Học Master', icon: '💻', description: 'Lập trình Fullstack, thiết kế UI/UX' },
      { id: 'tai-khoan-vip', label: 'Tài Khoản Bản Quyền', icon: '🔑', description: 'Canva Pro, Office 365, Chatbot AI' },
      { id: 'cloud-hosting', label: 'Hosting & Máy Chủ', icon: '☁️', description: 'Cloud server, tên miền quốc tế' },
    ],
  },
};
