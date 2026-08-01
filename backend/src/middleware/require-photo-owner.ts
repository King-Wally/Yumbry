import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';

/** Uploaded photos live at /uploads/recipes/:recipeId/... with no per-user
 * subdirectory (recipe ids are a single global sequence, not user-scoped),
 * so a logged-in user could otherwise guess another user's recipe id.
 * Mounted after requireAuth, before express.static, to check ownership. */
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

  const { rows } = await pool.query('SELECT 1 FROM recipes WHERE id = $1 AND user_id = $2', [
    match[1],
    req.userId,
  ]);
  if (rows.length === 0) {
    res.status(404).end();
    return;
  }
  next();
}
