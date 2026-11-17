export interface LanguageMeta {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  status: 'active' | 'coming_soon';
}

export const DEFAULT_LANGUAGE = 'vi';

export const AVAILABLE_LANGUAGES: LanguageMeta[] = [
  {
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    flag: '🇻🇳',
    status: 'active',
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
    status: 'active',
  },
];
