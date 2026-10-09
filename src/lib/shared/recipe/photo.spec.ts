import { describe, expect, it } from 'vitest';
import { photoErrorMessage, PHOTO_LIMIT_MB, type PhotoError } from '#lib/shared/recipe/photo.ts';

describe('photoErrorMessage', () => {
	it('gives every kind its own message', () => {
		const kinds: PhotoError[] = ['missing', 'unsupported_type', 'too_large', 'unreadable_image'];
		const messages = kinds.map(photoErrorMessage);
		expect(new Set(messages).size).toBe(kinds.length);
		for (const message of messages) expect(message).not.toBe('');
	});

	it('names the size limit for a photo that is too large', () => {
		expect(photoErrorMessage('too_large')).toContain(`${PHOTO_LIMIT_MB} MB`);
	});
});
