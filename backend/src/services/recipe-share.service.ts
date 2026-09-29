import { prisma } from '../db/prisma.js';
import { absoluteUploadPath, copyRecipeUpload } from '../middleware/upload.js';
import { generateShareToken } from '../utils/share-token.js';
import {
  createRecipe,
  getRecipeById,
  getRecipeByShareToken,
  setRecipePhoto,
} from './recipe.service.js';
import type { RecipeInput, RecipeWithRelations } from './recipe.types.js';

/** What an anonymous viewer of a share link gets: the recipe as the owner sees
 * it, minus its id and the token itself, plus whether it already belongs to the
 * viewer's own household. */
export type SharedRecipe = Omit<RecipeWithRelations, 'id' | 'share_token'> & {
  own_recipe_id: number | null;
};

/** Idempotent: returns the recipe's existing token if it has one. Null when the
 * recipe doesn't exist in this family. */
export async function enableShare(id: number, familyId: number): Promise<string | null> {
  const existing = await prisma.recipe.findFirst({
    where: { id: { equals: id }, familyId: { equals: familyId } },
    select: { shareToken: true },
  });
  if (!existing) return null;
  if (existing.shareToken) return existing.shareToken;

  // Conditional on the token still being null, so two concurrent "create link"
  // clicks can't mint two links where the first one shown silently stops working.
  // updatedAt is left alone: sharing isn't an edit of the recipe.
  const token = generateShareToken();
  const { count } = await prisma.recipe.updateMany({
    where: { id: { equals: id }, familyId: { equals: familyId }, shareToken: null },
    data: { shareToken: token },
  });
  if (count > 0) return token;

  const winner = await prisma.recipe.findFirst({
    where: { id: { equals: id }, familyId: { equals: familyId } },
    select: { shareToken: true },
  });
  return winner?.shareToken ?? null;
}

/** False when the recipe doesn't exist in this family. */
export async function disableShare(id: number, familyId: number): Promise<boolean> {
  const { count } = await prisma.recipe.updateMany({
    where: { id: { equals: id }, familyId: { equals: familyId } },
    data: { shareToken: null },
  });
  return count > 0;
}

/** The public URL a shared recipe's local photo is served from. `/uploads` is
 * family-gated, so an anonymous viewer can't load the stored path directly. */
export function sharedPhotoPath(token: string): string {
  return `/api/shared/${token}/photo`;
}

export async function getSharedRecipe(
  token: string,
  viewerFamilyId: number | undefined
): Promise<SharedRecipe | null> {
  const recipe = await getRecipeByShareToken(token);
  if (!recipe) return null;

  // Pulled out rather than spread: neither the id nor the token belongs in the
  // public payload. The token found the row, so it equals `token`.
  const { id, share_token: shareToken, familyId, ...rest } = recipe;
  const hasLocalPhoto = rest.image_path !== null && absoluteUploadPath(rest.image_path) !== null;
  return {
    ...rest,
    // Remote http(s) pictures (JSON-LD/URL imports) pass through as-is.
    image_path: hasLocalPhoto ? sharedPhotoPath(shareToken ?? token) : rest.image_path,
    own_recipe_id: viewerFamilyId === familyId ? id : null,
  };
}

/** Absolute path of a shared recipe's local photo, or null when there is none. */
export async function getSharedPhotoFile(token: string): Promise<string | null> {
  const recipe = await prisma.recipe.findUnique({
    where: { shareToken: token },
    select: { imagePath: true },
  });
  if (!recipe?.imagePath) return null;
  return absoluteUploadPath(recipe.imagePath);
}

function toNumberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** Maps a stored recipe back to createRecipe's input shape. Tags and category
 * travel by name, so createRecipe recreates them in the importer's family. */
export function toRecipeInput(recipe: RecipeWithRelations): RecipeInput {
  return {
    title: recipe.title,
    description: recipe.description,
    image_path: recipe.image_path,
    prep_time_minutes: recipe.prep_time_minutes,
    cook_time_minutes: recipe.cook_time_minutes,
    total_time_minutes: recipe.total_time_minutes,
    servings: Number(recipe.servings),
    calories: toNumberOrNull(recipe.calories),
    fat_content: toNumberOrNull(recipe.fat_content),
    carbohydrate_content: toNumberOrNull(recipe.carbohydrate_content),
    protein_content: toNumberOrNull(recipe.protein_content),
    ingredients: recipe.ingredients.map((ingredient) => ({
      raw_text: ingredient.raw_text,
      amount: toNumberOrNull(ingredient.amount),
      unit: ingredient.unit,
      name: ingredient.name,
      is_scalable: ingredient.is_scalable,
      sort_order: ingredient.sort_order,
    })),
    instructions: recipe.instructions.map((instruction) => ({
      step_number: instruction.step_number,
      text: instruction.text,
    })),
    tags: recipe.tags.map((tag) => tag.name),
    category: recipe.category?.name ?? null,
  };
}

/** Creates an independent copy of a shared recipe in the importer's family,
 * including its photo. Null when the token doesn't match a shared recipe. */
export async function importSharedRecipe(
  token: string,
  { familyId, userId }: { familyId: number; userId: string }
): Promise<RecipeWithRelations | null> {
  const source = await getRecipeByShareToken(token);
  if (!source) return null;

  // createRecipe keeps a remote image URL and drops a local /uploads path on
  // purpose (see externalImageUrl), so a local photo is copied separately below.
  const created = await createRecipe(toRecipeInput(source), { familyId, authorId: userId });
  if (!created || !source.image_path || !absoluteUploadPath(source.image_path)) return created;

  // Best-effort: a missing or unreadable source file still yields the recipe.
  try {
    const copiedPath = await copyRecipeUpload(source.image_path, created.id);
    if (!copiedPath) return created;
    await setRecipePhoto(created.id, copiedPath, familyId);
  } catch (err) {
    console.error(`Failed to copy photo for imported recipe ${created.id}:`, err);
    return created;
  }
  return getRecipeById(created.id, familyId);
}
