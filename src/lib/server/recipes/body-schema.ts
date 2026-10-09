import { z } from 'zod';

// What a save may write: main's rules, with Zod's own messages (main had no custom ones). The form
// is the only client now, so ingredients arrive as plain lines rather than main's string-or-object.
// `image_path` is accepted but never trusted: createRecipe keeps it only as an external http(s) URL
// (an imported draft's photo), and an update ignores it — the photo action owns that column.
export const RecipeBodySchema = z.object({
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	image_path: z.string().nullable().optional(),
	// `.int()` is the one rule main didn't have: the columns are integers, so 2.5 would otherwise
	// fail in Postgres rather than come back as a field error.
	prep_time_minutes: z.number().int().nullable().optional(),
	cook_time_minutes: z.number().int().nullable().optional(),
	total_time_minutes: z.number().int().nullable().optional(),
	servings: z.number().positive(),
	// Per single serving. kcal for calories, grams for the rest.
	calories: z.number().nonnegative().nullable().optional(),
	fat_content: z.number().nonnegative().nullable().optional(),
	carbohydrate_content: z.number().nonnegative().nullable().optional(),
	protein_content: z.number().nonnegative().nullable().optional(),
	ingredients: z.array(z.string()),
	instructions: z.array(z.object({ step_number: z.number().int().positive(), text: z.string() })),
	tags: z.array(z.string()),
	category: z.string().nullable()
});

export type RecipeBody = z.infer<typeof RecipeBodySchema>;
