import { describe, expect, it } from 'vitest';
import { recipeToJsonLd } from '../src/services/jsonld-export.service.js';
import type { RecipeWithRelations } from '../src/services/recipe.service.js';

const fullRecipe: RecipeWithRelations = {
  id: 1,
  title: 'Simple Pancakes',
  description: 'Fluffy weekend pancakes.',
  image_path: 'https://example.com/pancakes.jpg',
  prep_time_minutes: 10,
  cook_time_minutes: 15,
  total_time_minutes: 25,
  servings: '4',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ingredients: [
    {
      id: 1,
      recipe_id: 1,
      raw_text: '1 1/2 cups flour',
      amount: '1.5',
      unit: 'cups',
      name: 'flour',
      is_scalable: true,
      sort_order: 0,
    },
    {
      id: 2,
      recipe_id: 1,
      raw_text: 'salt to taste',
      amount: null,
      unit: null,
      name: 'salt to taste',
      is_scalable: false,
      sort_order: 1,
    },
  ],
  instructions: [
    { id: 1, recipe_id: 1, step_number: 1, text: 'Mix dry ingredients.', image_path: null },
    { id: 2, recipe_id: 1, step_number: 2, text: 'Cook on a griddle.', image_path: null },
  ],
  tags: [
    { id: 1, name: 'breakfast' },
    { id: 2, name: 'easy' },
  ],
};

describe('recipeToJsonLd', () => {
  it('serializes a full recipe as schema.org Recipe JSON-LD', () => {
    const jsonLd = recipeToJsonLd(fullRecipe);

    expect(jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Simple Pancakes',
      description: 'Fluffy weekend pancakes.',
      image: 'https://example.com/pancakes.jpg',
      recipeYield: '4',
      prepTime: 'PT10M',
      cookTime: 'PT15M',
      totalTime: 'PT25M',
      recipeIngredient: ['1 1/2 cups flour', 'salt to taste'],
      keywords: 'breakfast, easy',
    });
    expect(jsonLd.recipeInstructions).toEqual([
      { '@type': 'HowToStep', text: 'Mix dry ingredients.' },
      { '@type': 'HowToStep', text: 'Cook on a griddle.' },
    ]);
  });

  it('omits null/empty fields rather than emitting nulls', () => {
    const sparseRecipe: RecipeWithRelations = {
      ...fullRecipe,
      description: null,
      image_path: null,
      prep_time_minutes: null,
      cook_time_minutes: null,
      total_time_minutes: null,
      tags: [],
    };

    const jsonLd = recipeToJsonLd(sparseRecipe);

    expect(jsonLd).not.toHaveProperty('description');
    expect(jsonLd).not.toHaveProperty('image');
    expect(jsonLd).not.toHaveProperty('prepTime');
    expect(jsonLd).not.toHaveProperty('cookTime');
    expect(jsonLd).not.toHaveProperty('totalTime');
    expect(jsonLd).not.toHaveProperty('keywords');
  });

  it('preserves ingredient and instruction ordering', () => {
    const jsonLd = recipeToJsonLd(fullRecipe);
    expect(jsonLd.recipeIngredient).toEqual(['1 1/2 cups flour', 'salt to taste']);
    expect((jsonLd.recipeInstructions as { text: string }[]).map((i) => i.text)).toEqual([
      'Mix dry ingredients.',
      'Cook on a griddle.',
    ]);
  });
});
