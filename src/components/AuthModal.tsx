import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  User,
  Lock,
  Mail,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { authService } from '../services/authService';
import { calculatePasswordStrength, isValidUsername, isValidEmail } from '../utils/cryptoUtils';
import type { UserProfile } from '../types/game';
import { useLanguage } from '../context/LanguageContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowToast,
}) => {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');

  // Login Form
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register Form
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);

  // Forgot Password Form
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Turnstile configuration & states
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
  const [isTurnstileEnabled, setIsTurnstileEnabled] = useState<boolean>(Boolean(turnstileSiteKey));
  const [loginTurnstileToken, setLoginTurnstileToken] = useState('');
  const [regTurnstileToken, setRegTurnstileToken] = useState('');
  const loginWidgetIdRef = useRef<string | null>(null);
  const regWidgetIdRef = useRef<string | null>(null);
  const [isTurnstileLoaded, setIsTurnstileLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetch('/api/auth/turnstile-config')
      .then((res) => res.json())
      .then((data: any) => {
        if (active && data && typeof data.enabled === 'boolean') {
          setIsTurnstileEnabled(data.enabled);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
    }
  }, [isOpen, tab]);

  // Load Cloudflare Turnstile script dynamically
  useEffect(() => {
    if (!isOpen || !isTurnstileEnabled || !turnstileSiteKey) return;

    if ((window as any).turnstile) {
      setIsTurnstileLoaded(true);
      return;
    }

    const existingScript = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => setIsTurnstileLoaded(true);
      script.onerror = () => {
        console.error('[Turnstile] Failed to load SDK');
        setErrorMessage(isEn ? 'Failed to load security verification widget.' : 'Không thể tải widget bảo mật chống bot. Vui lòng thử lại.');
      };
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if ((window as any).turnstile) {
          setIsTurnstileLoaded(true);
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [isOpen, turnstileSiteKey, isEn]);

  // Render Turnstile widget for Login Tab
  useEffect(() => {
    if (!isOpen || !isTurnstileEnabled || !isTurnstileLoaded || !turnstileSiteKey || tab !== 'login') return;

    const timer = setTimeout(() => {
      const container = document.getElementById('turnstile-login-container');
      if (!container || !(window as any).turnstile) return;

      setLoginTurnstileToken('');
      if (loginWidgetIdRef.current) {
        try {
          (window as any).turnstile.remove(loginWidgetIdRef.current);
        } catch {}
        loginWidgetIdRef.current = null;
      }

      try {
        const id = (window as any).turnstile.render('#turnstile-login-container', {
          sitekey: turnstileSiteKey,
          theme: 'auto',
          callback: (token: string) => {
            setLoginTurnstileToken(token);
            setErrorMessage(null);
          },
          'expired-callback': () => {
            setLoginTurnstileToken('');
          },
          'error-callback': () => {
            setLoginTurnstileToken('');
            setErrorMessage(isEn ? 'Security challenge failed. Please retry.' : 'Xác minh chống bot thất bại. Vui lòng thử lại.');
          },
        });
        loginWidgetIdRef.current = id;
      } catch (e) {
        console.error('[Turnstile] Render error login:', e);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (loginWidgetIdRef.current && (window as any).turnstile) {
        try {
          (window as any).turnstile.remove(loginWidgetIdRef.current);
        } catch {}
        loginWidgetIdRef.current = null;
      }
    };
  }, [isOpen, isTurnstileLoaded, turnstileSiteKey, tab, isEn]);

  // Render Turnstile widget for Register Tab
  useEffect(() => {
    if (!isOpen || !isTurnstileEnabled || !isTurnstileLoaded || !turnstileSiteKey || tab !== 'register') return;

    const timer = setTimeout(() => {
      const container = document.getElementById('turnstile-register-container');
      if (!container || !(window as any).turnstile) return;

      setRegTurnstileToken('');
      if (regWidgetIdRef.current) {
        try {
          (window as any).turnstile.remove(regWidgetIdRef.current);
        } catch {}
        regWidgetIdRef.current = null;
      }

      try {
        const id = (window as any).turnstile.render('#turnstile-register-container', {
          sitekey: turnstileSiteKey,
          theme: 'auto',
          callback: (token: string) => {
            setRegTurnstileToken(token);
            setErrorMessage(null);
          },
          'expired-callback': () => {
            setRegTurnstileToken('');
          },
          'error-callback': () => {
            setRegTurnstileToken('');
            setErrorMessage(isEn ? 'Security challenge failed. Please retry.' : 'Xác minh chống bot thất bại. Vui lòng thử lại.');
          },
        });
        regWidgetIdRef.current = id;
      } catch (e) {
        console.error('[Turnstile] Render error register:', e);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (regWidgetIdRef.current && (window as any).turnstile) {
        try {
          (window as any).turnstile.remove(regWidgetIdRef.current);
        } catch {}
        regWidgetIdRef.current = null;
      }
    };
  }, [isOpen, isTurnstileLoaded, turnstileSiteKey, tab, isEn]);

  if (!isOpen) return null;

  // Real-time password evaluation
  const passwordStrength = calculatePasswordStrength(tab === 'register' ? regPassword : forgotNewPassword);
  const isConfirmPasswordMatch = regPassword.length > 0 && regPassword === regConfirmPassword;

  // Handle Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!loginIdentifier.trim()) {
      setErrorMessage(isEn ? 'Please enter your username or email.' : 'Vui lòng nhập tên đăng nhập hoặc email.');
      return;
    }

    if (isTurnstileEnabled && turnstileSiteKey && !loginTurnstileToken) {
      setErrorMessage(isEn ? 'Please complete the security check.' : 'Vui lòng hoàn tất xác minh bảo mật chống bot.');
      return;
    }

    setIsLoading(true);
    const res = await authService.login({
      identifier: loginIdentifier,
      password: loginPassword,
      rememberMe,
      turnstileToken: loginTurnstileToken,
    });
    setIsLoading(false);

    if (res.success && res.user) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#6366F1', '#10B981', '#F59E0B'],
      });
      onSuccess(res.user);
      onShowToast(
        isEn ? 'Login successful!' : 'Đăng nhập thành công!',
        isEn ? `Welcome back, ${res.user.displayName || res.user.username}!` : `Chào mừng ${res.user.displayName || res.user.username} quay trở lại!`,
        'success'
      );
      onClose();
    } else {
      if (loginWidgetIdRef.current && (window as any).turnstile) {
        try {
          (window as any).turnstile.reset(loginWidgetIdRef.current);
        } catch {}
        setLoginTurnstileToken('');
      }
      setErrorMessage(res.message || (isEn ? 'Login failed.' : 'Đăng nhập không thành công.'));
    }
  };

  // Handle Register Submit
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const userCheck = isValidUsername(regUsername);
    if (!userCheck.valid) {
      setErrorMessage(userCheck.message || (isEn ? 'Invalid username.' : 'Tên đăng nhập không hợp lệ.'));
      return;
    }

    if (!isValidEmail(regEmail)) {
      setErrorMessage(isEn ? 'Please enter a valid email address.' : 'Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMessage(isEn ? 'Password must be at least 6 characters.' : 'Mật khẩu cần tối thiểu 6 ký tự.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage(isEn ? 'Confirm password does not match.' : 'Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại.');
      return;
    }

    if (!agreeTerms) {
      setErrorMessage(isEn ? 'Please accept the Terms of Service & Privacy Policy.' : 'Vui lòng chấp thuận Điều khoản dịch vụ & Chính sách bảo mật.');
      return;
    }

    if (isTurnstileEnabled && turnstileSiteKey && !regTurnstileToken) {
      setErrorMessage(isEn ? 'Please complete the security check.' : 'Vui lòng hoàn tất xác minh bảo mật chống bot.');
      return;
    }

    setIsLoading(true);
    const res = await authService.register({
      username: regUsername,
      displayName: regDisplayName || regUsername,
      email: regEmail,
      password: regPassword,
      turnstileToken: regTurnstileToken,
    });
    setIsLoading(false);

    if (res.success && res.user) {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10B981', '#6366F1', '#F59E0B'],
      });
      onSuccess(res.user);
      onShowToast(
        isEn ? 'Registration successful!' : 'Đăng ký tài khoản thành công!',
        isEn ? `Account ${res.user.username} has been activated successfully.` : `Tài khoản ${res.user.username} đã được kích hoạt thành công.`,
        'success'
      );
      onClose();
    } else {
      if (regWidgetIdRef.current && (window as any).turnstile) {
        try {
          (window as any).turnstile.reset(regWidgetIdRef.current);
        } catch {}
        setRegTurnstileToken('');
      }
      setErrorMessage(res.message || (isEn ? 'Registration failed.' : 'Đăng ký không thành công.'));
    }
  };

  // Handle Forgot Password Step 1: Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!forgotIdentifier.trim()) {
      setErrorMessage(isEn ? 'Please enter the email or username to recover.' : 'Vui lòng nhập email hoặc tên tài khoản cần khôi phục.');
      return;
    }

    setIsLoading(true);
    const res = await authService.requestResetOtp(forgotIdentifier);
    setIsLoading(false);

    if (res.success) {
      setForgotStep(2);
      onShowToast(isEn ? 'Verification code sent' : 'Đã gửi mã xác minh', res.message || (isEn ? 'An OTP code has been sent to your email.' : 'Mã OTP đã được gửi đến email của bạn.'), 'info');
    } else {
      setErrorMessage(res.message || (isEn ? 'Unable to create password reset request.' : 'Không thể tạo yêu cầu đặt lại mật khẩu.'));
    }
  };

  // Handle Forgot Password Step 2: Verify OTP & Reset
  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!forgotOtp.trim()) {
      setErrorMessage(isEn ? 'Please enter the OTP verification code.' : 'Vui lòng nhập mã xác minh OTP.');
      return;
    }

    if (forgotNewPassword.length < 6) {
      setErrorMessage(isEn ? 'New password must be at least 6 characters.' : 'Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    setIsLoading(true);
    const res = await authService.confirmPasswordReset(forgotIdentifier, forgotOtp, forgotNewPassword);
    setIsLoading(false);

    if (res.success) {
      onShowToast(isEn ? 'Success' : 'Thành công', res.message, 'success');
      setTab('login');
      setLoginIdentifier(forgotIdentifier);
      setForgotStep(1);
    } else {
      setErrorMessage(res.message || (isEn ? 'OTP verification failed.' : 'Xác minh OTP thất bại.'));
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden animate-fade-in">
      <div
        className="relative w-full max-w-md bg-card border-t sm:border border-border/90 rounded-t-[28px] sm:rounded-3xl overflow-hidden shadow-2xl animate-scale-in flex flex-col max-h-[88dvh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed at top */}
        <div className="p-3.5 sm:p-5 pb-3 sm:pb-4 border-b border-border/70 bg-card/95 backdrop-blur-md shrink-0 sticky top-0 z-20">
          {/* Mobile Sheet Indicator */}
          <div className="w-12 h-1.5 bg-slate-600/60 rounded-full mx-auto mb-2 sm:hidden shrink-0" />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary-light border border-primary/25 flex items-center justify-center shadow-sm shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-heading font-extrabold text-base sm:text-lg text-foreground truncate">
                  {tab === 'login' && (isEn ? 'Account Login' : 'Đăng Nhập Tài Khoản')}
                  {tab === 'register' && (isEn ? 'Member Registration' : 'Đăng Ký Thành Viên')}
                  {tab === 'forgot' && (isEn ? 'Password Recovery' : 'Khôi Phục Mật Khẩu')}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {tab === 'login' && (isEn ? 'Enter login credentials to continue' : 'Nhập thông tin đăng nhập để tiếp tục')}
                  {tab === 'register' && (isEn ? 'Create a new member account' : 'Tạo tài khoản thành viên mới')}
                  {tab === 'forgot' && (isEn ? 'Verify identity to reset password' : 'Xác thực để đặt lại mật khẩu')}
                </p>
              </div>
            </div>

            {/* High-visibility Close Button */}
            <button
              onClick={onClose}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 hover:border-slate-600 shadow-md cursor-pointer transition-all active:scale-90 flex items-center justify-center shrink-0"
              aria-label={isEn ? "Close" : "Đóng"}
              title={isEn ? "Close" : "Đóng"}
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Switcher */}
        <div className="px-5 sm:px-6 pt-4">
          <div className="flex rounded-2xl bg-muted/60 p-1 border border-border">
            <button
              onClick={() => {
                setTab('login');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                tab === 'login'
                  ? 'bg-primary text-white shadow-glow-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {isEn ? 'Log In' : 'Đăng Nhập'}
            </button>
            <button
              onClick={() => {
                setTab('register');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                tab === 'register'
                  ? 'bg-primary text-white shadow-glow-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {isEn ? 'Register' : 'Đăng Ký'}
            </button>
          </div>
        </div>

        {/* Error Notification Banner */}
        {errorMessage && (
          <div className="mx-5 sm:mx-6 mt-3 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between gap-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-muted-foreground hover:text-rose-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* ==================== TAB 1: LOGIN ==================== */}
          {tab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4 animate-fade-in">
              {/* Identifier Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">
                  {isEn ? 'Username or Email' : 'Tên tài khoản hoặc Email'} <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder={isEn ? "Enter username or email" : "Nhập tên tài khoản hoặc email"}
                    required
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-xs sm:text-sm placeholder-gray-400 font-medium shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-foreground">
                    {isEn ? 'Password' : 'Mật khẩu'} <span className="text-accent">*</span>
                  </label>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder={isEn ? "Enter password" : "Nhập mật khẩu"}
                    required
                    autoComplete="current-password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-xs sm:text-sm placeholder-gray-400 font-medium shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 cursor-pointer"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-background"
                  />
                  <span className="text-xs text-muted-foreground">{isEn ? 'Remember me' : 'Ghi nhớ đăng nhập'}</span>
                </label>
              </div>

              {/* Turnstile Security Widget */}
              {isTurnstileEnabled && (turnstileSiteKey ? (
                <div className="flex justify-center my-2 min-h-[65px]">
                  <div id="turnstile-login-container"></div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs text-center">
                  {t('authModal.turnstileNotConfigured')}
                </div>
              ))}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || (isTurnstileEnabled ? (turnstileSiteKey ? !loginTurnstileToken : true) : false)}
                className="w-full py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-display font-bold text-xs sm:text-sm shadow-glow-primary transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{isEn ? 'Logging in...' : 'Đang xử lý đăng nhập...'}</span>
                  </>
                ) : (
                  <span>{isEn ? 'Log In' : 'Đăng Nhập'}</span>
                )}
              </button>
            </form>
          )}

          {/* ==================== TAB 2: REGISTER ==================== */}
          {tab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Username */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-foreground">
                    {isEn ? 'Username' : 'Tên đăng nhập'} <span className="text-accent">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder={isEn ? "Username" : "Tên đăng nhập"}
                      required
                      autoComplete="username"
                      className="w-full pl-10 pr-3 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-xs placeholder-gray-400 font-medium shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Display Name */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-foreground">
                    {isEn ? 'Display name' : 'Tên hiển thị'}
                  </label>
                  <input
                    type="text"
                    value={regDisplayName}
                    onChange={(e) => setRegDisplayName(e.target.value)}
                    placeholder={isEn ? "Display name" : "Tên hiển thị"}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-xs placeholder-gray-400 font-medium shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-foreground">
                  Email <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-xs sm:text-sm placeholder-gray-400 font-medium shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-foreground">
                  {isEn ? 'Password' : 'Mật khẩu'} <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder={isEn ? "At least 6 characters" : "Tối thiểu 6 ký tự"}
                    required
                    autoComplete="new-password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-xs sm:text-sm placeholder-gray-400 font-medium shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 cursor-pointer"
                  >
                    {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {regPassword && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-muted-foreground">{isEn ? 'Password strength:' : 'Độ mạnh mật khẩu:'}</span>
                      <span className={`font-bold ${passwordStrength.color.split(' ')[1] || 'text-foreground'}`}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${passwordStrength.color.split(' ')[0]} transition-all duration-300 rounded-full`}
                        style={{ width: passwordStrength.barWidth }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-foreground">
                  {isEn ? 'Confirm Password' : 'Xác nhận lại mật khẩu'} <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder={isEn ? "Confirm password" : "Nhập lại mật khẩu"}
                    required
                    autoComplete="new-password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-xs sm:text-sm placeholder-gray-400 font-medium shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                  />
                  {regConfirmPassword && (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                      {isConfirmPasswordMatch ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Terms Checkbox */}
              <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-background"
                />
                <span className="text-xs text-muted-foreground leading-tight">
                  {isEn ? 'I agree to the ' : 'Tôi đồng ý với '}
                  <strong className="text-foreground">{isEn ? 'Terms of Service' : 'Điều khoản dịch vụ'}</strong>
                  {isEn ? ' and account security policy.' : ' và bảo mật tài khoản.'}
                </span>
              </label>

              {/* Turnstile Security Widget */}
              {isTurnstileEnabled && (turnstileSiteKey ? (
                <div className="flex justify-center my-2 min-h-[65px]">
                  <div id="turnstile-register-container"></div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs text-center">
                  {t('authModal.turnstileNotConfigured')}
                </div>
              ))}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !isConfirmPasswordMatch || !agreeTerms || (isTurnstileEnabled ? (turnstileSiteKey ? !regTurnstileToken : true) : false)}
                className="w-full py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-display font-bold text-xs sm:text-sm shadow-glow-primary transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{isEn ? 'Creating account...' : 'Đang tạo tài khoản...'}</span>
                  </>
                ) : (
                  <span>{isEn ? 'Create Account' : 'Đăng Ký Tài Khoản'}</span>
                )}
              </button>
            </form>
          )}

          {/* ==================== TAB 3: FORGOT PASSWORD ==================== */}
          {tab === 'forgot' && (
            <div className="space-y-4 animate-fade-in">
              {forgotStep === 1 ? (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-muted/40 border border-border text-xs text-muted-foreground leading-relaxed">
                    {isEn ? 'Enter your registered username or email to receive a recovery OTP code.' : 'Nhập tên tài khoản hoặc email đăng ký để nhận mã OTP khôi phục.'}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-foreground">
                      {isEn ? 'Username or Email' : 'Tên tài khoản hoặc Email'} <span className="text-accent">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                      <input
                        type="text"
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        placeholder={isEn ? "Enter username or email" : "Nhập tên tài khoản hoặc email"}
                        required
                        className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-xs sm:text-sm placeholder-gray-400 font-medium shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-display font-bold text-xs sm:text-sm shadow-glow-primary transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{isEn ? 'Sending code...' : 'Đang gửi mã...'}</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>{isEn ? 'Send OTP Verification Code' : 'Gửi Mã Xác Minh OTP'}</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmReset} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-foreground">
                      {isEn ? 'Enter OTP Code' : 'Nhập mã OTP'} <span className="text-accent">*</span>
                    </label>
                    <input
                      type="text"
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value)}
                      placeholder={isEn ? "OTP Code" : "Mã OTP"}
                      required
                      className="w-full px-4 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 font-mono text-sm tracking-widest text-center font-bold shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-foreground">
                      {isEn ? 'New Password' : 'Mật khẩu mới'} <span className="text-accent">*</span>
                    </label>
                    <input
                      type="password"
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder={isEn ? "New password" : "Mật khẩu mới"}
                      required
                      autoComplete="new-password"
                      className="w-full px-4 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-xs sm:text-sm placeholder-gray-400 font-medium shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setForgotStep(1)}
                      className="px-4 py-3 rounded-2xl bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer"
                    >
                      {isEn ? 'Back' : 'Quay lại'}
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-display font-bold text-xs sm:text-sm shadow-glow-primary transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>{isEn ? 'Saving...' : 'Đang lưu...'}</span>
                        </>
                      ) : (
                        <span>{isEn ? 'Confirm Password Reset' : 'Xác Nhận Đổi Mật Khẩu'}</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
