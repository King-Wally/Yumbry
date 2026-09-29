import { describe, expect, it } from 'vitest';
import type { AiRecipeDraft } from '../src/ai-recipe-draft.js';
import { renderDraftForReader } from '../src/render-draft.js';

const base: AiRecipeDraft = {
  title: 'Soup',
  description: null,
  image_path: null,
  prep_time_minutes: null,
  cook_time_minutes: null,
  total_time_minutes: null,
  servings: 4,
  calories: null,
  fat_content: null,
  carbohydrate_content: null,
  protein_content: null,
  ingredients: ['400 g tomatoes'],
  ingredients_structured: [
    { item: 'tomatoes', quantity: 400, unit: 'g', note: null, density_key: 'none' },
  ],
  instructions: [{ step_number: 1, text: 'Bake at 200°C for 20 minutes.' }],
  tags: [],
  category: null,
};

describe('renderDraftForReader', () => {
  it('redraws ingredients and instruction temperatures in imperial', () => {
    const drawn = renderDraftForReader(base, {
      locale: 'en',
      unitSystem: 'imperial',
      smallVolumes: 'spoons',
    })!;
    expect(drawn.ingredients[0]).toMatch(/oz|lb/);
    expect(drawn.instructions[0].text).toMatch(/°F/);
  });

  it('keeps metric amounts in metric', () => {
    const drawn = renderDraftForReader(base, {
      locale: 'en',
      unitSystem: 'metric',
      smallVolumes: 'spoons',
    })!;
    expect(drawn.ingredients[0]).toBe('400 g tomatoes');
  });

  it('returns a draft without structured ingredients untouched', () => {
    const seeded = { ...base, ingredients_structured: undefined };
    expect(
      renderDraftForReader(seeded, { locale: 'en', unitSystem: 'imperial', smallVolumes: 'spoons' })
    ).toBe(seeded);
  });

  it('passes null through', () => {
    expect(
      renderDraftForReader(null, { locale: 'en', unitSystem: 'metric', smallVolumes: 'spoons' })
    ).toBeNull();
  });
});
