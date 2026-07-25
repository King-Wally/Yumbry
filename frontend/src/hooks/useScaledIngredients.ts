import { useMemo } from 'react';
import { formatFraction } from '../utils/format-fraction';
import { toNumber } from '../utils/numeric';
import type { Ingredient } from '../types';

export interface ScaledIngredient extends Ingredient {
  displayText: string;
  scaledAmount?: number;
}

/**
 * Scales ingredient amounts from a recipe's base servings to the desired
 * servings. Non-scalable ingredients (amount === null or is_scalable === false)
 * are returned with their raw text unchanged.
 */
export function useScaledIngredients(
  ingredients: Ingredient[] | undefined,
  baseServings: number,
  desiredServings: number
): ScaledIngredient[] {
  return useMemo(() => {
    const multiplier = baseServings > 0 ? desiredServings / baseServings : 1;

    return (ingredients ?? []).map((ingredient): ScaledIngredient => {
      if (!ingredient.is_scalable || ingredient.amount === null) {
        return { ...ingredient, displayText: ingredient.raw_text };
      }

      const scaledAmount = toNumber(ingredient.amount) * multiplier;
      const formattedAmount = formatFraction(scaledAmount);
      const unitPart = ingredient.unit ? ` ${ingredient.unit}` : '';

      return {
        ...ingredient,
        scaledAmount,
        displayText: `${formattedAmount}${unitPart} ${ingredient.name}`.trim(),
      };
    });
  }, [ingredients, baseServings, desiredServings]);
}
