import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

/** Gates the static /uploads mount. Scoped by familyId, so recipe photos are
 * visible to every member of the household that owns the recipe. */
export async function requirePhotoAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const match = req.path.match(/^\/recipes\/(\d+)\//);
  if (!match) {
    res.status(404).end();
    return;
  }

  const recipe = await prisma.recipe.findFirst({
    where: { id: Number(match[1]), familyId: req.familyId },
    select: { id: true },
  });
  if (!recipe) {
    res.status(404).end();
    return;
  }
  next();
}
