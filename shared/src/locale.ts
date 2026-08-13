/**
 * The locales the app ships UI translations for. Lives here rather than alongside the AI prompt
 * code that used to own it: the auth schema, the settings page and the unit label tables all need
 * it and have nothing to do with the AI assistant.
 */
export const SUPPORTED_LOCALES = ['en', 'nl', 'fr', 'es'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** English names for the languages, used when telling the model which language to write in. */
export const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  nl: 'Flemish Dutch',
  fr: 'French',
  es: 'Spanish',
};

/**
 * Which decimal separator a rendered amount uses. English recipes write "2.5", the other three
 * write "2,5" — and the backend's ingredient parser normalizes a leading decimal comma, so both
 * survive the round trip into the `amount` column.
 */
export function decimalSeparator(locale: SupportedLocale): '.' | ',' {
  return locale === 'en' ? '.' : ',';
}
