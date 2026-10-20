// The only file in the suite that knows table and column names. Seeding through SQL rather than
// the app's pages keeps setup fast and independent of the UI under test.
import type { Sql, TransactionSql } from 'postgres';

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
	constructor(private readonly sql: Sql) {}

	async familyIdOf(userId: string): Promise<number> {
		const [row] = await this.sql<{ family_id: number }[]>`
			SELECT family_id FROM users WHERE id = ${userId}`;
		if (!row) throw new Error(`No user ${userId}`);
		return row.family_id;
	}

	async userExists(email: string): Promise<boolean> {
		const rows = await this.sql`SELECT 1 FROM users WHERE email = ${email}`;
		return rows.length > 0;
	}

	async setJsonImportExport(userId: string, enabled: boolean): Promise<void> {
		await this.sql`UPDATE users SET json_import_export_enabled = ${enabled} WHERE id = ${userId}`;
	}

	async userLocale(userId: string): Promise<string> {
		const [row] = await this.sql<{ locale: string }[]>`
			SELECT locale FROM users WHERE id = ${userId}`;
		return row.locale;
	}

	async insertRecipe(familyId: number, authorId: string, recipe: SeedRecipe): Promise<number> {
		return this.sql.begin(async (tx) => {
			const categoryId = recipe.category
				? await upsertNamed(tx, 'categories', familyId, recipe.category)
				: null;
			const [{ id: recipeId }] = await tx<{ id: number }[]>`
				INSERT INTO recipes (title, description, servings, prep_time_minutes, cook_time_minutes,
					total_time_minutes, calories, fat_content, carbohydrate_content, protein_content,
					category_id, family_id, author_id)
				VALUES (${recipe.title}, ${recipe.description ?? null}, ${recipe.servings ?? 4},
					${recipe.prepTimeMinutes ?? null}, ${recipe.cookTimeMinutes ?? null},
					${recipe.totalTimeMinutes ?? null}, ${recipe.calories ?? null},
					${recipe.fatContent ?? null}, ${recipe.carbohydrateContent ?? null},
					${recipe.proteinContent ?? null}, ${categoryId}, ${familyId}, ${authorId})
				RETURNING id`;

			for (const [index, ingredient] of (recipe.ingredients ?? []).entries()) {
				const scalable = ingredient.amount !== undefined;
				await tx`
					INSERT INTO ingredients (recipe_id, raw_text, amount, unit, name, is_scalable, sort_order)
					VALUES (${recipeId}, ${ingredient.raw}, ${ingredient.amount ?? null},
						${ingredient.unit ?? null}, ${ingredient.name ?? ingredient.raw}, ${scalable}, ${index})`;
			}
			for (const [index, text] of (recipe.instructions ?? []).entries()) {
				await tx`
					INSERT INTO instructions (recipe_id, step_number, text)
					VALUES (${recipeId}, ${index + 1}, ${text})`;
			}
			for (const tag of recipe.tags ?? []) {
				const tagId = await upsertNamed(tx, 'tags', familyId, tag);
				await tx`INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (${recipeId}, ${tagId})`;
			}
			return recipeId;
		});
	}

	async recipeTitles(familyId: number): Promise<string[]> {
		const rows = await this.sql<{ title: string }[]>`
			SELECT title FROM recipes WHERE family_id = ${familyId} ORDER BY id`;
		return rows.map((row) => row.title);
	}

	async recipeExists(recipeId: number): Promise<boolean> {
		const rows = await this.sql`SELECT 1 FROM recipes WHERE id = ${recipeId}`;
		return rows.length > 0;
	}

	async recipeImagePath(recipeId: number): Promise<string | null> {
		const [row] = await this.sql<{ image_path: string | null }[]>`
			SELECT image_path FROM recipes WHERE id = ${recipeId}`;
		return row?.image_path ?? null;
	}

	async recipeShareToken(recipeId: number): Promise<string | null> {
		const [row] = await this.sql<{ share_token: string | null }[]>`
			SELECT share_token FROM recipes WHERE id = ${recipeId}`;
		return row?.share_token ?? null;
	}

	async recipeVersionCount(recipeId: number): Promise<number> {
		const [row] = await this.sql<{ count: string }[]>`
			SELECT count(*) FROM recipe_versions WHERE recipe_id = ${recipeId}`;
		return Number(row.count);
	}

	/** Books AI spend against a user (or the shared pool, with `null`) for today. */
	async addAiSpend(userId: string | null, costUsd: number): Promise<void> {
		await this.sql`
			INSERT INTO ai_usage (user_id, backend, tier, model, cost_usd, request_count)
			VALUES (${userId}, 'openrouter', 'medium', 'e2e/seed', ${costUsd}, 1)`;
	}
}

async function upsertNamed(
	tx: TransactionSql,
	table: 'tags' | 'categories',
	familyId: number,
	name: string
): Promise<number> {
	const [{ id }] = await tx<{ id: number }[]>`
		INSERT INTO ${tx(table)} (name, family_id) VALUES (${name}, ${familyId})
		ON CONFLICT (family_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
	return id;
}
