import { pool } from '../db/pool.js';
import type { Queryable } from '../db/transaction.js';
import type { CategoryRef, TagRef } from './recipe.types.js';

export async function fetchTagsForRecipeIds(
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

export async function deleteOrphaned(
  client: Queryable,
  table: 'tags' | 'categories',
  referencedIdsSql: string,
  userId: number
): Promise<void> {
  await client.query(
    `DELETE FROM ${table} WHERE user_id = $1 AND id NOT IN (${referencedIdsSql})`,
    [userId]
  );
}

export async function upsertTags(
  client: Queryable,
  recipeId: number,
  tagNames: string[],
  userId: number
): Promise<void> {
  const normalized = [...new Set(tagNames.map((name) => name.trim().toLowerCase()))].filter(
    Boolean
  );
  if (normalized.length === 0) return;

  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO tags (user_id, name)
     SELECT $1, * FROM UNNEST($2::text[])
     ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [userId, normalized]
  );

  const values = rows.map((_, index) => `($1, $${index + 2})`).join(', ');
  await client.query(
    `INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ${values} ON CONFLICT DO NOTHING`,
    [recipeId, ...rows.map((row) => row.id)]
  );
}

export async function upsertCategory(
  client: Queryable,
  name: string | null | undefined,
  userId: number
): Promise<number | null> {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO categories (user_id, name) VALUES ($1, $2)
     ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [userId, normalized]
  );
  return rows[0].id;
}

export async function listTags(userId: number): Promise<TagRef[]> {
  const { rows } = await pool.query<TagRef>('SELECT * FROM tags WHERE user_id = $1 ORDER BY name', [
    userId,
  ]);
  return rows;
}

export async function listCategories(userId: number): Promise<CategoryRef[]> {
  const { rows } = await pool.query<CategoryRef>(
    'SELECT * FROM categories WHERE user_id = $1 ORDER BY name',
    [userId]
  );
  return rows;
}
