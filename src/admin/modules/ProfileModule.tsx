import React, { useState, useEffect } from 'react';
import {
  User,
  KeyRound,
  Smartphone,
  Save,
  Lock,
  Laptop,
  CheckCircle2,
} from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { adminDataService } from '../services/adminDataService';
import { AdminUser } from '../types/adminTypes';
import { useLanguage } from '../../context/LanguageContext';

interface ProfileModuleProps {
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
  onUpdateCurrentUser?: (user: AdminUser) => void;
}

export const ProfileModule: React.FC<ProfileModuleProps> = ({
  onShowToast,
  onUpdateCurrentUser,
}) => {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);

  // Profile Form
  const [displayName, setDisplayName] = useState('');
  const [avatar, setAvatar] = useState('');

  // Password Form
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // 2FA Toggle State
  const [is2FAEnabled, setIs2FAEnabled] = useState(true);

  useEffect(() => {
    const usr = adminDataService.getCurrentAdminUser();
    setCurrentUser(usr);
    if (usr) {
      setDisplayName(usr.displayName);
      setAvatar(usr.avatar || '');
    }
  }, []);

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      onShowToast('Lỗi', 'Tên hiển thị không được để trống.', 'error');
      return;
    }

    const updated = adminDataService.updateAdminProfile({
      displayName,
      avatar,
    });

    if (updated) {
      setCurrentUser(updated);
      onUpdateCurrentUser?.(updated);
      onShowToast('Thành công', 'Thông tin quản trị viên đã được lưu.', 'success');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      onShowToast(
        isEn ? 'Error' : 'Lỗi',
        isEn ? 'Please enter both current and new passwords.' : 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.',
        'error'
      );
      return;
    }
    if (newPassword.length < 8) {
      onShowToast(
        isEn ? 'Error' : 'Lỗi',
        isEn ? 'New password must be at least 8 characters long.' : 'Mật khẩu mới phải có ít nhất 8 ký tự.',
        'error'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      onShowToast(
        isEn ? 'Error' : 'Lỗi',
        isEn ? 'New password confirmation does not match.' : 'Xác nhận mật khẩu mới không khớp.',
        'error'
      );
      return;
    }

    setIsChangingPassword(true);
    try {
      const token =
        localStorage.getItem('wcg_auth_token') ||
        sessionStorage.getItem('wcg_auth_token');

      if (!token) {
        onShowToast(
          isEn ? 'Session Expired' : 'Phiên đăng nhập hết hạn',
          isEn ? 'Your session has expired. Please log in again.' : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
          'error'
        );
        localStorage.removeItem('wcg_admin_authenticated');
        sessionStorage.removeItem('wcg_admin_authenticated');
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      // 1. Pre-flight session check strictly on current domain
      const checkRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (checkRes.status === 401 || checkRes.status === 403 || !checkRes.ok) {
        onShowToast(
          isEn ? 'Session Expired' : 'Phiên đăng nhập hết hạn',
          isEn
            ? 'Session does not exist or has expired on server. Please log in again.'
            : 'Phiên đăng nhập không tồn tại hoặc đã hết hạn trên máy chủ. Vui lòng đăng nhập lại.',
          'error'
        );
        localStorage.removeItem('wcg_admin_authenticated');
        sessionStorage.removeItem('wcg_admin_authenticated');
        localStorage.removeItem('wcg_auth_token');
        sessionStorage.removeItem('wcg_auth_token');
        localStorage.removeItem('wcg_auth_user');
        sessionStorage.removeItem('wcg_auth_user');
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      // 2. Execute password change strictly on current domain
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          oldPassword,
          newPassword,
        }),
      });

      const data: any = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        onShowToast(
          isEn ? 'Password Changed Successfully!' : 'Đổi mật khẩu thành công!',
          isEn
            ? 'All previous sessions have been revoked. Please log in again with your new password.'
            : 'Đã thu hồi toàn bộ phiên đăng nhập cũ. Vui lòng đăng nhập lại bằng mật khẩu mới.',
          'success'
        );
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        localStorage.removeItem('wcg_admin_authenticated');
        sessionStorage.removeItem('wcg_admin_authenticated');
        localStorage.removeItem('wcg_auth_token');
        sessionStorage.removeItem('wcg_auth_token');
        localStorage.removeItem('wcg_auth_user');
        sessionStorage.removeItem('wcg_auth_user');
        setTimeout(() => window.location.reload(), 1500);
        return;
      } else {
        onShowToast(
          isEn ? 'Password Change Failed' : 'Đổi mật khẩu thất bại',
          data?.message || (isEn ? 'Current password is incorrect.' : 'Mật khẩu hiện tại không chính xác.'),
          'error'
        );
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('wcg_admin_authenticated');
          sessionStorage.removeItem('wcg_admin_authenticated');
          localStorage.removeItem('wcg_auth_token');
          sessionStorage.removeItem('wcg_auth_token');
          localStorage.removeItem('wcg_auth_user');
          sessionStorage.removeItem('wcg_auth_user');
          setTimeout(() => window.location.reload(), 1500);
        }
      }
    } catch (err: any) {
      onShowToast(
        isEn ? 'Connection Error' : 'Lỗi kết nối',
        isEn ? 'Unable to reach the server to change password.' : 'Không thể kết nối đến máy chủ để đổi mật khẩu.',
        'error'
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 max-w-4xl mx-auto">
      {/* Profile Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-sm flex flex-col sm:flex-row items-center gap-5">
        <img
          src={avatar || currentUser?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Admin'}
          alt="Avatar"
          className="h-20 w-20 rounded-2xl ring-4 ring-indigo-500/20 object-cover"
        />
        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {currentUser?.displayName}
            </h3>
            <StatusBadge status={currentUser?.role || 'SUPER_ADMIN'} size="sm" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {currentUser?.email} • ID: <span className="font-mono">{currentUser?.id}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 justify-center sm:justify-start">
            {currentUser?.permissions.map((perm, idx) => (
              <span
                key={idx}
                className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                {perm}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Form 1: Update Profile Details */}
        <form
          onSubmit={handleUpdateProfile}
          className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <User className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Thông Tin Cá Nhân
            </h4>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Tên Quản Trị Viên <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Email Đăng Nhập
            </label>
            <input
              type="email"
              disabled
              value={currentUser?.email || ''}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Link Ảnh Avatar (URL)
            </label>
            <input
              type="text"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
            >
              <Save className="h-4 w-4" />
              <span>Cập Nhật Thông Tin</span>
            </button>
          </div>
        </form>

        {/* Form 2: Change Password */}
        <form
          onSubmit={handleChangePassword}
          className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <Lock className="h-4 w-4 text-purple-600" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Đổi Mật Khẩu Đăng Nhập
            </h4>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Mật Khẩu Hiện Tại <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Mật Khẩu Mới <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Ít nhất 6 ký tự"
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Xác Nhận Mật Khẩu Mới <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isChangingPassword}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50 cursor-pointer"
            >
              <KeyRound className="h-4 w-4" />
              <span>{isChangingPassword ? 'Đang cập nhật...' : 'Đổi Mật Khẩu'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 2FA & Active Sessions */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Xác Thực 2 Lớp (2FA Security)
              </h4>
              <p className="text-xs text-slate-500">
                Bảo vệ tài khoản quản trị viên bằng mã OTP Google Authenticator.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setIs2FAEnabled((prev) => {
                const next = !prev;
                onShowToast(
                  next ? 'Đã kích hoạt 2FA' : 'Đã tắt 2FA',
                  next ? 'Tài khoản được bảo vệ 2 lớp.' : 'Cảnh báo: Bảo mật giảm.',
                  next ? 'success' : 'info'
                );
                return next;
              });
            }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              is2FAEnabled
                ? 'bg-emerald-600 text-white shadow'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {is2FAEnabled ? 'Đang Kích Hoạt' : 'Bật 2FA'}
          </button>
        </div>

        <div>
          <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Phiên Đăng Nhập Đang Hoạt Động
          </h5>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60 text-xs">
            <div className="flex items-center gap-3">
              <Laptop className="h-5 w-5 text-indigo-600" />
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  Chrome on Windows (Thiết bị hiện tại)
                </p>
                <p className="text-[11px] text-slate-400 font-mono">
                  IP: 118.69.182.44 • TP. Hồ Chí Minh, VN
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 font-semibold text-emerald-600 text-[11px]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Đang hoạt động
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
