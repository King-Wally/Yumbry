import { z } from 'zod';

export const AiRecipeDraftSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  image_path: z.null(),
  prep_time_minutes: z.number().nullable(),
  cook_time_minutes: z.number().nullable(),
  total_time_minutes: z.number().nullable(),
  servings: z.number(),
  ingredients: z.array(z.string()),
  instructions: z.array(z.object({ step_number: z.number(), text: z.string() })),
  tags: z.array(z.string()),
  category: z.string().nullable(),
});

export const AiChatTurnRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1) }))
    .min(1),
  current_draft: AiRecipeDraftSchema.nullable(),
});
export type AiChatTurnRequest = z.infer<typeof AiChatTurnRequestSchema>;
