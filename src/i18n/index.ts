import en from './en.json';
import ar from './ar.json';

export type Locale = 'en' | 'ar';
export const locales: Locale[] = ['en', 'ar'];
export const defaultLocale: Locale = 'en';

const dicts = { en, ar } as const;

export type Dict = typeof en;

export function t(locale: Locale): Dict {
  return dicts[locale] ?? dicts.en;
}

export function localeDir(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export function loc(path: string, locale: Locale): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return locale === defaultLocale ? normalized : `/${locale}${normalized}`;
}
