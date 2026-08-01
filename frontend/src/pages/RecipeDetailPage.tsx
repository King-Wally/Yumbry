import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteRecipe, getRecipe, getRecipeExportUrl } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import RecipeHero from '../components/RecipeHero';
import ServingsStepper from '../components/ServingsStepper';
import TimeStat from '../components/TimeStat';
import { useScaledIngredients } from '../hooks/useScaledIngredients';
import { toNumber } from '../utils/numeric';

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: recipe, isLoading } = useQuery({
    queryKey: queryKeys.recipe(id!),
    queryFn: () => getRecipe(id!),
  });

  const [servings, setServings] = useState(1);
  const [servingsForRecipeId, setServingsForRecipeId] = useState<number | null>(null);

  // Adjust `servings` during render when a new recipe loads, rather than in a
  // useEffect — this is React's documented pattern for initializing editable
  // state from async data without an extra render/flash of stale values.
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

  if (isLoading) return <p className="text-stone-500">Loading recipe...</p>;
  if (!recipe) return <p className="text-stone-500">Recipe not found.</p>;

  return (
    <article className="space-y-8">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/"
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-stone-600 transition-colors hover:text-stone-900"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-4 w-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <div className="flex gap-2">
          <a
            href={getRecipeExportUrl(id!)}
            download
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            Export
          </a>
          <Link
            to={`/recipes/${id}/edit`}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            Edit
          </Link>
          <Link
            to={`/recipes/${id}/ai-improve`}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            Improve with AI
          </Link>
          <button
            type="button"
            onClick={() => {
              if (confirm('Delete this recipe?')) deleteMutation.mutate();
            }}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm md:col-span-1">
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

          <div className="flex flex-wrap gap-3 md:flex-col">
            {recipe.prep_time_minutes != null && (
              <TimeStat icon="clock" label="Prep" minutes={recipe.prep_time_minutes} />
            )}
            {recipe.cook_time_minutes != null && (
              <TimeStat icon="flame" label="Cook" minutes={recipe.cook_time_minutes} />
            )}
            {recipe.total_time_minutes != null && (
              <TimeStat icon="timer" label="Total" minutes={recipe.total_time_minutes} />
            )}
          </div>
        </div>

        <div className="md:col-span-2">
          <RecipeHero title={recipe.title} imagePath={recipe.image_path} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm md:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-xl text-stone-900">Ingredients</h2>
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

        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm md:col-span-2">
          <h2 className="mb-3 font-serif text-xl text-stone-900">Instructions</h2>
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
