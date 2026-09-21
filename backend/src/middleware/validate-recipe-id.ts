import type { NextFunction, Request, Response } from 'express';
import { RecipeIdParamSchema } from '../schemas/recipe-id.schema.js';

/** Rejects a malformed `:id` at the route boundary, so no unvalidated path
 * segment reaches a Prisma `where` clause or a filesystem path. Mount it as the
 * first handler of every `/:id` chain — requireRecipeAccess and multer's
 * destination callback both run before any controller and rely on req.recipeId.
 *
 * Synchronous, so it needs no asyncHandler wrapper. safeParse rather than the
 * controllers' .parse() + ZodError catch, since middleware has no try/catch to
 * map from.
 *
 * The body shape deviates from the controllers' `{ error: err.issues }` on
 * purpose: the frontend's request() helper puts `body.error` straight into an
 * ApiError message, where an array would render as "[object Object]". A string
 * in `error` keeps that readable; `issues` carries the Zod detail alongside. */
export function validateRecipeIdParam(req: Request, res: Response, next: NextFunction): void {
  const result = RecipeIdParamSchema.safeParse(req.params);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid recipe id.', issues: result.error.issues });
    return;
  }

  req.recipeId = result.data.id;
  next();
}
