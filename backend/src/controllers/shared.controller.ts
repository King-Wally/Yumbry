import type { Request, Response } from 'express';
import {
  getSharedPhotoFile,
  getSharedRecipe,
  importSharedRecipe,
} from '../services/recipe-share.service.js';
import { ShareTokenParamSchema } from '../schemas/share-token.schema.js';

// `kind` lets the share page tell a dead link apart from a network failure.
const NOT_FOUND = { error: 'Shared recipe not found', kind: 'share_not_found' };

/** A malformed token is answered like a revoked one — 404, never 400 — so the
 * response doesn't reveal anything about what a valid token looks like. */
function parseToken(req: Request): string | null {
  const parsed = ShareTokenParamSchema.safeParse(req.params);
  return parsed.success ? parsed.data.token : null;
}

export async function getShared(req: Request, res: Response) {
  const token = parseToken(req);
  if (!token) return res.status(404).json(NOT_FOUND);

  const recipe = await getSharedRecipe(token, req.familyId);
  if (!recipe) return res.status(404).json(NOT_FOUND);
  // Stopping sharing must take effect on the next load, not after a cache expiry.
  res.setHeader('Cache-Control', 'no-store');
  res.json(recipe);
}

export async function getSharedPhoto(req: Request, res: Response) {
  const token = parseToken(req);
  if (!token) return res.status(404).end();

  const file = await getSharedPhotoFile(token);
  if (!file) return res.status(404).end();

  // Same headers as the family-gated /uploads mount in app.ts.
  res.sendFile(
    file,
    {
      dotfiles: 'deny',
      headers: {
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
      },
    },
    (err) => {
      if (err && !res.headersSent) res.status(404).end();
    }
  );
}

export async function postImportShared(req: Request, res: Response) {
  const token = parseToken(req);
  if (!token) return res.status(404).json(NOT_FOUND);

  const recipe = await importSharedRecipe(token, {
    familyId: req.familyId as number,
    userId: req.userId as string,
  });
  if (!recipe) return res.status(404).json(NOT_FOUND);
  res.status(201).json(recipe);
}
