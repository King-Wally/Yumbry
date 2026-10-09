import * as z from 'zod';

// What a save may write, checked against the recipe form's input (`recipeInputFromForm`); a field
// error shows Zod's own message next to the field. Ingredients are plain lines. `image_path` is
// accepted but never trusted: createRecipe keeps it only as an external http(s) URL (an imported
// draft's photo), and an update ignores it — the photo action owns that column.
export const RecipeBodySchema = z.object({
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	image_path: z.string().nullable().optional(),
	// The columns are integers: 2.5 is a field error here rather than a failure in Postgres.
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
