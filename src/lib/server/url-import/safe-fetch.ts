import { promises as dns } from 'node:dns';
import net from 'node:net';
import { E2E_SAFE_FETCH_ALLOW } from '$app/env/private';
import ipaddr from 'ipaddr.js';
import { CookieJar } from 'tough-cookie';
import { UrlImportError } from '#lib/server/url-import/errors.ts';

// The server-side fetch behind URL import. A user-supplied URL must never reach the app's own
// network, so every hop (the first request and each redirect) is resolved, checked, and then dialled
// at the address that check approved. Dialling by IP is what pins DNS: the hostname travels only in
// the Host header and TLS SNI, so a rebinding resolver gets no second chance. Don't swap this for
// an undici Agent with `connect.lookup`: Bun's built-in undici ignores the lookup and resolves the
// hostname itself (runtime.spec.ts guards both behaviours).
//
// Error messages here are for the import log; the user reads a translated message per kind.

export interface SafeFetchResult {
	html: string;
	contentType: string;
	finalUrl: string;
}

interface SafeFetchOptions {
	timeoutMs?: number;
	maxBytes?: number;
	maxRedirects?: number;
	/** `Accept-Language` header value to send, e.g. from the requesting user's app locale. Falls back
	 * to DEFAULT_ACCEPT_LANGUAGE when omitted. */
	acceptLanguage?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
/** The largest page either fetcher (this one or the headless fallback) accepts. */
export const MAX_PAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 10;
const DEFAULT_ACCEPT_LANGUAGE = 'en-US,en;q=0.9';

// Some sites front their pages with bot-mitigation (e.g. Colruyt runs Dynatrace) that serves a
// JS-challenge page with no recipe markup to requests that don't look like an ordinary browser. Send
// the header set a real desktop Chrome sends on a top-level navigation; the UA and client hints
// derive from one version so they never disagree (a mismatch is itself a bot signal).
const CHROME_MAJOR = 153;

const BROWSER_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;

const BROWSER_NAVIGATION_HEADERS: Record<string, string> = {
	accept:
		'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
	'sec-ch-ua': `"Chromium";v="${CHROME_MAJOR}", "Not=A?Brand";v="24", "Google Chrome";v="${CHROME_MAJOR}"`,
	'sec-ch-ua-mobile': '?0',
	'sec-ch-ua-platform': '"Windows"',
	'sec-fetch-dest': 'document',
	'sec-fetch-mode': 'navigate',
	'sec-fetch-site': 'none',
	'sec-fetch-user': '?1',
	'upgrade-insecure-requests': '1',
	'user-agent': BROWSER_USER_AGENT
};

function parseAllowedUrl(rawUrl: string): URL {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new UrlImportError('Not an http(s) URL.', 'invalid_url');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new UrlImportError('Not an http(s) URL.', 'invalid_url');
	}
	return url;
}

/** `url.hostname` keeps the brackets around an IPv6 literal; DNS and SNI want it bare. */
function bareHostname(url: URL): string {
	return url.hostname.replace(/^\[(.*)\]$/, '$1');
}

// Exact `host:port` entries (comma-separated) exempt from the private-address check, so the E2E
// suite can import from a fixture server on loopback. Unset in production.
function isAllowlistedForTests(url: URL): boolean {
	if (!E2E_SAFE_FETCH_ALLOW) return false;
	const port = url.port || (url.protocol === 'https:' ? '443' : '80');
	const target = `${url.hostname}:${port}`;
	return E2E_SAFE_FETCH_ALLOW.split(',')
		.map((entry) => entry.trim())
		.some((entry) => entry === target);
}

export interface ResolvedAddress {
	address: string;
	family: number;
}

/** Resolves the URL's host and checks every address it gave. The returned addresses are the only
 * ones a caller may dial for this URL. */
export async function assertSafeTarget(url: URL): Promise<ResolvedAddress[]> {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new UrlImportError('Not an http(s) URL.', 'invalid_url');
	}

	let addresses: ResolvedAddress[];
	try {
		addresses = await dns.lookup(bareHostname(url), { all: true });
	} catch (err) {
		throw new UrlImportError('Unreachable.', 'network_error', err);
	}
	if (addresses.length === 0) throw new UrlImportError('Host has no addresses.', 'network_error');

	if (isAllowlistedForTests(url)) return addresses;

	for (const { address } of addresses) {
		if (ipaddr.process(address).range() !== 'unicast') {
			throw new UrlImportError(`Non-unicast address ${address}.`, 'blocked_url');
		}
	}

	return addresses;
}

/** Fetches `url` from `address` without resolving its hostname: the IP goes in the URL, the
 * hostname in the Host header and, for https, in SNI, where Bun also verifies the certificate
 * against it. */
function pinnedFetch(
	url: URL,
	address: string,
	init: { headers: Record<string, string>; signal: AbortSignal }
): Promise<Response> {
	const dial = new URL(url);
	dial.hostname = net.isIPv6(address) ? `[${address}]` : address;
	return fetch(dial, {
		redirect: 'manual',
		signal: init.signal,
		headers: { ...init.headers, host: url.host },
		tls: url.protocol === 'https:' ? { serverName: bareHostname(url) } : undefined
	});
}

/** Records every `Set-Cookie` on `response` into `jar` against `url`, skipping any that fail to
 * parse rather than letting one bad cookie abort the whole fetch. */
async function storeCookies(jar: CookieJar, response: Response, url: URL): Promise<void> {
	await Promise.all(
		response.headers.getSetCookie().map((cookie) =>
			jar.setCookie(cookie, url.toString()).catch(() => {
				// Malformed or rejected cookie (e.g. domain mismatch): ignore and keep going.
			})
		)
	);
}

// Cloudflare (and similar CDN-level bot management) intercepts the request before it ever reaches
// the origin and returns an interstitial "checking your browser" page: a JS challenge (and sometimes
// a Turnstile CAPTCHA) that a plain server-side fetch can never pass. That page is ordinary
// text/html with a 403 (or 503) and none of the site's own markup, so it would look like a page
// that simply has no JSON-LD. Recognize it up front and fail with an honest message instead.
const BOT_CHALLENGE_STATUSES = new Set([401, 403, 429, 503]);
// A JS challenge that solves itself in a real browser and then reloads into the page: Cloudflare's
// "Just a moment…" interstitial.
const SOLVABLE_CHALLENGE_MARKERS = [/just a moment/i, /challenges\.cloudflare\.com/i, /cf-chl/i];
const BOT_CHALLENGE_MARKERS = [
	...SOLVABLE_CHALLENGE_MARKERS,
	// Cloudflare's WAF "you have been blocked" page: no challenge to solve, just a hard block, with
	// its own title and error-page markup.
	/attention required[^<]*\|\s*cloudflare/i,
	/cf-error-details/i,
	// Akamai's edge block: a bare "Access Denied" page with a "Reference #..." trace id.
	/<title>\s*access denied\s*<\/title>/i
];

/** Marker-only check, for callers (the headless fallback) that can't rely on a status code because
 * the challenge page reloads itself in place. */
export function hasBotChallengeMarkers(html: string): boolean {
	return BOT_CHALLENGE_MARKERS.some((marker) => marker.test(html));
}

/** Whether the page is a challenge worth waiting on, as opposed to a hard block that never clears
 * no matter how long the browser sits on it. */
export function hasSolvableChallengeMarkers(html: string): boolean {
	return SOLVABLE_CHALLENGE_MARKERS.some((marker) => marker.test(html));
}

function looksLikeBotChallenge(status: number, html: string): boolean {
	return BOT_CHALLENGE_STATUSES.has(status) && hasBotChallengeMarkers(html);
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
	if (!response.body) return '';

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new UrlImportError('Page too large.', 'too_large');
		}
		chunks.push(value);
	}

	return Buffer.concat(chunks).toString('utf-8');
}

export async function safeFetchHtml(
	rawUrl: string,
	options?: SafeFetchOptions
): Promise<SafeFetchResult> {
	const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxBytes = options?.maxBytes ?? MAX_PAGE_BYTES;
	const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
	const acceptLanguage = options?.acceptLanguage ?? DEFAULT_ACCEPT_LANGUAGE;

	let currentUrl = parseAllowedUrl(rawUrl);
	let addresses = await assertSafeTarget(currentUrl);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	const cookieJar = new CookieJar();

	try {
		for (let redirectCount = 0; ; redirectCount++) {
			const cookieHeader = await cookieJar.getCookieString(currentUrl.toString());

			let response: Response;
			try {
				response = await pinnedFetch(currentUrl, addresses[0].address, {
					signal: controller.signal,
					headers: {
						...BROWSER_NAVIGATION_HEADERS,
						'accept-language': acceptLanguage,
						...(cookieHeader ? { cookie: cookieHeader } : {})
					}
				});
			} catch (err) {
				if (controller.signal.aborted) {
					throw new UrlImportError('Timed out.', 'timeout', err);
				}
				throw new UrlImportError('Unreachable.', 'network_error', err);
			}

			await storeCookies(cookieJar, response, currentUrl);

			const location = response.headers.get('location');
			if (response.status >= 300 && response.status < 400 && location) {
				await response.body?.cancel();
				if (redirectCount >= maxRedirects) {
					throw new UrlImportError('Too many redirects.', 'too_many_redirects');
				}
				currentUrl = parseAllowedUrl(new URL(location, currentUrl).toString());
				addresses = await assertSafeTarget(currentUrl);
				continue;
			}

			const contentType = response.headers.get('content-type') ?? '';
			if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
				await response.body?.cancel();
				throw new UrlImportError(
					`Not HTML (${contentType || 'no content type'}).`,
					'unsupported_content_type'
				);
			}

			const html = await readBodyWithLimit(response, maxBytes);

			if (looksLikeBotChallenge(response.status, html)) {
				throw new UrlImportError(
					`Bot challenge (HTTP ${response.status}).`,
					'bot_challenge',
					undefined,
					{ httpStatus: response.status }
				);
			}

			// Anything else that isn't a success would otherwise reach the JSON-LD check and be
			// misreported as "no structured data found".
			if (response.status < 200 || response.status >= 300) {
				throw new UrlImportError(`HTTP ${response.status}.`, 'network_error', undefined, {
					httpStatus: response.status
				});
			}

			return { html, contentType, finalUrl: currentUrl.toString() };
		}
	} catch (err) {
		// A timeout can also fire while the body is streaming, after fetch itself resolved.
		if (controller.signal.aborted && !(err instanceof UrlImportError)) {
			throw new UrlImportError('Timed out.', 'timeout', err);
		}
		throw err;
	} finally {
		clearTimeout(timeout);
	}
}
