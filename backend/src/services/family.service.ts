import type { Family } from 'yumbry-shared';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { withTransaction, type Queryable } from '../db/transaction.js';
import { deleteRecipeUploadsDir } from '../middleware/upload.js';
import { generateInviteToken } from '../utils/invite-token.js';

export type FamilyErrorKind = 'invalid_invite' | 'already_member' | 'nothing_to_leave';

export class FamilyError extends Error {
  readonly kind: FamilyErrorKind;

  constructor(message: string, kind: FamilyErrorKind) {
    super(message);
    this.name = 'FamilyError';
    this.kind = kind;
  }
}

export const FAMILY_ERROR_STATUS: Record<FamilyErrorKind, number> = {
  invalid_invite: 404,
  already_member: 409,
  nothing_to_leave: 409,
};

const TOKEN_ATTEMPTS = 3;

/** Creates an empty family. Retries on the astronomically unlikely unique-index
 * collision rather than surfacing it — a failed registration would be absurd. */
export async function createFamily(client: Queryable): Promise<{ id: number }> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await client.family.create({
        data: { inviteToken: generateInviteToken() },
        select: { id: true },
      });
    } catch (err) {
      const isCollision =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!isCollision || attempt >= TOKEN_ATTEMPTS) throw err;
    }
  }
}

export async function getFamily(familyId: number): Promise<Family | null> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: {
      id: true,
      inviteToken: true,
      members: { select: { id: true, email: true }, orderBy: { id: 'asc' } },
    },
  });
  if (!family) return null;

  return { id: family.id, invite_token: family.inviteToken, members: family.members };
}

/** Locks the given families in ascending id order. Two people joining each
 * other's family at the same moment would otherwise be able to deadlock, and
 * the lock is also what makes the tag/category merge below safe: a second
 * joiner only proceeds once the first has committed, so it sees the
 * freshly-moved rows as duplicates instead of hitting the unique index. */
async function lockFamilies(client: Queryable, ids: number[]): Promise<void> {
  const ordered = [...new Set(ids)].sort((a, b) => a - b);
  await client.$queryRaw`
    SELECT id FROM families WHERE id IN (${Prisma.join(ordered)}) ORDER BY id FOR UPDATE`;
}

/** Moves everything owned by `from` into `to`, merging tags and categories that
 * already exist there by name.
 *
 * The order matters in both halves: repoint referencing rows, then delete the
 * duplicates, then reassign the survivors. Reassigning first would trip the
 * (family_id, name) unique index. Names are safe to compare with plain equality
 * because upsertTags/upsertCategory both store `name.trim().toLowerCase()` — a
 * future case-preserving write would silently break this. */
async function mergeFamilyContent(client: Queryable, from: number, to: number): Promise<void> {
  // Categories: recipes.category_id is the only referencing column.
  await client.$executeRaw`
    UPDATE recipes r SET category_id = tc.id
      FROM categories mc
      JOIN categories tc ON tc.family_id = ${to} AND tc.name = mc.name
     WHERE mc.family_id = ${from} AND r.category_id = mc.id`;
  await client.$executeRaw`
    DELETE FROM categories WHERE family_id = ${from}
      AND name IN (SELECT name FROM categories WHERE family_id = ${to})`;
  await client.category.updateMany({ where: { familyId: from }, data: { familyId: to } });

  // Tags: INSERT .. ON CONFLICT DO NOTHING rather than UPDATE recipe_tags SET
  // tag_id, because an UPDATE violates the (recipe_id, tag_id) primary key
  // whenever the recipe already carries the target tag, and Postgres has no
  // ON CONFLICT clause for UPDATE.
  await client.$executeRaw`
    INSERT INTO recipe_tags (recipe_id, tag_id)
    SELECT rt.recipe_id, tt.id
      FROM recipe_tags rt
      JOIN tags mt ON mt.id = rt.tag_id AND mt.family_id = ${from}
      JOIN tags tt ON tt.family_id = ${to} AND tt.name = mt.name
    ON CONFLICT (recipe_id, tag_id) DO NOTHING`;
  // Deleting the duplicate tags takes their recipe_tags rows with them via the
  // existing ON DELETE CASCADE, so there is no join-row cleanup to do.
  await client.$executeRaw`
    DELETE FROM tags WHERE family_id = ${from}
      AND name IN (SELECT name FROM tags WHERE family_id = ${to})`;
  await client.tag.updateMany({ where: { familyId: from }, data: { familyId: to } });

  // authorId is deliberately untouched, and photo directories are keyed by
  // recipe id, so nothing on disk has to move.
  await client.recipe.updateMany({ where: { familyId: from }, data: { familyId: to } });
}

export async function joinFamily(userId: number, token: string): Promise<{ familyId: number }> {
  return withTransaction(async (client) => {
    const target = await client.family.findUnique({
      where: { inviteToken: token },
      select: { id: true },
    });
    if (!target) {
      throw new FamilyError('That invite link is not valid.', 'invalid_invite');
    }

    const me = await client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { familyId: true },
    });
    if (me.familyId === target.id) {
      throw new FamilyError("You're already in this family.", 'already_member');
    }

    await lockFamilies(client, [me.familyId, target.id]);

    const otherMembers = await client.user.count({
      where: { familyId: me.familyId, id: { not: userId } },
    });

    // Only bring your collection along if it is yours alone. Someone who is
    // already sharing with others and then clicks a second invite link must not
    // drag that shared collection into the new family — for them this behaves
    // like leaving, and the content stays with the members left behind.
    if (otherMembers === 0) {
      await mergeFamilyContent(client, me.familyId, target.id);
    }

    await client.user.update({ where: { id: userId }, data: { familyId: target.id } });

    if (otherMembers === 0) {
      // Empty of members and of content by now, so nothing cascades away.
      await client.family.delete({ where: { id: me.familyId } });
    }

    return { familyId: target.id };
  });
}

export async function leaveFamily(userId: number): Promise<{ familyId: number }> {
  return withTransaction(async (client) => {
    const me = await client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { familyId: true },
    });
    await lockFamilies(client, [me.familyId]);

    const memberCount = await client.user.count({ where: { familyId: me.familyId } });
    // Leaving a family of one would delete every recipe in it. That is never
    // what "leave" is meant to do, so refuse rather than silently destroy — which
    // also means this path never orphans an upload directory.
    if (memberCount <= 1) {
      throw new FamilyError("You're not sharing with anyone yet.", 'nothing_to_leave');
    }

    const fresh = await createFamily(client);
    await client.user.update({ where: { id: userId }, data: { familyId: fresh.id } });
    // Recipes, tags and categories deliberately stay with the family.

    return { familyId: fresh.id };
  });
}

/** Deletes a family once its last member is gone, and reports the recipe ids
 * whose upload directories the caller should clean up. Must be called inside a
 * transaction that has already locked the family. */
export async function deleteFamilyIfEmpty(client: Queryable, familyId: number): Promise<number[]> {
  const remaining = await client.user.count({ where: { familyId } });
  if (remaining > 0) return [];

  // Capture the ids before the cascade destroys the rows.
  const recipes = await client.recipe.findMany({ where: { familyId }, select: { id: true } });
  await client.family.delete({ where: { id: familyId } });
  return recipes.map((recipe) => recipe.id);
}

/** Best-effort upload cleanup, always after the transaction has committed —
 * matching how deleteRecipe sequences it. */
export async function removeRecipeUploads(recipeIds: number[]): Promise<void> {
  for (const id of recipeIds) {
    await deleteRecipeUploadsDir(id);
  }
}

export { lockFamilies };
