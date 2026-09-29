import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Request } from 'express';
import multer, { type FileFilterCallback } from 'multer';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

/** The formats a recipe photo may be stored as, and the extension each is written
 * with. An allowlist rather than a `image/` prefix test, and the extension comes
 * from here rather than from the upload's own filename: both halves of the old
 * rule were attacker-supplied, so `evil.html` sent as `Content-Type: image/png`
 * landed as `<uuid>.html` under uploads/ and was then served from the app's own
 * origin by express.static.
 *
 * SVG is excluded on purpose. It is an image everywhere else in the stack, but it
 * is also a document that can carry script, and these files are served same-origin. */
const ALLOWED_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination(req: Request, file, cb) {
    // req.recipeId, never req.params.id: Express decodes path params, so a raw
    // `..%2F..%2Fetc` would escape UPLOADS_DIR through path.join. Only an integer
    // is ever concatenated here, which makes traversal impossible by construction
    // rather than by the order validateRecipeIdParam happens to be mounted in.
    //
    // The other end of that invariant is recipe.service.ts: the path this produces
    // reaches the database only through setRecipePhoto, and a client-supplied
    // `/uploads/...` string is dropped rather than stored, so no request body can
    // name a file here that the request did not itself just write.
    const { recipeId } = req;
    if (!Number.isInteger(recipeId)) {
      cb(new Error('Invalid recipe id'), '');
      return;
    }

    const dir = path.join(UPLOADS_DIR, 'recipes', String(recipeId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    // Never path.extname(file.originalname): the extension decides how this file is
    // later served. imageFileFilter has already refused anything absent from the map.
    const extension = ALLOWED_IMAGE_EXTENSIONS[file.mimetype];
    if (!extension) {
      cb(new Error('Only image uploads are allowed'), '');
      return;
    }
    cb(null, `${uuidv4()}${extension}`);
  },
});

export function imageFileFilter(
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void {
  if (!(file.mimetype in ALLOWED_IMAGE_EXTENSIONS)) {
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

// Memory storage, unlike uploadPhoto: a photo imported into the AI is downscaled by sharp,
// base64'd into one Gemini call and then dropped. Writing it to disk would mean a staging
// directory outside uploads/recipes/<id>/ — which requirePhotoAccess cannot serve — plus cleanup
// for every import the user abandons, all for a picture of a cookbook page nobody wants to keep.
//
// The 25 MB ceiling is deliberately far above uploadPhoto's 8 MB: this file arrives at full camera
// resolution because the shrink happens server-side, and a recent phone shooting 48 MP easily
// clears 8 MB. It is a bound on what the process will hold, not a quality setting — what reaches
// the model is whatever prepareImageForModel produces, typically a few hundred KB.
export const MEMORY_PHOTO_LIMIT_MB = 25;

export const uploadPhotoToMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: MEMORY_PHOTO_LIMIT_MB * 1024 * 1024 },
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

/** Copies an already-stored recipe photo into another recipe's upload directory
 * under a fresh server-chosen name, and returns the new file's public path. Used
 * when importing a shared recipe, so the copy survives the original's deletion.
 * Returns null for anything that isn't a local upload with an allowed extension. */
export async function copyRecipeUpload(
  publicPath: string,
  targetRecipeId: number
): Promise<string | null> {
  if (!Number.isInteger(targetRecipeId)) return null;
  const source = absoluteUploadPath(publicPath);
  if (!source) return null;

  const extension = path.extname(source).toLowerCase();
  if (!Object.values(ALLOWED_IMAGE_EXTENSIONS).includes(extension)) return null;

  const dir = path.join(UPLOADS_DIR, 'recipes', String(targetRecipeId));
  await fsp.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${uuidv4()}${extension}`);
  await fsp.copyFile(source, target);
  return publicUploadPath(target);
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
