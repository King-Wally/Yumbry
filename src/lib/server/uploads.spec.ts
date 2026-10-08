import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ UPLOADS_DIR: undefined }));

const { resolveUploadPath } = await import('#lib/server/uploads.ts');

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
