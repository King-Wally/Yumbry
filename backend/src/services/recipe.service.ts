import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import type { ParsedIngredient } from './ingredient-parser.js';

export interface TagRef {
  id: number;
  name: string;
}

export interface TagRow {
  id: number;
  name: string;
}

export interface RecipeRow {
  id: number;
  title: string;
  description: string | null;
  image_path: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  servings: string;
  created_at: Date;
  updated_at: Date;
}

export interface IngredientRow {
  id: number;
  recipe_id: number;
  raw_text: string;
  amount: string | null;
  unit: string | null;
  name: string;
  is_scalable: boolean;
  sort_order: number;
}

export interface InstructionRow {
  id: number;
  recipe_id: number;
  step_number: number;
  text: string;
}

export interface RecipeWithRelations extends RecipeRow {
  ingredients: IngredientRow[];
  instructions: InstructionRow[];
  tags: TagRef[];
}

export interface IngredientInput extends ParsedIngredient {
  sort_order?: number;
}

export interface InstructionInput {
  step_number?: number;
  text: string;
}

export interface RecipeInput {
  title: string;
  description?: string | null;
  image_path?: string | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  total_time_minutes?: number | null;
  servings?: number;
  ingredients?: IngredientInput[];
  instructions?: InstructionInput[];
  tags?: string[];
}

type Queryable = Pick<PoolClient, 'query'>;

async function fetchTagsForRecipeIds(
  client: Queryable,
  recipeIds: number[]
): Promise<Map<number, TagRef[]>> {
  const byRecipe = new Map<number, TagRef[]>();
  if (recipeIds.length === 0) return byRecipe;

  const { rows } = await client.query<{ recipe_id: number; id: number; name: string }>(
    `SELECT rt.recipe_id, t.id, t.name
     FROM recipe_tags rt
     JOIN tags t ON t.id = rt.tag_id
     WHERE rt.recipe_id = ANY($1::int[])
     ORDER BY t.name`,
    [recipeIds]
  );

  for (const row of rows) {
    const list = byRecipe.get(row.recipe_id) ?? [];
    list.push({ id: row.id, name: row.name });
    byRecipe.set(row.recipe_id, list);
  }
  return byRecipe;
}

export async function listRecipes({ search, tag }: { search?: string; tag?: string } = {}): Promise<
  (RecipeRow & { tags: TagRef[] })[]
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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query<RecipeRow>(
    `SELECT r.* FROM recipes r ${where} ORDER BY r.created_at DESC`,
    params
  );

  const tagsByRecipe = await fetchTagsForRecipeIds(
    pool,
    rows.map((r) => r.id)
  );

  return rows.map((row) => ({ ...row, tags: tagsByRecipe.get(row.id) ?? [] }));
}

export async function getRecipeById(id: string | number): Promise<RecipeWithRelations | null> {
  const { rows } = await pool.query<RecipeRow>('SELECT * FROM recipes WHERE id = $1', [id]);
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
    ...recipe,
    ingredients,
    instructions,
    tags: tagsByRecipe.get(recipe.id) ?? [],
  };
}

async function upsertTags(client: Queryable, recipeId: number, tagNames: string[]): Promise<void> {
  for (const name of tagNames) {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name]
    );
    await client.query(
      'INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [recipeId, rows[0].id]
    );
  }
}

async function deleteOrphanedTags(client: Queryable): Promise<void> {
  await client.query(
    'DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM recipe_tags)'
  );
}

async function insertIngredients(
  client: Queryable,
  recipeId: number,
  ingredients: IngredientInput[]
): Promise<void> {
  let sortOrder = 0;
  for (const ingredient of ingredients) {
    await client.query(
      `INSERT INTO ingredients (recipe_id, raw_text, amount, unit, name, is_scalable, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        recipeId,
        ingredient.raw_text,
        ingredient.amount,
        ingredient.unit,
        ingredient.name,
        ingredient.is_scalable ?? true,
        ingredient.sort_order ?? sortOrder,
      ]
    );
    sortOrder += 1;
  }
}

async function insertInstructions(
  client: Queryable,
  recipeId: number,
  instructions: InstructionInput[]
): Promise<void> {
  let stepNumber = 1;
  for (const instruction of instructions) {
    await client.query(
      `INSERT INTO instructions (recipe_id, step_number, text)
       VALUES ($1, $2, $3)`,
      [recipeId, instruction.step_number ?? stepNumber, instruction.text]
    );
    stepNumber += 1;
  }
}

export async function createRecipe(data: RecipeInput): Promise<RecipeWithRelations | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO recipes
        (title, description, image_path, prep_time_minutes, cook_time_minutes,
         total_time_minutes, servings)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        data.title,
        data.description ?? null,
        data.image_path ?? null,
        data.prep_time_minutes ?? null,
        data.cook_time_minutes ?? null,
        data.total_time_minutes ?? null,
        data.servings ?? 1,
      ]
    );
    const recipeId = rows[0].id;

    await insertIngredients(client, recipeId, data.ingredients ?? []);
    await insertInstructions(client, recipeId, data.instructions ?? []);
    await upsertTags(client, recipeId, data.tags ?? []);

    await client.query('COMMIT');
    return getRecipeById(recipeId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateRecipe(
  id: string,
  data: RecipeInput
): Promise<RecipeWithRelations | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query(
      `UPDATE recipes SET
        title = $1, description = $2, image_path = $3, prep_time_minutes = $4,
        cook_time_minutes = $5, total_time_minutes = $6, servings = $7,
        updated_at = now()
       WHERE id = $8`,
      [
        data.title,
        data.description ?? null,
        data.image_path ?? null,
        data.prep_time_minutes ?? null,
        data.cook_time_minutes ?? null,
        data.total_time_minutes ?? null,
        data.servings ?? 1,
        id,
      ]
    );

    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('DELETE FROM ingredients WHERE recipe_id = $1', [id]);
    await client.query('DELETE FROM instructions WHERE recipe_id = $1', [id]);
    await client.query('DELETE FROM recipe_tags WHERE recipe_id = $1', [id]);

    await insertIngredients(client, Number(id), data.ingredients ?? []);
    await insertInstructions(client, Number(id), data.instructions ?? []);
    await upsertTags(client, Number(id), data.tags ?? []);
    await deleteOrphanedTags(client);

    await client.query('COMMIT');
    return getRecipeById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteRecipe(id: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query('DELETE FROM recipes WHERE id = $1', [id]);
    await deleteOrphanedTags(client);
    await client.query('COMMIT');
    return (rowCount ?? 0) > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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

export async function listTags(): Promise<TagRow[]> {
  const { rows } = await pool.query<TagRow>('SELECT * FROM tags ORDER BY name');
  return rows;
}
