import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const uploadsDir = vi.hoisted(() => ({ path: '' }));
uploadsDir.path = mkdtempSync(path.join(tmpdir(), 'yumbry-uploads-'));
vi.mock('$app/env/private', () => ({
	get UPLOADS_DIR() {
		return uploadsDir.path;
	}
}));

const {
	absoluteUploadPath,
	checkPhotoFile,
	deleteRecipeUploadsDir,
	deleteUploadedFile,
	resolveUploadPath,
	saveRecipePhoto
} = await import('#lib/server/uploads.ts');

afterAll(() => rmSync(uploadsDir.path, { recursive: true, force: true }));

const root = path.resolve('/srv/uploads');

describe('resolveUploadPath', () => {
	it('resolves the stored path shapes', () => {
		expect(resolveUploadPath(root, 'recipes/7/0b8e6a52-4f0d-4c1e-9c39-1f1f5a3e9d2b.webp')).toEqual({
			recipeId: 7,
			absolutePath: path.join(root, 'recipes/7/0b8e6a52-4f0d-4c1e-9c39-1f1f5a3e9d2b.webp'),
			contentType: 'image/webp'
		});
		expect(resolveUploadPath(root, 'recipes/12/photo.JPG')?.contentType).toBe('image/jpeg');
		expect(resolveUploadPath(root, 'recipes/12/photo.jpeg')?.contentType).toBe('image/jpeg');
		expect(resolveUploadPath(root, 'recipes/12/photo.png')?.contentType).toBe('image/png');
		expect(resolveUploadPath(root, 'recipes/12/photo.gif')?.contentType).toBe('image/gif');
	});

	// The params as Kit hands them over, decoded (http-contract.spec.ts sends these encoded).
	it.each([
		'recipes/../../etc/passwd',
		'recipes/../../../../../etc/passwd',
		'recipes/7/../../../../etc/passwd',
		'recipes/7/../../../package.json',
		'recipes/7/....//....//etc/passwd',
		'../public/index.html',
		'recipes/7/..',
		'recipes/7/.hidden.webp',
		'recipes/7/a\\..\\b.webp',
		'recipes/7/sub/photo.webp',
		'recipes/7/',
		'recipes/7',
		'photo.webp',
		'other/7/photo.webp',
		'recipes/007/photo.webp',
		'recipes/0/photo.webp',
		'recipes/99999999999999/photo.webp',
		'recipes/abc/photo.webp',
		'recipes/7/photo.svg',
		'recipes/7/photo.html',
		'recipes/7/photo',
		'recipes/7/photo.webp\0.txt',
		''
	])('refuses %j', (relative) => {
		expect(resolveUploadPath(root, relative)).toBeNull();
	});
});

describe('checkPhotoFile', () => {
	const file = (type: string, size = 10) => new File([new Uint8Array(size)], 'photo', { type });

	it('accepts the allowlisted image types', () => {
		for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
			expect(checkPhotoFile(file(type))).toBeNull();
		}
	});

	// These would all pass a `startsWith('image/')` test. SVG is the one that matters: it is a
	// scriptable document served from the app's own origin.
	it.each([
		'image/svg+xml',
		'image/svg',
		'image/x-icon',
		'image/',
		'application/pdf',
		'text/plain',
		''
	])('refuses %j', (type) => {
		expect(checkPhotoFile(file(type))).toBe('unsupported_type');
	});

	it('refuses a missing or empty file, or a plain string', () => {
		expect(checkPhotoFile(null)).toBe('missing');
		expect(checkPhotoFile('photo.jpg')).toBe('missing');
		expect(checkPhotoFile(file('image/jpeg', 0))).toBe('missing');
	});

	it('refuses anything over 25 MB', () => {
		const limit = 25 * 1024 * 1024;
		expect(checkPhotoFile(file('image/jpeg', limit))).toBeNull();
		expect(checkPhotoFile(file('image/jpeg', limit + 1))).toBe('too_large');
	});
});

describe('writing photos', () => {
	it('saves under recipes/<id>/<uuid>.webp and deletes by stored path', async () => {
		const stored = await saveRecipePhoto(42, new Uint8Array([1, 2, 3]));
		expect(stored).toMatch(/^\/uploads\/recipes\/42\/[0-9a-f-]{36}\.webp$/);

		const absolute = absoluteUploadPath(stored);
		expect(absolute).toBe(path.join(uploadsDir.path, stored.slice('/uploads/'.length)));
		expect(existsSync(absolute!)).toBe(true);

		await deleteUploadedFile(stored);
		expect(existsSync(absolute!)).toBe(false);
	});

	it('removes a recipe’s whole directory', async () => {
		await saveRecipePhoto(43, new Uint8Array([1]));
		await saveRecipePhoto(43, new Uint8Array([2]));
		expect(readdirSync(path.join(uploadsDir.path, 'recipes/43'))).toHaveLength(2);

		await deleteRecipeUploadsDir(43);
		expect(existsSync(path.join(uploadsDir.path, 'recipes/43'))).toBe(false);
	});

	it('resolves only stored /uploads/ paths inside the root', () => {
		expect(absoluteUploadPath('https://example.com/photo.jpg')).toBeNull();
		expect(absoluteUploadPath('recipes/42/photo.jpg')).toBeNull();
		expect(absoluteUploadPath('/etc/passwd')).toBeNull();
		expect(absoluteUploadPath('/uploads/../../etc/passwd')).toBeNull();
		expect(absoluteUploadPath('/uploads/recipes/../../../etc/passwd')).toBeNull();
	});

	it('ignores paths it does not own when deleting', async () => {
		await expect(deleteUploadedFile('https://example.com/photo.jpg')).resolves.toBeUndefined();
		await expect(deleteUploadedFile('/uploads/../package.json')).resolves.toBeUndefined();
	});
});
