import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { cookieMaxAge, cookieName, defineCustomServerStrategy } from '#lib/paraglide/runtime.js';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { isSupportedLocale, type SupportedLocale } from '#lib/shared/locale.ts';

/**
 * The signed-in user's saved language, per request. Paraglide's `custom-session` strategy (first
 * in paraglide.config.ts) reads it, so a user's preference beats the cookie and Accept-Language.
 * Keyed by the request object rather than a header, so a client can't supply it.
 */
const sessionLocales = new WeakMap<Request, SupportedLocale>();

defineCustomServerStrategy('custom-session', {
	getLocale: (request) => (request ? sessionLocales.get(request) : undefined)
});

/** Called by hooks.server.ts once the session is known, before Paraglide resolves the locale. */
export function rememberSessionLocale(request: Request, locale: string): void {
	if (isSupportedLocale(locale)) sessionLocales.set(request, locale);
}

export function setLocaleCookie(cookies: Cookies, locale: SupportedLocale): void {
	// Not httpOnly: Paraglide's client runtime reads and writes the same cookie.
	cookies.set(cookieName, locale, {
		path: '/',
		maxAge: cookieMaxAge,
		sameSite: 'lax',
		httpOnly: false
	});
}

/**
 * Applies a language the user picked. Every language switch goes through here (the settings and
 * onboarding actions), never through a client-only `setLocale()`: for a signed-in user the saved
 * preference outranks the cookie, so changing only the cookie would be undone on the next request.
 */
export async function saveLocaleChoice(
	event: RequestEvent,
	locale: SupportedLocale
): Promise<void> {
	setLocaleCookie(event.cookies, locale);
	const user = event.locals.user;
	if (!user) return;
	await db.update(users).set({ locale }).where(eq(users.id, user.id));
	user.locale = locale;
}
