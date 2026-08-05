import * as cheerio from 'cheerio';
import type { RecipeInput } from 'yumbry-shared';
import { parseRecipeFromJsonLd } from './jsonld-import.service.js';
import { safeFetchHtml } from '../utils/safe-fetch.js';
import { UrlImportError } from '../utils/url-import-error.js';

/**
 * Finds every `<script type="application/ld+json">` block on the page and
 * tries each one through the existing parseRecipeFromJsonLd (which already
 * handles @graph wrappers, arrays, and every schema.org Recipe field) until
 * one yields a Recipe — some sites emit multiple JSON-LD blocks (e.g. one
 * for the page's WebSite/BreadcrumbList, another for the Recipe itself), or
 * put unrelated/malformed JSON in a block alongside a valid one.
 */
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
        // RecipeInput takes raw ingredient lines, never pre-parsed amounts —
        // parsed.amount/unit/is_scalable are recomputed server-side on save
        // the same way every other entry point (manual form, JSON-LD import)
        // already works, so only raw_text survives this mapping.
        ingredients: parsed.ingredients.map((ingredient) => ingredient.raw_text),
        instructions: parsed.instructions,
        tags: parsed.tags,
        category: parsed.category,
      };
    } catch {
      // This block was invalid JSON or had no Recipe node — try the next one.
      continue;
    }
  }

  throw new UrlImportError('No schema.org Recipe was found on that page.', 'no_recipe_found');
}

/** Fetches `url`, extracts its schema.org Recipe JSON-LD, and returns an
 * unsaved draft shaped exactly like RecipeInput — the same shape the
 * AI-create draft hand-off already uses, so callers can hand it straight to
 * the recipe form without any further mapping. */
export async function scrapeRecipeFromUrl(url: string): Promise<RecipeInput> {
  const { html } = await safeFetchHtml(url);
  return extractRecipeFromHtml(html);
}
