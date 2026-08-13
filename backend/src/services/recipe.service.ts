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

type PrismaRecipeWithRelations = {
  id: number;
  title: string;
  description: string | null;
  imagePath: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  servings: { toString(): string };
  categoryId: number | null;
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
    category_id: recipe.categoryId,
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
  userId: number,
  { search, tag, category }: { search?: string; tag?: string; category?: string } = {}
): Promise<(RecipeRow & { tags: TagRef[]; category: CategoryRef | null })[]> {
  const recipes = await prisma.recipe.findMany({
    where: {
      userId,
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

export async function getRecipeById(
  id: string | number,
  userId: number
): Promise<RecipeWithRelations | null> {
  const recipe = await prisma.recipe.findFirst({
    where: { id: Number(id), userId },
    include: {
      ...RECIPE_WITH_TAGS_INCLUDE,
      ingredients: { orderBy: { sortOrder: 'asc' } },
      instructions: { orderBy: { stepNumber: 'asc' } },
    },
  });
  if (!recipe) return null;

  return {
    ...toRecipeRow(recipe),
    ingredients: recipe.ingredients.map(toIngredientRow),
    instructions: recipe.instructions.map(toInstructionRow),
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

async function referencedTagIds(client: Queryable, userId: number): Promise<number[]> {
  const rows = await client.recipeTag.findMany({
    where: { tag: { userId } },
    select: { tagId: true },
    distinct: ['tagId'],
  });
  return rows.map((row) => row.tagId);
}

async function referencedCategoryIds(client: Queryable, userId: number): Promise<number[]> {
  const rows = await client.recipe.findMany({
    where: { userId, categoryId: { not: null } },
    select: { categoryId: true },
    distinct: ['categoryId'],
  });
  return rows.map((row) => row.categoryId as number);
}

export async function createRecipe(
  data: RecipeInput,
  userId: number
): Promise<RecipeWithRelations | null> {
  const recipeId = await withTransaction(async (client) => {
    const categoryId = await upsertCategory(client, data.category, userId);

    const recipe = await client.recipe.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        imagePath: data.image_path ?? null,
        prepTimeMinutes: data.prep_time_minutes ?? null,
        cookTimeMinutes: data.cook_time_minutes ?? null,
        totalTimeMinutes: data.total_time_minutes ?? null,
        servings: data.servings ?? 1,
        categoryId,
        userId,
      },
      select: { id: true },
    });

    await insertIngredients(client, recipe.id, data.ingredients ?? []);
    await insertInstructions(client, recipe.id, data.instructions ?? []);
    await upsertTags(client, recipe.id, data.tags ?? [], userId);

    return recipe.id;
  });

  return getRecipeById(recipeId, userId);
}

export async function updateRecipe(
  id: string,
  data: RecipeInput,
  userId: number
): Promise<RecipeWithRelations | null> {
  const result = await withTransaction(async (client) => {
    const categoryId = await upsertCategory(client, data.category, userId);
    const recipeId = Number(id);

    const existing = await client.recipe.findFirst({
      where: { id: recipeId, userId },
      select: { imagePath: true },
    });

    const { count } = await client.recipe.updateMany({
      where: { id: recipeId, userId },
      data: {
        title: data.title,
        description: data.description ?? null,
        imagePath: data.image_path ?? null,
        prepTimeMinutes: data.prep_time_minutes ?? null,
        cookTimeMinutes: data.cook_time_minutes ?? null,
        totalTimeMinutes: data.total_time_minutes ?? null,
        servings: data.servings ?? 1,
        categoryId,
        updatedAt: new Date(),
      },
    });

    if (count === 0) return null;

    await client.ingredient.deleteMany({ where: { recipeId } });
    await client.instruction.deleteMany({ where: { recipeId } });
    await client.recipeTag.deleteMany({ where: { recipeId } });

    await insertIngredients(client, recipeId, data.ingredients ?? []);
    await insertInstructions(client, recipeId, data.instructions ?? []);
    await upsertTags(client, recipeId, data.tags ?? [], userId);

    await deleteOrphaned(client, 'tags', await referencedTagIds(client, userId), userId);
    await deleteOrphaned(client, 'categories', await referencedCategoryIds(client, userId), userId);

    return { previousImagePath: existing?.imagePath ?? null };
  });

  if (!result) return null;

  const nextImagePath = data.image_path ?? null;
  if (result.previousImagePath && result.previousImagePath !== nextImagePath) {
    await deleteUploadedFile(result.previousImagePath);
  }

  return getRecipeById(id, userId);
}

export async function deleteRecipe(id: string, userId: number): Promise<boolean> {
  const recipeId = Number(id);

  const deleted = await withTransaction(async (client) => {
    const { count } = await client.recipe.deleteMany({ where: { id: recipeId, userId } });
    await deleteOrphaned(client, 'tags', await referencedTagIds(client, userId), userId);
    await deleteOrphaned(client, 'categories', await referencedCategoryIds(client, userId), userId);
    return count > 0;
  });

  if (deleted) await deleteRecipeUploadsDir(recipeId);
  return deleted;
}

export async function setRecipePhoto(
  id: string,
  imagePath: string,
  userId: number
): Promise<{ id: number } | null> {
  const existing = await prisma.recipe.findFirst({
    where: { id: Number(id), userId },
    select: { imagePath: true },
  });
  if (!existing) return null;

  const { count } = await prisma.recipe.updateMany({
    where: { id: Number(id), userId },
    data: { imagePath, updatedAt: new Date() },
  });
  if (count === 0) return null;

  if (existing.imagePath && existing.imagePath !== imagePath) {
    await deleteUploadedFile(existing.imagePath);
  }

  return { id: Number(id) };
}
