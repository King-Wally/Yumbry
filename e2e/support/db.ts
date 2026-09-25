// The only file in the suite that knows table and column names. Seeding through SQL rather than
// the app's JSON API keeps specs independent of that API. As long as the schema keeps today's
// names, nothing here changes.
import pg from 'pg';

export interface SeedIngredient {
  raw: string;
  /** Omit for a line that shouldn't scale ("salt to taste"). */
  amount?: number;
  unit?: string;
  name?: string;
}

export interface SeedRecipe {
  title: string;
  description?: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  calories?: number;
  fatContent?: number;
  carbohydrateContent?: number;
  proteinContent?: number;
  category?: string;
  tags?: string[];
  ingredients?: SeedIngredient[];
  instructions?: string[];
}

export class Db {
  constructor(private readonly pool: pg.Pool) {}

  async familyIdOf(userId: string): Promise<number> {
    const { rows } = await this.pool.query<{ family_id: number }>(
      'SELECT family_id FROM users WHERE id = $1',
      [userId]
    );
    if (!rows[0]) throw new Error(`No user ${userId}`);
    return rows[0].family_id;
  }

  async userExists(email: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    return Boolean(rowCount);
  }

  async setJsonImportExport(userId: string, enabled: boolean): Promise<void> {
    await this.pool.query('UPDATE users SET json_import_export_enabled = $2 WHERE id = $1', [
      userId,
      enabled,
    ]);
  }

  async userLocale(userId: string): Promise<string> {
    const { rows } = await this.pool.query<{ locale: string }>(
      'SELECT locale FROM users WHERE id = $1',
      [userId]
    );
    return rows[0].locale;
  }

  async insertRecipe(familyId: number, authorId: string, recipe: SeedRecipe): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const categoryId = recipe.category
        ? await upsertNamed(client, 'categories', familyId, recipe.category)
        : null;
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO recipes (title, description, servings, prep_time_minutes, cook_time_minutes,
           total_time_minutes, calories, fat_content, carbohydrate_content, protein_content,
           category_id, family_id, author_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          recipe.title,
          recipe.description ?? null,
          recipe.servings ?? 4,
          recipe.prepTimeMinutes ?? null,
          recipe.cookTimeMinutes ?? null,
          recipe.totalTimeMinutes ?? null,
          recipe.calories ?? null,
          recipe.fatContent ?? null,
          recipe.carbohydrateContent ?? null,
          recipe.proteinContent ?? null,
          categoryId,
          familyId,
          authorId,
        ]
      );
      const recipeId = rows[0].id;

      for (const [index, ingredient] of (recipe.ingredients ?? []).entries()) {
        const scalable = ingredient.amount !== undefined;
        await client.query(
          `INSERT INTO ingredients (recipe_id, raw_text, amount, unit, name, is_scalable, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            recipeId,
            ingredient.raw,
            ingredient.amount ?? null,
            ingredient.unit ?? null,
            ingredient.name ?? ingredient.raw,
            scalable,
            index,
          ]
        );
      }
      for (const [index, text] of (recipe.instructions ?? []).entries()) {
        await client.query(
          'INSERT INTO instructions (recipe_id, step_number, text) VALUES ($1, $2, $3)',
          [recipeId, index + 1, text]
        );
      }
      for (const tag of recipe.tags ?? []) {
        const tagId = await upsertNamed(client, 'tags', familyId, tag);
        await client.query('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ($1, $2)', [
          recipeId,
          tagId,
        ]);
      }
      await client.query('COMMIT');
      return recipeId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async recipeTitles(familyId: number): Promise<string[]> {
    const { rows } = await this.pool.query<{ title: string }>(
      'SELECT title FROM recipes WHERE family_id = $1 ORDER BY id',
      [familyId]
    );
    return rows.map((row) => row.title);
  }

  async recipeExists(recipeId: number): Promise<boolean> {
    const { rowCount } = await this.pool.query('SELECT 1 FROM recipes WHERE id = $1', [recipeId]);
    return Boolean(rowCount);
  }

  async recipeImagePath(recipeId: number): Promise<string | null> {
    const { rows } = await this.pool.query<{ image_path: string | null }>(
      'SELECT image_path FROM recipes WHERE id = $1',
      [recipeId]
    );
    return rows[0]?.image_path ?? null;
  }

  /** Books AI spend against a user (or the shared pool, with `null`) for today. */
  async addAiSpend(userId: string | null, costUsd: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_usage (user_id, backend, tier, model, cost_usd, request_count)
       VALUES ($1, 'openrouter', 'medium', 'e2e/seed', $2, 1)`,
      [userId, costUsd]
    );
  }
}

async function upsertNamed(
  client: pg.PoolClient,
  table: 'tags' | 'categories',
  familyId: number,
  name: string
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO ${table} (name, family_id) VALUES ($1, $2)
     ON CONFLICT (family_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [name, familyId]
  );
  return rows[0].id;
}
