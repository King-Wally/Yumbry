import { randomBytes } from 'node:crypto';
import { notExists, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { families, users } from '#lib/server/db/schema.ts';

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
