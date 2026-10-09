import { BROWSER_CDP_URL, BROWSER_PROXY_HOST } from '$app/env/private';
import {
	chromium,
	errors as playwrightErrors,
	type Browser,
	type BrowserContext
} from 'playwright-core';
import {
	assertSafeTarget,
	hasBotChallengeMarkers,
	hasSolvableChallengeMarkers,
	type SafeFetchResult
} from '#lib/server/url-import/safe-fetch.ts';
import { startSsrfProxy } from '#lib/server/url-import/ssrf-proxy.ts';
import { UrlImportError } from '#lib/server/url-import/errors.ts';

// Fallback for pages whose bot protection (e.g. Cloudflare's "Just a moment…") needs a real
// browser: the challenge script runs, sets its clearance cookie and reloads into the actual page.
// The browser is CloakBrowser, a Chromium with its fingerprint and automation tells patched out in
// the binary itself, running as a long-lived CDP server (`cloakserve`, the compose `browser`
// sidecar) at BROWSER_CDP_URL; unset means the fallback is off. Because the stealth is in the
// binary, the driver is stock playwright-core and needs no particular version. Its identity
// (headful or not, locale, timezone) is set on that server; emulating any of it here over CDP
// would be detectable.

export interface HeadlessFetchOptions {
	timeoutMs?: number;
	maxBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const POLL_INTERVAL_MS = 500;
// How long a page without recipe data must sit without navigating before we accept it. Covers bot
// interstitials we don't recognise, which reload themselves a second or two in.
const SETTLE_MS = 2_000;
const MAX_CONCURRENT_FETCHES = 2;

// Never needed to read a recipe's markup. Images and fonts do load, as they would for a person:
// some bot sensors notice a page that never fetches them.
const BLOCKED_RESOURCE_TYPES = new Set(['media']);

export function isHeadlessFetchConfigured(): boolean {
	return Boolean(BROWSER_CDP_URL);
}

/** First-pass filter on each browser request, before its host is checked. The SSRF proxy is the
 * real guard; this just skips needless downloads and odd schemes early. */
export function isRequestAllowed(url: string, resourceType: string): boolean {
	if (BLOCKED_RESOURCE_TYPES.has(resourceType)) return false;
	try {
		const { protocol } = new URL(url);
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

/** Whether the browser was left on a bot-protection page. Recipe data means it reached the real
 * page, even if the markers match: sites embed Cloudflare Turnstile in their own forms
 * (tasteatlas.com does, for sign-in), which carries the same `challenges.cloudflare.com` script and
 * `cf-chl` ids as the interstitial. */
export function isBlockedPage(html: string, hasJsonLd: boolean): boolean {
	return !hasJsonLd && hasBotChallengeMarkers(html);
}

let activeFetches = 0;
const waiting: (() => void)[] = [];

async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
	if (activeFetches >= MAX_CONCURRENT_FETCHES) {
		await new Promise<void>((resolve) => waiting.push(resolve));
	}
	activeFetches++;
	try {
		return await fn();
	} finally {
		activeFetches--;
		waiting.shift()?.();
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function headlessFetchHtml(
	rawUrl: string,
	options?: HeadlessFetchOptions
): Promise<SafeFetchResult> {
	const cdpUrl = BROWSER_CDP_URL;
	if (!cdpUrl) throw new Error('BROWSER_CDP_URL is not set.');

	const url = new URL(rawUrl);
	// Fail fast with the proper error kind; the proxy re-checks every hop anyway.
	await assertSafeTarget(url);

	return withConcurrencyLimit(() => fetchWithBrowser(cdpUrl, url, options));
}

async function fetchWithBrowser(
	cdpUrl: string,
	url: URL,
	options?: HeadlessFetchOptions
): Promise<SafeFetchResult> {
	const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
	const deadline = Date.now() + timeoutMs;

	// Connection failures here are not UrlImportErrors: the caller reads that as "fallback
	// unavailable" and reports the original fetch's error instead.
	const proxy = await startSsrfProxy(BROWSER_PROXY_HOST || '127.0.0.1');
	let browser: Browser | undefined;
	let context: BrowserContext | undefined;
	try {
		browser = await chromium.connectOverCDP(cdpUrl, { timeout: 10_000 });
		// The browser is shared and outlives this fetch, so everything happens in a context of our
		// own. No UA, viewport or locale overrides: the binary's persona is already consistent.
		context = await browser.newContext({
			viewport: null,
			serviceWorkers: 'block',
			proxy: { server: proxy.server, username: proxy.username, password: proxy.password }
		});

		let navigationBlocked = false;
		await context.route('**/*', (route, request) => {
			if (isRequestAllowed(request.url(), request.resourceType())) return route.continue();
			if (request.isNavigationRequest()) navigationBlocked = true;
			return route.abort('blockedbyclient');
		});
		await context.routeWebSocket(/.*/, (ws) => ws.close());

		const page = await context.newPage();
		let lastNavigationAt = Date.now();
		page.on('framenavigated', (frame) => {
			if (frame === page.mainFrame()) lastNavigationAt = Date.now();
		});
		try {
			await page.goto(url.toString(), {
				waitUntil: 'domcontentloaded',
				timeout: Math.max(deadline - Date.now(), 1)
			});
		} catch (err) {
			if (navigationBlocked) {
				throw new UrlImportError(
					"That URL points to a private or internal network address, which isn't allowed.",
					'blocked_url',
					err
				);
			}
			if (err instanceof playwrightErrors.TimeoutError) {
				throw new UrlImportError(
					'The page took too long to respond. Try again or check the URL.',
					'timeout',
					err
				);
			}
			throw new UrlImportError(
				'Could not reach that URL. Check the address and try again.',
				'network_error',
				err
			);
		}

		// A challenge page solves itself and reloads (or navigates) into the real page, so poll until
		// recipe data shows up. A hard block never clears, so stop as soon as that's all that's left;
		// any other page without JSON-LD is accepted once it stops navigating. Reading content
		// mid-navigation throws; that just means "not yet".
		let html = '';
		let hasJsonLd = false;
		for (;;) {
			try {
				html = await page.content();
				hasJsonLd = (await page.locator('script[type="application/ld+json"]').count()) > 0;
				if (hasJsonLd) break;
				const solvable = hasSolvableChallengeMarkers(html);
				if (!solvable && hasBotChallengeMarkers(html)) break;
				if (!solvable && Date.now() - lastNavigationAt >= SETTLE_MS) break;
			} catch {
				// Navigation in progress.
			}
			if (Date.now() + POLL_INTERVAL_MS > deadline) break;
			await sleep(POLL_INTERVAL_MS);
		}

		if (isBlockedPage(html, hasJsonLd)) {
			throw new UrlImportError(
				"That site's bot protection blocked import, even with a real browser.",
				'bot_challenge'
			);
		}
		if (Buffer.byteLength(html) > maxBytes) {
			throw new UrlImportError('That page is too large to import.', 'too_large');
		}

		return { html, contentType: 'text/html', finalUrl: page.url() };
	} finally {
		// Closing a CDP-connected browser only disconnects; the server's browser keeps running.
		await context?.close().catch(() => {});
		await browser?.close().catch(() => {});
		await proxy.close();
	}
}
