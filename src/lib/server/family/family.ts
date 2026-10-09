import { randomBytes } from 'node:crypto';
import { and, asc, count, eq, inArray, ne, notExists, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '#lib/server/db/index.ts';
import { categories, families, recipes, tags, users } from '#lib/server/db/schema.ts';
import { FamilyError } from '#lib/server/family/errors.ts';
import { deleteRecipeUploadsDir } from '#lib/server/uploads/storage.ts';
import type { Family } from '#lib/server/family/types.ts';

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
export async function createFamily(executor: DbExecutor = db): Promise<{ id: number }> {
	for (let attempt = 1; ; attempt += 1) {
		try {
			const [family] = await executor
				.insert(families)
				.values({ inviteToken: generateInviteToken() })
				.returning({ id: families.id });
			return family;
		} catch (err) {
			if (!isUniqueViolation(err) || attempt >= TOKEN_ATTEMPTS) throw err;
		}
	}
}

/** The family with its members, oldest account first, or null if it doesn't exist. By creation
 * date, not id: better-auth ids are random strings, so ordering by them would shuffle the list. */
export async function getFamily(familyId: number): Promise<Family | null> {
	const [family] = await db
		.select({ id: families.id, inviteToken: families.inviteToken })
		.from(families)
		.where(eq(families.id, familyId));
	if (!family) return null;

	const members = await db
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(eq(users.familyId, familyId))
		.orderBy(asc(users.createdAt), asc(users.id));
	return { id: family.id, invite_token: family.inviteToken, members };
}

/** The join link the settings page and onboarding show. */
export function inviteUrl(origin: string, inviteToken: string): string {
	return `${origin}/join-family/${inviteToken}`;
}

/** Deletes families nobody belongs to and returns how many. The user-create hook in better-auth.ts writes
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

/** Moves everything owned by `from` into `to`, merging tags and categories that already exist there
 * by name.
 *
 * The order matters in both halves: repoint referencing rows, then delete the duplicates, then
 * reassign the survivors. Reassigning first would trip the (family_id, name) unique index. Names are
 * safe to compare with plain equality because tags and categories are stored as
 * `name.trim().toLowerCase()` — a future case-preserving write would silently break this. */
async function mergeFamilyContent(tx: DbExecutor, from: number, to: number): Promise<void> {
	// Categories: recipes.category_id is the only referencing column.
	await tx.execute(sql`
		UPDATE recipes r SET category_id = tc.id
		  FROM categories mc
		  JOIN categories tc ON tc.family_id = ${to} AND tc.name = mc.name
		 WHERE mc.family_id = ${from} AND r.category_id = mc.id`);
	await tx.execute(sql`
		DELETE FROM categories WHERE family_id = ${from}
		   AND name IN (SELECT name FROM categories WHERE family_id = ${to})`);
	await tx.update(categories).set({ familyId: to }).where(eq(categories.familyId, from));

	// Tags: INSERT .. ON CONFLICT DO NOTHING rather than UPDATE recipe_tags SET tag_id, because an
	// UPDATE violates the (recipe_id, tag_id) primary key whenever the recipe already carries the
	// target tag, and Postgres has no ON CONFLICT clause for UPDATE.
	await tx.execute(sql`
		INSERT INTO recipe_tags (recipe_id, tag_id)
		SELECT rt.recipe_id, tt.id
		  FROM recipe_tags rt
		  JOIN tags mt ON mt.id = rt.tag_id AND mt.family_id = ${from}
		  JOIN tags tt ON tt.family_id = ${to} AND tt.name = mt.name
		ON CONFLICT (recipe_id, tag_id) DO NOTHING`);
	// Deleting the duplicate tags takes their recipe_tags rows with them (ON DELETE CASCADE).
	await tx.execute(sql`
		DELETE FROM tags WHERE family_id = ${from}
		   AND name IN (SELECT name FROM tags WHERE family_id = ${to})`);
	await tx.update(tags).set({ familyId: to }).where(eq(tags.familyId, from));

	// author_id is deliberately untouched, and photo directories are keyed by recipe id, so nothing
	// on disk has to move. Versions hang off the recipe and come along.
	await tx.update(recipes).set({ familyId: to }).where(eq(recipes.familyId, from));
}

async function familyIdOf(tx: DbExecutor, userId: string): Promise<number> {
	const [me] = await tx
		.select({ familyId: users.familyId })
		.from(users)
		.where(eq(users.id, userId));
	if (!me) throw new Error(`User ${userId} not found`);
	return me.familyId;
}

/** Moves the user into the family the invite token belongs to. A user who was alone brings their
 * collection along and their old family is deleted; one who was sharing leaves the shared
 * collection with the members left behind. */
export async function joinFamily(userId: string, token: string): Promise<{ familyId: number }> {
	return db.transaction(async (tx) => {
		const [target] = await tx
			.select({ id: families.id })
			.from(families)
			.where(eq(families.inviteToken, token));
		if (!target) throw new FamilyError('That invite link is not valid.', 'invalid_invite');

		const myFamilyId = await familyIdOf(tx, userId);
		if (myFamilyId === target.id) {
			throw new FamilyError("You're already in this family.", 'already_member');
		}

		// The lock is also what makes the merge safe: a second joiner only proceeds once the first
		// has committed, so it sees the freshly moved rows as duplicates instead of hitting the
		// unique index.
		await lockFamilies(tx, [myFamilyId, target.id]);

		const [{ otherMembers }] = await tx
			.select({ otherMembers: count() })
			.from(users)
			.where(and(eq(users.familyId, myFamilyId), ne(users.id, userId)));

		// Only bring your collection along if it is yours alone. Someone already sharing with others
		// who clicks a second invite link must not drag that shared collection into the new family —
		// for them this behaves like leaving, and the content stays with the members left behind.
		if (otherMembers === 0) await mergeFamilyContent(tx, myFamilyId, target.id);

		await tx.update(users).set({ familyId: target.id }).where(eq(users.id, userId));

		// Empty of members and of content by now, so nothing cascades away.
		if (otherMembers === 0) await tx.delete(families).where(eq(families.id, myFamilyId));

		return { familyId: target.id };
	});
}

/** Moves the user into a new, empty family of their own. The recipes, tags and categories stay with
 * the family they leave. */
export async function leaveFamily(userId: string): Promise<{ familyId: number }> {
	return db.transaction(async (tx) => {
		const myFamilyId = await familyIdOf(tx, userId);
		await lockFamilies(tx, [myFamilyId]);

		const [{ memberCount }] = await tx
			.select({ memberCount: count() })
			.from(users)
			.where(eq(users.familyId, myFamilyId));
		// Leaving a family of one would delete every recipe in it. That is never what "leave" is meant
		// to do, so refuse rather than silently destroy — which also means this never orphans uploads.
		if (memberCount <= 1) {
			throw new FamilyError("You're not sharing with anyone yet.", 'nothing_to_leave');
		}

		const fresh = await createFamily(tx);
		await tx.update(users).set({ familyId: fresh.id }).where(eq(users.id, userId));
		return { familyId: fresh.id };
	});
}
