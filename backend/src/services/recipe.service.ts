import { prisma } from '../db/prisma.js';
import { withTransaction, type Queryable } from '../db/transaction.js';
import { deleteRecipeUploadsDir, deleteUploadedFile } from '../middleware/upload.js';
import { deleteOrphaned, upsertCategory, upsertTags } from './tag-category.service.js';
import type {
  CategoryRef,
  IngredientInput,
  IngredientRow,
  InstructionInput,
  InstructionRow,
  RecipeInput,
  RecipeRow,
  RecipeWithRelations,
  TagRef,
} from './recipe.types.js';

/** The only `image_path` a client may put in the DB: a remote picture, as JSON-LD
 * and URL imports carry one. A local `/uploads/...` path is refused because that
 * string is a filesystem handle — it reaches `fs.rm` through deleteUploadedFile —
 * and nothing in the request ties it to the recipe being written, so accepting one
 * would let a user aim their recipe at another family's upload directory. Local
 * paths are set by setRecipePhoto alone, from a file this server just wrote. */
function externalImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // Not absolute: a relative path, an `/uploads/...` echo, or junk.
    return null;
  }

  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
}

type PrismaRecipeWithRelations = {
  id: number;
  title: string;
  description: string | null;
  imagePath: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  servings: { toString(): string };
  calories: { toString(): string } | null;
  fatContent: { toString(): string } | null;
  carbohydrateContent: { toString(): string } | null;
  proteinContent: { toString(): string } | null;
  categoryId: number | null;
  shareToken: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: CategoryRef | null;
  recipeTags: { tag: TagRef }[];
};

function toRecipeRow(recipe: PrismaRecipeWithRelations): RecipeRow & {
  tags: TagRef[];
  category: CategoryRef | null;
} {
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    image_path: recipe.imagePath,
    prep_time_minutes: recipe.prepTimeMinutes,
    cook_time_minutes: recipe.cookTimeMinutes,
    total_time_minutes: recipe.totalTimeMinutes,
    servings: recipe.servings.toString(),
    calories: recipe.calories?.toString() ?? null,
    fat_content: recipe.fatContent?.toString() ?? null,
    carbohydrate_content: recipe.carbohydrateContent?.toString() ?? null,
    protein_content: recipe.proteinContent?.toString() ?? null,
    category_id: recipe.categoryId,
    share_token: recipe.shareToken,
    created_at: recipe.createdAt,
    updated_at: recipe.updatedAt,
    category: recipe.category,
    tags: recipe.recipeTags.map((rt) => rt.tag).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function toIngredientRow(ingredient: {
  id: number;
  recipeId: number;
  rawText: string;
  amount: { toString(): string } | null;
  unit: string | null;
  name: string;
  isScalable: boolean;
  sortOrder: number;
}): IngredientRow {
  return {
    id: ingredient.id,
    recipe_id: ingredient.recipeId,
    raw_text: ingredient.rawText,
    amount: ingredient.amount?.toString() ?? null,
    unit: ingredient.unit,
    name: ingredient.name,
    is_scalable: ingredient.isScalable,
    sort_order: ingredient.sortOrder,
  };
}

function toInstructionRow(instruction: {
  id: number;
  recipeId: number;
  stepNumber: number;
  text: string;
}): InstructionRow {
  return {
    id: instruction.id,
    recipe_id: instruction.recipeId,
    step_number: instruction.stepNumber,
    text: instruction.text,
  };
}

const RECIPE_WITH_TAGS_INCLUDE = {
  category: { select: { id: true, name: true } },
  recipeTags: { include: { tag: { select: { id: true, name: true } } } },
} as const;

export async function listRecipes(
  familyId: number,
  { search, tag, category }: { search?: string; tag?: string; category?: string } = {}
): Promise<(RecipeRow & { tags: TagRef[]; category: CategoryRef | null })[]> {
  const recipes = await prisma.recipe.findMany({
    where: {
      familyId: { equals: familyId },
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(tag && { recipeTags: { some: { tag: { name: tag } } } }),
      ...(category && { category: { name: category } }),
    },
    include: RECIPE_WITH_TAGS_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  return recipes.map(toRecipeRow);
}

const RECIPE_WITH_RELATIONS_INCLUDE = {
  ...RECIPE_WITH_TAGS_INCLUDE,
  ingredients: { orderBy: { sortOrder: 'asc' } },
  instructions: { orderBy: { stepNumber: 'asc' } },
} as const;

export async function getRecipeById(
  id: number,
  familyId: number
): Promise<RecipeWithRelations | null> {
  const recipe = await prisma.recipe.findFirst({
    where: { id: { equals: id }, familyId: { equals: familyId } },
    include: RECIPE_WITH_RELATIONS_INCLUDE,
  });
  if (!recipe) return null;

  return {
    ...toRecipeRow(recipe),
    ingredients: recipe.ingredients.map(toIngredientRow),
    instructions: recipe.instructions.map(toInstructionRow),
  };
}

/** The one read that is not family-scoped: the token itself is the credential.
 * Returns the owning familyId alongside so the caller can tell whether the
 * viewer is looking at their own household's recipe. */
export async function getRecipeByShareToken(
  token: string
): Promise<(RecipeWithRelations & { familyId: number }) | null> {
  const recipe = await prisma.recipe.findUnique({
    where: { shareToken: token },
    include: RECIPE_WITH_RELATIONS_INCLUDE,
  });
  if (!recipe) return null;

  return {
    ...toRecipeRow(recipe),
    ingredients: recipe.ingredients.map(toIngredientRow),
    instructions: recipe.instructions.map(toInstructionRow),
    familyId: recipe.familyId,
  };
}

async function insertIngredients(
  client: Queryable,
  recipeId: number,
  ingredients: IngredientInput[]
): Promise<void> {
  if (ingredients.length === 0) return;

  await client.ingredient.createMany({
    data: ingredients.map((ingredient, index) => ({
      recipeId,
      rawText: ingredient.raw_text,
      amount: ingredient.amount,
      unit: ingredient.unit,
      name: ingredient.name,
      isScalable: ingredient.is_scalable ?? true,
      sortOrder: ingredient.sort_order ?? index,
    })),
  });
}

async function insertInstructions(
  client: Queryable,
  recipeId: number,
  instructions: InstructionInput[]
): Promise<void> {
  if (instructions.length === 0) return;

  await client.instruction.createMany({
    data: instructions.map((instruction, index) => ({
      recipeId,
      stepNumber: instruction.step_number ?? index + 1,
      text: instruction.text,
    })),
  });
}

async function referencedTagIds(client: Queryable, familyId: number): Promise<number[]> {
  const rows = await client.recipeTag.findMany({
    where: { tag: { familyId: { equals: familyId } } },
    select: { tagId: true },
    distinct: ['tagId'],
  });
  return rows.map((row) => row.tagId);
}

async function referencedCategoryIds(client: Queryable, familyId: number): Promise<number[]> {
  const rows = await client.recipe.findMany({
    where: { familyId: { equals: familyId }, categoryId: { not: null } },
    select: { categoryId: true },
    distinct: ['categoryId'],
  });
  return rows.map((row) => row.categoryId as number);
}

/** The one write that needs both scopes: `familyId` decides who can see and
 * edit the recipe, `authorId` is provenance only and survives as NULL once the
 * author's account is gone. */
export async function createRecipe(
  data: RecipeInput,
  { familyId, authorId }: { familyId: number; authorId: string }
): Promise<RecipeWithRelations | null> {
  const recipeId = await withTransaction(async (client) => {
    const categoryId = await upsertCategory(client, data.category, familyId);

    const recipe = await client.recipe.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        imagePath: externalImageUrl(data.image_path),
        prepTimeMinutes: data.prep_time_minutes ?? null,
        cookTimeMinutes: data.cook_time_minutes ?? null,
        totalTimeMinutes: data.total_time_minutes ?? null,
        servings: data.servings ?? 1,
        calories: data.calories ?? null,
        fatContent: data.fat_content ?? null,
        carbohydrateContent: data.carbohydrate_content ?? null,
        proteinContent: data.protein_content ?? null,
        categoryId,
        familyId,
        authorId,
      },
      select: { id: true },
    });

    await insertIngredients(client, recipe.id, data.ingredients ?? []);
    await insertInstructions(client, recipe.id, data.instructions ?? []);
    await upsertTags(client, recipe.id, data.tags ?? [], familyId);

    return recipe.id;
  });

  return getRecipeById(recipeId, familyId);
}

export async function updateRecipe(
  id: number,
  data: RecipeInput,
  familyId: number
): Promise<RecipeWithRelations | null> {
  const result = await withTransaction(async (client) => {
    const categoryId = await upsertCategory(client, data.category, familyId);

    // imagePath is deliberately absent from the update: the column is owned by
    // setRecipePhoto (and, for a remote picture, by the initial create). Writing
    // the client's copy here is what made a PUT able to delete an arbitrary file
    // under uploads/ — the value flows on to deleteUploadedFile, and nothing in
    // the body proves the path belongs to this recipe. A photo is changed by
    // POST /api/recipes/:id/photo, which replaces the file it supersedes.
    const { count } = await client.recipe.updateMany({
      where: { id: { equals: id }, familyId: { equals: familyId } },
      data: {
        title: data.title,
        description: data.description ?? null,
        prepTimeMinutes: data.prep_time_minutes ?? null,
        cookTimeMinutes: data.cook_time_minutes ?? null,
        totalTimeMinutes: data.total_time_minutes ?? null,
        servings: data.servings ?? 1,
        calories: data.calories ?? null,
        fatContent: data.fat_content ?? null,
        carbohydrateContent: data.carbohydrate_content ?? null,
        proteinContent: data.protein_content ?? null,
        categoryId,
        updatedAt: new Date(),
      },
    });

    if (count === 0) return null;

    await client.ingredient.deleteMany({ where: { recipeId: { equals: id } } });
    await client.instruction.deleteMany({ where: { recipeId: { equals: id } } });
    await client.recipeTag.deleteMany({ where: { recipeId: { equals: id } } });

    await insertIngredients(client, id, data.ingredients ?? []);
    await insertInstructions(client, id, data.instructions ?? []);
    await upsertTags(client, id, data.tags ?? [], familyId);

    await deleteOrphaned(client, 'tags', await referencedTagIds(client, familyId), familyId);
    await deleteOrphaned(
      client,
      'categories',
      await referencedCategoryIds(client, familyId),
      familyId
    );

    return true;
  });

  if (!result) return null;

  return getRecipeById(id, familyId);
}

export async function deleteRecipe(id: number, familyId: number): Promise<boolean> {
  const deleted = await withTransaction(async (client) => {
    const { count } = await client.recipe.deleteMany({
      where: { id: { equals: id }, familyId: { equals: familyId } },
    });
    await deleteOrphaned(client, 'tags', await referencedTagIds(client, familyId), familyId);
    await deleteOrphaned(
      client,
      'categories',
      await referencedCategoryIds(client, familyId),
      familyId
    );
    return count > 0;
  });

  if (deleted) await deleteRecipeUploadsDir(id);
  return deleted;
}

export async function setRecipePhoto(
  id: number,
  imagePath: string,
  familyId: number
): Promise<{ id: number } | null> {
  const existing = await prisma.recipe.findFirst({
    where: { id: { equals: id }, familyId: { equals: familyId } },
    select: { imagePath: true },
  });
  if (!existing) return null;

  const { count } = await prisma.recipe.updateMany({
    where: { id: { equals: id }, familyId: { equals: familyId } },
    data: { imagePath, updatedAt: new Date() },
  });
  if (count === 0) return null;

  if (existing.imagePath && existing.imagePath !== imagePath) {
    await deleteUploadedFile(existing.imagePath);
  }

  return { id };
}
