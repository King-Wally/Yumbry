import type { Handle } from '@sveltejs/kit/hooks';

/** helmet 8's defaults, which main sent on every response, except the Referrer-Policy (below). The
 * Content-Security-Policy is SvelteKit's (`csp` in vite.config.ts), so it can carry nonces for
 * Kit's inline scripts. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
	'cross-origin-opener-policy': 'same-origin',
	'cross-origin-resource-policy': 'same-origin',
	'origin-agent-cluster': '?1',
	// Not helmet's `no-referrer`: under that, Chrome sends `Origin: null` on a native form POST, and
	// SvelteKit's CSRF check refuses it, so every form submitted before hydration failed.
	// `same-origin` still sends nothing to other sites.
	'referrer-policy': 'same-origin',
	'strict-transport-security': 'max-age=31536000; includeSubDomains',
	'x-content-type-options': 'nosniff',
	'x-dns-prefetch-control': 'off',
	'x-download-options': 'noopen',
	'x-frame-options': 'SAMEORIGIN',
	'x-permitted-cross-domain-policies': 'none',
	'x-xss-protection': '0'
};

/** Adds SECURITY_HEADERS to every response Kit renders, leaving any a route set itself alone.
 * Static assets never pass through hooks (adapter-node serves them first). They are
 * content-hashed scripts, styles and icons; `/uploads` sets its own headers. */
export const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}
	return response;
};
