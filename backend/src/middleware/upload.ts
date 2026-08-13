import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Request } from 'express';
import multer, { type FileFilterCallback } from 'multer';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

const storage = multer.diskStorage({
  destination(req: Request, file, cb) {
    const dir = path.join(UPLOADS_DIR, 'recipes', String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  },
});

export function imageFileFilter(
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void {
  if (!file.mimetype.startsWith('image/')) {
    cb(new Error('Only image uploads are allowed'));
    return;
  }
  cb(null, true);
}

export const uploadPhoto = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

export const uploadJsonFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

export function publicUploadPath(absolutePath: string): string {
  return `/uploads/${path.relative(UPLOADS_DIR, absolutePath)}`;
}

/** Inverse of publicUploadPath. Returns null for anything outside UPLOADS_DIR. */
export function absoluteUploadPath(publicPath: string): string | null {
  if (!publicPath.startsWith('/uploads/')) return null;

  const root = path.resolve(UPLOADS_DIR);
  const absolute = path.resolve(path.join(root, publicPath.slice('/uploads/'.length)));
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;
  return absolute;
}

/** Best-effort: a failed unlink leaves an orphaned file, which beats failing the request. */
export async function deleteUploadedFile(publicPath: string | null | undefined): Promise<void> {
  if (!publicPath) return;
  const absolute = absoluteUploadPath(publicPath);
  if (!absolute) return;

  try {
    await fsp.rm(absolute, { force: true });
  } catch (err) {
    console.error(`Failed to delete uploaded file ${absolute}:`, err);
  }
}

/** Best-effort removal of a recipe's whole upload directory, including any orphans in it. */
export async function deleteRecipeUploadsDir(recipeId: number): Promise<void> {
  if (!Number.isInteger(recipeId)) return;
  const dir = path.join(UPLOADS_DIR, 'recipes', String(recipeId));

  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch (err) {
    console.error(`Failed to delete uploads directory ${dir}:`, err);
  }
}

export { UPLOADS_DIR };
