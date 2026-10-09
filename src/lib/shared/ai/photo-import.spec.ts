import { describe, expect, it } from 'vitest';
import { buildPhotoImportMessages } from '#lib/shared/ai/photo-import.ts';
import { NUTRITION_FIELDS } from '#lib/shared/ai/nutrition.ts';
import { recipeFieldsSection, type AiContentPart } from '#lib/shared/ai/recipe-draft.ts';
import {
	LANGUAGE_NAMES,
	SUPPORTED_LOCALES,
	type SupportedLocale
} from '#lib/shared/i18n/locale.ts';

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

function systemText(locale: SupportedLocale = 'en'): string {
	const [system] = buildPhotoImportMessages(DATA_URL, locale);
	if (typeof system.content !== 'string') throw new Error('system message should be plain text');
	return system.content;
}

function userParts(locale: SupportedLocale = 'en'): AiContentPart[] {
	const [, user] = buildPhotoImportMessages(DATA_URL, locale);
	if (typeof user.content === 'string') throw new Error('user message should carry content parts');
	return user.content;
}

describe('buildPhotoImportMessages', () => {
	it('returns exactly one system message and one user message', () => {
		const messages = buildPhotoImportMessages(DATA_URL);

		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe('system');
		expect(messages[1].role).toBe('user');
	});

	it('carries the image as an image_url part alongside a text part', () => {
		const parts = userParts();

		expect(parts).toHaveLength(2);
		expect(parts[0]).toMatchObject({ type: 'text' });
		expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: DATA_URL } });
	});

	// The text has to precede the image: the instruction is what the image is being read *for*, and
	// a model that meets the picture first has already started describing it.
	it('puts the instruction before the image', () => {
		const parts = userParts();

		expect(parts.findIndex((part) => part.type === 'text')).toBeLessThan(
			parts.findIndex((part) => part.type === 'image_url')
		);
	});

	it.each(SUPPORTED_LOCALES)('names the target language for %s', (locale) => {
		expect(systemText(locale)).toContain(LANGUAGE_NAMES[locale]);
	});

	it('shares the field contract with the chat prompt', () => {
		expect(systemText()).toContain(recipeFieldsSection(LANGUAGE_NAMES.en));
	});

	// The schema-free rungs of the downgrade ladder leave the prompt as the only contract.
	it('documents every nutrition field', () => {
		for (const field of NUTRITION_FIELDS) {
			expect(systemText(), field).toContain(`"recipe.${field}"`);
		}
	});

	// Continuation lines are indented to sit under a single-digit number.
	it('numbers the hard requirements 1, 2, 3… below ten', () => {
		const numbers = systemText()
			.split('# HARD REQUIREMENTS')[1]
			.split('\n# ')[0]
			.split('\n')
			.flatMap((line) => line.match(/^(\d+)\. /)?.[1] ?? []);

		expect(numbers.length).toBeLessThan(10);
		expect(numbers).toEqual(numbers.map((_, index) => String(index + 1)));
	});
});
