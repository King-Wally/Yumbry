import { useTranslation } from 'react-i18next';
import { toNullableNumber } from 'yumbry-shared';

interface NutritionStatsProps {
  /** Decimal columns arrive as strings from the API and as numbers from an AI draft. */
  calories: string | number | null;
  fatContent: string | number | null;
  carbohydrateContent: string | number | null;
  proteinContent: string | number | null;
}

/**
 * The four per-serving values, or nothing at all when a recipe carries none — which is what gives
 * "hidden when there is no nutrition" for free at every call site.
 *
 * These never scale with the servings stepper: they describe one serving by definition, which is
 * also how schema.org defines NutritionInformation.
 */
export default function NutritionStats({
  calories,
  fatContent,
  carbohydrateContent,
  proteinContent,
}: NutritionStatsProps) {
  const { t } = useTranslation();

  const stats = [
    { key: 'calories', label: t('recipes.detail.calories'), unit: 'kcal', raw: calories },
    { key: 'fat', label: t('recipes.detail.fat'), unit: 'g', raw: fatContent },
    { key: 'carbs', label: t('recipes.detail.carbs'), unit: 'g', raw: carbohydrateContent },
    { key: 'protein', label: t('recipes.detail.protein'), unit: 'g', raw: proteinContent },
  ]
    .map((stat) => ({ ...stat, value: toNullableNumber(stat.raw) }))
    .filter((stat): stat is typeof stat & { value: number } => stat.value !== null);

  if (stats.length === 0) return null;

  return (
    <div className="border-t border-stone-200 pt-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-xs font-medium tracking-wide text-stone-500 uppercase">
          {t('recipes.detail.nutrition')}
        </h2>
        <span className="text-xs text-stone-500">{t('recipes.detail.perServing')}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {stats.map((stat) => (
          <div key={stat.key} className="rounded-md bg-stone-100 px-1.5 py-1.5 text-center">
            <div className="text-sm font-medium text-stone-900">
              {/* Decimal(8,2) means a whole number can come back as "420.00" — round off the
                  noise, but keep a genuine 14.5. */}
              {Number(stat.value.toFixed(1))}
              <span className="ml-0.5 text-[10px] text-stone-500">{stat.unit}</span>
            </div>
            <div className="text-[10px] text-stone-500">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
