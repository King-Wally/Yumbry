import { randomBytes } from 'node:crypto';
import { asc, count, eq, inArray, notExists } from 'drizzle-orm';
import { db, type DbExecutor } from '#lib/server/db/index.ts';
import { families, recipes, users } from '#lib/server/db/schema.ts';
import { deleteRecipeUploadsDir } from '#lib/server/uploads.ts';

const TOKEN_ATTEMPTS = 3;

/** A family invite token. Stored raw (see `families.inviteToken`), because the settings page
 * has to keep re-displaying the same link. */
function generateInviteToken(): string {
	return randomBytes(32).toString('hex');
}

/** Drizzle wraps driver errors in a DrizzleQueryError whose `cause` is the postgres error. */
function isUniqueViolation(err: unknown): boolean {
	const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
	return code(err) === '23505' || code((err as { cause?: unknown } | null)?.cause) === '23505';
}

/** Creates an empty family. Retries on the astronomically unlikely invite-token collision rather
 * than surfacing it — a failed registration would be absurd. */
export async function createFamily(): Promise<{ id: number }> {
	for (let attempt = 1; ; attempt += 1) {
		try {
			const [family] = await db
				.insert(families)
				.values({ inviteToken: generateInviteToken() })
				.returning({ id: families.id });
			return family;
		} catch (err) {
			if (!isUniqueViolation(err) || attempt >= TOKEN_ATTEMPTS) throw err;
		}
	}
}

/** Deletes families nobody belongs to and returns how many. The user-create hook in auth.ts writes
 * the family before the user row, so a failed signup (duplicate email) leaves an empty one behind.
 * Harmless, but they accumulate, so hooks.server.ts clears them once at start-up. */
export async function sweepOrphanedFamilies(): Promise<number> {
	const deleted = await db
		.delete(families)
		.where(
			notExists(db.select({ id: users.id }).from(users).where(eq(users.familyId, families.id)))
		)
		.returning({ id: families.id });
	return deleted.length;
}

/** Locks the families' rows for the rest of the transaction, always in id order so two
 * transactions locking the same pair can't deadlock. Membership changes (leaving, joining, deleting
 * an account) take this first, so each sees the other's committed result. */
export async function lockFamilies(tx: DbExecutor, ids: number[]): Promise<void> {
	const ordered = [...new Set(ids)].sort((a, b) => a - b);
	if (ordered.length === 0) return;
	await tx
		.select({ id: families.id })
		.from(families)
		.where(inArray(families.id, ordered))
		.orderBy(asc(families.id))
		.for('update');
}

/** Deletes the family once nobody belongs to it (its recipes, tags and categories cascade) and
 * returns the ids of the recipes that went with it, so their uploads can be removed after commit.
 * A family that still has members is left alone. */
export async function deleteFamilyIfEmpty(tx: DbExecutor, familyId: number): Promise<number[]> {
	const [{ remaining }] = await tx
		.select({ remaining: count() })
		.from(users)
		.where(eq(users.familyId, familyId));
	if (remaining > 0) return [];

	// Captured before the cascade destroys the rows.
	const orphaned = await tx
		.select({ id: recipes.id })
		.from(recipes)
		.where(eq(recipes.familyId, familyId));
	await tx.delete(families).where(eq(families.id, familyId));
	return orphaned.map((recipe) => recipe.id);
}

/** Best-effort upload clean-up, always after the transaction that deleted the recipes committed. */
export async function removeRecipeUploads(recipeIds: number[]): Promise<void> {
	for (const id of recipeIds) await deleteRecipeUploadsDir(id);
}
