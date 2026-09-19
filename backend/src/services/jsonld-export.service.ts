import type { RecipeWithRelations } from './recipe.types.js';
import { minutesToIsoDuration } from '../utils/iso-duration.js';

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

  // schema.org's NutritionInformation is per serving, which is how we store it — no conversion.
  // Emitted only when there is something to say, so exports of nutrition-less recipes are
  // byte-identical to what they were before nutrition existed.
  const nutrition: Record<string, unknown> = { '@type': 'NutritionInformation' };
  if (recipe.calories != null) nutrition.calories = `${recipe.calories} kcal`;
  if (recipe.fat_content != null) nutrition.fatContent = `${recipe.fat_content} g`;
  if (recipe.carbohydrate_content != null) {
    nutrition.carbohydrateContent = `${recipe.carbohydrate_content} g`;
  }
  if (recipe.protein_content != null) nutrition.proteinContent = `${recipe.protein_content} g`;
  if (Object.keys(nutrition).length > 1) jsonLd.nutrition = nutrition;

  if (recipe.category) jsonLd.recipeCategory = recipe.category.name;

  if (recipe.tags.length > 0) {
    jsonLd.keywords = recipe.tags.map((tag) => tag.name).join(', ');
  }

  return jsonLd;
}
