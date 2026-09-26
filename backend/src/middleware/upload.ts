import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Request } from 'express';
import multer, { type FileFilterCallback } from 'multer';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

/** The formats a photo upload may declare. An allowlist rather than an `image/` prefix
 * test. What is stored is always re-encoded by sharp (see saveRecipePhoto), so this
 * gate is about refusing obvious non-images early, not about what gets served.
 *
 * SVG is excluded on purpose. It is an image everywhere else in the stack, but it
 * is also a document that can carry script, and sharp would rasterize it with libvips'
 * SVG loader — attack surface for no benefit to a recipe photo. */
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function imageFileFilter(
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    cb(new Error('Only image uploads are allowed'));
    return;
  }
  cb(null, true);
}

// Memory storage for both photo uploads: the bytes are decoded and shrunk by sharp before anything
// is kept, so the camera original never touches disk. A recipe photo is then written by
// saveRecipePhoto; a photo imported into the AI is base64'd into one model call and dropped.
//
// The 25 MB ceiling is deliberately generous: the file arrives at full camera resolution because
// the shrink happens server-side, and a recent phone shooting 48 MP easily clears 8 MB. It is a
// bound on what the process will hold, not a quality setting — what is stored or sent is whatever
// image-prep.service.ts produces, typically a few hundred KB.
export const MEMORY_PHOTO_LIMIT_MB = 25;

const photoInMemory = {
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: MEMORY_PHOTO_LIMIT_MB * 1024 * 1024 },
};

export const uploadPhoto = multer(photoInMemory);

export const uploadPhotoToMemory = multer(photoInMemory);

/**
 * Writes an already-optimized recipe photo under uploads/recipes/<id>/ and returns its public path.
 *
 * recipeId comes from req.recipeId, never req.params.id: Express decodes path params, so a raw
 * `..%2F..%2Fetc` would escape UPLOADS_DIR through path.join. Only an integer is ever concatenated
 * here, which makes traversal impossible by construction rather than by the order
 * validateRecipeIdParam happens to be mounted in.
 *
 * The other end of that invariant is recipe.service.ts: the path this produces reaches the
 * database only through setRecipePhoto, and a client-supplied `/uploads/...` string is dropped
 * rather than stored, so no request body can name a file here that the request did not itself
 * just write. The extension is fixed too — optimizeRecipePhoto always encodes WebP — so nothing
 * the client sent decides how the file is later served.
 */
export async function saveRecipePhoto(recipeId: number, data: Buffer): Promise<string> {
  if (!Number.isInteger(recipeId)) throw new Error('Invalid recipe id');

  const dir = path.join(UPLOADS_DIR, 'recipes', String(recipeId));
  await fsp.mkdir(dir, { recursive: true });
  const absolute = path.join(dir, `${uuidv4()}.webp`);
  await fsp.writeFile(absolute, data);
  return publicUploadPath(absolute);
}

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
