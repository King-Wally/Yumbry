import { useTranslation } from 'react-i18next';
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
        {draft.category && (
          <span className="mt-2 inline-block rounded-full bg-clay px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
            {draft.category}
          </span>
        )}
        {draft.description && <p className="mt-2 text-stone-600">{draft.description}</p>}
      </div>

      {draft.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {draft.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-clay/25 bg-clay/10 px-3 py-1 text-xs font-medium tracking-wide text-clay capitalize"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-sm text-stone-600">
        {draft.prep_time_minutes != null && (
          <span>{t('recipePreview.prep', { minutes: draft.prep_time_minutes })}</span>
        )}
        {draft.cook_time_minutes != null && (
          <span>{t('recipePreview.cook', { minutes: draft.cook_time_minutes })}</span>
        )}
        {draft.total_time_minutes != null && (
          <span>{t('recipePreview.total', { minutes: draft.total_time_minutes })}</span>
        )}
        <span>{t('recipePreview.servings', { count: draft.servings })}</span>
      </div>

      <section>
        <h3 className="mb-2 font-serif text-lg text-stone-900">{t('recipePreview.ingredients')}</h3>
        <ul className="divide-y divide-stone-100">
          {draft.ingredients.map((line, i) => (
            <li key={i} className="flex items-start gap-2.5 py-2 text-stone-700">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-clay/60" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-serif text-lg text-stone-900">
          {t('recipePreview.instructions')}
        </h3>
        <ol className="space-y-4">
          {draft.instructions.map((step) => (
            <li key={step.step_number} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay text-sm font-medium text-white">
                {step.step_number}
              </span>
              <p className="flex-1 text-stone-700">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
