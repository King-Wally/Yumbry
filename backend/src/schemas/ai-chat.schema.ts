import { z } from 'zod';
import { isDensityKey } from 'yumbry-shared';

export const AiRecipeDraftSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  image_path: z.string().nullable(),
  prep_time_minutes: z.number().nullable(),
  cook_time_minutes: z.number().nullable(),
  total_time_minutes: z.number().nullable(),
  servings: z.number(),
  ingredients: z.array(z.string()),
  instructions: z.array(z.object({ step_number: z.number(), text: z.string() })),
  tags: z.array(z.string()),
  category: z.string().nullable(),
  // Optional so a client holding a draft from before this field existed still validates; the
  // server falls back to re-parsing the rendered lines.
  ingredients_structured: z
    .array(
      z.object({
        item: z.string(),
        quantity: z.number().nullable(),
        unit: z.string(),
        note: z.string().nullable(),
        // Tolerated rather than enumerated: this value round-trips through the client, so an
        // unrecognised key should degrade to weight, not fail the whole turn with a 400.
        density_key: z.string().transform((value) => (isDensityKey(value) ? value : 'none')),
      })
    )
    .optional(),
});

export const AiChatTurnRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1) }))
    .min(1),
  current_draft: AiRecipeDraftSchema.nullable(),
});
export type AiChatTurnRequest = z.infer<typeof AiChatTurnRequestSchema>;
