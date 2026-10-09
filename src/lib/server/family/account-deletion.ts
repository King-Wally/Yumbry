import { db } from '#lib/server/db/index.ts';
import { deleteFamilyIfEmpty, lockFamilies, removeRecipeUploads } from './family.ts';

/** better-auth's `deleteUser.afterDelete` hook: the family goes once nobody is left in it (its
 * recipes stay with the remaining members otherwise). The user it gets still carries `familyId`,
 * but is typed without the additional fields, hence the narrowing. */
export async function cleanUpFamilyAfterDelete(user: { id: string }): Promise<void> {
	const familyId = (user as { familyId?: unknown }).familyId;
	if (typeof familyId !== 'number') return;

	const orphanedRecipeIds = await db.transaction(async (tx) => {
		await lockFamilies(tx, [familyId]);
		return deleteFamilyIfEmpty(tx, familyId);
	});
	await removeRecipeUploads(orphanedRecipeIds);
}
