import { describe, expect, it } from 'vitest';
import { parsePreferences } from '#lib/server/preferences/parse.ts';

function form(fields: Record<string, string>): FormData {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) data.set(name, value);
	return data;
}

describe('parsePreferences', () => {
	it('reads only the fields that were posted', () => {
		const result = parsePreferences(form({ locale: 'nl' }));
		expect(result.success && result.data).toEqual({ locale: 'nl' });
	});

	it('reads every preference at once', () => {
		const result = parsePreferences(
			form({
				locale: 'fr',
				unitSystem: 'imperial',
				smallVolumes: 'millilitres',
				jsonImportExportEnabled: 'true'
			})
		);
		expect(result.success && result.data).toEqual({
			locale: 'fr',
			unitSystem: 'imperial',
			smallVolumes: 'millilitres',
			jsonImportExportEnabled: true
		});
	});

	it.each(['true', 'false'])('turns the JSON switch value %s into a boolean', (value) => {
		const result = parsePreferences(form({ jsonImportExportEnabled: value }));
		expect(result.success && result.data.jsonImportExportEnabled).toBe(value === 'true');
	});

	it.each([
		['locale', 'de'],
		['unitSystem', 'cubits'],
		['smallVolumes', 'cups'],
		['jsonImportExportEnabled', 'yes']
	])('rejects %s=%s, outside the shared enums', (name, value) => {
		expect(parsePreferences(form({ [name]: value })).success).toBe(false);
	});

	it('rejects a submission with no preference in it', () => {
		expect(parsePreferences(form({})).success).toBe(false);
		expect(parsePreferences(form({ other: 'x' })).success).toBe(false);
	});
});
