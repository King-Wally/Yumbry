import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '../utils/jwt.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
  const userId = token ? verifyAuthToken(token) : null;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  req.userId = userId;
  next();
}
