import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

export async function requireRecipeOwner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const recipe = await prisma.recipe.findFirst({
    where: { id: Number(req.params.id), userId: req.userId },
    select: { id: true },
  });
  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  next();
}
