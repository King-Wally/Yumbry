import path from 'node:path';
import { rm } from 'node:fs/promises';
import { UPLOADS_DIR } from '$app/env/private';
import { parseRecipeId } from '#lib/server/recipe-id.ts';

/** Where recipe photos live on disk. Stored paths are `/uploads/` + a path relative to this. */
export function uploadsRoot(): string {
	return path.resolve(UPLOADS_DIR ?? 'uploads');
}

// New uploads are always WebP. The others are what older versions stored, and stay servable. The
// type comes from this list, never from sniffing the file.
const CONTENT_TYPES: Record<string, string> = {
	webp: 'image/webp',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif'
};

// One plain file name: no separators, no leading dot, so no `..` and no dotfiles.
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*\.([A-Za-z0-9]+)$/;

export interface UploadFile {
	recipeId: number;
	absolutePath: string;
	contentType: string;
}

/** The photo file behind `/uploads/<relativePath>`, or null for anything that isn't exactly
 * `recipes/<id>/<file>` with a known image extension. `relativePath` is the decoded route param. */
export function resolveUploadPath(root: string, relativePath: string): UploadFile | null {
	const segments = relativePath.split('/');
	if (segments.length !== 3 || segments[0] !== 'recipes') return null;

	const recipeId = parseRecipeId(segments[1]);
	const match = FILE_NAME.exec(segments[2]);
	if (recipeId === null || !match) return null;

	const contentType = CONTENT_TYPES[match[1].toLowerCase()];
	if (!contentType) return null;

	const absolutePath = path.resolve(root, 'recipes', String(recipeId), segments[2]);
	// Can't fail after the checks above; kept so a future loosening of FILE_NAME can't escape root.
	if (!absolutePath.startsWith(path.resolve(root) + path.sep)) return null;

	return { recipeId, absolutePath, contentType };
}

// --- Writing photos ---------------------------------------------------------------------------

/** What an upload may declare itself as. SVG is left out on purpose: it is a scriptable document,
 * and it would be served from the app's own origin. */
export const ALLOWED_PHOTO_TYPES: ReadonlySet<string> = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif'
]);

/** Ceiling for an original as the camera wrote it; what is stored is re-encoded far smaller.
 * `BODY_SIZE_LIMIT` (30M in the Dockerfile and the e2e config) leaves room for multipart overhead. */
export const PHOTO_LIMIT_MB = 25;

export type PhotoRefusal = 'missing' | 'unsupported_type' | 'too_large';

/** Why the photo action refused an upload: the checks here, or bytes sharp can't decode. */
export type PhotoError = PhotoRefusal | 'unreadable_image';

/** Why a form value can't be taken as a recipe photo, or null if it can. Only the declared type is
 * checked here; `optimizeRecipePhoto` is what looks at the bytes. */
export function checkPhotoFile(value: FormDataEntryValue | null): PhotoRefusal | null {
	if (!(value instanceof File) || value.size === 0) return 'missing';
	if (!ALLOWED_PHOTO_TYPES.has(value.type)) return 'unsupported_type';
	if (value.size > PHOTO_LIMIT_MB * 1024 * 1024) return 'too_large';
	return null;
}

const PUBLIC_PREFIX = '/uploads/';

/** Writes an already re-encoded photo under a fresh name and returns its stored path,
 * `/uploads/recipes/<id>/<uuid>.webp`. */
export async function saveRecipePhoto(recipeId: number, webp: Uint8Array): Promise<string> {
	const relative = `recipes/${recipeId}/${crypto.randomUUID()}.webp`;
	const file = resolveUploadPath(uploadsRoot(), relative);
	if (!file) throw new Error(`Invalid recipe id: ${recipeId}`);
	// Bun.write creates the missing directories.
	await Bun.write(file.absolutePath, webp);
	return PUBLIC_PREFIX + relative;
}

/** The file behind a stored `/uploads/...` path, or null for anything else (a remote URL from an
 * import, or a path that doesn't resolve safely). */
export function resolveStoredUpload(storedPath: string): UploadFile | null {
	if (!storedPath.startsWith(PUBLIC_PREFIX)) return null;
	return resolveUploadPath(uploadsRoot(), storedPath.slice(PUBLIC_PREFIX.length));
}

/** Like `resolveStoredUpload`, the absolute path only. */
export function absoluteUploadPath(storedPath: string): string | null {
	return resolveStoredUpload(storedPath)?.absolutePath ?? null;
}

/** Copies a stored photo to another recipe under a fresh name, keeping its extension, and returns
 * the copy's stored path. Null when `storedPath` isn't a local upload. Throws if the file can't be
 * read. */
export async function copyRecipeUpload(
	storedPath: string,
	targetRecipeId: number
): Promise<string | null> {
	const source = resolveStoredUpload(storedPath);
	if (!source) return null;

	const extension = path.extname(source.absolutePath).toLowerCase();
	const relative = `recipes/${targetRecipeId}/${crypto.randomUUID()}${extension}`;
	const target = resolveUploadPath(uploadsRoot(), relative);
	if (!target) return null;
	await Bun.write(target.absolutePath, Bun.file(source.absolutePath));
	return PUBLIC_PREFIX + relative;
}

/** Best-effort removal of a stored photo. A failure only leaves an orphaned file behind. */
export async function deleteUploadedFile(storedPath: string): Promise<void> {
	const absolute = absoluteUploadPath(storedPath);
	if (!absolute) return;
	await rm(absolute, { force: true }).catch((err) => {
		console.error(`Failed to delete uploaded file ${absolute}:`, err);
	});
}

/** Best-effort removal of everything stored for a recipe, once the recipe itself is gone. */
export async function deleteRecipeUploadsDir(recipeId: number): Promise<void> {
	if (parseRecipeId(String(recipeId)) === null) return;
	const dir = path.join(uploadsRoot(), 'recipes', String(recipeId));
	await rm(dir, { recursive: true, force: true }).catch((err) => {
		console.error(`Failed to delete uploads directory ${dir}:`, err);
	});
}
