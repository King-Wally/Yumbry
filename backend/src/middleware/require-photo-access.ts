import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { RecipeIdParamSchema } from '../schemas/recipe-id.schema.js';

/** Gates the static /uploads mount. Scoped by familyId, so recipe photos are
 * visible to every member of the household that owns the recipe. */
export async function requirePhotoAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const match = req.path.match(/^\/recipes\/([^/]+)\//);
  if (!match) {
    res.status(404).end();
    return;
  }

  // Same id rules as the /api/recipes routes. 404 rather than the routes' 400:
  // this gates express.static, where "no such asset" is the honest answer and a
  // JSON validation body would be out of place. Bounding the id also keeps an
  // over-long digit string from overflowing int4 inside Prisma.
  const parsed = RecipeIdParamSchema.safeParse({ id: match[1] });
  if (!parsed.success) {
    res.status(404).end();
    return;
  }

  const recipe = await prisma.recipe.findFirst({
    where: { id: parsed.data.id, familyId: req.familyId },
    select: { id: true },
  });
  if (!recipe) {
    res.status(404).end();
    return;
  }
  next();
}
