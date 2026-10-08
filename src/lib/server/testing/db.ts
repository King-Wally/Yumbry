// Database-backed service tests (`*.db.spec.ts`). They run against TEST_DATABASE_URL and are skipped
// when it is unset. NEVER point it at a real database: resetTestDatabase() drops every table.
//
// A spec swaps the app's client for this one before importing the service under test:
//
//   vi.mock('#lib/server/db/index.ts', async () => {
//     const { testDb } = await import('#lib/server/testing/db.ts');
//     return { get db() { return testDb(); } };
//   });
import { fileURLToPath } from 'node:url';
import { describe } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '#lib/server/db/schema.ts';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const describeDb = describe.skipIf(!TEST_DATABASE_URL);

const migrationsFolder = fileURLToPath(new URL('../../../../drizzle', import.meta.url));

let client: postgres.Sql | undefined;
let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function testDb() {
	if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set');
	client ??= postgres(TEST_DATABASE_URL, { onnotice: () => {} });
	instance ??= drizzle(client, { schema });
	return instance;
}

/** An empty database at the latest migration. */
export async function resetTestDatabase(): Promise<void> {
	const db = testDb();
	await client!`drop schema if exists drizzle cascade`;
	await client!`drop schema public cascade`;
	await client!`create schema public`;
	await migrate(db, { migrationsFolder });
}

export async function closeTestDatabase(): Promise<void> {
	await client?.end();
	client = undefined;
	instance = undefined;
}

export async function insertFamily(): Promise<number> {
	const [row] = await testDb()
		.insert(schema.families)
		.values({ inviteToken: crypto.randomUUID() })
		.returning({ id: schema.families.id });
	return row.id;
}

export interface SeedRecipe {
	title: string;
	description?: string;
	servings?: number;
	prepTimeMinutes?: number;
	calories?: number;
	category?: string;
	tags?: string[];
	/** Raw lines; `amount` makes a line scalable. */
	ingredients?: { raw: string; amount?: number; unit?: string; name?: string }[];
	instructions?: string[];
	createdAt?: Date;
}

/** Inserts a recipe with its category, tags, ingredients and steps, the way the app stores them. */
export async function insertRecipe(familyId: number, seed: SeedRecipe): Promise<number> {
	const db = testDb();
	return db.transaction(async (tx) => {
		let categoryId: number | null = null;
		if (seed.category) {
			const [category] = await tx
				.insert(schema.categories)
				.values({ familyId, name: seed.category })
				.onConflictDoUpdate({
					target: [schema.categories.familyId, schema.categories.name],
					set: { name: seed.category }
				})
				.returning({ id: schema.categories.id });
			categoryId = category.id;
		}

		const [recipe] = await tx
			.insert(schema.recipes)
			.values({
				familyId,
				title: seed.title,
				description: seed.description ?? null,
				servings: String(seed.servings ?? 4),
				prepTimeMinutes: seed.prepTimeMinutes ?? null,
				calories: seed.calories === undefined ? null : String(seed.calories),
				categoryId,
				...(seed.createdAt && { createdAt: seed.createdAt })
			})
			.returning({ id: schema.recipes.id });

		const lines = seed.ingredients ?? [];
		if (lines.length > 0) {
			await tx.insert(schema.ingredients).values(
				lines.map((line, index) => ({
					recipeId: recipe.id,
					rawText: line.raw,
					amount: line.amount === undefined ? null : String(line.amount),
					unit: line.unit ?? null,
					name: line.name ?? line.raw,
					isScalable: line.amount !== undefined,
					sortOrder: index
				}))
			);
		}

		const steps = seed.instructions ?? [];
		if (steps.length > 0) {
			await tx
				.insert(schema.instructions)
				.values(steps.map((text, index) => ({ recipeId: recipe.id, stepNumber: index + 1, text })));
		}

		for (const name of seed.tags ?? []) {
			const [tag] = await tx
				.insert(schema.tags)
				.values({ familyId, name })
				.onConflictDoUpdate({ target: [schema.tags.familyId, schema.tags.name], set: { name } })
				.returning({ id: schema.tags.id });
			await tx.insert(schema.recipeTags).values({ recipeId: recipe.id, tagId: tag.id });
		}

		return recipe.id;
	});
}
