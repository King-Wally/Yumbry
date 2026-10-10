import type { UnitSystem } from '#lib/shared/units/unit-system.ts';

export type Dimension = 'mass' | 'volume' | 'length';

export type UnitCode =
	// mass
	| 'g'
	| 'kg'
	| 'oz'
	| 'lb'
	| 'stick'
	// volume
	| 'ml'
	| 'l'
	| 'tsp'
	| 'tbsp'
	| 'cup'
	| 'fl_oz'
	| 'pt'
	| 'qt'
	| 'gal'
	// length
	| 'cm'
	| 'in';

interface UnitMeta {
	dimension: Dimension;
	/** How many base units one of this unit is. Base units: g (mass), ml (volume), cm (length). */
	base: number;
	/** Which system this unit renders in. `'both'` units are written identically in either. */
	system: UnitSystem | 'both';
}

/**
 * Volume uses the culinary set, an integer-millilitre ladder (3 tsp = 1 tbsp, 2 tbsp = 1 fl oz,
 * 8 fl oz = 1 cup = 240 ml): US customary's 236.588 ml/cup prints numbers no cookbook uses.
 *
 * Mass and length use the exact definitions. The rounding bands produce the round numbers anyway
 * (1 lb = 453.6 g snaps to 450 g), and an approximated factor would compound on larger amounts.
 */
export const UNIT_META: Record<UnitCode, UnitMeta> = {
	g: { dimension: 'mass', base: 1, system: 'metric' },
	kg: { dimension: 'mass', base: 1000, system: 'metric' },
	oz: { dimension: 'mass', base: 28.349523125, system: 'imperial' },
	lb: { dimension: 'mass', base: 453.59237, system: 'imperial' },
	// A US stick of butter is defined as 4 oz. Recognised so "1 stick butter" converts instead of
	// silently surviving into a metric recipe; never rendered.
	stick: { dimension: 'mass', base: 113.3980925, system: 'imperial' },

	ml: { dimension: 'volume', base: 1, system: 'metric' },
	l: { dimension: 'volume', base: 1000, system: 'metric' },
	tsp: { dimension: 'volume', base: 5, system: 'both' },
	tbsp: { dimension: 'volume', base: 15, system: 'both' },
	cup: { dimension: 'volume', base: 240, system: 'imperial' },
	fl_oz: { dimension: 'volume', base: 30, system: 'imperial' },
	pt: { dimension: 'volume', base: 480, system: 'imperial' },
	qt: { dimension: 'volume', base: 960, system: 'imperial' },
	gal: { dimension: 'volume', base: 3840, system: 'imperial' },

	cm: { dimension: 'length', base: 1, system: 'metric' },
	in: { dimension: 'length', base: 2.54, system: 'imperial' }
};

export function isUnitCode(value: unknown): value is UnitCode {
	return typeof value === 'string' && Object.prototype.hasOwnProperty.call(UNIT_META, value);
}

export function toBase(value: number, unit: UnitCode): number {
	return value * UNIT_META[unit].base;
}

export function fromBase(base: number, unit: UnitCode): number {
	return base / UNIT_META[unit].base;
}

/**
 * The only unit values the AI model may emit. Choosing kg over g, spoons or cups, and spelling the
 * unit in the reader's language all depend on the reader's unit system, which the model is never
 * told; we do that when rendering. `''` covers anything counted whole ("2 eggs").
 *
 * `''` rather than `null`: a nullable enum is a type union in strict JSON Schema, which Gemini's
 * OpenAI-compatible endpoint is the most likely to mangle.
 */
export const MODEL_UNIT_ENUM = ['g', 'ml', 'cm', ''] as const;

export type ModelUnit = (typeof MODEL_UNIT_ENUM)[number];
