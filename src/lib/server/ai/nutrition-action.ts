import { fail, type RequestEvent } from '@sveltejs/kit';
import * as z from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { requireUser } from '#lib/server/auth/guards.ts';
import { failKinded } from '#lib/server/http/kinded-errors.ts';
import { assertGeminiQuota } from '#lib/server/ai/budget.ts';
import { chatWithAi } from '#lib/server/ai/provider.ts';
import {
	AI_NUTRITION_JSON_SCHEMA,
	buildNutritionMessages,
	NUTRITION_SAMPLING,
	parseNutritionEstimate
} from '#lib/shared/ai/nutrition.ts';
import { parseModelAnswer } from '#lib/server/ai/errors.ts';
import { formStateFromFormData, nutritionRequestFromForm } from '#lib/shared/recipe/form.ts';

/**
 * Bounds exist to cap the prompt rather than to police the cook: the form disables the button
 * until there is a title and an ingredient, since a recipe with nothing in it has no nutrition to
 * estimate.
 */
const NutritionRequestSchema = z.object({
	title: z.string().min(1).max(200),
	description: z.string().max(2000).nullable(),
	servings: z.number().positive().max(100),
	ingredients: z.array(z.string().min(1).max(300)).min(1).max(100),
	instructions: z.array(z.string().min(1).max(2000)).max(100)
});

/**
 * The recipe form's "Estimate with AI": the four per-serving values for whatever the form holds
 * right now, saved or not. Mounted as `?/estimateNutrition` on the new and edit pages.
 *
 * The form posts its fields here from a plain button (a second submit button would become the
 * form's default, run by Enter in any field) and merges the estimate into what the cook typed.
 */
export async function estimateNutrition(event: RequestEvent) {
	const { user } = requireUser(event);
	try {
		// Before the body is read: a spent quota refuses without looking at the request.
		await assertGeminiQuota();

		const values = formStateFromFormData(await event.request.formData());
		const parsed = NutritionRequestSchema.safeParse(nutritionRequestFromForm(values));
		if (!parsed.success) return fail(400, { message: m.common_something_went_wrong() });

		const raw = await chatWithAi(buildNutritionMessages(parsed.data), {
			userId: user.id,
			jsonSchema: AI_NUTRITION_JSON_SCHEMA,
			sampling: NUTRITION_SAMPLING,
			// Always the cheap tier: this measures a recipe already in hand rather than inventing one,
			// which is exactly the case the small model exists for.
			tier: 'small'
		});
		return { estimate: parseModelAnswer(() => parseNutritionEstimate(raw)) };
	} catch (err) {
		return failKinded(err);
	}
}
