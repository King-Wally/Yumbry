import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractRecipeFromHtml,
  scrapeRecipeFromUrl,
} from '../src/services/url-recipe-import.service.js';
import { safeFetchHtml } from '../src/utils/safe-fetch.js';

vi.mock('../src/utils/safe-fetch.js', () => ({
  safeFetchHtml: vi.fn(),
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
});
