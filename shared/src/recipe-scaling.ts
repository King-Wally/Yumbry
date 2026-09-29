import type { SupportedLocale } from './locale.js';
import { toNumber } from './numeric.js';
import type { Ingredient } from './recipe-dto.js';
import { formatScaledAmount } from './units/index.js';

export interface ScaledIngredient extends Ingredient {
  displayText: string;
  scaledAmount?: number;
}

/**
 * Ingredient lines for a recipe shown at `desiredServings` instead of the `baseServings` it was
 * saved for. Nutrition is per serving and is never passed through here.
 */
export function scaleIngredients(
  ingredients: readonly Ingredient[],
  baseServings: number,
  desiredServings: number,
  locale: SupportedLocale
): ScaledIngredient[] {
  const multiplier = baseServings > 0 ? desiredServings / baseServings : 1;

  return ingredients.map((ingredient): ScaledIngredient => {
    if (!ingredient.is_scalable || ingredient.amount === null) {
      return { ...ingredient, displayText: ingredient.raw_text };
    }

    const scaledAmount = toNumber(ingredient.amount) * multiplier;
    // Scaling never converts — a saved recipe keeps the units it was saved in. The formatter
    // only makes the number measurable again, in whatever unit the line already uses.
    const formattedAmount = formatScaledAmount(scaledAmount, ingredient.unit, locale);
    const unitPart = ingredient.unit ? ` ${ingredient.unit}` : '';

    return {
      ...ingredient,
      scaledAmount,
      displayText: `${formattedAmount}${unitPart} ${ingredient.name}`.trim(),
    };
  });
}
