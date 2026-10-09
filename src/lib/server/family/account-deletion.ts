import { db } from '#lib/server/db/index.ts';
import { deleteFamilyIfEmpty, lockFamilies, removeRecipeUploads } from './family.ts';

/**
 * better-auth's `deleteUser.afterDelete` hook. Recipes belong to the family, not to their author,
 * so deleting an account only nulls `recipes.author_id` and leaves the collection to the remaining
 * members. The family itself goes once nobody is left in it.
 *
 * better-auth hands both hooks the session's user, which still carries `familyId` after the row is
 * gone, so there is nothing to capture in a `beforeDelete` first. The hook's declared type is
 * better-auth's base user (without the additional fields), hence the narrowing here.
 */
export async function cleanUpFamilyAfterDelete(user: { id: string }): Promise<void> {
	const familyId = (user as { familyId?: unknown }).familyId;
	if (typeof familyId !== 'number') return;

	const orphanedRecipeIds = await db.transaction(async (tx) => {
		await lockFamilies(tx, [familyId]);
		return deleteFamilyIfEmpty(tx, familyId);
	});
	await removeRecipeUploads(orphanedRecipeIds);
}
