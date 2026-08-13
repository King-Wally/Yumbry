import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatScaledAmount, isSupportedLocale } from 'yumbry-shared';
import { toNumber } from '../utils/numeric';
import type { Ingredient } from '../types';

export interface ScaledIngredient extends Ingredient {
  displayText: string;
  scaledAmount?: number;
}

export function useScaledIngredients(
  ingredients: Ingredient[] | undefined,
  baseServings: number,
  desiredServings: number
): ScaledIngredient[] {
  const { i18n } = useTranslation();
  const locale = isSupportedLocale(i18n.language) ? i18n.language : 'en';

  return useMemo(() => {
    const multiplier = baseServings > 0 ? desiredServings / baseServings : 1;

    return (ingredients ?? []).map((ingredient): ScaledIngredient => {
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
  }, [ingredients, baseServings, desiredServings, locale]);
}
