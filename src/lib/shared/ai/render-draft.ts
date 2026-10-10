import type { AiRecipeDraft } from '#lib/shared/ai/recipe-draft.ts';
import type { SupportedLocale } from '#lib/shared/i18n/locale.ts';
import { renderIngredientLine } from '#lib/shared/units/format.ts';
import type { SmallVolumeStyle } from '#lib/shared/units/small-volumes.ts';
import { convertTextUnits } from '#lib/shared/units/text.ts';
import type { UnitSystem } from '#lib/shared/units/unit-system.ts';

export interface ReaderPreferences {
	locale: SupportedLocale;
	unitSystem: UnitSystem;
	smallVolumes: SmallVolumeStyle;
}

/**
 * Redraws a draft in the reader's current measurement preferences, without asking the server:
 * `ingredients_structured` holds the amounts in metric exactly as the model wrote them, so a
 * changed preference shows in the preview at once rather than on the next reply.
 *
 * A draft without structured ingredients (improve mode, seeded from a saved recipe) is returned
 * untouched, shown as it was saved.
 */
export function renderDraftForReader(
	draft: AiRecipeDraft | null,
	preferences: ReaderPreferences
): AiRecipeDraft | null {
	if (!draft?.ingredients_structured?.length) return draft;

	const { locale, unitSystem, smallVolumes } = preferences;

	return {
		...draft,
		ingredients: draft.ingredients_structured.map((ingredient) =>
			renderIngredientLine(ingredient, { locale, unitSystem, smallVolumes })
		),
		// Steps have no canonical copy, so this converts from whatever they say now. Temperatures and
		// tin sizes round-trip exactly; a repeated weight can shift a rounding band, which is why the
		// prompt asks the model to name ingredients in steps rather than repeat their amounts.
		instructions: draft.instructions.map((step) => ({
			...step,
			text: convertTextUnits(step.text, unitSystem, locale, smallVolumes)
		}))
	};
}
