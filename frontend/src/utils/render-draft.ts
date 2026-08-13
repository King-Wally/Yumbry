import {
  convertTextUnits,
  renderIngredientLine,
  type SmallVolumeStyle,
  type SupportedLocale,
  type UnitSystem,
} from 'yumbry-shared';
import type { AiRecipeDraft } from '../types';

export interface ReaderPreferences {
  locale: SupportedLocale;
  unitSystem: UnitSystem;
  smallVolumes: SmallVolumeStyle;
}

/**
 * Redraws a draft in the reader's current measurement preferences, without asking the server.
 *
 * This is what the canonical side-channel was for: `ingredients_structured` holds the amounts in
 * metric exactly as the model wrote them, so changing a preference can redraw the preview
 * immediately instead of leaving a control that appears to do nothing until the next reply.
 *
 * Returns the draft untouched when there is no canonical data to redraw from — an improve-mode
 * draft seeded straight from a saved recipe, which is deliberately shown as it was saved.
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
    // Instruction prose has no canonical copy — it is stored as it was last rendered — so this
    // converts from whatever it currently says. Temperatures and tin sizes round-trip exactly;
    // a weight repeated in a step can shift by one rounding band, which is why the prompt asks
    // the model to name ingredients in steps rather than repeat their amounts.
    instructions: draft.instructions.map((step) => ({
      ...step,
      text: convertTextUnits(step.text, unitSystem, locale, smallVolumes),
    })),
  };
}
