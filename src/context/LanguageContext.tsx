import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { TRANSLATIONS } from '../i18n/translations';
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE, LanguageMeta } from '../i18n/config';

interface LanguageContextType {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string) => string;
  formatCurrency: (amount: number) => string;
  availableLanguages: LanguageMeta[];
  currentLanguageMeta: LanguageMeta;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
const STORAGE_KEY = 'universal_mall_language';

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && (saved === 'vi' || saved === 'en')) return saved;
    }
    return DEFAULT_LANGUAGE;
  });

  const setLanguage = (lang: string) => {
    const target = lang === 'en' ? 'en' : 'vi';
    setLanguageState(target);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, target);
      document.documentElement.lang = target;
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const currentLanguageMeta = useMemo(() => {
    return AVAILABLE_LANGUAGES.find(l => l.code === language) || AVAILABLE_LANGUAGES[0];
  }, [language]);

  const t = (key: string): string => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS['vi'];
    const parts = key.split('.');
    let cur = dict;
    for (const part of parts) {
      if (cur && typeof cur === 'object' && part in cur) {
        cur = cur[part];
      } else {
        // Fallback vi
        let fb = TRANSLATIONS['vi'];
        for (const p of parts) {
          if (fb && typeof fb === 'object' && p in fb) fb = fb[p];
          else return key;
        }
        return typeof fb === 'string' ? fb : key;
      }
    }
    return typeof cur === 'string' ? cur : key;
  };

  const formatCurrency = (amount: number): string => {
    if (language === 'en') {
      return `VND ${Number(amount || 0).toLocaleString('en-US')}`;
    }
    return `${Number(amount || 0).toLocaleString('vi-VN')}đ`;
  };

  return (
    <LanguageContext.Provider value={{
      language,
      setLanguage,
      t,
      formatCurrency,
      availableLanguages: AVAILABLE_LANGUAGES,
      currentLanguageMeta,
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};
