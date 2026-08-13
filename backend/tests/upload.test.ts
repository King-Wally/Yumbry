import path from 'node:path';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  absoluteUploadPath,
  imageFileFilter,
  publicUploadPath,
  UPLOADS_DIR,
} from '../src/middleware/upload.js';

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

describe('absoluteUploadPath', () => {
  it('round-trips a path produced by publicUploadPath', () => {
    const absolutePath = path.join(UPLOADS_DIR, 'recipes', '42', 'photo.jpg');
    expect(absoluteUploadPath(publicUploadPath(absolutePath))).toBe(path.resolve(absolutePath));
  });

  it('returns null for a path outside /uploads/', () => {
    expect(absoluteUploadPath('/etc/passwd')).toBeNull();
    expect(absoluteUploadPath('recipes/42/photo.jpg')).toBeNull();
  });

  it('returns null for traversal outside UPLOADS_DIR', () => {
    expect(absoluteUploadPath('/uploads/../../etc/passwd')).toBeNull();
    expect(absoluteUploadPath('/uploads/recipes/../../../etc/passwd')).toBeNull();
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
