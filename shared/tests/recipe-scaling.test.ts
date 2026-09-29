import { describe, expect, it } from 'vitest';
import type { Ingredient } from '../src/recipe-dto.js';
import { scaleIngredients } from '../src/recipe-scaling.js';

const ingredients: Ingredient[] = [
  {
    id: 1,
    recipe_id: 1,
    raw_text: '2 cups flour',
    amount: '2',
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
  {
    id: 3,
    recipe_id: 1,
    raw_text: '3 eggs',
    amount: '3',
    unit: null,
    name: 'eggs',
    is_scalable: true,
    sort_order: 2,
  },
];

const lines = (base: number, desired: number) =>
  scaleIngredients(ingredients, base, desired, 'en').map((i) => i.displayText);

describe('scaleIngredients', () => {
  it('scales amounts proportionally to the servings ratio', () => {
    expect(lines(2, 4)[0]).toBe('4 cups flour');
  });

  it('leaves non-scalable ingredients as raw text', () => {
    expect(lines(2, 4)[1]).toBe('salt to taste');
  });

  it('returns the original amounts when servings are unchanged', () => {
    expect(lines(2, 2)[0]).toBe('2 cups flour');
  });

  it('formats fractional scaled amounts', () => {
    expect(lines(4, 6)[0]).toBe('3 cups flour');
  });

  it('omits the unit for counted ingredients', () => {
    expect(lines(1, 2)[2]).toBe('6 eggs');
  });

  it('never converts units, whatever the scale', () => {
    expect(lines(1, 10)[0]).toMatch(/ cups flour$/);
  });

  it('treats a non-positive base as unscaled rather than dividing by zero', () => {
    expect(lines(0, 8)[0]).toBe('2 cups flour');
  });

  it('keeps the numeric scaled amount alongside the text', () => {
    expect(scaleIngredients(ingredients, 2, 3, 'en')[0].scaledAmount).toBe(3);
  });
});
