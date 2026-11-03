import * as z from 'zod';

// The column limits: numeric(8,2) for nutrition, a 32-bit integer for minutes and step numbers.
const MAX_NUTRITION = 999999.99;
const MAX_INT = 2147483647;

// What a save may write, checked against the recipe form's input (`recipeInputFromForm`); a field
// error shows Zod's own message next to the field. Ingredients are plain lines. `image_path` and
// `source_url` are accepted but never trusted: createRecipe keeps each only as an external http(s)
// URL (an imported draft's photo and page), and an update ignores both — the photo action owns
// `image_path`, and the source never changes.
export const RecipeBodySchema = z.object({
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	image_path: z.string().nullable().optional(),
	source_url: z.string().nullable().optional(),
	// The columns are integers: 2.5 is a field error here rather than a failure in Postgres.
	prep_time_minutes: z.number().int().max(MAX_INT).nullable().optional(),
	cook_time_minutes: z.number().int().max(MAX_INT).nullable().optional(),
	total_time_minutes: z.number().int().max(MAX_INT).nullable().optional(),
	servings: z.number().positive(),
	// Per single serving. kcal for calories, grams for the rest.
	calories: z.number().nonnegative().max(MAX_NUTRITION).nullable().optional(),
	fat_content: z.number().nonnegative().max(MAX_NUTRITION).nullable().optional(),
	carbohydrate_content: z.number().nonnegative().max(MAX_NUTRITION).nullable().optional(),
	protein_content: z.number().nonnegative().max(MAX_NUTRITION).nullable().optional(),
	ingredients: z.array(z.string()),
	instructions: z.array(
		z.object({ step_number: z.number().int().positive().max(MAX_INT), text: z.string() })
	),
	tags: z.array(z.string()),
	category: z.string().nullable()
});

export type RecipeBody = z.infer<typeof RecipeBodySchema>;
