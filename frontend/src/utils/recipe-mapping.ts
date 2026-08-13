import { toNumber } from './numeric';
import type { AiRecipeDraft, Recipe } from '../types';

// Returns the AI draft shape rather than the looser `RecipeInput`: every field is filled here,
// and the AI turn needs the stronger guarantee. `AiRecipeDraft` is assignable to `RecipeInput`, so
// the other callers are unaffected.
export function toRecipeInput(recipe: Recipe): AiRecipeDraft {
  return {
    title: recipe.title,
    description: recipe.description,
    image_path: recipe.image_path,
    prep_time_minutes: recipe.prep_time_minutes,
    cook_time_minutes: recipe.cook_time_minutes,
    total_time_minutes: recipe.total_time_minutes,
    servings: toNumber(recipe.servings, 1),
    ingredients: recipe.ingredients.map((i) => i.raw_text),
    instructions: recipe.instructions.map((i) => ({ step_number: i.step_number, text: i.text })),
    tags: recipe.tags.map((t) => t.name),
    category: recipe.category?.name ?? null,
  };
}
