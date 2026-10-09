import { and, desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { recipes, recipeVersions } from '#lib/server/db/schema.ts';
import type { RecipeBody } from '#lib/server/recipes/body-schema.ts';
import { updateRecipe } from '#lib/server/recipes/recipes.ts';
import { toNullableNumber } from '#lib/shared/recipe/numeric.ts';
import type {
	RecipeSnapshot,
	RecipeVersion,
	RecipeVersionSummary
} from '#lib/shared/recipe/snapshot.ts';

// Versions are written by updateRecipe itself, which snapshots the state a save is about to
// replace. This module only reads them back and reverts to one.

/** Matches the recipe's versions only while the recipe is the family's. */
function scoped(recipeId: number, familyId: number) {
	return and(eq(recipeVersions.recipeId, recipeId), eq(recipes.familyId, familyId));
}

/** Newest first. Another family's recipe yields [], as does one that was never edited. */
export async function listVersions(
	recipeId: number,
	familyId: number
): Promise<RecipeVersionSummary[]> {
	const rows = await db
		.select({ id: recipeVersions.id, savedAt: recipeVersions.savedAt })
		.from(recipeVersions)
		.innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
		.where(scoped(recipeId, familyId))
		.orderBy(desc(recipeVersions.savedAt), desc(recipeVersions.id));
	return rows.map((row) => ({ id: row.id, saved_at: row.savedAt.toISOString() }));
}

export async function getVersion(
	recipeId: number,
	versionId: number,
	familyId: number
): Promise<RecipeVersion | null> {
	const [row] = await db
		.select({
			id: recipeVersions.id,
			savedAt: recipeVersions.savedAt,
			snapshot: recipeVersions.snapshot
		})
		.from(recipeVersions)
		.innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
		.where(and(eq(recipeVersions.id, versionId), scoped(recipeId, familyId)))
		.limit(1);
	if (!row) return null;
	return {
		id: row.id,
		saved_at: row.savedAt.toISOString(),
		snapshot: row.snapshot as RecipeSnapshot
	};
}

/** The save that would put the snapshot's content back. No `image_path`: a snapshot holds no photo,
 * and updateRecipe never touches it. */
export function snapshotToRecipeBody(snapshot: RecipeSnapshot): RecipeBody {
	return {
		title: snapshot.title,
		description: snapshot.description,
		prep_time_minutes: snapshot.prep_time_minutes,
		cook_time_minutes: snapshot.cook_time_minutes,
		total_time_minutes: snapshot.total_time_minutes,
		servings: Number(snapshot.servings),
		calories: toNullableNumber(snapshot.calories),
		fat_content: toNullableNumber(snapshot.fat_content),
		carbohydrate_content: toNullableNumber(snapshot.carbohydrate_content),
		protein_content: toNullableNumber(snapshot.protein_content),
		category: snapshot.category,
		tags: snapshot.tags,
		ingredients: snapshot.ingredients,
		instructions: snapshot.instructions
	};
}

/** Writes the version's content back through updateRecipe, which first snapshots the state being
 * replaced, so a revert is itself undoable. Returns false if the version isn't one of the family's
 * recipe's. */
export async function revertToVersion(
	recipeId: number,
	versionId: number,
	familyId: number
): Promise<boolean> {
	const version = await getVersion(recipeId, versionId, familyId);
	if (!version) return false;
	return updateRecipe(recipeId, snapshotToRecipeBody(version.snapshot), familyId);
}
