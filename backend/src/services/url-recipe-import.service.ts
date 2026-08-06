import * as cheerio from 'cheerio';
import type { RecipeInput } from 'yumbry-shared';
import { parseRecipeFromJsonLd } from './jsonld-import.service.js';
import { safeFetchHtml } from '../utils/safe-fetch.js';
import { UrlImportError } from '../utils/url-import-error.js';

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

export async function scrapeRecipeFromUrl(url: string): Promise<RecipeInput> {
  const { html } = await safeFetchHtml(url);
  return extractRecipeFromHtml(html);
}
