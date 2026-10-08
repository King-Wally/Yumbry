import * as z from 'zod';
import { isDensityKey } from '#lib/shared/units/density.ts';

// What the chat page posts back each turn: the transcript so far and the draft on screen. Both
// came from this server on an earlier turn, but they travel through the browser, so they are
// checked like any other input. Main's schema, with bounds added so a forged transcript can't make
// the prompt arbitrarily large.

const MAX_TEXT = 4000;

export const AiRecipeDraftSchema = z.object({
	title: z.string().max(500),
	description: z.string().max(MAX_TEXT).nullable(),
	image_path: z.string().max(2000).nullable(),
	prep_time_minutes: z.number().nullable(),
	cook_time_minutes: z.number().nullable(),
	total_time_minutes: z.number().nullable(),
	servings: z.number(),
	// Defaulted rather than required: a draft seeded before these fields existed still validates.
	calories: z.number().nullish().default(null),
	fat_content: z.number().nullish().default(null),
	carbohydrate_content: z.number().nullish().default(null),
	protein_content: z.number().nullish().default(null),
	ingredients: z.array(z.string().max(MAX_TEXT)).max(200),
	instructions: z
		.array(z.object({ step_number: z.number(), text: z.string().max(MAX_TEXT) }))
		.max(200),
	tags: z.array(z.string().max(200)).max(50),
	category: z.string().max(200).nullable(),
	// Absent on a draft seeded from a saved recipe (improve mode). An unknown density key is
	// tolerated as 'none' rather than refused: it only loses a cup conversion.
	ingredients_structured: z
		.array(
			z.object({
				item: z.string().max(MAX_TEXT),
				quantity: z.number().nullable(),
				unit: z.string().max(50),
				note: z.string().max(MAX_TEXT).nullable(),
				density_key: z.string().transform((value) => (isDensityKey(value) ? value : 'none'))
			})
		)
		.max(200)
		.optional()
});

export const AiTranscriptSchema = z
	.array(
		z.object({
			role: z.enum(['user', 'assistant']),
			content: z.string().min(1).max(MAX_TEXT)
		})
	)
	.max(100);

/** The cook's new message. */
export const AiChatMessageSchema = z.string().trim().min(1).max(MAX_TEXT);
