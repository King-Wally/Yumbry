import path from 'node:path';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { imageFileFilter, publicUploadPath, UPLOADS_DIR } from '../src/middleware/upload.js';

describe('publicUploadPath', () => {
  it('builds a /uploads-relative URL from an absolute path under UPLOADS_DIR', () => {
    const absolutePath = path.join(UPLOADS_DIR, 'recipes', '42', 'photo.jpg');
    expect(publicUploadPath(absolutePath)).toBe('/uploads/recipes/42/photo.jpg');
  });

  it('handles a file directly inside UPLOADS_DIR with no subdirectory', () => {
    const absolutePath = path.join(UPLOADS_DIR, 'photo.jpg');
    expect(publicUploadPath(absolutePath)).toBe('/uploads/photo.jpg');
  });
});

describe('imageFileFilter', () => {
  const req = {} as Request;

  it('accepts image mimetypes', () => {
    const cb = vi.fn();
    imageFileFilter(req, { mimetype: 'image/png' } as Express.Multer.File, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('rejects non-image mimetypes', () => {
    const cb = vi.fn();
    imageFileFilter(req, { mimetype: 'application/pdf' } as Express.Multer.File, cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
});
