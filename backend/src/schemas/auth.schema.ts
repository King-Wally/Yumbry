import { z } from 'zod';

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
