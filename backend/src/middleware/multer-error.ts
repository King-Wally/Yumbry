import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { MEMORY_PHOTO_LIMIT_MB } from './upload.js';

/**
 * Turns an upload multer itself rejected — too large, or not an image — into a 400 the client can
 * show. Without this the rejection falls through to the catch-all handler in `app.ts`, which logs
 * it and answers a generic 500: the one error shape that tells a user nothing about a mistake that
 * is entirely theirs to fix.
 *
 * Mount it directly after the multer middleware in a route chain, where a 4-argument handler is
 * reached only by an error thrown above it.
 */
export function handleUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `That photo is too large. Please use one under ${MEMORY_PHOTO_LIMIT_MB} MB.`
        : 'That upload could not be read.';
    res.status(400).json({ error: message });
    return;
  }

  // imageFileFilter rejects with a plain Error rather than a MulterError.
  if (err instanceof Error && err.message === 'Only image uploads are allowed') {
    res.status(400).json({ error: 'Only image uploads are allowed.' });
    return;
  }

  next(err);
}
