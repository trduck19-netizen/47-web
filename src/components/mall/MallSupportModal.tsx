import React from 'react';
import { HelpCircle, X, Send, PhoneCall, ShieldAlert, BookOpen, MessageSquare } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface MallSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenReceivedCodes?: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const MallSupportModal: React.FC<MallSupportModalProps> = ({
  isOpen,
  onClose,
  onOpenReceivedCodes,
  onShowToast
}) => {
  const { language } = useLanguage();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[#f53d2d] to-[#ee4d2d] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <HelpCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">
                {language === 'en' ? '24/7 Universal Mall Support' : 'Trung Tâm Hỗ Trợ Universal Mall 24/7'}
              </h3>
              <p className="text-xs text-white/90">
                {language === 'en' ? 'Inquiries, transaction assistance & code troubleshooting' : 'Giải đáp thắc mắc, hỗ trợ giao dịch & xử lý lỗi mã'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/30 text-white flex items-center justify-center transition cursor-pointer"
            title={language === 'en' ? 'Close' : 'Đóng'}
            aria-label={language === 'en' ? 'Close' : 'Đóng'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-sm">
          
          {/* Quick Support Channels */}
          <div className="grid grid-cols-2 gap-3">
            <a
              href="https://t.me/codegame_hotro"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition flex flex-col items-center text-center group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center mb-2 shadow-sm group-hover:scale-105 transition">
                <Send className="w-5 h-5" />
              </div>
              <div className="font-bold text-blue-900 dark:text-blue-300 text-xs">
                {language === 'en' ? 'Telegram 24/7 Bot' : 'Bot Telegram 24/7'}
              </div>
              <div className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
                {language === 'en' ? 'Response under 30s' : 'Phản hồi dưới 30 giây'}
              </div>
            </a>

            <div
              onClick={() => {
                navigator.clipboard.writeText('0987654321');
                onShowToast(language === 'en' ? 'Copied Support Hotline: 0987.654.321' : 'Đã sao chép số Hotline CSKH: 0987.654.321', 'success');
              }}
              className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 transition flex flex-col items-center text-center group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center mb-2 shadow-sm group-hover:scale-105 transition">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div className="font-bold text-emerald-900 dark:text-emerald-300 text-xs">
                {language === 'en' ? 'Support Hotline & Zalo' : 'Hotline & Zalo CSKH'}
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                {language === 'en' ? '0987.654.321 (Click to copy)' : '0987.654.321 (Nhấp để chép)'}
              </div>
            </div>
          </div>

          {/* Common Troubles */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
              {language === 'en' ? 'Frequently Asked Questions (FAQ):' : 'Câu Hỏi Thường Gặp (FAQ):'}
            </h4>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-orange-500" />
                {language === 'en' ? '1. Where do I view my codes after purchasing?' : '1. Mua mã xong thì xem mã ở đâu?'}
              </div>
              <p className="text-slate-600 dark:text-slate-400 pl-5">
                {language === 'en' ? (
                  <>Codes appear immediately upon successful purchase. You can also open <strong>"My Vault / Orders"</strong> in the top menu at any time.</>
                ) : (
                  <>Mã sẽ hiển thị ngay khi nạp/mua thành công. Bạn cũng có thể mở mục <strong>"Tủ Mã / Đơn Mua"</strong> trên thanh menu để xem lại bất cứ lúc nào.</>
                )}
              </p>
              {onOpenReceivedCodes && (
                <div className="pl-5 pt-1">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenReceivedCodes();
                    }}
                    className="text-[#ee4d2d] hover:underline font-semibold text-[11px] cursor-pointer"
                  >
                    {language === 'en' ? '→ Open My Code Vault Now' : '→ Mở Tủ Mã Của Tôi Ngay'}
                  </button>
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                {language === 'en' ? '2. What if a code is invalid or account password incorrect?' : '2. Nếu mã thẻ không nạp được hoặc acc sai mật khẩu?'}
              </div>
              <p className="text-slate-600 dark:text-slate-400 pl-5">
                {language === 'en' ? (
                  <>Your funds are 100% safe under our 168-hour escrow protection. Go to your Vault and click <strong>"Report Issue"</strong> to request a new code or immediate wallet refund.</>
                ) : (
                  <>Bạn hoàn toàn yên tâm vì tiền của bạn được giữ an toàn 168 giờ. Hãy vào Tủ Mã bấm nút <strong>"Báo Lỗi"</strong> để yêu cầu người bán đổi mã mới hoặc hoàn tiền ví tức thì.</>
                )}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                {language === 'en' ? '3. How fast is VietQR automatic top-up?' : '3. Nạp tiền VietQR bao lâu thì tiền vào ví?'}
              </div>
              <p className="text-slate-600 dark:text-slate-400 pl-5">
                {language === 'en'
                  ? 'Our system is connected with automated SePay gateways. After scanning VietQR with exact syntax, funds are credited to your wallet in 3-5 seconds.'
                  : 'Hệ thống tích hợp cổng SePay tự động. Khi quét mã VietQR đúng cú pháp, tiền sẽ tự động cộng vào ví của bạn trong vòng 3 đến 5 giây.'}
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="bg-[#ee4d2d] hover:bg-orange-600 text-white font-bold px-6 py-2 rounded-xl text-xs shadow transition active:scale-95 cursor-pointer"
          >
            {language === 'en' ? 'Close Support' : 'Đóng Hỗ Trợ'}
          </button>
        </div>

      </div>
    </div>
  );
};
