import path from 'node:path';
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
