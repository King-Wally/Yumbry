import { z } from 'zod';

/** Manually-entered ingredients arrive as either a raw text line or an object
 * carrying one (see controllers/recipes.controller.ts's normalizeIngredients). */
const IngredientInputSchema = z.union([z.string(), z.object({ raw_text: z.string() })]);

const InstructionInputSchema = z.object({
  step_number: z.number().int().positive().optional(),
  text: z.string(),
});

export const RecipeBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  image_path: z.string().nullable().optional(),
  prep_time_minutes: z.number().nullable().optional(),
  cook_time_minutes: z.number().nullable().optional(),
  total_time_minutes: z.number().nullable().optional(),
  servings: z.number().positive().optional(),
  ingredients: z.array(IngredientInputSchema).optional(),
  instructions: z.array(InstructionInputSchema).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().nullable().optional(),
});

export type RecipeBody = z.infer<typeof RecipeBodySchema>;
