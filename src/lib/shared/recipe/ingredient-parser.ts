import { parseMeasurementPrefix } from '#lib/shared/units/parse.ts';

interface ParsedIngredient {
	raw_text: string;
	amount: number | null;
	unit: string | null;
	name: string;
	is_scalable: boolean;
}

// Distinct precision from the renderer's culinary rounding, which is aimed at display: scaling a
// recipe by an odd servings ratio needs sub-1 precision to stay accurate across repeated scaling.
function roundParsedAmount(amount: number): number {
	return Math.round(amount * 1000) / 1000;
}

function stripLeadingOf(text: string): string {
	return text.replace(/^[\s,.;]*(?:(?:of|van|de)\s+|d')/i, '');
}

function unparsed(rawText: string): ParsedIngredient {
	return { raw_text: rawText, amount: null, unit: null, name: rawText, is_scalable: false };
}

/**
 * Splits a written ingredient line into the columns the database stores. The unit vocabulary is
 * the same registry the unit converter uses, so "2 c. à s." and "2 el" parse as well as "2 tbsp".
 */
export function parseIngredientLine(rawText: string): ParsedIngredient {
	const trimmed = rawText.trim();
	if (!trimmed) return unparsed(rawText);

	const parsed = parseMeasurementPrefix(trimmed);
	if (parsed.quantity === null) return unparsed(rawText);

	return {
		raw_text: rawText,
		amount: roundParsedAmount(parsed.quantity),
		unit: parsed.unitWord,
		name: stripLeadingOf(parsed.rest).trim() || rawText,
		is_scalable: true
	};
}
