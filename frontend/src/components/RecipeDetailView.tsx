import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useScaledIngredients } from '../hooks/useScaledIngredients';
import { toNumber } from '../utils/numeric';
import type { SharedRecipe } from '../types';
import IngredientList from './IngredientList';
import InstructionList from './InstructionList';
import NutritionStats from './NutritionStats';
import RecipeHero from './RecipeHero';
import RecipeTagBadges from './RecipeTagBadges';
import ServingsStepper from './ServingsStepper';
import TimeStat from './TimeStat';

interface RecipeDetailViewProps {
  /** Only the displayed fields are read, so both a family recipe and one viewed
   * through a public share link fit. */
  recipe: Omit<SharedRecipe, 'own_recipe_id'>;
}

/** The read-only body of a recipe: summary card, photo, scalable ingredients and
 * steps. Owns the servings stepper, which starts at the recipe's own servings —
 * give it a `key` per recipe so switching recipes starts over. */
export default function RecipeDetailView({ recipe }: RecipeDetailViewProps) {
  const { t } = useTranslation();
  const [servings, setServings] = useState(() => toNumber(recipe.servings, 1));

  const scaledIngredients = useScaledIngredients(
    recipe.ingredients,
    toNumber(recipe.servings, 1),
    servings
  );

  return (
    <>
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

          <NutritionStats
            calories={recipe.calories}
            fatContent={recipe.fat_content}
            carbohydrateContent={recipe.carbohydrate_content}
            proteinContent={recipe.protein_content}
          />
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
    </>
  );
}
