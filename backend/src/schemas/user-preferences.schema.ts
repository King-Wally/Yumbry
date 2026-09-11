import { z } from 'zod';
import { SMALL_VOLUME_STYLES, SUPPORTED_LOCALES, UNIT_SYSTEMS } from 'yumbry-shared';

export const LocaleSchema = z.enum(SUPPORTED_LOCALES);

export const UnitSystemSchema = z.enum(UNIT_SYSTEMS);

export const SmallVolumesSchema = z.enum(SMALL_VOLUME_STYLES);

// Both optional, because the settings page drives them from two independent selects. Requiring
// `locale` here would force the units select to read the current locale out of a possibly-stale
// query cache and write it back, which is a real lost-update race: change the language, change the
// units immediately after, and the language reverts. The refine keeps an empty body a 400 rather
// than a silent no-op.
export const UpdateProfileBodySchema = z
  .object({
    locale: LocaleSchema.optional(),
    unitSystem: UnitSystemSchema.optional(),
    smallVolumes: SmallVolumesSchema.optional(),
    jsonImportExportEnabled: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Provide at least one preference to update.',
  });

export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;
