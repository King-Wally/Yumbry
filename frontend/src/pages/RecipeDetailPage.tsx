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
import { useAiStatus } from '../hooks/useAiStatus';
import { useAuth } from '../hooks/useAuth';
import { toNumber } from '../utils/numeric';
import CollapsibleActions from '../components/CollapsibleActions';
import ConfirmDialog from '../components/ConfirmDialog';
import IngredientList from '../components/IngredientList';
import InstructionList from '../components/InstructionList';
import RecipeTagBadges from '../components/RecipeTagBadges';

export default function RecipeDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: recipe, isLoading } = useQuery({
    queryKey: queryKeys.recipe(id!),
    queryFn: () => getRecipe(id!),
  });
  const { data: aiStatus } = useAiStatus();
  const { user } = useAuth();

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
    <article className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
        >
          <ArrowLeft size={18} />
        </Link>
        <CollapsibleActions>
          {user?.jsonImportExportEnabled && (
            <a
              href={getRecipeExportUrl(id!)}
              download
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
            >
              {t('recipes.detail.export')}
            </a>
          )}
          <Link
            to={`/recipes/${id}/edit`}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            {t('recipes.detail.edit')}
          </Link>
          {aiStatus?.configured && (
            <Link
              to={`/recipes/${id}/ai-improve`}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
            >
              {t('recipes.detail.improveWithAi')}
            </Link>
          )}
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
        <div className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-1">
          <div>
            <h1 className="font-serif text-3xl text-stone-900">{recipe.title}</h1>
            {recipe.description && <p className="mt-2 text-stone-600">{recipe.description}</p>}
          </div>

          <RecipeTagBadges
            category={recipe.category?.name}
            tags={recipe.tags.map((tag) => tag.name)}
          />

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
        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-xl text-stone-900">{t('recipes.detail.ingredients')}</h2>
          </div>
          <ServingsStepper value={servings} onChange={setServings} />
          <div className="mt-4">
            <IngredientList
              items={scaledIngredients.map((ingredient) => ({
                key: ingredient.id,
                text: ingredient.displayText,
              }))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-2">
          <h2 className="mb-3 font-serif text-xl text-stone-900">
            {t('recipes.detail.instructions')}
          </h2>
          <InstructionList
            items={(recipe.instructions ?? []).map((step) => ({
              key: step.id,
              step_number: step.step_number,
              text: step.text,
            }))}
          />
        </section>
      </div>
    </article>
  );
}
