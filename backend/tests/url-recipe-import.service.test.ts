import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractRecipeFromHtml,
  scrapeRecipeFromUrl,
} from '../src/services/url-recipe-import.service.js';
import { headlessFetchHtml, isHeadlessFetchConfigured } from '../src/utils/headless-fetch.js';
import { safeFetchHtml } from '../src/utils/safe-fetch.js';
import { UrlImportError } from '../src/utils/url-import-error.js';

vi.mock('../src/utils/safe-fetch.js', () => ({
  safeFetchHtml: vi.fn(),
}));

vi.mock('../src/utils/headless-fetch.js', () => ({
  headlessFetchHtml: vi.fn(),
  isHeadlessFetchConfigured: vi.fn(() => false),
}));

const bareRecipe = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Simple Pancakes',
  description: 'Fluffy weekend pancakes.',
  image: 'https://example.com/pancakes.jpg',
  prepTime: 'PT10M',
  cookTime: 'PT15M',
  recipeYield: '4 servings',
  recipeCategory: 'Breakfast',
  keywords: 'pancakes, breakfast, easy',
  recipeIngredient: ['1 1/2 cups flour', '2 eggs', 'salt to taste'],
  recipeInstructions: 'Mix dry ingredients.\nWhisk in eggs.\nCook on a griddle.',
};

const graphWrapped = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', name: 'A page' },
    { ...bareRecipe, name: 'Graph Recipe' },
  ],
};

function htmlWithScripts(...blocks: string[]): string {
  const scripts = blocks
    .map((block) => `<script type="application/ld+json">${block}</script>`)
    .join('\n');
  return `<html><head>${scripts}</head><body></body></html>`;
}

describe('extractRecipeFromHtml', () => {
  // The projection from ParsedRecipeImport into RecipeInput is written out field by field, so a
  // new field that isn't listed there drops silently rather than failing a typecheck.
  it('carries nutrition through the projection into RecipeInput', () => {
    const node = {
      ...bareRecipe,
      nutrition: {
        '@type': 'NutritionInformation',
        calories: '512 kcal',
        fatContent: '24 g',
        carbohydrateContent: '40 g',
        proteinContent: '31 g',
      },
    };
    const recipe = extractRecipeFromHtml(htmlWithScripts(JSON.stringify(node)));

    expect(recipe.calories).toBe(512);
    expect(recipe.fat_content).toBe(24);
    expect(recipe.carbohydrate_content).toBe(40);
    expect(recipe.protein_content).toBe(31);
  });

  it('extracts a Recipe from a single JSON-LD block', () => {
    const recipe = extractRecipeFromHtml(htmlWithScripts(JSON.stringify(bareRecipe)));

    expect(recipe.title).toBe('Simple Pancakes');
    expect(recipe.servings).toBe(4);
    expect(recipe.category).toBe('Breakfast');
    // RecipeInput.ingredients is raw text lines, not structured objects.
    expect(recipe.ingredients).toEqual(['1 1/2 cups flour', '2 eggs', 'salt to taste']);
    expect(recipe.instructions).toEqual([
      { step_number: 1, text: 'Mix dry ingredients.' },
      { step_number: 2, text: 'Whisk in eggs.' },
      { step_number: 3, text: 'Cook on a griddle.' },
    ]);
  });

  it('finds the Recipe when it is the second of several script blocks', () => {
    const html = htmlWithScripts(
      JSON.stringify({ '@type': 'WebSite', name: 'Some Site' }),
      JSON.stringify(bareRecipe)
    );
    const recipe = extractRecipeFromHtml(html);
    expect(recipe.title).toBe('Simple Pancakes');
  });

  it('handles a Recipe nested inside @graph', () => {
    const recipe = extractRecipeFromHtml(htmlWithScripts(JSON.stringify(graphWrapped)));
    expect(recipe.title).toBe('Graph Recipe');
  });

  it('skips a malformed JSON block and still finds a later valid Recipe', () => {
    const html = htmlWithScripts('{ this is not valid json', JSON.stringify(bareRecipe));
    const recipe = extractRecipeFromHtml(html);
    expect(recipe.title).toBe('Simple Pancakes');
  });

  it('throws no_jsonld when the page has no JSON-LD script tags at all', () => {
    expect.assertions(1);
    try {
      extractRecipeFromHtml('<html><body>No structured data here.</body></html>');
    } catch (err) {
      expect(err).toMatchObject({ kind: 'no_jsonld' });
    }
  });

  it('throws no_recipe_found when JSON-LD blocks exist but none is a Recipe', () => {
    expect.assertions(1);
    const html = htmlWithScripts(JSON.stringify({ '@type': 'WebPage', name: 'Not a recipe' }));
    try {
      extractRecipeFromHtml(html);
    } catch (err) {
      expect(err).toMatchObject({ kind: 'no_recipe_found' });
    }
  });
});

describe('scrapeRecipeFromUrl', () => {
  beforeEach(() => {
    vi.mocked(safeFetchHtml).mockResolvedValue({
      html: htmlWithScripts(JSON.stringify(bareRecipe)),
      contentType: 'text/html',
      finalUrl: 'https://example.com/pancakes',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the URL and returns a RecipeInput-shaped draft', async () => {
    const draft = await scrapeRecipeFromUrl('https://example.com/pancakes');
    expect(draft.title).toBe('Simple Pancakes');
    expect(Array.isArray(draft.ingredients)).toBe(true);
    expect(typeof draft.ingredients[0]).toBe('string');
  });

  describe('headless fallback', () => {
    const recipePage = {
      html: htmlWithScripts(JSON.stringify(bareRecipe)),
      contentType: 'text/html',
      finalUrl: 'https://example.com/pancakes',
    };

    beforeEach(() => {
      vi.mocked(isHeadlessFetchConfigured).mockReturnValue(true);
      vi.mocked(headlessFetchHtml).mockResolvedValue(recipePage);
    });

    it.each([
      [
        'bot_challenge',
        new UrlImportError('blocked', 'bot_challenge', undefined, { httpStatus: 403 }),
      ],
      [
        'a 403 page',
        new UrlImportError('HTTP 403', 'network_error', undefined, { httpStatus: 403 }),
      ],
      [
        'a 402 page',
        new UrlImportError('HTTP 402', 'network_error', undefined, { httpStatus: 402 }),
      ],
      [
        'a 503 page',
        new UrlImportError('HTTP 503', 'network_error', undefined, { httpStatus: 503 }),
      ],
    ])('retries in the browser after %s', async (_label, error) => {
      vi.mocked(safeFetchHtml).mockRejectedValue(error);

      const draft = await scrapeRecipeFromUrl('https://example.com/pancakes', 'nl');

      expect(draft.title).toBe('Simple Pancakes');
      expect(headlessFetchHtml).toHaveBeenCalledWith('https://example.com/pancakes');
    });

    it('retries in the browser when the fetched page has no JSON-LD', async () => {
      vi.mocked(safeFetchHtml).mockResolvedValue({ ...recipePage, html: '<html></html>' });

      const draft = await scrapeRecipeFromUrl('https://example.com/pancakes');

      expect(draft.title).toBe('Simple Pancakes');
      expect(headlessFetchHtml).toHaveBeenCalledOnce();
    });

    it.each([
      new UrlImportError('private', 'blocked_url'),
      new UrlImportError('slow', 'timeout'),
      new UrlImportError('HTTP 404', 'network_error', undefined, { httpStatus: 404 }),
      new UrlImportError('DNS', 'network_error'),
    ])('does not retry after $kind ($message)', async (error) => {
      vi.mocked(safeFetchHtml).mockRejectedValue(error);

      await expect(scrapeRecipeFromUrl('https://example.com/pancakes')).rejects.toBe(error);
      expect(headlessFetchHtml).not.toHaveBeenCalled();
    });

    it('does not retry when no browser is configured', async () => {
      vi.mocked(isHeadlessFetchConfigured).mockReturnValue(false);
      const error = new UrlImportError('blocked', 'bot_challenge');
      vi.mocked(safeFetchHtml).mockRejectedValue(error);

      await expect(scrapeRecipeFromUrl('https://example.com/pancakes')).rejects.toBe(error);
      expect(headlessFetchHtml).not.toHaveBeenCalled();
    });

    it('reports the original error when the browser is unreachable', async () => {
      const error = new UrlImportError('blocked', 'bot_challenge');
      vi.mocked(safeFetchHtml).mockRejectedValue(error);
      vi.mocked(headlessFetchHtml).mockRejectedValue(new Error('ECONNREFUSED'));
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(scrapeRecipeFromUrl('https://example.com/pancakes')).rejects.toBe(error);
    });

    it("reports the browser's own import error when it has one", async () => {
      vi.mocked(safeFetchHtml).mockRejectedValue(new UrlImportError('blocked', 'bot_challenge'));
      const browserError = new UrlImportError('still blocked', 'bot_challenge');
      vi.mocked(headlessFetchHtml).mockRejectedValue(browserError);

      await expect(scrapeRecipeFromUrl('https://example.com/pancakes')).rejects.toBe(browserError);
    });
  });
});
