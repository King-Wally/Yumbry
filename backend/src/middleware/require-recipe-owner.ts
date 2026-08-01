import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

/** Mounted before multer's disk storage for photo uploads, so a request for
 * a recipe id the caller doesn't own 404s before any file is written to
 * disk (multer's destination callback has no async ownership-check hook). */
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
