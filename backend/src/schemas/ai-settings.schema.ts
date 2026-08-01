import { z } from 'zod';

export const AiSettingsBodySchema = z.object({
  base_url: z.string().url(),
  model: z.string().min(1).nullable(),
});

export type AiSettingsBody = z.infer<typeof AiSettingsBodySchema>;
