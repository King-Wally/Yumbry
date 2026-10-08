import { setLocale } from '#lib/paraglide/runtime.js';
import type { SupportedLocale } from '#lib/shared/locale.ts';

/**
 * Switches the page to a language the server has just saved (`saveLocaleChoice`), without a reload.
 * Paraglide's `custom-session` client strategy (hooks.client.ts) moves `<html lang>`, which is
 * where the client reads the locale from. Call it before invalidating: the root layout re-renders
 * when the reloaded `data.locale` changes, and its messages then come out in the new language.
 */
export function applyLocale(locale: SupportedLocale): void {
	void setLocale(locale, { reload: false });
}
