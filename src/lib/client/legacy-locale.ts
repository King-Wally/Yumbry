import { isSupportedLocale, type SupportedLocale } from '#lib/shared/i18n/locale.ts';

/** Where main's React app kept a visitor's language. Read once, then removed. */
export const LEGACY_LOCALE_STORAGE_KEY = 'yumbry.locale';

export interface LegacyLocaleMigration {
	/** Remove the localStorage key. */
	remove: boolean;
	/** Write this locale to the cookie. */
	cookie?: SupportedLocale;
	/** Reload, so the server renders the page in the carried-over language. */
	reload: boolean;
}

/**
 * Decides how to carry a choice from main's localStorage over to the locale cookie. The key is
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
