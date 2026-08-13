import { z } from 'zod';
import { SMALL_VOLUME_STYLES, SUPPORTED_LOCALES, UNIT_SYSTEMS } from 'yumbry-shared';

export const AuthBodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
});

export type AuthBody = z.infer<typeof AuthBodySchema>;

export const DeleteAccountBodySchema = z.object({
  password: z.string().min(1),
});

export type DeleteAccountBody = z.infer<typeof DeleteAccountBodySchema>;

export const ForgotPasswordBodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBodySchema>;

export const ResetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72),
});

export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>;

export const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

export type ChangePasswordBody = z.infer<typeof ChangePasswordBodySchema>;

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
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Provide at least one preference to update.',
  });

export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;
