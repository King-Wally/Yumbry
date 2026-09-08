import { useTranslation } from 'react-i18next';
import IngredientList from './IngredientList';
import InstructionList from './InstructionList';
import RecipeTagBadges from './RecipeTagBadges';
import TimeStat from './TimeStat';
import type { RecipeInput } from '../types';

interface RecipePreviewProps {
  draft: RecipeInput | null;
}

export default function RecipePreview({ draft }: RecipePreviewProps) {
  const { t } = useTranslation();
  if (!draft) {
    return <p className="text-sm text-stone-400">{t('recipePreview.empty')}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl text-stone-900">
          {draft.title || t('recipePreview.untitled')}
        </h2>
        {draft.description && <p className="mt-2 text-stone-600">{draft.description}</p>}
      </div>

      <RecipeTagBadges category={draft.category} tags={draft.tags} />

      <div className="flex flex-wrap gap-4 text-sm text-stone-600">
        {draft.prep_time_minutes != null && (
          <TimeStat
            icon="clock"
            label={t('recipes.detail.prep')}
            minutes={draft.prep_time_minutes}
          />
        )}
        {draft.cook_time_minutes != null && (
          <TimeStat
            icon="flame"
            label={t('recipes.detail.cook')}
            minutes={draft.cook_time_minutes}
          />
        )}
        {draft.total_time_minutes != null && (
          <TimeStat
            icon="timer"
            label={t('recipes.detail.total')}
            minutes={draft.total_time_minutes}
          />
        )}
        <span>{t('recipePreview.servings', { count: draft.servings })}</span>
      </div>

      <section>
        <h3 className="mb-2 font-serif text-lg text-stone-900">{t('recipePreview.ingredients')}</h3>
        <IngredientList items={draft.ingredients.map((line, i) => ({ key: i, text: line }))} />
      </section>

      <section>
        <h3 className="mb-2 font-serif text-lg text-stone-900">
          {t('recipePreview.instructions')}
        </h3>
        <InstructionList
          items={draft.instructions.map((step) => ({
            key: step.step_number,
            step_number: step.step_number,
            text: step.text,
          }))}
        />
      </section>
    </div>
  );
}
