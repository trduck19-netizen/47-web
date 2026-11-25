import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface TurnstileWidgetProps {
  onTokenChange: (token: string) => void;
  onEnabledChange?: (enabled: boolean) => void;
  onError?: (message: string) => void;
  resetTrigger?: number;
  theme?: 'dark' | 'light' | 'auto';
  className?: string;
}

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  onTokenChange,
  onEnabledChange,
  onError,
  resetTrigger = 0,
  theme = 'dark',
  className = '',
}) => {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const onTokenChangeRef = useRef(onTokenChange);
  const onEnabledChangeRef = useRef(onEnabledChange);
  const onErrorRef = useRef(onError);
  onTokenChangeRef.current = onTokenChange;
  onEnabledChangeRef.current = onEnabledChange;
  onErrorRef.current = onError;

  // Query backend flag to check if Turnstile verification is currently active
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    fetch('/api/auth/turnstile-config', { signal: controller.signal })
      .then((res) => res.json())
      .then((data: any) => {
        if (!active) return;
        const enabled = data && typeof data.enabled === 'boolean' ? data.enabled : Boolean(siteKey);
        setServerEnabled(enabled);
        onEnabledChangeRef.current?.(enabled);
        if (!enabled) {
          onTokenChangeRef.current('');
        }
      })
      .catch(() => {
        if (!active) return;
        const fallbackEnabled = Boolean(siteKey);
        setServerEnabled(fallbackEnabled);
        onEnabledChangeRef.current?.(fallbackEnabled);
      })
      .finally(() => clearTimeout(timer));

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [siteKey]);

  // Load Cloudflare Turnstile SDK only when enabled & siteKey present
  useEffect(() => {
    if (serverEnabled !== true || !siteKey) return;

    if ((window as any).turnstile) {
      setSdkReady(true);
      return;
    }

    const existingScript = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => setSdkReady(true);
      script.onerror = () => {
        onErrorRef.current?.(
          isEn
            ? 'Failed to load security verification widget.'
            : 'Không thể tải widget bảo mật chống bot. Vui lòng thử lại.'
        );
      };
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if ((window as any).turnstile) {
          setSdkReady(true);
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [serverEnabled, siteKey, isEn]);

  // Render widget explicitly
  useEffect(() => {
    if (serverEnabled !== true || !sdkReady || !siteKey) return;

    const timer = setTimeout(() => {
      const el = containerRef.current;
      if (!el || !(window as any).turnstile) return;

      onTokenChangeRef.current('');

      if (widgetIdRef.current) {
        try {
          (window as any).turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }

      try {
        const id = (window as any).turnstile.render(el, {
          sitekey: siteKey,
          theme,
          language: isEn ? 'en' : 'vi',
          callback: (token: string) => {
            onTokenChangeRef.current(token);
          },
          'expired-callback': () => {
            onTokenChangeRef.current('');
          },
          'error-callback': () => {
            onTokenChangeRef.current('');
          },
        });
        widgetIdRef.current = id;
      } catch (err) {
        console.error('[Turnstile] Render error:', err);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      if (widgetIdRef.current && (window as any).turnstile) {
        try {
          (window as any).turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [serverEnabled, sdkReady, siteKey, theme, isEn]);

  // Reset widget when parent triggers reset
  useEffect(() => {
    if (resetTrigger > 0 && widgetIdRef.current && (window as any).turnstile) {
      try {
        (window as any).turnstile.reset(widgetIdRef.current);
      } catch {}
      onTokenChangeRef.current('');
    }
  }, [resetTrigger]);

  if (serverEnabled !== true) {
    return null;
  }

  if (!siteKey) {
    return (
      <div className={`p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs text-center ${className}`}>
        {t('authModal.turnstileNotConfigured')}
      </div>
    );
  }

  return (
    <div className={`flex justify-center my-2 min-h-[65px] ${className}`}>
      <div ref={containerRef} />
    </div>
  );
};
