import { describe, expect, it } from 'vitest';
import { findRecipeNode, parseRecipeFromJsonLd } from '../src/services/jsonld-import.service.js';

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

describe('findRecipeNode', () => {
  it('finds a bare Recipe object', () => {
    expect(findRecipeNode(bareRecipe)?.['@type']).toBe('Recipe');
  });

  it('finds a Recipe nested in @graph', () => {
    const found = findRecipeNode(graphWrapped);
    expect(found?.name).toBe('Graph Recipe');
  });

  it('returns null when no Recipe node exists', () => {
    expect(findRecipeNode({ '@type': 'WebPage' })).toBeNull();
  });

  it('matches when @type is an array containing Recipe', () => {
    const node = { '@type': ['Thing', 'Recipe'], name: 'Array Type Recipe' };
    expect(findRecipeNode(node)).toBe(node);
  });
});

describe('parseRecipeFromJsonLd', () => {
  it('parses a bare Recipe end to end', () => {
    const recipe = parseRecipeFromJsonLd(JSON.stringify(bareRecipe));

    expect(recipe.title).toBe('Simple Pancakes');
    expect(recipe.image_path).toBe('https://example.com/pancakes.jpg');
    expect(recipe.prep_time_minutes).toBe(10);
    expect(recipe.cook_time_minutes).toBe(15);
    expect(recipe.total_time_minutes).toBe(25); // derived from prep + cook
    expect(recipe.servings).toBe(4);
    expect(recipe.category).toBe('Breakfast');
    expect(recipe.tags.sort()).toEqual(['pancakes', 'breakfast', 'easy'].sort());

    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.ingredients[0]).toMatchObject({ amount: 1.5, unit: 'cups', name: 'flour' });
    expect(recipe.ingredients[2]).toMatchObject({ amount: null, is_scalable: false });

    expect(recipe.instructions).toEqual([
      { step_number: 1, text: 'Mix dry ingredients.' },
      { step_number: 2, text: 'Whisk in eggs.' },
      { step_number: 3, text: 'Cook on a griddle.' },
    ]);
  });

  it('parses a Recipe nested inside @graph', () => {
    const recipe = parseRecipeFromJsonLd(JSON.stringify(graphWrapped));
    expect(recipe.title).toBe('Graph Recipe');
  });

  it('handles recipeInstructions as an array of HowToStep', () => {
    const node = {
      ...bareRecipe,
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Step one.' },
        { '@type': 'HowToStep', text: 'Step two.' },
      ],
    };
    const recipe = parseRecipeFromJsonLd(JSON.stringify(node));
    expect(recipe.instructions.map((i) => i.text)).toEqual(['Step one.', 'Step two.']);
  });

  it('flattens HowToSection groups of HowToStep', () => {
    const node = {
      ...bareRecipe,
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Batter',
          itemListElement: [
            { '@type': 'HowToStep', text: 'Mix batter.' },
            { '@type': 'HowToStep', text: 'Rest batter.' },
          ],
        },
        { '@type': 'HowToStep', text: 'Cook pancakes.' },
      ],
    };
    const recipe = parseRecipeFromJsonLd(JSON.stringify(node));
    expect(recipe.instructions.map((i) => i.text)).toEqual([
      'Mix batter.',
      'Rest batter.',
      'Cook pancakes.',
    ]);
  });

  it('handles image as an array of ImageObject', () => {
    const node = {
      ...bareRecipe,
      image: [{ '@type': 'ImageObject', url: 'https://example.com/first.jpg' }],
    };
    const recipe = parseRecipeFromJsonLd(JSON.stringify(node));
    expect(recipe.image_path).toBe('https://example.com/first.jpg');
  });

  it('defaults servings to 1 when recipeYield is unparseable', () => {
    const node = { ...bareRecipe, recipeYield: undefined };
    const recipe = parseRecipeFromJsonLd(JSON.stringify(node));
    expect(recipe.servings).toBe(1);
  });

  it('takes the first entry when recipeCategory is an array', () => {
    const node = { ...bareRecipe, recipeCategory: ['Main course', 'Dinner'] };
    const recipe = parseRecipeFromJsonLd(JSON.stringify(node));
    expect(recipe.category).toBe('Main course');
  });

  it('sets category to null when recipeCategory is absent', () => {
    const node = { ...bareRecipe, recipeCategory: undefined };
    const recipe = parseRecipeFromJsonLd(JSON.stringify(node));
    expect(recipe.category).toBeNull();
  });

  it('throws when the input has no Recipe node', () => {
    expect(() => parseRecipeFromJsonLd(JSON.stringify({ '@type': 'WebPage' }))).toThrow(
      /No schema.org Recipe/
    );
  });

  it('throws on invalid JSON', () => {
    expect(() => parseRecipeFromJsonLd('not json')).toThrow();
  });

  it('repairs a raw newline left unescaped inside a JSON string value', () => {
    // Some sites template-interpolate `description` without JSON-escaping it, leaving a
    // literal newline inside the string - technically invalid JSON that a strict
    // JSON.parse would reject with "Bad control character in string literal". Splice a
    // real newline directly into the already-serialized JSON (JSON.stringify itself would
    // correctly escape it to the two characters "\n", so build it this way instead).
    const paragraphs = ['Fluffy weekend pancakes.', 'Second paragraph.'];
    const malformed = JSON.stringify(bareRecipe).replace(
      'Fluffy weekend pancakes.',
      paragraphs.join('\n')
    );

    const recipe = parseRecipeFromJsonLd(malformed);
    expect(recipe.description).toBe(paragraphs.join('\n'));
  });

  it('drops non-string entries from recipeIngredient instead of throwing', () => {
    const node = {
      ...bareRecipe,
      recipeIngredient: ['1 cup rice', { '@type': 'HowToStep', text: 'not an ingredient' }, null],
    };
    const recipe = parseRecipeFromJsonLd(JSON.stringify(node));
    expect(recipe.ingredients).toHaveLength(1);
    expect(recipe.ingredients[0].name).toBe('rice');
  });

  it('falls back to a non-standard "ingredients" key when recipeIngredient is absent', () => {
    // Some sites emit `ingredients` instead of the schema.org
    // standard `recipeIngredient`.
    const node = {
      ...bareRecipe,
      recipeIngredient: undefined,
      ingredients: ['2 tomatoes', '1 onion'],
    };
    const recipe = parseRecipeFromJsonLd(JSON.stringify(node));
    expect(recipe.ingredients).toHaveLength(2);
    expect(recipe.ingredients.map((i) => i.name)).toEqual(['tomatoes', 'onion']);
  });

  it('prefers recipeIngredient over ingredients when both are present', () => {
    const node = { ...bareRecipe, ingredients: ['should be ignored'] };
    const recipe = parseRecipeFromJsonLd(JSON.stringify(node));
    // bareRecipe.recipeIngredient has 3 entries; the `ingredients` fallback has 1 — only
    // the standard key's entries should show up.
    expect(recipe.ingredients).toHaveLength(3);
  });

  it('drops non-string entries from keywords instead of throwing', () => {
    const node = {
      ...bareRecipe,
      keywords: ['pancakes', { name: 'not a keyword' }, 42, 'easy'],
    };
    const recipe = parseRecipeFromJsonLd(JSON.stringify(node));
    expect(recipe.tags.sort()).toEqual(['pancakes', 'easy'].sort());
  });
});
