import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { deleteRecipe, getRecipe, getRecipeExportUrl } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import RecipeHero from '../components/RecipeHero';
import ServingsStepper from '../components/ServingsStepper';
import TimeStat from '../components/TimeStat';
import { useScaledIngredients } from '../hooks/useScaledIngredients';
import { toNumber } from '../utils/numeric';
import CollapsibleActions from '../components/CollapsibleActions';
import ConfirmDialog from '../components/ConfirmDialog';

export default function RecipeDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: recipe, isLoading } = useQuery({
    queryKey: queryKeys.recipe(id!),
    queryFn: () => getRecipe(id!),
  });

  const [servings, setServings] = useState(1);
  const [servingsForRecipeId, setServingsForRecipeId] = useState<number | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Form hydration in render (not useEffect) to avoid stale-value flash
  if (recipe && servingsForRecipeId !== recipe.id) {
    setServingsForRecipeId(recipe.id);
    setServings(toNumber(recipe.servings, 1));
  }

  const scaledIngredients = useScaledIngredients(
    recipe?.ingredients,
    toNumber(recipe?.servings, 1),
    servings
  );

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecipe(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes() });
      navigate('/');
    },
  });

  if (isLoading) return <p className="text-stone-500">{t('recipes.detail.loading')}</p>;
  if (!recipe) return <p className="text-stone-500">{t('recipes.detail.notFound')}</p>;

  return (
    <article className="space-y-8">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/"
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-stone-600 transition-colors hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Link>
        <CollapsibleActions>
          <a
            href={getRecipeExportUrl(id!)}
            download
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            {t('recipes.detail.export')}
          </a>
          <Link
            to={`/recipes/${id}/edit`}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            {t('recipes.detail.edit')}
          </Link>
          <Link
            to={`/recipes/${id}/ai-improve`}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            {t('recipes.detail.improveWithAi')}
          </Link>
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
          >
            {t('common.delete')}
          </button>
        </CollapsibleActions>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t('recipes.detail.deleteDialogTitle')}
        description={t('recipes.detail.deleteDialogDescription')}
        confirmLabel={t('common.delete')}
        isDanger
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-1">
          <div>
            <h1 className="font-serif text-3xl text-stone-900">{recipe.title}</h1>
            {recipe.category && (
              <span className="mt-2 inline-block rounded-full bg-clay px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                {recipe.category.name}
              </span>
            )}
            {recipe.description && <p className="mt-2 text-stone-600">{recipe.description}</p>}
          </div>

          {recipe.tags && recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {recipe.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full border border-clay/25 bg-clay/10 px-3 py-1 text-xs font-medium tracking-wide text-clay capitalize"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3 lg:flex-col">
            {recipe.prep_time_minutes != null && (
              <TimeStat
                icon="clock"
                label={t('recipes.detail.prep')}
                minutes={recipe.prep_time_minutes}
              />
            )}
            {recipe.cook_time_minutes != null && (
              <TimeStat
                icon="flame"
                label={t('recipes.detail.cook')}
                minutes={recipe.cook_time_minutes}
              />
            )}
            {recipe.total_time_minutes != null && (
              <TimeStat
                icon="timer"
                label={t('recipes.detail.total')}
                minutes={recipe.total_time_minutes}
              />
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <RecipeHero title={recipe.title} imagePath={recipe.image_path} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-xl text-stone-900">{t('recipes.detail.ingredients')}</h2>
          </div>
          <ServingsStepper value={servings} onChange={setServings} />
          <ul className="mt-4 divide-y divide-stone-100">
            {scaledIngredients.map((ingredient) => (
              <li key={ingredient.id} className="flex items-start gap-2.5 py-2 text-stone-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-clay/60" />
                <span>{ingredient.displayText}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-3 font-serif text-xl text-stone-900">
            {t('recipes.detail.instructions')}
          </h2>
          <ol className="space-y-5">
            {recipe.instructions?.map((step) => (
              <li key={step.id} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay text-sm font-medium text-white">
                  {step.step_number}
                </span>
                <div className="flex-1">
                  <p className="text-stone-700">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}
