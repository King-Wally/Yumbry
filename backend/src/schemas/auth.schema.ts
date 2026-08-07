import { z } from 'zod';
import { SUPPORTED_LOCALES } from 'yumbry-shared';

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

export const UpdateProfileBodySchema = z.object({
  locale: LocaleSchema,
});

export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;
