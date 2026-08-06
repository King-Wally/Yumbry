import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

export async function requirePhotoOwner(
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
    where: { id: Number(match[1]), userId: req.userId },
    select: { id: true },
  });
  if (!recipe) {
    res.status(404).end();
    return;
  }
  next();
}
