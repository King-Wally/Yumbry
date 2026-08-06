import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { SupportedLocale } from 'yumbry-shared';
import en from './locales/en.json';
import nl from './locales/nl.json';
import fr from './locales/fr.json';
import es from './locales/es.json';

export const LOCALE_STORAGE_KEY = 'yumbry.locale';

const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'nl', 'fr', 'es'];

function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return Boolean(value) && SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

// localStorage isn't guaranteed to be a usable Storage implementation in
// every environment this module loads in (e.g. some test runners stub a
// non-conforming global) — read/write defensively rather than letting i18n
// init throw and take the whole app down with it.
function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLocale(locale: SupportedLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore — locale still applies for the current session via i18n.changeLanguage.
  }
}

function detectInitialLocale(): SupportedLocale {
  const stored = readStoredLocale();
  if (isSupportedLocale(stored)) return stored;

  const browserLang = navigator.language?.slice(0, 2).toLowerCase();
  if (isSupportedLocale(browserLang)) return browserLang;

  return 'en';
}

void i18n.use(initReactI18next).init({
  lng: detectInitialLocale(),
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
    nl: { translation: nl },
    fr: { translation: fr },
    es: { translation: es },
  },
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Switches the active UI language and persists it so the next page load
 * (before the authenticated user is fetched) still starts in the right
 * language. Called once the current user's `locale` is known — see
 * `App.tsx`. */
export function setActiveLocale(locale: SupportedLocale): void {
  writeStoredLocale(locale);
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
}

export default i18n;
