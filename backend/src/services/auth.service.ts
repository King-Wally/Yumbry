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
  token_version: number;
  locale: string;
  unit_system: string;
  small_volumes: string;
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
  await prisma.user.delete({ where: { id } });
}

// Generalised rather than given a sibling per column: Prisma ignores `undefined` keys, so a
// partial update needs no branching, and the next preference to be added needs no third function.
export async function updateUserProfile(
  userId: number,
  data: { locale?: string; unitSystem?: string; smallVolumes?: string }
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
      user = await tx.user.create({ data: { email, passwordHash } });
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

    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    const user = await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });

    return { userId: resetToken.userId, tokenVersion: user.tokenVersion };
  });
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
