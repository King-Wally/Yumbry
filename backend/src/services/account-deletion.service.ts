import { prisma } from '../db/prisma.js';
import { withTransaction } from '../db/transaction.js';
import { deleteFamilyIfEmpty, lockFamilies, removeRecipeUploads } from './family.service.js';

/** better-auth deletes the user row itself, between its beforeDelete and
 * afterDelete hooks, so the family id has to be read while the user still
 * exists and carried across to the cleanup that follows. Entries live for the
 * few milliseconds between the two hooks of a single request; the app is
 * single-process, and a crash in between leaves nothing worse than an empty
 * family row. */
const pendingFamilyCleanup = new Map<string, number>();

export async function captureFamilyBeforeDelete(user: { id: string }): Promise<void> {
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { familyId: true },
  });
  if (row) pendingFamilyCleanup.set(user.id, row.familyId);
}

/** Recipes belong to the family, not to their author, so deleting an account
 * only nulls recipes.author_id (SetNull) and leaves the collection for the
 * remaining members. The family itself goes only once nobody is left in it. */
export async function cleanUpFamilyAfterDelete(user: { id: string }): Promise<void> {
  const familyId = pendingFamilyCleanup.get(user.id);
  pendingFamilyCleanup.delete(user.id);
  if (familyId === undefined) return;

  const orphanedRecipeIds = await withTransaction(async (tx) => {
    await lockFamilies(tx, [familyId]);
    return deleteFamilyIfEmpty(tx, familyId);
  });

  await removeRecipeUploads(orphanedRecipeIds);
}
