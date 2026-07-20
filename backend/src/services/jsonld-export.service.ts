import type { RecipeWithRelations } from './recipe.service.js';
import { minutesToIsoDuration } from '../utils/iso-duration.js';

/** Serializes a stored recipe as a schema.org Recipe JSON-LD document, the
 * inverse of parseRecipeFromJsonLd in jsonld-import.service.ts. Keys whose
 * source value is null/empty are omitted rather than emitted as null. */
export function recipeToJsonLd(recipe: RecipeWithRelations): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
  };

  if (recipe.description) jsonLd.description = recipe.description;
  if (recipe.image_path) jsonLd.image = recipe.image_path;
  jsonLd.recipeYield = recipe.servings;

  const prepTime = minutesToIsoDuration(recipe.prep_time_minutes);
  if (prepTime) jsonLd.prepTime = prepTime;
  const cookTime = minutesToIsoDuration(recipe.cook_time_minutes);
  if (cookTime) jsonLd.cookTime = cookTime;
  const totalTime = minutesToIsoDuration(recipe.total_time_minutes);
  if (totalTime) jsonLd.totalTime = totalTime;

  jsonLd.recipeIngredient = recipe.ingredients.map((ingredient) => ingredient.raw_text);
  jsonLd.recipeInstructions = recipe.instructions.map((instruction) => ({
    '@type': 'HowToStep',
    text: instruction.text,
  }));

  if (recipe.tags.length > 0) {
    jsonLd.keywords = recipe.tags.map((tag) => tag.name).join(', ');
  }

  return jsonLd;
}
