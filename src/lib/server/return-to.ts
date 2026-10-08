import type { RequestEvent } from '@sveltejs/kit';

// Where a signed-out visitor was headed, kept for the login (or register → onboarding) that
// follows. A cookie rather than a `?redirectTo=` query: the login page's URL is part of the
// contract (the e2e specs expect a bare /login), as it was on main, which kept it in router state.

export const RETURN_TO_COOKIE = 'yumbry-return-to';
const TEN_MINUTES_SECONDS = 10 * 60;

/** `raw` if it is a path on this app's origin, else null. Rejects absolute and protocol-relative
 * URLs (`//evil.example`, `/\evil.example`), so the value can't send anyone off-site. */
export function safeReturnPath(raw: string | undefined, origin: string): string | null {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
	try {
		const url = new URL(raw, origin);
		if (url.origin !== origin) return null;
		return url.pathname + url.search + url.hash;
	} catch {
		return null;
	}
}

/** Remembers the current page as the place to return to after logging in. GET only: a form
 * action can't be replayed by a redirect. */
export function rememberReturnTo(event: RequestEvent): void {
	if (event.request.method !== 'GET') return;
	event.cookies.set(RETURN_TO_COOKIE, event.url.pathname + event.url.search, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: TEN_MINUTES_SECONDS
	});
}

/** The remembered page (forgetting it), or `/`. */
export function takeReturnTo(event: RequestEvent): string {
	const raw = event.cookies.get(RETURN_TO_COOKIE);
	if (raw === undefined) return '/';
	event.cookies.delete(RETURN_TO_COOKIE, { path: '/' });
	return safeReturnPath(raw, event.url.origin) ?? '/';
}
