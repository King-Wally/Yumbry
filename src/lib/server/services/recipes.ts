import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { recipes } from '#lib/server/db/schema.ts';

/** Whether the recipe exists and belongs to the family. Recipes are owned by the family, not the
 * author, so any member may read and write any recipe in their household. */
export async function recipeBelongsToFamily(recipeId: number, familyId: number): Promise<boolean> {
	const [row] = await db
		.select({ id: recipes.id })
		.from(recipes)
		.where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)))
		.limit(1);
	return row !== undefined;
}
