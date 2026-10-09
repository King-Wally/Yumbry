import type { RequestEvent } from '@sveltejs/kit';

// Where a signed-out visitor was headed, kept for the login (or register → onboarding) that
// follows. A cookie rather than a `?redirectTo=` query, so protected pages redirect to a bare
// /login (the e2e specs expect exactly that URL).

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

/** Remembers the current page as the place to return to after logging in. A form action can't be
 * replayed by a redirect, so for anything but a GET it only remembers an explicit `path`: the page
 * the action belongs to (the join-family page sends a signed-out visitor to log in this way). */
export function rememberReturnTo(event: RequestEvent, path?: string): void {
	if (path === undefined && event.request.method !== 'GET') return;
	event.cookies.set(RETURN_TO_COOKIE, path ?? event.url.pathname + event.url.search, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: TEN_MINUTES_SECONDS
	});
}

/** Remembers the page a link to /login or /register asked to come back to (`?redirectTo=`, a
 * same-origin path only). Explicit links use this, like the public share page's "Log in"; a
 * protected page sends a bare /login and remembers itself instead (`requireUser`). */
export function rememberRequestedReturnTo(event: RequestEvent): void {
	const requested = safeReturnPath(
		event.url.searchParams.get('redirectTo') ?? undefined,
		event.url.origin
	);
	if (requested !== null) rememberReturnTo(event, requested);
}

/** The remembered page (forgetting it), or `/`. */
export function takeReturnTo(event: RequestEvent): string {
	const raw = event.cookies.get(RETURN_TO_COOKIE);
	if (raw === undefined) return '/';
	event.cookies.delete(RETURN_TO_COOKIE, { path: '/' });
	return safeReturnPath(raw, event.url.origin) ?? '/';
}
