import { pool } from '../db/pool.js';
import { withTransaction, type Queryable } from '../db/transaction.js';
import { insertValuesClause } from '../utils/sql.js';
import {
  deleteOrphaned,
  fetchTagsForRecipeIds,
  upsertCategory,
  upsertTags,
} from './tag-category.service.js';
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

type RecipeRowWithCategoryName = RecipeRow & { category_name: string | null };

function attachCategory<T extends RecipeRowWithCategoryName>(
  row: T
): Omit<T, 'category_name'> & { category: CategoryRef | null } {
  const { category_name, ...rest } = row;
  return {
    ...rest,
    category: row.category_id ? { id: row.category_id, name: category_name as string } : null,
  };
}

export async function listRecipes({
  search,
  tag,
  category,
}: { search?: string; tag?: string; category?: string } = {}): Promise<
  (RecipeRow & { tags: TagRef[]; category: CategoryRef | null })[]
> {
  const conditions: string[] = [];
  const params: string[] = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(r.title ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
  }

  if (tag) {
    params.push(tag);
    conditions.push(
      `r.id IN (SELECT rt.recipe_id FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE t.name = $${params.length})`
    );
  }

  if (category) {
    params.push(category);
    conditions.push(`c.name = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query<RecipeRowWithCategoryName>(
    `SELECT r.*, c.name AS category_name FROM recipes r
     LEFT JOIN categories c ON c.id = r.category_id
     ${where} ORDER BY r.created_at DESC`,
    params
  );

  const tagsByRecipe = await fetchTagsForRecipeIds(
    pool,
    rows.map((r) => r.id)
  );

  return rows.map((row) => ({ ...attachCategory(row), tags: tagsByRecipe.get(row.id) ?? [] }));
}

export async function getRecipeById(id: string | number): Promise<RecipeWithRelations | null> {
  const { rows } = await pool.query<RecipeRowWithCategoryName>(
    `SELECT r.*, c.name AS category_name FROM recipes r
     LEFT JOIN categories c ON c.id = r.category_id
     WHERE r.id = $1`,
    [id]
  );
  const recipe = rows[0];
  if (!recipe) return null;

  const [{ rows: ingredients }, { rows: instructions }, tagsByRecipe] = await Promise.all([
    pool.query<IngredientRow>(
      'SELECT * FROM ingredients WHERE recipe_id = $1 ORDER BY sort_order',
      [id]
    ),
    pool.query<InstructionRow>(
      'SELECT * FROM instructions WHERE recipe_id = $1 ORDER BY step_number',
      [id]
    ),
    fetchTagsForRecipeIds(pool, [recipe.id]),
  ]);

  return {
    ...attachCategory(recipe),
    ingredients,
    instructions,
    tags: tagsByRecipe.get(recipe.id) ?? [],
  };
}

async function insertIngredients(
  client: Queryable,
  recipeId: number,
  ingredients: IngredientInput[]
): Promise<void> {
  if (ingredients.length === 0) return;

  const params = ingredients.flatMap((ingredient, index) => [
    recipeId,
    ingredient.raw_text,
    ingredient.amount,
    ingredient.unit,
    ingredient.name,
    ingredient.is_scalable ?? true,
    ingredient.sort_order ?? index,
  ]);

  await client.query(
    `INSERT INTO ingredients (recipe_id, raw_text, amount, unit, name, is_scalable, sort_order)
     VALUES ${insertValuesClause(ingredients.length, 7)}`,
    params
  );
}

async function insertInstructions(
  client: Queryable,
  recipeId: number,
  instructions: InstructionInput[]
): Promise<void> {
  if (instructions.length === 0) return;

  const params = instructions.flatMap((instruction, index) => [
    recipeId,
    instruction.step_number ?? index + 1,
    instruction.text,
  ]);

  await client.query(
    `INSERT INTO instructions (recipe_id, step_number, text)
     VALUES ${insertValuesClause(instructions.length, 3)}`,
    params
  );
}

export async function createRecipe(data: RecipeInput): Promise<RecipeWithRelations | null> {
  const recipeId = await withTransaction(async (client) => {
    const categoryId = await upsertCategory(client, data.category);

    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO recipes
        (title, description, image_path, prep_time_minutes, cook_time_minutes,
         total_time_minutes, servings, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        data.title,
        data.description ?? null,
        data.image_path ?? null,
        data.prep_time_minutes ?? null,
        data.cook_time_minutes ?? null,
        data.total_time_minutes ?? null,
        data.servings ?? 1,
        categoryId,
      ]
    );
    const recipeId = rows[0].id;

    await insertIngredients(client, recipeId, data.ingredients ?? []);
    await insertInstructions(client, recipeId, data.instructions ?? []);
    await upsertTags(client, recipeId, data.tags ?? []);

    return recipeId;
  });

  return getRecipeById(recipeId);
}

export async function updateRecipe(
  id: string,
  data: RecipeInput
): Promise<RecipeWithRelations | null> {
  const updated = await withTransaction(async (client) => {
    const categoryId = await upsertCategory(client, data.category);

    const { rowCount } = await client.query(
      `UPDATE recipes SET
        title = $1, description = $2, image_path = $3, prep_time_minutes = $4,
        cook_time_minutes = $5, total_time_minutes = $6, servings = $7,
        category_id = $8, updated_at = now()
       WHERE id = $9`,
      [
        data.title,
        data.description ?? null,
        data.image_path ?? null,
        data.prep_time_minutes ?? null,
        data.cook_time_minutes ?? null,
        data.total_time_minutes ?? null,
        data.servings ?? 1,
        categoryId,
        id,
      ]
    );

    if (rowCount === 0) return false;

    await client.query('DELETE FROM ingredients WHERE recipe_id = $1', [id]);
    await client.query('DELETE FROM instructions WHERE recipe_id = $1', [id]);
    await client.query('DELETE FROM recipe_tags WHERE recipe_id = $1', [id]);

    await insertIngredients(client, Number(id), data.ingredients ?? []);
    await insertInstructions(client, Number(id), data.instructions ?? []);
    await upsertTags(client, Number(id), data.tags ?? []);
    await deleteOrphaned(client, 'tags', 'SELECT DISTINCT tag_id FROM recipe_tags');
    await deleteOrphaned(
      client,
      'categories',
      'SELECT DISTINCT category_id FROM recipes WHERE category_id IS NOT NULL'
    );

    return true;
  });

  if (!updated) return null;
  return getRecipeById(id);
}

export async function deleteRecipe(id: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query('DELETE FROM recipes WHERE id = $1', [id]);
    await deleteOrphaned(client, 'tags', 'SELECT DISTINCT tag_id FROM recipe_tags');
    await deleteOrphaned(
      client,
      'categories',
      'SELECT DISTINCT category_id FROM recipes WHERE category_id IS NOT NULL'
    );
    return (rowCount ?? 0) > 0;
  });
}

export async function setRecipePhoto(
  id: string,
  imagePath: string
): Promise<{ id: number } | null> {
  const { rows } = await pool.query<{ id: number }>(
    'UPDATE recipes SET image_path = $1, updated_at = now() WHERE id = $2 RETURNING id',
    [imagePath, id]
  );
  return rows[0] ?? null;
}
