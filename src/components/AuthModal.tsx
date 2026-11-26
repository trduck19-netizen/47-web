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
  const [isLoginTurnstileEnabled, setIsLoginTurnstileEnabled] = useState<boolean>(false);
  const [isRegisterTurnstileEnabled, setIsRegisterTurnstileEnabled] = useState<boolean>(Boolean(turnstileSiteKey));
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
        if (!active || !data) return;
        if (typeof data.guestLoginEnabled === 'boolean') {
          setIsLoginTurnstileEnabled(data.guestLoginEnabled);
        }
        if (typeof data.enabled === 'boolean') {
          setIsRegisterTurnstileEnabled(data.enabled);
        }
      })
      .catch(() => {
        if (active) {
          setIsLoginTurnstileEnabled(true);
        }
      });
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
    if (!isOpen || !(isLoginTurnstileEnabled || isRegisterTurnstileEnabled) || !turnstileSiteKey) return;

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
        setErrorMessage(t('authStrict.k1'));
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
  }, [isOpen, isLoginTurnstileEnabled, isRegisterTurnstileEnabled, turnstileSiteKey, isEn]);

  // Load Google Identity Services SDK dynamically
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const scriptId = 'google-jssdk';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, [isOpen]);

  const handleGoogleLogin = async (response: any) => {
    const credential = response?.credential;
    if (!credential) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await authService.loginWithGoogle(credential);
      if (res.success && res.user) {
        onShowToast(t('authStrict.k2'), res.message, 'success');
        onSuccess(res.user);
        onClose();
      } else {
        setErrorMessage(res.message || t('authStrict.k3'));
      }
    } catch (err: any) {
      setErrorMessage(err?.message || t('authStrict.k4'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleButtonClick = () => {
    if (typeof window === 'undefined') return;
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    if (!googleClientId) {
      onShowToast(
        t('authStrict.k5'),
        t('authStrict.k6'),
        'info'
      );
      return;
    }

    if ((window as any).google?.accounts?.id) {
      (window as any).google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleLogin,
      });
      (window as any).google.accounts.id.prompt();
    }
  };

  // Render Turnstile widget for Login Tab
  useEffect(() => {
    if (!isOpen || !isLoginTurnstileEnabled || !isTurnstileLoaded || !turnstileSiteKey || tab !== 'login') return;

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
            setErrorMessage(t('authStrict.k7'));
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
  }, [isOpen, isLoginTurnstileEnabled, isTurnstileLoaded, turnstileSiteKey, tab, isEn]);

  // Render Turnstile widget for Register Tab
  useEffect(() => {
    if (!isOpen || !isRegisterTurnstileEnabled || !isTurnstileLoaded || !turnstileSiteKey || tab !== 'register') return;

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
            setErrorMessage(t('authStrict.k8'));
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
  }, [isOpen, isRegisterTurnstileEnabled, isTurnstileLoaded, turnstileSiteKey, tab, isEn]);

  if (!isOpen) return null;

  // Real-time password evaluation
  const passwordStrength = calculatePasswordStrength(tab === 'register' ? regPassword : forgotNewPassword);
  const isConfirmPasswordMatch = regPassword.length > 0 && regPassword === regConfirmPassword;

  // Handle Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!loginIdentifier.trim()) {
      setErrorMessage(t('authStrict.k9'));
      return;
    }

    if (isLoginTurnstileEnabled && turnstileSiteKey && !loginTurnstileToken) {
      setErrorMessage(t('authStrict.k10'));
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
        t('authStrict.k11'),
        t('authStrict.welcomeBack', { name: res.user.displayName || res.user.username }),
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
      setErrorMessage(res.message || t('authStrict.k12'));
    }
  };

  // Handle Register Submit
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const userCheck = isValidUsername(regUsername);
    if (!userCheck.valid) {
      setErrorMessage(userCheck.message || t('authStrict.k13'));
      return;
    }

    if (!isValidEmail(regEmail)) {
      setErrorMessage(t('authStrict.k14'));
      return;
    }

    if (regPassword.length < 6) {
      setErrorMessage(t('authStrict.k15'));
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage(t('authStrict.k16'));
      return;
    }

    if (!agreeTerms) {
      setErrorMessage(t('authStrict.k17'));
      return;
    }

    if (isRegisterTurnstileEnabled && turnstileSiteKey && !regTurnstileToken) {
      setErrorMessage(t('authStrict.k18'));
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
        t('authStrict.k19'),
        t('authStrict.accountActivated', { username: res.user.username }),
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
      setErrorMessage(res.message || t('authStrict.k20'));
    }
  };

  // Handle Forgot Password Step 1: Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!forgotIdentifier.trim()) {
      setErrorMessage(t('authStrict.k21'));
      return;
    }

    setIsLoading(true);
    const res = await authService.requestResetOtp(forgotIdentifier);
    setIsLoading(false);

    if (res.success) {
      setForgotStep(2);
      onShowToast(t('authStrict.k22'), res.message || t('authStrict.k23'), 'info');
    } else {
      setErrorMessage(res.message || t('authStrict.k24'));
    }
  };

  // Handle Forgot Password Step 2: Verify OTP & Reset
  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!forgotOtp.trim()) {
      setErrorMessage(t('authStrict.k25'));
      return;
    }

    if (forgotNewPassword.length < 6) {
      setErrorMessage(t('authStrict.k26'));
      return;
    }

    setIsLoading(true);
    const res = await authService.confirmPasswordReset(forgotIdentifier, forgotOtp, forgotNewPassword);
    setIsLoading(false);

    if (res.success) {
      onShowToast(t('authStrict.k27'), res.message, 'success');
      setTab('login');
      setLoginIdentifier(forgotIdentifier);
      setForgotStep(1);
    } else {
      setErrorMessage(res.message || t('authStrict.k28'));
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
                  {tab === 'login' && t('authStrict.k29')}
                  {tab === 'register' && t('authStrict.k30')}
                  {tab === 'forgot' && t('authStrict.k31')}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {tab === 'login' && t('authStrict.k32')}
                  {tab === 'register' && t('authStrict.k33')}
                  {tab === 'forgot' && t('authStrict.k34')}
                </p>
              </div>
            </div>

            {/* High-visibility Close Button */}
            <button
              onClick={onClose}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 hover:border-slate-600 shadow-md cursor-pointer transition-all active:scale-90 flex items-center justify-center shrink-0"
              aria-label={t('authStrict.k35')}
              title={t('authStrict.k36')}
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
              {t('authStrict.k37')}
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
              {t('authStrict.k38')}
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
                  {t('authStrict.k39')} <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder={t('authStrict.k40')}
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
                    {t('authStrict.k41')} <span className="text-accent">*</span>
                  </label>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder={t('authStrict.k42')}
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
                  <span className="text-xs text-muted-foreground">{t('authStrict.k43')}</span>
                </label>
              </div>

              {/* Turnstile Security Widget */}
              {isLoginTurnstileEnabled && (turnstileSiteKey ? (
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
                disabled={isLoading || (isLoginTurnstileEnabled ? (turnstileSiteKey ? !loginTurnstileToken : true) : false)}
                className="w-full py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-display font-bold text-xs sm:text-sm shadow-glow-primary transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('authStrict.k44')}</span>
                  </>
                ) : (
                  <span>{t('authStrict.k45')}</span>
                )}
              </button>

              {/* Google Sign-in Divider & Button */}
              <div className="relative my-3 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/80"></div></div>
                <div className="relative bg-card px-3 text-[11px] text-muted-foreground uppercase">{t('authStrict.k46')}</div>
              </div>

              <button
                type="button"
                onClick={handleGoogleButtonClick}
                disabled={isLoading}
                className="w-full py-2.5 sm:py-3 px-4 rounded-2xl bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 active:scale-98"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{t('authExtra.continueWithGoogle')}</span>
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
                    {t('authStrict.k47')} <span className="text-accent">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder={t('authStrict.k48')}
                      required
                      autoComplete="username"
                      className="w-full pl-10 pr-3 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 text-xs placeholder-gray-400 font-medium shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Display Name */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-foreground">
                    {t('authStrict.k49')}
                  </label>
                  <input
                    type="text"
                    value={regDisplayName}
                    onChange={(e) => setRegDisplayName(e.target.value)}
                    placeholder={t('authStrict.k50')}
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
                  {t('authStrict.k51')} <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder={t('authStrict.k52')}
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
                      <span className="text-muted-foreground">{t('authStrict.k53')}</span>
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
                  {t('authStrict.k54')} <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder={t('authStrict.k55')}
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
                  {t('authStrict.k56')}
                  <strong className="text-foreground">{t('authStrict.k57')}</strong>
                  {t('authStrict.k58')}
                </span>
              </label>

              {/* Turnstile Security Widget */}
              {isRegisterTurnstileEnabled && (turnstileSiteKey ? (
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
                disabled={isLoading || !isConfirmPasswordMatch || !agreeTerms || (isRegisterTurnstileEnabled ? (turnstileSiteKey ? !regTurnstileToken : true) : false)}
                className="w-full py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-display font-bold text-xs sm:text-sm shadow-glow-primary transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('authStrict.k59')}</span>
                  </>
                ) : (
                  <span>{t('authStrict.k60')}</span>
                )}
              </button>

              {/* Google Sign-in Divider & Button */}
              <div className="relative my-3 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/80"></div></div>
                <div className="relative bg-card px-3 text-[11px] text-muted-foreground uppercase">{t('authStrict.k61')}</div>
              </div>

              <button
                type="button"
                onClick={handleGoogleButtonClick}
                disabled={isLoading}
                className="w-full py-2.5 sm:py-3 px-4 rounded-2xl bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 active:scale-98"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{t('authExtra.signUpWithGoogle')}</span>
              </button>
            </form>
          )}

          {/* ==================== TAB 3: FORGOT PASSWORD ==================== */}
          {tab === 'forgot' && (
            <div className="space-y-4 animate-fade-in">
              {forgotStep === 1 ? (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-muted/40 border border-border text-xs text-muted-foreground leading-relaxed">
                    {t('authStrict.k62')}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-foreground">
                      {t('authStrict.k63')} <span className="text-accent">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                      <input
                        type="text"
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        placeholder={t('authStrict.k64')}
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
                        <span>{t('authStrict.k65')}</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>{t('authStrict.k66')}</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmReset} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-foreground">
                      {t('authStrict.k67')} <span className="text-accent">*</span>
                    </label>
                    <input
                      type="text"
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value)}
                      placeholder={t('authStrict.k68')}
                      required
                      className="w-full px-4 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-900 font-mono text-sm tracking-widest text-center font-bold shadow-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-foreground">
                      {t('authStrict.k69')} <span className="text-accent">*</span>
                    </label>
                    <input
                      type="password"
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder={t('authStrict.k70')}
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
                      {t('authStrict.k71')}
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-display font-bold text-xs sm:text-sm shadow-glow-primary transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>{t('authStrict.k72')}</span>
                        </>
                      ) : (
                        <span>{t('authStrict.k73')}</span>
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
