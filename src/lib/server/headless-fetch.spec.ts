import { describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({ env: { BROWSER_CDP_URL: undefined as string | undefined } }));

vi.mock('$app/env/private', () => ({
	get BROWSER_CDP_URL() {
		return env.BROWSER_CDP_URL;
	},
	BROWSER_PROXY_HOST: undefined,
	E2E_SAFE_FETCH_ALLOW: undefined
}));

const { isBlockedPage, isHeadlessFetchConfigured, isRequestAllowed } =
	await import('#lib/server/headless-fetch.ts');

describe('isRequestAllowed', () => {
	it('lets documents, scripts and XHR through, since a challenge needs them', () => {
		expect(isRequestAllowed('https://example.com/', 'document')).toBe(true);
		expect(isRequestAllowed('https://example.com/cdn-cgi/challenge.js', 'script')).toBe(true);
		expect(isRequestAllowed('https://example.com/api', 'xhr')).toBe(true);
	});

	it('loads images and fonts like a person would, but skips media', () => {
		expect(isRequestAllowed('https://example.com/a.jpg', 'image')).toBe(true);
		expect(isRequestAllowed('https://example.com/a.woff2', 'font')).toBe(true);
		expect(isRequestAllowed('https://example.com/a.mp4', 'media')).toBe(false);
	});

	it('blocks non-http schemes', () => {
		expect(isRequestAllowed('file:///etc/passwd', 'document')).toBe(false);
		expect(isRequestAllowed('ftp://example.com/', 'document')).toBe(false);
		expect(isRequestAllowed('not a url', 'document')).toBe(false);
	});
});

describe('isBlockedPage', () => {
	const interstitial =
		'<html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></body></html>';
	const recipeWithTurnstileForm =
		'<html><head><script type="application/ld+json">{"@type":"Recipe"}</script>' +
		'<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script></head>' +
		'<body><input type="hidden" name="cf-turnstile-response" id="cf-chl-widget-abc_response"></body></html>';

	it('flags a challenge page without recipe data', () => {
		expect(isBlockedPage(interstitial, false)).toBe(true);
	});

	it('accepts a recipe page that embeds Turnstile in its own forms', () => {
		expect(isBlockedPage(recipeWithTurnstileForm, true)).toBe(false);
	});

	it('accepts an ordinary page without markers', () => {
		expect(isBlockedPage('<html><body>Hello</body></html>', false)).toBe(false);
	});
});

describe('isHeadlessFetchConfigured', () => {
	it('is off when BROWSER_CDP_URL is unset', () => {
		env.BROWSER_CDP_URL = undefined;
		expect(isHeadlessFetchConfigured()).toBe(false);
	});

	it('is on when BROWSER_CDP_URL is set', () => {
		env.BROWSER_CDP_URL = 'http://browser:9222';
		expect(isHeadlessFetchConfigured()).toBe(true);
	});
});
