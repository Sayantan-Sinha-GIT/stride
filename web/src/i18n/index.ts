import en from './en.json';
import hi from './hi.json';

export type Locale = 'en' | 'hi';
export type Messages = typeof en;

const DICTIONARIES: Record<Locale, Messages> = { en, hi };

export function normalizeLocale(input?: string | null): Locale {
  return input === 'hi' ? 'hi' : 'en';
}

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale] ?? en;
}
