import type { RecipeSnapshot, RecipeVersion, RecipeVersionSummary } from 'yumbry-shared';
import { prisma } from '../db/prisma.js';
import { parseIngredientLine } from './ingredient-parser.js';
import { updateRecipe } from './recipe.service.js';
import type { RecipeWithRelations } from './recipe.types.js';

// Versions are written by updateRecipe itself (recipe.service.ts), which snapshots the state a
// save is about to replace. This module only reads them back and reverts to one.

/** Newest first. Scoped through the recipe's family, so another family's recipe id yields []
 * — the controller tells that apart from "no versions yet" by checking the recipe first. */
export async function listVersions(
  recipeId: number,
  familyId: number
): Promise<RecipeVersionSummary[]> {
  const versions = await prisma.recipeVersion.findMany({
    where: { recipeId: { equals: recipeId }, recipe: { familyId: { equals: familyId } } },
    select: { id: true, savedAt: true },
    orderBy: [{ savedAt: 'desc' }, { id: 'desc' }],
  });
  return versions.map((version) => ({ id: version.id, saved_at: version.savedAt.toISOString() }));
}

export async function getVersion(
  recipeId: number,
  versionId: number,
  familyId: number
): Promise<RecipeVersion | null> {
  const version = await prisma.recipeVersion.findFirst({
    where: {
      id: { equals: versionId },
      recipeId: { equals: recipeId },
      recipe: { familyId: { equals: familyId } },
    },
  });
  if (!version) return null;

  return {
    id: version.id,
    saved_at: version.savedAt.toISOString(),
    snapshot: version.snapshot as unknown as RecipeSnapshot,
  };
}

/** Writes the version's content back through updateRecipe, which first snapshots the state
 * being replaced — so a revert is itself undoable and never loses anything. The photo is
 * untouched, as with every update. */
export async function revertToVersion(
  recipeId: number,
  versionId: number,
  familyId: number
): Promise<RecipeWithRelations | null> {
  const version = await getVersion(recipeId, versionId, familyId);
  if (!version) return null;

  const { snapshot } = version;
  return updateRecipe(
    recipeId,
    {
      title: snapshot.title,
      description: snapshot.description,
      prep_time_minutes: snapshot.prep_time_minutes,
      cook_time_minutes: snapshot.cook_time_minutes,
      total_time_minutes: snapshot.total_time_minutes,
      servings: Number(snapshot.servings),
      calories: nullableNumber(snapshot.calories),
      fat_content: nullableNumber(snapshot.fat_content),
      carbohydrate_content: nullableNumber(snapshot.carbohydrate_content),
      protein_content: nullableNumber(snapshot.protein_content),
      category: snapshot.category,
      tags: snapshot.tags,
      ingredients: snapshot.ingredients.map((line) => parseIngredientLine(line)),
      instructions: snapshot.instructions,
    },
    familyId
  );
}

function nullableNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}
