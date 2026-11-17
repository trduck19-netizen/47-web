import React from 'react';
import { ShieldCheck, Truck, RotateCcw, Clock, PhoneCall, Mail, MapPin } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export const Footer: React.FC = () => {
  const { t } = useLanguage();

  return (
    <footer className="bg-gray-900 text-gray-300 pt-12 pb-8 border-t border-gray-800 text-xs">
      {/* 4 Core Commitments */}
      <div className="max-w-7xl mx-auto px-4 pb-10 border-b border-gray-800 grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">Giao Hàng Toàn Quốc</h4>
            <p className="text-gray-400 text-[11px]">Bưu chính GHTK, GHN, Viettel Post</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-green-500/10 text-green-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">100% Chính Hãng</h4>
            <p className="text-gray-400 text-[11px]">Đảm bảo nguồn gốc xuất xứ</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">Đổi Trả 7 Ngày</h4>
            <p className="text-gray-400 text-[11px]">Miễn phí đổi size hoặc lỗi NSX</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">Giao Tức Thì 0 Giây</h4>
            <p className="text-gray-400 text-[11px]">Mã kích hoạt số tự động</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-10 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <h3 className="font-extrabold text-white text-base mb-3 bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            Universal Commerce
          </h3>
          <p className="text-gray-400 leading-relaxed mb-4">
            Nền tảng thương mại điện tử đa ngành toàn diện phong cách Shopee Mall. Sẵn sàng đóng gói chuyển giao công nghệ SaaS White-label trọn gói.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-white mb-3">Chăm Sóc Khách Hàng</h4>
          <ul className="space-y-2 text-gray-400">
            <li><a href="#tracking" className="hover:text-white transition-colors">Tra cứu vận đơn bưu chính</a></li>
            <li><a href="#voucher" className="hover:text-white transition-colors">Kho voucher giảm giá đa tầng</a></li>
            <li><a href="#policy" className="hover:text-white transition-colors">Chính sách bảo hành & hoàn tiền</a></li>
            <li><a href="#faq" className="hover:text-white transition-colors">Hướng dẫn thanh toán VietQR</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-white mb-3">Giải Pháp Sàn Thương Mại</h4>
          <ul className="space-y-2 text-gray-400">
            <li><a href="#giai-phap-san" className="hover:text-white transition-colors">Bán web sàn trọn gói</a></li>
            <li><a href="#giai-phap-san" className="hover:text-white transition-colors">Thuê web chỉ từ 390.000đ/tháng</a></li>
            <li><a href="#giai-phap-san" className="hover:text-white transition-colors">Tích hợp cổng thanh toán & vận chuyển</a></li>
            <li><a href="#giai-phap-san" className="hover:text-white transition-colors">Đa ngôn ngữ & SEO tự động</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-white mb-3">Thông Tin Liên Hệ</h4>
          <ul className="space-y-2 text-gray-400">
            <li className="flex items-center space-x-2">
              <PhoneCall className="w-4 h-4 text-orange-400 shrink-0" />
              <span>Hotline: 1900.888.999 (24/7)</span>
            </li>
            <li className="flex items-center space-x-2">
              <Mail className="w-4 h-4 text-orange-400 shrink-0" />
              <span>support@universal-mall.com</span>
            </li>
            <li className="flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-orange-400 shrink-0" />
              <span>Tòa nhà Innovation, Hà Nội, Việt Nam</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-10 pt-6 border-t border-gray-800 text-center text-gray-500">
        <p>© 2026 Universal Commerce Platform. Tối ưu hóa trên Cloudflare Serverless Edge Computing.</p>
      </div>
    </footer>
  );
};
