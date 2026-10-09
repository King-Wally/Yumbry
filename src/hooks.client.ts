import type { ClientInit } from '@sveltejs/kit/hooks';
import {
	cookieMaxAge,
	cookieName,
	defineCustomClientStrategy,
	isLocale
} from '#lib/paraglide/runtime.js';
import { LEGACY_LOCALE_STORAGE_KEY, planLegacyLocaleMigration } from '#lib/client/legacy-locale.ts';
import { checkServer, observeFetch } from '#lib/client/server-status.svelte.ts';

// The server resolved the locale (#lib/server/http/locale.ts) and rendered it into <html lang>. The
// client trusts that answer instead of re-deriving it from the cookie, which a signed-in user's
// saved preference outranks.
defineCustomClientStrategy('custom-session', {
	getLocale: () => {
		const lang = document.documentElement.lang;
		return isLocale(lang) ? lang : undefined;
	},
	setLocale: (locale) => {
		document.documentElement.lang = locale;
	}
});

function hasLocaleCookie(): boolean {
	return document.cookie.split(/;\s*/).some((part) => part.startsWith(`${cookieName}=`));
}

// Transitional, with #lib/client/legacy-locale.ts; remove the two together.
function migrateLegacyLocale(): void {
	let stored: string | null;
	try {
		stored = localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);
	} catch {
		return;
	}
	const plan = planLegacyLocaleMigration({
		stored,
		hasCookie: hasLocaleCookie(),
		current: document.documentElement.lang
	});
	if (plan.remove) {
		try {
			localStorage.removeItem(LEGACY_LOCALE_STORAGE_KEY);
		} catch {
			// Ignore: the cookie, once written, makes a leftover key harmless.
		}
	}
	if (plan.cookie) {
		document.cookie = `${cookieName}=${plan.cookie}; path=/; max-age=${cookieMaxAge}; samesite=lax`;
	}
	if (plan.reload) location.reload();
}

export const init: ClientInit = () => {
	migrateLegacyLocale();
	// SSR rendered this page, which says nothing about whether the server still answers the
	// client (see #lib/client/server-status.svelte.ts).
	observeFetch();
	void checkServer();
};
