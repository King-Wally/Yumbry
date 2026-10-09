import { and, asc, eq, inArray, notExists } from 'drizzle-orm';
import { db, type DbExecutor } from '#lib/server/db/index.ts';
import { categories, recipes, recipeTags, tags } from '#lib/server/db/schema.ts';
import type { Category, Tag } from '#lib/shared/recipe/dto.ts';

// Names are stored trimmed and lowercased (the UI capitalises them), so "Dinner" and "dinner" are one
// row. Every row is in use: a save or delete that drops a name's last use deletes its row.

/** The family's tags, by name. */
export function listTags(familyId: number): Promise<Tag[]> {
	return db
		.select({ id: tags.id, name: tags.name })
		.from(tags)
		.where(eq(tags.familyId, familyId))
		.orderBy(asc(tags.name));
}

/** The family's categories, by name. */
export function listCategories(familyId: number): Promise<Category[]> {
	return db
		.select({ id: categories.id, name: categories.name })
		.from(categories)
		.where(eq(categories.familyId, familyId))
		.orderBy(asc(categories.name));
}

function normalizeName(name: string): string {
	return name.trim().toLowerCase();
}

/** The id of the family's category with this name, created if new; null for no category. */
export async function upsertCategory(
	tx: DbExecutor,
	name: string | null | undefined,
	familyId: number
): Promise<number | null> {
	const normalized = name ? normalizeName(name) : '';
	if (!normalized) return null;
	const [row] = await tx
		.insert(categories)
		.values({ familyId, name: normalized })
		// A no-op update rather than DO NOTHING, so RETURNING also yields an existing row's id.
		.onConflictDoUpdate({
			target: [categories.familyId, categories.name],
			set: { name: normalized }
		})
		.returning({ id: categories.id });
	return row.id;
}

/** Links the recipe to these tags by name, creating the family's missing ones. */
export async function upsertTags(
	tx: DbExecutor,
	recipeId: number,
	names: readonly string[],
	familyId: number
): Promise<void> {
	const normalized = [...new Set(names.map(normalizeName))].filter(Boolean);
	if (normalized.length === 0) return;
	await tx
		.insert(tags)
		.values(normalized.map((name) => ({ familyId, name })))
		.onConflictDoNothing({ target: [tags.familyId, tags.name] });
	const rows = await tx
		.select({ id: tags.id })
		.from(tags)
		.where(and(eq(tags.familyId, familyId), inArray(tags.name, normalized)));
	await tx
		.insert(recipeTags)
		.values(rows.map((tag) => ({ recipeId, tagId: tag.id })))
		.onConflictDoNothing();
}

/** Deletes the family's tags and categories that no recipe uses any more. */
export async function deleteOrphanedTagsAndCategories(
	tx: DbExecutor,
	familyId: number
): Promise<void> {
	await tx
		.delete(tags)
		.where(
			and(
				eq(tags.familyId, familyId),
				notExists(
					tx.select({ one: recipeTags.tagId }).from(recipeTags).where(eq(recipeTags.tagId, tags.id))
				)
			)
		);
	await tx
		.delete(categories)
		.where(
			and(
				eq(categories.familyId, familyId),
				notExists(
					tx.select({ one: recipes.id }).from(recipes).where(eq(recipes.categoryId, categories.id))
				)
			)
		);
}
