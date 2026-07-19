import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScaledIngredients } from '../src/hooks/useScaledIngredients';
import type { Ingredient } from '../src/types';

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
];

describe('useScaledIngredients', () => {
  it('scales amounts proportionally to the servings ratio', () => {
    const { result } = renderHook(() => useScaledIngredients(ingredients, 2, 4));
    expect(result.current[0].displayText).toBe('4 cups flour');
  });

  it('leaves non-scalable ingredients as raw text', () => {
    const { result } = renderHook(() => useScaledIngredients(ingredients, 2, 4));
    expect(result.current[1].displayText).toBe('salt to taste');
  });

  it('returns the original amounts when servings are unchanged', () => {
    const { result } = renderHook(() => useScaledIngredients(ingredients, 2, 2));
    expect(result.current[0].displayText).toBe('2 cups flour');
  });

  it('formats fractional scaled amounts', () => {
    const { result } = renderHook(() => useScaledIngredients(ingredients, 4, 6));
    expect(result.current[0].displayText).toBe('3 cups flour');
  });
});
