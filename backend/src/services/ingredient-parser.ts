import { parseIngredient } from 'parse-ingredient';

export interface ParsedIngredient {
  raw_text: string;
  amount: number | null;
  unit: string | null;
  name: string;
  is_scalable: boolean;
}

/**
 * Parses a single raw ingredient line into structured amount/unit/name fields.
 * Never throws: unparseable lines fall back to the raw text with amount: null
 * and is_scalable: false, per the import spec.
 */
export function parseIngredientLine(rawText: string): ParsedIngredient {
  const [parsed] = parseIngredient(rawText);

  if (!parsed) {
    return {
      raw_text: rawText,
      amount: null,
      unit: null,
      name: rawText,
      is_scalable: false,
    };
  }

  const { quantity, unitOfMeasure, description, isGroupHeader } = parsed;

  return {
    raw_text: rawText,
    amount: quantity,
    unit: unitOfMeasure ?? null,
    name: description && description.length > 0 ? description : rawText,
    is_scalable: quantity !== null && !isGroupHeader,
  };
}
