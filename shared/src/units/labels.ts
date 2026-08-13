import type { SupportedLocale } from '../locale.js';
import { SUPPORTED_LOCALES } from '../locale.js';
import type { UnitCode } from './unit-model.js';

/** A unit word. Metric symbols and abbreviations never inflect in any of the four languages. */
export type UnitLabel = string | { one: string; other: string };

/**
 * Metric symbols are locale-invariant; only the imperial and spoon words translate. Several cells
 * here are deliberately NOT the natural-sounding translation, because the natural word means
 * something else:
 *
 * - nl `ons` is 100 g, a live everyday Dutch unit ("twee ons kaas"). Rendering `oz` as `ons` would
 *   be a 3.5x error, so Dutch keeps `oz`.
 * - nl `pond` is 500 g and fr `livre` is about 500 g — same trap, roughly 10% off. Both keep `lb`.
 * - nl has no correct word for a US cup: `kopje` is a teacup (~125-150 ml) and `beker` a mug.
 *   Dutch and Flemish food writing uses the English loanword, so `cup` it is. This is the one cell
 *   where the language genuinely has no native form.
 * - nl `duim` (inch) is archaic in cooking; Dutch recipes write `inch`.
 */
export const UNIT_LABELS: Record<SupportedLocale, Record<UnitCode, UnitLabel>> = {
  en: {
    g: 'g',
    kg: 'kg',
    oz: 'oz',
    lb: 'lb',
    stick: { one: 'stick', other: 'sticks' },
    ml: 'ml',
    l: 'l',
    tsp: 'tsp',
    tbsp: 'tbsp',
    cup: { one: 'cup', other: 'cups' },
    fl_oz: 'fl oz',
    pt: { one: 'pint', other: 'pints' },
    qt: { one: 'quart', other: 'quarts' },
    gal: { one: 'gallon', other: 'gallons' },
    cm: 'cm',
    in: { one: 'inch', other: 'inches' },
  },
  nl: {
    g: 'g',
    kg: 'kg',
    oz: 'oz',
    lb: 'lb',
    stick: { one: 'stick', other: 'sticks' },
    ml: 'ml',
    l: 'l',
    tsp: 'tl',
    tbsp: 'el',
    cup: { one: 'cup', other: 'cups' },
    fl_oz: 'fl oz',
    pt: { one: 'pint', other: 'pints' },
    qt: { one: 'quart', other: 'quarts' },
    gal: { one: 'gallon', other: 'gallons' },
    cm: 'cm',
    in: 'inch',
  },
  fr: {
    g: 'g',
    kg: 'kg',
    oz: 'oz',
    lb: 'lb',
    stick: { one: 'plaquette', other: 'plaquettes' },
    ml: 'ml',
    l: 'l',
    tsp: 'c. à c.',
    tbsp: 'c. à s.',
    cup: { one: 'tasse', other: 'tasses' },
    fl_oz: 'fl oz',
    pt: { one: 'pinte', other: 'pintes' },
    qt: { one: 'quart', other: 'quarts' },
    gal: { one: 'gallon', other: 'gallons' },
    cm: 'cm',
    in: { one: 'pouce', other: 'pouces' },
  },
  es: {
    g: 'g',
    kg: 'kg',
    oz: 'oz',
    lb: 'lb',
    stick: { one: 'barra', other: 'barras' },
    ml: 'ml',
    l: 'l',
    tsp: 'cdta',
    tbsp: 'cda',
    cup: { one: 'taza', other: 'tazas' },
    fl_oz: 'fl oz',
    pt: { one: 'pinta', other: 'pintas' },
    qt: { one: 'cuarto', other: 'cuartos' },
    gal: { one: 'galón', other: 'galones' },
    cm: 'cm',
    in: { one: 'pulgada', other: 'pulgadas' },
  },
};

/**
 * Plural iff the count is greater than one. English recipe convention is "1/2 cup", not
 * "0.5 cups", and French and Spanish agree; the naive `n !== 1` test gets every fractional
 * quantity wrong.
 */
export function unitLabel(
  unit: UnitCode,
  locale: SupportedLocale,
  quantity: number | null
): string {
  const label = UNIT_LABELS[locale][unit];
  if (typeof label === 'string') return label;
  return quantity !== null && quantity > 1 ? label.other : label.one;
}

interface SynonymEntry {
  token: string;
  code: UnitCode;
  /** `core` tokens are recognised regardless of locale: metric symbols, which are the same
   *  everywhere, and English imperial words, which are what a model leaks whatever language it is
   *  writing in. Locale-scoped tokens are only recognised when that locale is active. */
  scope: 'core' | SupportedLocale;
}

function entries(
  code: UnitCode,
  scope: SynonymEntry['scope'],
  ...tokens: string[]
): SynonymEntry[] {
  return tokens.map((token) => ({ token, code, scope }));
}

const UNIT_SYNONYM_ENTRIES: SynonymEntry[] = [
  ...entries('g', 'core', 'g', 'gr', 'gram', 'grams', 'gramme', 'grammes'),
  ...entries('g', 'es', 'gramo', 'gramos'),
  ...entries('kg', 'core', 'kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'),
  ...entries('kg', 'fr', 'kilogramme', 'kilogrammes'),
  ...entries('kg', 'es', 'kilogramo', 'kilogramos'),

  ...entries('oz', 'core', 'oz', 'ozs', 'ounce', 'ounces'),
  ...entries('lb', 'core', 'lb', 'lbs', 'pound', 'pounds'),
  ...entries('stick', 'core', 'stick', 'sticks'),

  ...entries('ml', 'core', 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'),
  ...entries('ml', 'es', 'mililitro', 'mililitros'),
  ...entries('l', 'core', 'l', 'liter', 'liters', 'litre', 'litres'),
  ...entries('l', 'es', 'litro', 'litros'),

  ...entries('tsp', 'core', 'tsp', 'tsps', 'teaspoon', 'teaspoons'),
  ...entries('tsp', 'nl', 'tl', 'theelepel', 'theelepels'),
  ...entries('tsp', 'fr', 'c. à c.', 'càc', 'cuillère à café', 'cuillères à café'),
  ...entries('tsp', 'es', 'cdta', 'cucharadita', 'cucharaditas'),

  ...entries('tbsp', 'core', 'tbsp', 'tbsps', 'tbs', 'tablespoon', 'tablespoons'),
  ...entries('tbsp', 'nl', 'el', 'eetlepel', 'eetlepels'),
  ...entries('tbsp', 'fr', 'c. à s.', 'càs', 'cuillère à soupe', 'cuillères à soupe'),
  ...entries('tbsp', 'es', 'cda', 'cucharada', 'cucharadas'),

  ...entries('cup', 'core', 'cup', 'cups'),
  ...entries('cup', 'fr', 'tasse', 'tasses'),
  ...entries('cup', 'es', 'taza', 'tazas'),

  ...entries('fl_oz', 'core', 'fl oz', 'fl. oz', 'fl.oz', 'fluid ounce', 'fluid ounces'),
  ...entries('pt', 'core', 'pint', 'pints'),
  ...entries('qt', 'core', 'quart', 'quarts'),
  ...entries('gal', 'core', 'gallon', 'gallons'),

  ...entries('cm', 'core', 'cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'),
  ...entries('cm', 'es', 'centímetro', 'centímetros'),
  ...entries('in', 'core', 'inch', 'inches'),
  ...entries('in', 'fr', 'pouce', 'pouces'),
  ...entries('in', 'es', 'pulgada', 'pulgadas'),
];

/**
 * Words that name a portion rather than a measurement. We recognise them so the ingredient parser
 * can fill the `unit` column in every language instead of swallowing the word into the name, but
 * there is nothing to convert, so they are deliberately absent from the model's enum: the model
 * writes "2 teentjes look" with the noun already in the reader's language, for free.
 */
export const CULINARY_UNIT_WORDS: string[] = [
  'mg',
  'clove',
  'cloves',
  'teentje',
  'teentjes',
  'gousse',
  'gousses',
  'diente',
  'dientes',
  'pinch',
  'pinches',
  'snuifje',
  'snuifjes',
  'pincée',
  'pincées',
  'pizca',
  'pizcas',
  'dash',
  'dashes',
  'scheutje',
  'scheutjes',
  'trait',
  'traits',
  'chorrito',
  'chorritos',
  'sprig',
  'sprigs',
  'takje',
  'takjes',
  'brin',
  'brins',
  'ramita',
  'ramitas',
  'bunch',
  'bunches',
  'bosje',
  'bosjes',
  'bouquet',
  'bouquets',
  'manojo',
  'manojos',
  'can',
  'cans',
  'blik',
  'blikken',
  'boîte',
  'boîtes',
  'lata',
  'latas',
  'package',
  'packages',
  'pack',
  'packs',
  'pkg',
  'pakje',
  'pakjes',
  'paquet',
  'paquets',
  'paquete',
  'paquetes',
  'slice',
  'slices',
  'sneetje',
  'sneetjes',
  'tranche',
  'tranches',
  'rebanada',
  'rebanadas',
  'piece',
  'pieces',
  'stuk',
  'stuks',
  'stukken',
  'morceau',
  'morceaux',
  'pieza',
  'piezas',
  'head',
  'heads',
  'krop',
  'kroppen',
  'tête',
  'têtes',
  'cabeza',
  'cabezas',
  'stalk',
  'stalks',
  'stengel',
  'stengels',
  'tige',
  'tiges',
  'tallo',
  'tallos',
  'handful',
  'handfuls',
  'handvol',
  'poignée',
  'poignées',
  'puñado',
  'puñados',
  'drop',
  'drops',
  'druppel',
  'druppels',
  'goutte',
  'gouttes',
  'gota',
  'gotas',
  'sheet',
  'sheets',
  'vel',
  'vellen',
  'feuille',
  'feuilles',
  'hoja',
  'hojas',
];

/**
 * Words a unit lexicon must never claim, each an observed or obvious false positive:
 *
 *   in       English preposition — "cut in half", "stir in the flour"
 *   c        collides with French "c." (cuillère) and is meaningless alone
 *   t / T    US shorthand for tsp/tbsp; catastrophic against ordinary prose
 *   ons      Dutch for 100 g, not an ounce
 *   pond     Dutch for 500 g / livre French for ~500 g, not a pound
 *
 * They are simply absent from the tables above; this list exists so tests can assert the absence
 * rather than trusting that nobody adds them later.
 */
export const AMBIGUOUS_NON_UNITS = ['in', 'c', 't', 'ons', 'pond', 'livre', 'libra'];

/** Every unit word we recognise anywhere, mapped to its code. Culinary words map to `null`. */
export const RECOGNIZED_UNITS: Map<string, UnitCode | null> = new Map([
  ...UNIT_SYNONYM_ENTRIES.map((entry) => [entry.token, entry.code] as [string, UnitCode | null]),
  ...SUPPORTED_LOCALES.flatMap((locale) =>
    Object.entries(UNIT_LABELS[locale]).flatMap(([code, label]) =>
      (typeof label === 'string' ? [label] : [label.one, label.other]).map(
        (token) => [token.toLowerCase(), code as UnitCode] as [string, UnitCode | null]
      )
    )
  ),
  ...CULINARY_UNIT_WORDS.map((word) => [word, null] as [string, UnitCode | null]),
]);

/** Convertible unit words visible to the instruction-text pass for a given locale. */
export function textUnitLookup(locale: SupportedLocale): Map<string, UnitCode> {
  const lookup = new Map<string, UnitCode>();
  for (const entry of UNIT_SYNONYM_ENTRIES) {
    if (entry.scope === 'core' || entry.scope === locale) lookup.set(entry.token, entry.code);
  }
  for (const [code, label] of Object.entries(UNIT_LABELS[locale])) {
    for (const token of typeof label === 'string' ? [label] : [label.one, label.other]) {
      lookup.set(token.toLowerCase(), code as UnitCode);
    }
  }
  return lookup;
}

/** Longest token first, so "fl oz" wins over "oz" and "cuillère à soupe" over "cuillère". */
export function tokensByLengthDesc(tokens: Iterable<string>): string[] {
  return [...tokens].sort((a, b) => b.length - a.length || a.localeCompare(b));
}
