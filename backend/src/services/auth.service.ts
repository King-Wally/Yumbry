import bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { withTransaction } from '../db/transaction.js';
import { generateResetToken, hashResetToken } from '../utils/reset-token.js';
import { sendPasswordResetEmail } from './email.service.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
}

const BCRYPT_COST_FACTOR = 12;
// Used to compare against when the email doesn't exist, so login takes the
// same amount of time either way and doesn't leak which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST_FACTOR);

function toUserRow(user: {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: Date;
}): UserRow {
  return {
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash,
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

/** Deletes the user row; cascading FKs remove all owned recipes, tags,
 * categories, and ai_settings. */
export async function deleteUser(id: number): Promise<void> {
  await prisma.user.delete({ where: { id } });
}

/** Creates a user and their placeholder ai_settings row in one transaction.
 * Returns null if the email is already registered. */
export async function registerUser(email: string, password: string): Promise<UserRow | null> {
  const passwordHash = await hashPassword(password);

  return withTransaction(async (tx) => {
    let user;
    try {
      user = await tx.user.create({ data: { email, passwordHash } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return null;
      }
      throw err;
    }

    await tx.aiSettings.create({
      data: { userId: user.id, provider: null, baseUrl: null, model: null },
    });

    return toUserRow(user);
  });
}

/** Sends a password reset email if the address belongs to a registered user.
 * Always resolves successfully regardless of whether the email exists, and
 * burns comparable time either way, so callers can return the same response
 * without leaking which emails are registered. */
export async function requestPasswordReset(email: string): Promise<void> {
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

/** Verifies a raw reset token and, if valid/unused/unexpired, updates the
 * user's password and marks the token used, atomically. Returns the userId
 * on success, or null if the token is missing, already used, or expired. */
export async function resetPassword(rawToken: string, newPassword: string): Promise<number | null> {
  const tokenHash = hashResetToken(rawToken);
  const passwordHash = await hashPassword(newPassword);

  return withTransaction(async (tx) => {
    const resetToken = await tx.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return null;
    }

    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    return resetToken.userId;
  });
}
