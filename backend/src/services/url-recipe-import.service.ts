import * as cheerio from 'cheerio';
import type { RecipeInput, SupportedLocale } from 'yumbry-shared';
import { parseRecipeFromJsonLd } from './jsonld-import.service.js';
import { headlessFetchHtml, isHeadlessFetchConfigured } from '../utils/headless-fetch.js';
import { safeFetchHtml } from '../utils/safe-fetch.js';
import { UrlImportError } from '../utils/url-import-error.js';

// Sent as Accept-Language so the source page (where it supports content
// negotiation) and any bot-mitigation in front of it see a request that looks
// like the user's own browser, not a hardcoded default.
const ACCEPT_LANGUAGE_BY_LOCALE: Record<SupportedLocale, string> = {
  en: 'en-US,en;q=0.9',
  nl: 'nl,en;q=0.8',
  fr: 'fr,en;q=0.8',
  es: 'es,en;q=0.8',
};

export function extractRecipeFromHtml(html: string): RecipeInput {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]').toArray();

  if (scripts.length === 0) {
    throw new UrlImportError(
      'No structured recipe data (JSON-LD) was found on that page.',
      'no_jsonld'
    );
  }

  for (const script of scripts) {
    const text = $(script).html();
    if (!text?.trim()) continue;

    try {
      const parsed = parseRecipeFromJsonLd(text);
      return {
        title: parsed.title,
        description: parsed.description,
        image_path: parsed.image_path,
        prep_time_minutes: parsed.prep_time_minutes,
        cook_time_minutes: parsed.cook_time_minutes,
        total_time_minutes: parsed.total_time_minutes,
        servings: parsed.servings,
        calories: parsed.calories,
        fat_content: parsed.fat_content,
        carbohydrate_content: parsed.carbohydrate_content,
        protein_content: parsed.protein_content,
        ingredients: parsed.ingredients.map((ingredient) => ingredient.raw_text),
        instructions: parsed.instructions,
        tags: parsed.tags,
        category: parsed.category,
      };
    } catch {
      continue;
    }
  }

  throw new UrlImportError('No schema.org Recipe was found on that page.', 'no_recipe_found');
}

// Statuses bot protection answers with even when its page doesn't match our challenge markers
// (allrecipes.com, for one, answers a non-browser client with a bare 402).
const RETRYABLE_HTTP_STATUSES = new Set([401, 402, 403, 429, 503]);

/** Whether a plain-fetch failure might be bot protection a real browser could get past. A page
 * with no JSON-LD counts too: some challenge pages come back as an ordinary 200. */
function shouldRetryHeadless(err: unknown): boolean {
  if (!(err instanceof UrlImportError)) return false;
  if (err.kind === 'bot_challenge' || err.kind === 'no_jsonld') return true;
  return (
    err.kind === 'network_error' &&
    err.httpStatus !== undefined &&
    RETRYABLE_HTTP_STATUSES.has(err.httpStatus)
  );
}

/** How a page was fetched: plain server-side HTTP, or the headless browser fallback. */
export type ImportMethod = 'server' | 'browser';

/** `trace.method` is set to the last method attempted, also when the import then fails, so the
 * caller can log it either way. */
export async function scrapeRecipeFromUrl(
  url: string,
  locale?: SupportedLocale,
  trace?: { method?: ImportMethod }
): Promise<RecipeInput> {
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
