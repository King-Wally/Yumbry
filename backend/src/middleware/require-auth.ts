import type { Request } from 'express';
import { prisma } from '../db/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '../utils/jwt.js';

export const requireAuth = asyncHandler(async (req: Request, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
  const verified = token ? verifyAuthToken(token) : null;
  if (!verified) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { tokenVersion: true, email: true, locale: true },
  });
  if (!user || user.tokenVersion !== verified.tokenVersion) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  req.userId = verified.userId;
  req.user = { id: verified.userId, email: user.email, locale: user.locale };
  next();
});
