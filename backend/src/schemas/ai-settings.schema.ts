import { z } from 'zod';

export const AiSettingsBodySchema = z
  .object({
    provider: z.enum(['openai', 'anthropic', 'gemini', 'ollama', 'custom']),
    base_url: z.string().url().nullable(),
    model: z.string().min(1).nullable(),
    api_key: z.string().min(1).nullable().optional(), // omitted = leave unchanged
  })
  .refine(
    (v) => (v.provider === 'ollama' || v.provider === 'custom' ? Boolean(v.base_url) : true),
    {
      message: 'base_url is required for this provider',
      path: ['base_url'],
    }
  );

export type AiSettingsBody = z.infer<typeof AiSettingsBodySchema>;
