import { z } from 'zod';

/**
 * Bounds exist to cap the prompt rather than to police the cook — the form is the only caller, and
 * it disables the button below `ingredients.min(1)` for the same reason the schema requires it:
 * a recipe with nothing in it has no nutrition to estimate.
 */
export const AiNutritionRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish().default(null),
  servings: z.number().positive().max(100),
  ingredients: z.array(z.string().min(1).max(300)).min(1).max(100),
  instructions: z.array(z.string().min(1).max(2000)).max(100).default([]),
});

export type AiNutritionRequestBody = z.infer<typeof AiNutritionRequestSchema>;
