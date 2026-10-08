import type { RequestEvent } from '@sveltejs/kit';

// A one-shot notice for the page a form action redirects to, shown as a toast by the root layout.
// A cookie rather than an enhance callback, so it also survives a plain form POST (no JS yet, or a
// click that landed before hydration). It carries a key, not text, so the toast is rendered in the
// viewer's language.

export const FLASH_COOKIE = 'yumbry-flash';
const FLASH_KEYS = ['family_joined', 'recipe_imported'] as const;
export type FlashKey = (typeof FLASH_KEYS)[number];

export function setFlash(event: RequestEvent, key: FlashKey): void {
	event.cookies.set(FLASH_COOKIE, key, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60
	});
}

/** The pending notice (forgetting it), or null. */
export function takeFlash(event: RequestEvent): FlashKey | null {
	const raw = event.cookies.get(FLASH_COOKIE);
	if (raw === undefined) return null;
	event.cookies.delete(FLASH_COOKIE, { path: '/' });
	return (FLASH_KEYS as readonly string[]).includes(raw) ? (raw as FlashKey) : null;
}
