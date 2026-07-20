import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteRecipe, getRecipe } from '../api/client';
import RecipeHero from '../components/RecipeHero';
import ServingsStepper from '../components/ServingsStepper';
import TimeStat from '../components/TimeStat';
import { useScaledIngredients } from '../hooks/useScaledIngredients';

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: recipe, isLoading } = useQuery({
    queryKey: ['recipe', id],
    queryFn: () => getRecipe(id!),
  });

  const [servings, setServings] = useState(1);
  const [servingsForRecipeId, setServingsForRecipeId] = useState<number | null>(null);

  // Adjust `servings` during render when a new recipe loads, rather than in a
  // useEffect — this is React's documented pattern for initializing editable
  // state from async data without an extra render/flash of stale values.
  if (recipe && servingsForRecipeId !== recipe.id) {
    setServingsForRecipeId(recipe.id);
    setServings(Number(recipe.servings));
  }

  const scaledIngredients = useScaledIngredients(
    recipe?.ingredients,
    Number(recipe?.servings ?? 1),
    servings
  );

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecipe(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      navigate('/');
    },
  });

  if (isLoading) return <p className="text-stone-500">Loading recipe...</p>;
  if (!recipe) return <p className="text-stone-500">Recipe not found.</p>;

  return (
    <article className="space-y-8">
      <div className="flex justify-end gap-2">
        <Link
          to={`/recipes/${id}/edit`}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
        >
          Edit
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

      <RecipeHero title={recipe.title} description={recipe.description} imagePath={recipe.image_path} />

      {recipe.tags && recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recipe.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full border border-clay/25 bg-clay/10 px-3 py-1 text-xs font-medium tracking-wide text-clay"
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-6">
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
                  {step.image_path && (
                    <img
                      src={step.image_path}
                      alt={`Step ${step.step_number}`}
                      className="mt-2 max-h-48 rounded-md object-cover"
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}
