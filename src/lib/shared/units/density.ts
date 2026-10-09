/**
 * Densities for the ingredients American cooks measure by volume rather than by weight.
 *
 * The model picks a key from this fixed English enum rather than us matching ingredient names,
 * which it writes in the reader's language ("bloem", "farine T55", ...). Every failure degrades to
 * weight: `none`, an unknown key, a non-mass unit or an implausibly small result all fall back to
 * ounces, which is always correct, merely less idiomatic.
 */
export const DENSITY_KEYS = [
	'none',
	'flour',
	'sugar_granulated',
	'sugar_brown',
	'sugar_powdered',
	'butter',
	'rice',
	'oats',
	'cocoa',
	'breadcrumbs',
	'cheese_grated',
	'nuts_chopped',
	'chocolate_chips',
	'honey_syrup',
	'liquid'
] as const;

export type DensityKey = (typeof DENSITY_KEYS)[number];

/**
 * Grams per US cup (240 ml).
 *
 * Flour is the contested entry: 120 g/cup spooned to 145 g/cup scooped is the most-argued number
 * in American baking. 125 is the spooned-and-levelled convention, which is what a recipe written
 * in grams assumes.
 */
const GRAMS_PER_CUP: Record<Exclude<DensityKey, 'none'>, number> = {
	flour: 125,
	sugar_granulated: 200,
	sugar_brown: 220,
	sugar_powdered: 120,
	butter: 227,
	rice: 185,
	oats: 90,
	cocoa: 85,
	breadcrumbs: 108,
	cheese_grated: 100,
	nuts_chopped: 120,
	chocolate_chips: 170,
	honey_syrup: 340,
	liquid: 240
};

export function isDensityKey(value: unknown): value is DensityKey {
	return typeof value === 'string' && (DENSITY_KEYS as readonly string[]).includes(value);
}

/** Millilitres that `grams` of this ingredient occupies, or null when we have no basis to say. */
export function gramsToMillilitres(grams: number, key: DensityKey): number | null {
	if (key === 'none') return null;
	return (grams / GRAMS_PER_CUP[key]) * 240;
}
