import * as z from 'zod';
import { SUPPORTED_LOCALES } from '#lib/shared/locale.ts';
import { SMALL_VOLUME_STYLES } from '#lib/shared/units/small-volumes.ts';
import { UNIT_SYSTEMS } from '#lib/shared/units/unit-system.ts';

// Every field optional: the settings page and the AI chat page each post only the preference they
// change, and requiring the others would make a form write back whatever stale value it rendered.
// The refine keeps an empty submission a 400 rather than a silent no-op.
export const PreferencesSchema = z
	.object({
		locale: z.enum(SUPPORTED_LOCALES).optional(),
		unitSystem: z.enum(UNIT_SYSTEMS).optional(),
		smallVolumes: z.enum(SMALL_VOLUME_STYLES).optional(),
		jsonImportExportEnabled: z
			.enum(['true', 'false'])
			.transform((value) => value === 'true')
			.optional()
	})
	.refine((body) => Object.values(body).some((value) => value !== undefined), {
		message: 'Provide at least one preference to update.'
	});

export type Preferences = z.infer<typeof PreferencesSchema>;

/** The preferences a form posted. Fields it didn't send stay undefined and are left alone. */
export function parsePreferences(data: FormData) {
	const field = (name: string) => {
		const value = data.get(name);
		return typeof value === 'string' ? value : undefined;
	};
	return PreferencesSchema.safeParse({
		locale: field('locale'),
		unitSystem: field('unitSystem'),
		smallVolumes: field('smallVolumes'),
		jsonImportExportEnabled: field('jsonImportExportEnabled')
	});
}
