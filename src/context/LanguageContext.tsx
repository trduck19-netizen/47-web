import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import viLocale from '../locales/vi.json';
import enLocale from '../locales/en.json';
import thLocale from '../locales/th.json';
import {
  AVAILABLE_LANGUAGES,
  ACTIVE_LANGUAGES,
  DEFAULT_LANGUAGE,
  type LanguageMeta,
  type SupportedLanguage,
} from '../i18n/config';
import { formatCurrency, formatDateTime, formatNumber } from '../utils/formatUtils';

export type TranslationDict = typeof viLocale;

interface LanguageContextType {
  language: string;
  setLanguage: (lang: string) => void;
  /**
   * Hàm dịch hỗ trợ cả 2 cách gọi:
   * 1. t('nav.catalog')
   * 2. t.nav.catalog
   */
  t: ((key: string, params?: Record<string, any>) => string) & TranslationDict;
  formatCurrency: (amount: number | null | undefined) => string;
  formatDateTime: (date: string | number | Date | null | undefined, options?: { showTimezone?: boolean; includeTime?: boolean }) => string;
  formatNumber: (num: number | null | undefined) => string;
  availableLanguages: LanguageMeta[];
  activeLanguages: LanguageMeta[];
  currentLanguageMeta: LanguageMeta;
  /** Chế độ kiểm tra tràn khung và phát hiện chữ ghi cứng nội bộ */
  isPseudo: boolean;
  setIsPseudo: (enabled: boolean) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
const LANGUAGE_STORAGE_KEY = 'pine_language';

// Từ điển ngôn ngữ nội bộ
const dictionaries: Record<string, any> = {
  vi: viLocale,
  en: enLocale,
  th: thLocale,
};

/**
 * Hàm tra cứu giá trị theo dot notation: "checkout.shippingSectionTitle"
 */
function getNestedValue(obj: any, path: string): string | undefined {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Bảng biến đổi ký tự Pseudolocalization:
 * Kéo dài văn bản ~30%, thêm dấu phụ quốc tế để kiểm thử tràn khung ngang và lộ chữ ghi cứng
 */
const PSEUDO_ACCENTS: Record<string, string> = {
  a: 'á', b: 'ḅ', c: 'ç', d: 'đ', e: 'é', f: 'ƒ', g: 'ğ', h: 'ĥ',
  i: 'í', j: 'ĵ', k: 'ķ', l: 'ł', m: 'ḿ', n: 'ñ', o: 'ó', p: 'ƥ',
  q: 'ʠ', r: 'ř', s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ',
  y: 'ý', z: 'ž',
  A: 'Á', B: 'Ḅ', C: 'Ç', D: 'Đ', E: 'É', F: 'Ƒ', G: 'Ğ', H: 'Ĥ',
  I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ł', M: 'Ḿ', N: 'Ñ', O: 'Ó', P: 'Ƥ',
  Q: 'Ǫ', R: 'Ř', S: 'Š', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ',
  Y: 'Ý', Z: 'Ž',
};

export function pseudolocalize(text: string): string {
  if (!text || typeof text !== 'string') return text;
  if (/^\s*$/.test(text) || /^https?:\/\//i.test(text) || text.startsWith('/')) return text;

  // Bảo vệ tokens và tags cú pháp
  const tokens: string[] = [];
  const placeholder = text.replace(/(\{[^}]+\}|<[^>]+>)/g, (match) => {
    tokens.push(match);
    return `___TOKEN_${tokens.length - 1}___`;
  });

  let pseudo = '';
  for (let i = 0; i < placeholder.length; i++) {
    const ch = placeholder[i];
    const transformed = PSEUDO_ACCENTS[ch] || ch;
    pseudo += transformed;
    // Kéo dài nguyên âm thêm 1 ký tự (~30% dài hơn)
    if (/[aeiouyAEIOUY]/.test(ch)) {
      pseudo += transformed;
    }
  }

  tokens.forEach((tok, idx) => {
    pseudo = pseudo.replace(`___TOKEN_${idx}___`, tok);
  });

  return `[!!! ${pseudo} !!!]`;
}

function detectInitialPseudoMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const testMode = params.get('i18n-test')?.toLowerCase();
    const pseudoParam = params.get('pseudo')?.toLowerCase();
    if (testMode === 'pseudo' || pseudoParam === 'true' || pseudoParam === '1') {
      return true;
    }
    const sessionFlag = sessionStorage.getItem('pine_pseudo_i18n');
    if (sessionFlag === 'true') {
      return true;
    }
  } catch {}
  return false;
}

/**
 * Thay thế biến: {name}, {count}
 */
function interpolate(template: string, params?: Record<string, any>): string {
  if (!params || !template) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

/**
 * Phát hiện ngôn ngữ ban đầu theo thứ tự ưu tiên:
 * 1. Tham số truy vấn URL (?lang=en hoặc ?lang=vi)
 * 2. Tiền tố URL path (/en/, /en, /vi/, /vi)
 * 3. Lựa chọn đã lưu của user trong localStorage (tôn trọng khi tải lại trang hoặc mở tab mới)
 * 4. Ngôn ngữ của trình duyệt (navigator.language)
 * 5. Mặc định là Tiếng Việt (DEFAULT_LANGUAGE = 'vi')
 */
function detectInitialLanguage(): string {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;

  try {
    // 1. Tham số URL query: ?lang=en hoặc ?lang=vi
    const params = new URLSearchParams(window.location.search);
    const qLang = params.get('lang')?.toLowerCase();
    if (qLang && ACTIVE_LANGUAGES.some((l) => l.code === qLang)) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, qLang);
      return qLang;
    }

    // 2. Tiền tố URL path: /en/, /en, /vi/, /vi
    const path = window.location.pathname.toLowerCase();
    for (const l of ACTIVE_LANGUAGES) {
      if (path === `/${l.code}` || path.startsWith(`/${l.code}/`)) {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, l.code);
        return l.code;
      }
    }

    // 3. Lựa chọn đã lưu của user trong localStorage
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && ACTIVE_LANGUAGES.some((l) => l.code === saved)) {
      return saved;
    }

    // 4. Ngôn ngữ trình duyệt
    if (typeof navigator !== 'undefined' && navigator.language) {
      const browserLang = navigator.language.toLowerCase();
      const match = ACTIVE_LANGUAGES.find((l) => browserLang.startsWith(l.code));
      if (match) return match.code;
    }
  } catch {}

  // 5. Mặc định là Tiếng Việt
  return DEFAULT_LANGUAGE;
}

/**
 * Chuẩn hóa URL đồng bộ với ngôn ngữ hiển thị:
 * - Tiếng Anh: luôn có tiền tố /en/ (hoặc /en/subpath), loại bỏ sạch tham số ?lang=...
 * - Tiếng Việt: luôn chuẩn hóa về / (hoặc subpath không tiền tố), loại bỏ sạch tham số ?lang=...
 */
function syncUrlWithLanguage(targetLang: string) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);

    // 1. Loại bỏ tham số ?lang=...
    url.searchParams.delete('lang');

    // 2. Chuẩn hóa path sạch không có tiền tố ngôn ngữ cũ
    let cleanPath = url.pathname;
    cleanPath = cleanPath.replace(/^\/(en|vi)(\/|$)/i, '/');
    if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;

    // 3. Gán tiền tố chuẩn theo ngôn ngữ mục tiêu
    if (targetLang === 'en') {
      url.pathname = cleanPath === '/' ? '/en/' : `/en${cleanPath}`;
    } else {
      url.pathname = cleanPath; // Tiếng Việt mặc định là / hoặc path gốc
    }

    const newUrl = url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '');
    const currentUrl = window.location.pathname + window.location.search + window.location.hash;

    if (newUrl !== currentUrl) {
      window.history.replaceState(null, '', newUrl);
    }
  } catch (e) {
    console.warn('[syncUrlWithLanguage error]', e);
  }
}

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<string>(detectInitialLanguage);
  const [isPseudo, setIsPseudoState] = useState<boolean>(detectInitialPseudoMode);

  const setIsPseudo = useCallback((enabled: boolean) => {
    setIsPseudoState(enabled);
    try {
      sessionStorage.setItem('pine_pseudo_i18n', enabled ? 'true' : 'false');
      window.dispatchEvent(new CustomEvent('pine_pseudo_changed', { detail: enabled }));
    } catch {}
  }, []);

  const setLanguage = useCallback((newLang: string) => {
    // Nhận bất kỳ ngôn ngữ nào trong ACTIVE_LANGUAGES, mặc định về DEFAULT_LANGUAGE ('vi')
    const isValid = ACTIVE_LANGUAGES.some((l) => l.code === newLang);
    const targetLang = isValid ? newLang : DEFAULT_LANGUAGE;
    setLanguageState(targetLang);

    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, targetLang);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = targetLang;
      }

      // Chuẩn hóa và đồng bộ URL tức thì mà không reload trang (Việc 2)
      syncUrlWithLanguage(targetLang);

      window.dispatchEvent(new CustomEvent('pine_language_changed', { detail: targetLang }));
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }

    // Chuẩn hóa URL ban đầu (xử lý ?lang=en thành /en/, ?lang=vi thành /)
    syncUrlWithLanguage(language);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === LANGUAGE_STORAGE_KEY && e.newValue) {
        if (ACTIVE_LANGUAGES.some((l) => l.code === e.newValue)) {
          setLanguageState(e.newValue);
          syncUrlWithLanguage(e.newValue);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [language]);

  // Lấy meta của ngôn ngữ hiện tại
  const currentLanguageMeta = useMemo(() => {
    return AVAILABLE_LANGUAGES.find((l) => l.code === language) || AVAILABLE_LANGUAGES[0];
  }, [language]);

  // Tạo hàm dịch đa năng t()
  const translateFn = useCallback(
    (key: string, params?: Record<string, any>): string => {
      const activeDict = dictionaries[language] || dictionaries.vi;
      // 1. Thử tìm trong ngôn ngữ hiện tại
      let val = getNestedValue(activeDict, key);

      // 2. Nếu thiếu, fallback về tiếng Việt
      if (!val && language !== 'vi') {
        val = getNestedValue(dictionaries.vi, key);
      }

      // 3. Nếu vẫn thiếu, format lại key sạch
      if (!val) {
        val = key.split('.').pop() || key;
      }

      const translated = interpolate(val, params);
      if (isPseudo) {
        return pseudolocalize(translated);
      }
      return translated;
    },
    [language, isPseudo]
  );

  // Tạo Proxy để hỗ trợ cả t('path') và t.section.key đa tầng đệ quy
  const t = useMemo(() => {
    const currentDict = dictionaries[language] || dictionaries.vi;
    const fallbackDict = dictionaries.vi;

    const createRecursiveProxy = (currentObj: any, fallbackObj: any): any => {
      return new Proxy(currentObj || {}, {
        get(target, prop) {
          if (typeof prop === 'string') {
            const curVal = target[prop];
            const fbVal = fallbackObj && typeof fallbackObj === 'object' ? fallbackObj[prop] : undefined;
            const val = curVal !== undefined ? curVal : fbVal;
            if (val !== null && typeof val === 'object') {
              return createRecursiveProxy(val, fbVal);
            }
            const finalVal = val !== undefined ? val : prop;
            if (isPseudo && typeof finalVal === 'string') {
              return pseudolocalize(finalVal);
            }
            return finalVal;
          }
          return Reflect.get(target, prop);
        },
      });
    };

    const handler: ProxyHandler<any> = {
      get(target, prop, receiver) {
        if (typeof prop === 'string') {
          // Nếu truy cập thuộc tính như t.nav, t.header, t.mall...
          const currentVal = currentDict[prop];
          const fallbackVal = fallbackDict[prop];
          const val = currentVal !== undefined ? currentVal : fallbackVal;
          if (val !== undefined) {
            if (typeof val === 'object' && val !== null) {
              return createRecursiveProxy(val, fallbackVal);
            }
            if (isPseudo && typeof val === 'string') {
              return pseudolocalize(val);
            }
            return val;
          }
        }
        return Reflect.get(target, prop, receiver);
      },
      apply(target, thisArg, argArray) {
        const [key, params] = argArray;
        return translateFn(key, params);
      },
    };

    return new Proxy(translateFn, handler) as any;
  }, [language, isPseudo, translateFn]);

  // Helpers định dạng tiền tệ và ngày giờ gắn liền ngôn ngữ
  const handleFormatCurrency = useCallback(
    (amount: number | null | undefined) => formatCurrency(amount, language),
    [language]
  );

  const handleFormatDateTime = useCallback(
    (date: string | number | Date | null | undefined, options?: { showTimezone?: boolean; includeTime?: boolean }) =>
      formatDateTime(date, language, options),
    [language]
  );

  const handleFormatNumber = useCallback(
    (num: number | null | undefined) => formatNumber(num, language),
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      formatCurrency: handleFormatCurrency,
      formatDateTime: handleFormatDateTime,
      formatNumber: handleFormatNumber,
      availableLanguages: AVAILABLE_LANGUAGES,
      activeLanguages: ACTIVE_LANGUAGES,
      currentLanguageMeta,
      isPseudo,
      setIsPseudo,
    }),
    [
      language,
      setLanguage,
      t,
      handleFormatCurrency,
      handleFormatDateTime,
      handleFormatNumber,
      currentLanguageMeta,
      isPseudo,
      setIsPseudo,
    ]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    // Fallback an toàn nếu render ngoài provider
    const fallbackTranslate = (key: string) => {
      const parts = key.split('.');
      let cur: any = viLocale;
      for (const p of parts) {
        if (cur && typeof cur === 'object') cur = cur[p];
      }
      return typeof cur === 'string' ? cur : key;
    };
    return {
      language: 'vi',
      setLanguage: () => {},
      t: fallbackTranslate as any,
      formatCurrency: (amount) => formatCurrency(amount, 'vi'),
      formatDateTime: (date, opt) => formatDateTime(date, 'vi', opt),
      formatNumber: (num) => formatNumber(num, 'vi'),
      availableLanguages: AVAILABLE_LANGUAGES,
      activeLanguages: ACTIVE_LANGUAGES,
      currentLanguageMeta: AVAILABLE_LANGUAGES[0],
      isPseudo: false,
      setIsPseudo: () => {},
    };
  }
  return context;
};
