import React, { useState } from 'react';
import { 
  Check, Sparkles, ArrowRight, ShieldCheck, 
  Zap, Globe, Server, Rocket, PhoneCall, Mail 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useLanguage } from '../../context/LanguageContext';

export const PlatformSolutionsView: React.FC = () => {
  const { formatCurrency } = useLanguage();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<'startup' | 'pro' | 'buyout'>('pro');
  const [domainRequested, setDomainRequested] = useState('');
  const [industryFocus, setIndustryFocus] = useState('Thời Trang & Bán Lẻ');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      alert('Vui lòng nhập họ tên và số điện thoại liên hệ');
      return;
    }

    const leadCode = `LEAD-${Date.now().toString().slice(-5)}`;
    const newLead = {
      id: `lead_${Date.now()}`,
      lead_code: leadCode,
      full_name: fullName,
      phone,
      email,
      package_type: selectedPackage,
      domain_requested: domainRequested,
      industry_focus: industryFocus,
      status: 'NEW',
      created_at: new Date().toISOString(),
    };

    try {
      const saved = JSON.parse(localStorage.getItem('universal_mall_leads_v1') || '[]');
      saved.unshift(newLead);
      localStorage.setItem('universal_mall_leads_v1', JSON.stringify(saved));
    } catch {}

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });

    setIsSuccess(true);
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 space-y-12">
      {/* Hero Title */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center space-x-1.5 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold">
          <Sparkles className="w-4 h-4 text-orange-600" />
          <span>GIẢI PHÁP SÀN THƯƠNG MẠI ĐA NGÀNH TOÀN DIỆN</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-gray-900 tracking-tight leading-tight">
          Sở Hữu Sàn TMĐT Riêng Chuẩn Shopee Mall Chỉ Trong 3 Phút
        </h1>
        <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
          Đầy đủ hệ thống quản trị sản phẩm vật lý & số, tích hợp sẵn vận chuyển bưu chính GHTK/GHN, cổng thanh toán VietQR SePay, kho voucher đa tầng và kiến trúc Cloudflare Serverless siêu tốc chi phí 0đ.
        </p>
      </div>

      {/* 3 Pricing Packages Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        {/* Package 1: Startup */}
        <div 
          onClick={() => setSelectedPackage('startup')}
          className={`bg-white rounded-2xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between ${
            selectedPackage === 'startup'
              ? 'border-orange-500 shadow-xl ring-2 ring-orange-500/20'
              : 'border-gray-200 hover:border-orange-300'
          }`}
        >
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Khởi Nghiệp</span>
            <h3 className="text-xl font-black text-gray-900 mt-1">Thuê Cơ Bản</h3>
            <div className="mt-4 flex items-baseline space-x-1">
              <span className="text-3xl font-extrabold text-orange-600">390.000đ</span>
              <span className="text-xs text-gray-400">/ tháng</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Dành cho cá nhân bán lẻ dưới 500 sản phẩm.</p>

            <ul className="mt-6 space-y-3 text-xs text-gray-600">
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Kệ hàng Shopee Mall đa ngành</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Giao hàng bưu chính & Live tracking</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Cổng thanh toán tự động VietQR</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Máy chủ Cloudflare tốc độ &lt; 50ms</span>
              </li>
            </ul>
          </div>

          <button className={`w-full mt-6 py-2.5 rounded-xl font-bold text-xs transition-colors ${
            selectedPackage === 'startup'
              ? 'bg-orange-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}>
            Chọn Gói Này
          </button>
        </div>

        {/* Package 2: Professional (Popular) */}
        <div 
          onClick={() => setSelectedPackage('pro')}
          className={`bg-white rounded-2xl p-6 border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
            selectedPackage === 'pro'
              ? 'border-orange-500 shadow-2xl ring-2 ring-orange-500/20'
              : 'border-gray-200 hover:border-orange-300'
          }`}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-600 to-amber-500 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow">
            KHUYÊN DÙNG NHẤT
          </div>

          <div>
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wide">Chuyên Nghiệp</span>
            <h3 className="text-xl font-black text-gray-900 mt-1">Thuê Trọn Gói</h3>
            <div className="mt-4 flex items-baseline space-x-1">
              <span className="text-3xl font-extrabold text-orange-600">790.000đ</span>
              <span className="text-xs text-gray-400">/ tháng</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Dành cho doanh nghiệp kinh doanh không giới hạn.</p>

            <ul className="mt-6 space-y-3 text-xs text-gray-600">
              <li className="flex items-center space-x-2 font-semibold text-gray-800">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Gắn tên miền riêng thương hiệu</span>
              </li>
              <li className="flex items-center space-x-2 font-semibold text-gray-800">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Không giới hạn sản phẩm & đơn hàng</span>
              </li>
              <li className="flex items-center space-x-2 font-semibold text-gray-800">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Hệ thống Voucher Shopee đa tầng</span>
              </li>
              <li className="flex items-center space-x-2 font-semibold text-gray-800">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Đa ngôn ngữ i18n (Tiếng Việt + Anh)</span>
              </li>
              <li className="flex items-center space-x-2 font-semibold text-gray-800">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Hỗ trợ kỹ thuật 24/7 chuyên sâu</span>
              </li>
            </ul>
          </div>

          <button className={`w-full mt-6 py-2.5 rounded-xl font-bold text-xs transition-colors ${
            selectedPackage === 'pro'
              ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg shadow-orange-500/25'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}>
            Chọn Gói Này
          </button>
        </div>

        {/* Package 3: Buyout Source Code */}
        <div 
          onClick={() => setSelectedPackage('buyout')}
          className={`bg-white rounded-2xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between ${
            selectedPackage === 'buyout'
              ? 'border-orange-500 shadow-xl ring-2 ring-orange-500/20'
              : 'border-gray-200 hover:border-orange-300'
          }`}
        >
          <div>
            <span className="text-xs font-bold text-purple-600 uppercase tracking-wide">Toàn Quyền</span>
            <h3 className="text-xl font-black text-gray-900 mt-1">Mua Đứt Mã Nguồn</h3>
            <div className="mt-4 flex items-baseline space-x-1">
              <span className="text-3xl font-extrabold text-orange-600">15.000.000đ</span>
              <span className="text-xs text-gray-400">/ trọn đời</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Bàn giao 100% full source code và tài liệu triển khai.</p>

            <ul className="mt-6 space-y-3 text-xs text-gray-600">
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>100% Mã nguồn React + Edge Functions</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Toàn quyền chỉnh sửa, phát triển và bán lại</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Database D1 SQLite schema trọn bộ</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Hướng dẫn tự chủ vận hành 0đ máy chủ</span>
              </li>
            </ul>
          </div>

          <button className={`w-full mt-6 py-2.5 rounded-xl font-bold text-xs transition-colors ${
            selectedPackage === 'buyout'
              ? 'bg-purple-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}>
            Chọn Gói Này
          </button>
        </div>
      </div>

      {/* Registration Form */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xl max-w-2xl mx-auto">
        <h3 className="text-lg font-bold text-gray-900 text-center mb-1">
          Đăng Ký Tư Vấn & Triển Khai Trong 3 Phút
        </h3>
        <p className="text-xs text-gray-500 text-center mb-6">
          Chuyên gia của chúng tôi sẽ liên hệ Zalo tư vấn và thiết lập web ngay lập tức.
        </p>

        {isSuccess ? (
          <div className="bg-emerald-50 rounded-xl p-6 text-center space-y-3 border border-emerald-200">
            <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h4 className="font-extrabold text-base text-emerald-900">Gửi Yêu Cầu Thành Công!</h4>
            <p className="text-xs text-emerald-700 leading-relaxed">
              Cảm ơn bạn. Chuyên viên kỹ thuật sẽ liên hệ trực tiếp qua số điện thoại <span className="font-bold">{phone}</span> trong vòng 15 phút.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Số điện thoại (Zalo) *</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912345678"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@gmail.com"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Tên miền mong muốn (nếu có)</label>
                <input
                  type="text"
                  value={domainRequested}
                  onChange={(e) => setDomainRequested(e.target.value)}
                  placeholder="vd: shopfashion.vn"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-gray-700 block mb-1">Ngành hàng bạn muốn kinh doanh</label>
              <select
                value={industryFocus}
                onChange={(e) => setIndustryFocus(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white"
              >
                <option value="Thời Trang & Bán Lẻ">Thời Trang & Phụ Kiện</option>
                <option value="Mỹ Phẩm & Sắc Đẹp">Mỹ Phẩm & Chăm Sóc Sắc Đẹp</option>
                <option value="Thiết Bị Số & Công Nghệ">Thiết Bị Số & Gaming Gear</option>
                <option value="Dịch Vụ Số & Khóa Học">Dịch Vụ Số & Khóa Học Trực Tuyến</option>
                <option value="Đa Ngành Tổng Hợp">Sàn Thương Mại Đa Ngành Tổng Hợp</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center space-x-2"
            >
              <span>Nhận Tư Vấn & Bàn Giao Web Ngay</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
