import { z } from 'zod';

export const UrlImportBodySchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'A URL is required.')
    .url('Enter a valid URL.')
    .refine((url) => /^https?:\/\//i.test(url), 'The URL must start with http:// or https://'),
});

export type UrlImportBody = z.infer<typeof UrlImportBodySchema>;
