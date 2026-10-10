/** The locales the app ships UI translations for. */
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
	es: 'Spanish'
};

/**
 * Which decimal separator a rendered amount uses. English recipes write "2.5", the other three
 * write "2,5"; `parseMeasurementPrefix` reads a leading decimal comma, so both survive the round
 * trip into the `amount` column.
 */
export function decimalSeparator(locale: SupportedLocale): '.' | ',' {
	return locale === 'en' ? '.' : ',';
}

/** Each language's name in that language, for the language pickers. */
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
	en: 'English',
	nl: 'Nederlands',
	fr: 'Français',
	es: 'Español'
};
