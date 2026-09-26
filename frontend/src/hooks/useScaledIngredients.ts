import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { isSupportedLocale, scaleIngredients, type ScaledIngredient } from 'yumbry-shared';
import type { Ingredient } from '../types';

export type { ScaledIngredient };

export function useScaledIngredients(
  ingredients: Ingredient[] | undefined,
  baseServings: number,
  desiredServings: number
): ScaledIngredient[] {
  const { i18n } = useTranslation();
  const locale = isSupportedLocale(i18n.language) ? i18n.language : 'en';

  return useMemo(
    () => scaleIngredients(ingredients ?? [], baseServings, desiredServings, locale),
    [ingredients, baseServings, desiredServings, locale]
  );
}
