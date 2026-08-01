import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';

/** Mounted before multer's disk storage for photo uploads, so a request for
 * a recipe id the caller doesn't own 404s before any file is written to
 * disk (multer's destination callback has no async ownership-check hook). */
export async function requireRecipeOwner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { rows } = await pool.query('SELECT 1 FROM recipes WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.userId,
  ]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  next();
}
