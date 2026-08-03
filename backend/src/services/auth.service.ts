import bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { withTransaction } from '../db/transaction.js';

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
