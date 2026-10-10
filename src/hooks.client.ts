import type { ClientInit } from '@sveltejs/kit/hooks';
import { defineCustomClientStrategy, isLocale } from '#lib/paraglide/runtime.js';
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

export const init: ClientInit = () => {
	// SSR rendered this page, which says nothing about whether the server still answers the
	// client (see #lib/client/server-status.svelte.ts).
	observeFetch();
	void checkServer();
};
