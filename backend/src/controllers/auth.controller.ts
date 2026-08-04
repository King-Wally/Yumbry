import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  AuthBodySchema,
  DeleteAccountBodySchema,
  ForgotPasswordBodySchema,
  ResetPasswordBodySchema,
} from '../schemas/auth.schema.js';
import { AUTH_COOKIE_NAME, signAuthToken } from '../utils/jwt.js';
import {
  deleteUser,
  findUserByEmail,
  findUserById,
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyPassword,
} from '../services/auth.service.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

function setAuthCookie(res: Response, userId: number): void {
  res.cookie(AUTH_COOKIE_NAME, signAuthToken(userId), {
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

    setAuthCookie(res, user.id);
    res.status(201).json({ id: user.id, email: user.email });
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

    setAuthCookie(res, user.id);
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function postLogout(_req: Request, res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.status(204).end();
}

export async function getMe(req: Request, res: Response) {
  const user = await findUserById(req.userId as number);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  res.json({ id: user.id, email: user.email });
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
    const userId = await resetPassword(token, password);
    if (!userId) return res.status(400).json({ error: 'Invalid or expired reset link.' });

    setAuthCookie(res, userId);
    res.status(200).json({ id: userId });
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
