import {
	headlessFetchHtml,
	isHeadlessFetchConfigured
} from '#lib/server/url-import/headless-fetch.ts';
import { parseRecipeFromJsonLd } from '#lib/server/recipes/jsonld-import.ts';
import type { RecipeBody } from '#lib/server/recipes/body-schema.ts';
import { safeFetchHtml } from '#lib/server/url-import/safe-fetch.ts';
import { UrlImportError, type ImportMethod } from '#lib/server/url-import/errors.ts';
import type { SupportedLocale } from '#lib/shared/i18n/locale.ts';

// Sent as Accept-Language so the source page (where it supports content negotiation) and any
// bot-mitigation in front of it see a request that looks like the user's own browser, not a
// hardcoded default.
const ACCEPT_LANGUAGE_BY_LOCALE: Record<SupportedLocale, string> = {
	en: 'en-US,en;q=0.9',
	nl: 'nl,en;q=0.8',
	fr: 'fr,en;q=0.8',
	es: 'es,en;q=0.8'
};

/** The raw text of every `<script type="application/ld+json">` on the page, in order. */
function jsonLdBlocks(html: string): string[] {
	const blocks: string[][] = [];
	new HTMLRewriter()
		.on('script[type="application/ld+json"]', {
			element() {
				blocks.push([]);
			},
			text(chunk) {
				blocks.at(-1)?.push(chunk.text);
			}
		})
		.transform(html);
	return blocks.map((parts) => parts.join(''));
}

/** The first JSON-LD block on the page that holds a schema.org Recipe, as a recipe body. */
export function extractRecipeFromHtml(html: string): RecipeBody {
	const blocks = jsonLdBlocks(html);

	if (blocks.length === 0) {
		throw new UrlImportError(
			'No structured recipe data (JSON-LD) was found on that page.',
			'no_jsonld'
		);
	}

	for (const text of blocks) {
		if (!text.trim()) continue;
		try {
			return parseRecipeFromJsonLd(text);
		} catch {
			continue;
		}
	}

	throw new UrlImportError('No schema.org Recipe was found on that page.', 'no_recipe_found');
}

// Statuses bot protection answers with even when its page doesn't match our challenge markers
// (allrecipes.com, for one, answers a non-browser client with a bare 402).
const RETRYABLE_HTTP_STATUSES = new Set([401, 402, 403, 429, 503]);

/** Whether a plain-fetch failure might be bot protection a real browser could get past. A page with
 * no JSON-LD counts too: some challenge pages come back as an ordinary 200. */
function shouldRetryHeadless(err: unknown): boolean {
	if (!(err instanceof UrlImportError)) return false;
	if (err.kind === 'bot_challenge' || err.kind === 'no_jsonld') return true;
	return (
		err.kind === 'network_error' &&
		err.httpStatus !== undefined &&
		RETRYABLE_HTTP_STATUSES.has(err.httpStatus)
	);
}

/** `trace.method` is set to the last method attempted, also when the import then fails, so the
 * caller can log it either way. */
export async function scrapeRecipeFromUrl(
	url: string,
	locale?: SupportedLocale,
	trace?: { method?: ImportMethod }
): Promise<RecipeBody> {
	const acceptLanguage = locale ? ACCEPT_LANGUAGE_BY_LOCALE[locale] : undefined;
	if (trace) trace.method = 'server';
	try {
		const { html } = await safeFetchHtml(url, { acceptLanguage });
		return extractRecipeFromHtml(html);
	} catch (err) {
		if (!shouldRetryHeadless(err) || !isHeadlessFetchConfigured()) throw err;

		if (trace) trace.method = 'browser';
		let html: string;
		try {
			({ html } = await headlessFetchHtml(url));
		} catch (headlessErr) {
			if (headlessErr instanceof UrlImportError) throw headlessErr;
			// The browser itself is unreachable or crashed: report the original failure.
			console.warn('Headless URL import fallback failed:', headlessErr);
			throw err;
		}
		return extractRecipeFromHtml(html);
	}
}
