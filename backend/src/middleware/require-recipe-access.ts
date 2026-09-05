import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

/** Recipes are owned by the family, not the author, so access is decided by
 * familyId — any member may read and write any recipe in their household. */
export async function requireRecipeAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const recipe = await prisma.recipe.findFirst({
    where: { id: Number(req.params.id), familyId: req.familyId },
    select: { id: true },
  });
  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  next();
}
