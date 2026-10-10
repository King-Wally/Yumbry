import { isSupportedLocale, type SupportedLocale } from '#lib/shared/i18n/locale.ts';

// Transitional: moves the language a v1.x install kept in localStorage into the locale cookie, once
// per browser. Remove this file, its spec and its call in hooks.client.ts once those installs are
// gone.

/** The localStorage key holding the visitor's language. Read once, then removed. */
export const LEGACY_LOCALE_STORAGE_KEY = 'yumbry.locale';

interface LegacyLocaleMigration {
	/** Remove the localStorage key. */
	remove: boolean;
	/** Write this locale to the cookie. */
	cookie?: SupportedLocale;
	/** Reload, so the server renders the page in the carried-over language. */
	reload: boolean;
}

/**
 * Decides how to carry the stored choice over to the locale cookie. The key is
 * always removed. The value only fills a missing cookie, so a choice made since then (or a
 * signed-in user's saved preference, which the server mirrors into the cookie) is never
 * overwritten. Once the cookie exists, a stale key can't trigger another reload.
 */
export function planLegacyLocaleMigration(input: {
	stored: string | null;
	hasCookie: boolean;
	current: string;
}): LegacyLocaleMigration {
	if (input.stored === null) return { remove: false, reload: false };
	if (input.hasCookie || !isSupportedLocale(input.stored)) return { remove: true, reload: false };
	return { remove: true, cookie: input.stored, reload: input.stored !== input.current };
}
