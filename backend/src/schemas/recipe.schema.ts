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
  // Accepted but never trusted. The edit form echoes back whatever it loaded —
  // including the `/uploads/...` path of an already-attached photo — so rejecting
  // here would 400 every edit of a recipe that has one. createRecipe runs the value
  // through externalImageUrl, which keeps only remote http(s) URLs (how JSON-LD and
  // URL imports carry a picture) and drops everything else; updateRecipe ignores it
  // outright. The column is otherwise written only by setRecipePhoto.
  image_path: z.string().nullable().optional(),
  prep_time_minutes: z.number().nullable().optional(),
  cook_time_minutes: z.number().nullable().optional(),
  total_time_minutes: z.number().nullable().optional(),
  servings: z.number().positive().optional(),
  // Per single serving. kcal for calories, grams for the rest.
  calories: z.number().nonnegative().nullable().optional(),
  fat_content: z.number().nonnegative().nullable().optional(),
  carbohydrate_content: z.number().nonnegative().nullable().optional(),
  protein_content: z.number().nonnegative().nullable().optional(),
  ingredients: z.array(IngredientInputSchema).optional(),
  instructions: z.array(InstructionInputSchema).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().nullable().optional(),
});

export type RecipeBody = z.infer<typeof RecipeBodySchema>;
export type InstructionInput = z.infer<typeof InstructionInputSchema>;
