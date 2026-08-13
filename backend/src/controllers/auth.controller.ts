import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import {
  AuthBodySchema,
  ChangePasswordBodySchema,
  DeleteAccountBodySchema,
  ForgotPasswordBodySchema,
  ResetPasswordBodySchema,
  UpdateProfileBodySchema,
} from '../schemas/auth.schema.js';
import { AUTH_COOKIE_NAME, signAuthToken, verifyAuthToken } from '../utils/jwt.js';
import {
  changePassword,
  deleteUser,
  findUserByEmail,
  findUserById,
  registerUser,
  requestPasswordReset,
  resetPassword,
  revokeAuthSessions,
  updateUserProfile,
  verifyPassword,
  type UserRow,
} from '../services/auth.service.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

interface PublicUser {
  id: number;
  email: string;
  locale: string;
  unitSystem: string;
  smallVolumes: string;
}

function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    locale: user.locale,
    unitSystem: user.unitSystem,
    smallVolumes: user.smallVolumes,
  };
}

// Service rows are snake_case; `req.user` is already camelCase. One adapter beats two shapes.
function publicUserFromRow(user: UserRow): PublicUser {
  return toPublicUser({
    id: user.id,
    email: user.email,
    locale: user.locale,
    unitSystem: user.unit_system,
    smallVolumes: user.small_volumes,
  });
}

function setAuthCookie(res: Response, userId: number, tokenVersion: number): void {
  res.cookie(AUTH_COOKIE_NAME, signAuthToken(userId, tokenVersion), {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: THIRTY_DAYS_MS,
  });
}

export async function postRegister(req: Request, res: Response) {
  try {
    const { email, password } = AuthBodySchema.parse(req.body);
    const user = await registerUser(email, password);
    if (!user) return res.status(409).json({ error: 'Email is already registered.' });

    setAuthCookie(res, user.id, user.token_version);
    res.status(201).json(publicUserFromRow(user));
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function postLogin(req: Request, res: Response) {
  try {
    const { email, password } = AuthBodySchema.parse(req.body);
    const user = await findUserByEmail(email);
    const valid = await verifyPassword(password, user?.password_hash);
    if (!user || !valid) return res.status(401).json({ error: 'Invalid email or password.' });

    setAuthCookie(res, user.id, user.token_version);
    res.json(publicUserFromRow(user));
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function postLogout(req: Request, res: Response) {
  const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
  const verified = token ? verifyAuthToken(token) : null;
  if (verified) {
    try {
      await revokeAuthSessions(verified.userId);
    } catch (err) {
      // If the account was already deleted (e.g. from another tab), there's
      // no session left to revoke — the goal of logout already holds.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
        throw err;
      }
    }
  }
  res.clearCookie(AUTH_COOKIE_NAME);
  res.status(204).end();
}

export async function getMe(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  res.json(toPublicUser(req.user));
}

export async function patchMe(req: Request, res: Response) {
  try {
    const patch = UpdateProfileBodySchema.parse(req.body);
    const user = await updateUserProfile(req.userId as number, patch);
    res.json(publicUserFromRow(user));
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function postForgotPassword(req: Request, res: Response) {
  try {
    const { email } = ForgotPasswordBodySchema.parse(req.body);
    await requestPasswordReset(email);
    // Always the same response, whether or not the email is registered —
    // avoids leaking which emails have accounts.
    res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function postResetPassword(req: Request, res: Response) {
  try {
    const { token, password } = ResetPasswordBodySchema.parse(req.body);
    const result = await resetPassword(token, password);
    if (!result) return res.status(400).json({ error: 'Invalid or expired reset link.' });

    setAuthCookie(res, result.userId, result.tokenVersion);
    res.status(200).json({ id: result.userId });
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function postChangePassword(req: Request, res: Response) {
  try {
    const { currentPassword, newPassword } = ChangePasswordBodySchema.parse(req.body);
    const result = await changePassword(req.userId as number, currentPassword, newPassword);
    if (!result) return res.status(401).json({ error: 'Incorrect password.' });

    setAuthCookie(res, req.userId as number, result.tokenVersion);
    res.status(204).end();
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function deleteAccount(req: Request, res: Response) {
  try {
    const { password } = DeleteAccountBodySchema.parse(req.body);
    const user = await findUserById(req.userId as number);
    const valid = await verifyPassword(password, user?.password_hash);
    if (!user || !valid) return res.status(401).json({ error: 'Incorrect password.' });

    await deleteUser(user.id);
    res.clearCookie(AUTH_COOKIE_NAME);
    res.status(204).end();
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}
