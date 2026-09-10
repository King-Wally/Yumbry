import bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { withTransaction } from '../db/transaction.js';
import { generateResetToken, hashResetToken } from '../utils/reset-token.js';
import { generateInviteToken } from '../utils/invite-token.js';
import { deleteFamilyIfEmpty, lockFamilies, removeRecipeUploads } from './family.service.js';
import { isEmailConfigured, sendPasswordResetEmail } from './email.service.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  token_version: number;
  locale: string;
  unit_system: string;
  small_volumes: string;
  json_import_export_enabled: boolean;
  created_at: Date;
}

const BCRYPT_COST_FACTOR = 12;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST_FACTOR);

function toUserRow(user: {
  id: number;
  email: string;
  passwordHash: string;
  tokenVersion: number;
  locale: string;
  unitSystem: string;
  smallVolumes: string;
  jsonImportExportEnabled: boolean;
  createdAt: Date;
}): UserRow {
  return {
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash,
    token_version: user.tokenVersion,
    locale: user.locale,
    unit_system: user.unitSystem,
    small_volumes: user.smallVolumes,
    json_import_export_enabled: user.jsonImportExportEnabled,
    created_at: user.createdAt,
  };
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

export function verifyPassword(password: string, hash: string | undefined): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  return user ? toUserRow(user) : null;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? toUserRow(user) : null;
}

export async function deleteUser(id: number): Promise<void> {
  // Recipes belong to the family, not to their author, so deleting an account
  // only nulls recipes.author_id (SetNull) and leaves the collection for the
  // remaining members. The family itself goes only once nobody is left in it.
  const orphanedRecipeIds = await withTransaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id }, select: { familyId: true } });
    if (!user) return [];

    await lockFamilies(tx, [user.familyId]);
    await tx.user.delete({ where: { id } });
    return deleteFamilyIfEmpty(tx, user.familyId);
  });

  await removeRecipeUploads(orphanedRecipeIds);
}

// Generalised rather than given a sibling per column: Prisma ignores `undefined` keys, so a
// partial update needs no branching, and the next preference to be added needs no third function.
export async function updateUserProfile(
  userId: number,
  data: {
    locale?: string;
    unitSystem?: string;
    smallVolumes?: string;
    jsonImportExportEnabled?: boolean;
  }
): Promise<UserRow> {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });
  return toUserRow(user);
}

export async function revokeAuthSessions(userId: number): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  return user.tokenVersion;
}

export async function registerUser(email: string, password: string): Promise<UserRow | null> {
  const passwordHash = await hashPassword(password);

  return withTransaction(async (tx) => {
    let user;
    try {
      // Nested create: every user starts in a personal family of one, so
      // users.family_id is never null and no "user without a family" state
      // exists for the rest of the app to handle.
      user = await tx.user.create({
        data: {
          email,
          passwordHash,
          family: { create: { inviteToken: generateInviteToken() } },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return null;
      }
      throw err;
    }

    return toUserRow(user);
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  // Same no-op path as "no such user" — the frontend already hides the "forgot password"
  // entry point when email isn't configured, but this endpoint stays safe to call directly.
  if (!isEmailConfigured()) {
    await hashPassword('not-a-real-password');
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await hashPassword('not-a-real-password');
    return;
  }

  const rawToken = generateResetToken();
  const tokenHash = hashResetToken(rawToken);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  await sendPasswordResetEmail(user.email, rawToken);
}

export async function resetPassword(
  rawToken: string,
  newPassword: string
): Promise<{ userId: number; tokenVersion: number } | null> {
  const tokenHash = hashResetToken(rawToken);
  const passwordHash = await hashPassword(newPassword);

  return withTransaction(async (tx) => {
    const resetToken = await tx.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return null;
    }

    // Delete rather than mark used: a consumed token has no further purpose, and
    // deleting it here means the periodic cleanup sweep never has to touch it.
    await tx.passwordResetToken.delete({ where: { id: resetToken.id } });

    const user = await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });

    return { userId: resetToken.userId, tokenVersion: user.tokenVersion };
  });
}

// Periodic safety-net sweep (see backend/src/index.ts): expired tokens are never deleted on
// their own since nothing revisits a request that was never completed, and `usedAt` only ever
// gets set here as a defensive fallback (`resetPassword` normally deletes the row outright).
export async function cleanupPasswordResetTokens(): Promise<number> {
  const { count } = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }],
    },
  });
  return count;
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<{ tokenVersion: number } | null> {
  const user = await findUserById(userId);
  const valid = await verifyPassword(currentPassword, user?.password_hash);
  if (!user || !valid) return null;

  const passwordHash = await hashPassword(newPassword);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });

  return { tokenVersion: updated.tokenVersion };
}
