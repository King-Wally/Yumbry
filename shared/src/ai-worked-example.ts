import type { SupportedLocale } from './locale.js';
import type { DensityKey } from './units/density.js';
import type { ModelUnit } from './units/unit-model.js';

/**
 * The worked example shown at the end of the system prompt.
 *
 * One structural fixture plus a table of translated strings, assembled by code — not four
 * hand-maintained JSON blobs. The point is testability: because the example is built rather than
 * written, CI can assert that it validates against `AI_ENVELOPE_JSON_SCHEMA` and survives our own
 * `parseChatEnvelope`, in every locale. Four static blobs cannot be kept honest that way, and a
 * stale example is worse than no example at all — a model copies the example over the spec
 * whenever the two disagree.
 *
 * The dish is chosen to exercise every part of the contract in one artefact: something counted
 * whole, a plain weight, a weight a cook could also measure by the cupful, a spooned volume, an
 * ingredient with no quantity, both a filled and an absent note, an oven temperature in °C, and
 * plain imperative steps.
 *
 * Its tags carry exactly one of each kind the field notes list — protein, cuisine, dietary
 * restriction, cooking method — so the example demonstrates the mapping rather than merely showing
 * four plausible words. Each is true of this dish; nothing in it contains wheat, so the dietary
 * tag is a fact rather than a guess, which is the habit worth teaching.
 */
interface ExampleIngredient {
  quantity: number | null;
  unit: ModelUnit;
  density_key: DensityKey;
  /** Index into the locale's `notes`, or null for an ingredient that needs none. */
  note: number | null;
}

const EXAMPLE_INGREDIENTS: ExampleIngredient[] = [
  { quantity: 8, unit: '', density_key: 'none', note: null },
  { quantity: 400, unit: 'g', density_key: 'none', note: 0 },
  { quantity: 3, unit: '', density_key: 'none', note: 1 },
  { quantity: 30, unit: 'ml', density_key: 'none', note: null },
  { quantity: 5, unit: 'ml', density_key: 'none', note: null },
  { quantity: 40, unit: 'g', density_key: 'cheese_grated', note: null },
  { quantity: null, unit: '', density_key: 'none', note: 2 },
];

const EXAMPLE_TIMES = {
  servings: 4,
  prep_time_minutes: 10,
  cook_time_minutes: 45,
  total_time_minutes: 55,
};

interface ExampleText {
  title: string;
  description: string;
  category: string;
  tags: string[];
  /** One per entry in EXAMPLE_INGREDIENTS, in the same order. */
  items: string[];
  /** Referenced by index from `ExampleIngredient.note`. */
  notes: string[];
  steps: string[];
  reply: string;
}

const EXAMPLE_TEXT: Record<SupportedLocale, ExampleText> = {
  en: {
    title: 'Oven-roasted chicken thighs with tomatoes',
    description: 'Chicken thighs and cherry tomatoes roasted together in one dish.',
    category: 'Main course',
    tags: ['chicken', 'mediterranean', 'gluten-free', 'roasted'],
    items: [
      'chicken thighs',
      'cherry tomatoes',
      'garlic cloves',
      'olive oil',
      'dried oregano',
      'grated parmesan',
      'salt',
    ],
    notes: ['halved', 'crushed', 'to taste'],
    steps: [
      'Heat the oven to 200 °C.',
      'Put the chicken thighs skin side up in a large baking dish.',
      'Scatter the tomatoes and the garlic around them and pour over the olive oil.',
      'Sprinkle with the oregano and the salt.',
      'Roast for 40 minutes, until the skin is crisp.',
      'Scatter the parmesan over and return it to the oven for 5 minutes.',
    ],
    reply:
      "Here's a simple one-dish roast with chicken thighs and cherry tomatoes. Tell me if you'd like it spicier.",
  },
  nl: {
    title: 'Kippendijen uit de oven met tomaten',
    description: 'Kippendijen en kerstomaten samen geroosterd in één schaal.',
    category: 'Hoofdgerecht',
    tags: ['kip', 'mediterraans', 'glutenvrij', 'geroosterd'],
    items: [
      'kippendijen',
      'kerstomaten',
      'teentjes look',
      'olijfolie',
      'gedroogde oregano',
      'geraspte parmezaan',
      'zout',
    ],
    notes: ['gehalveerd', 'geplet', 'naar smaak'],
    steps: [
      'Verwarm de oven voor op 200 °C.',
      'Leg de kippendijen met het vel naar boven in een grote ovenschaal.',
      'Verdeel de tomaten en de look eromheen en giet er de olijfolie over.',
      'Bestrooi met de oregano en het zout.',
      'Rooster 40 minuten, tot het vel krokant is.',
      'Strooi de parmezaan erover en zet nog 5 minuten in de oven.',
    ],
    reply:
      'Dit is een eenvoudig ovengerecht met kippendijen en kerstomaten. Zeg gerust als je het pittiger wil.',
  },
  fr: {
    title: 'Cuisses de poulet rôties aux tomates',
    description: 'Des cuisses de poulet et des tomates cerises rôties ensemble dans un seul plat.',
    category: 'Plat principal',
    tags: ['poulet', 'méditerranéen', 'sans gluten', 'rôti'],
    items: [
      'cuisses de poulet',
      'tomates cerises',
      "gousses d'ail",
      "huile d'olive",
      'origan séché',
      'parmesan râpé',
      'sel',
    ],
    notes: ['coupées en deux', 'écrasées', 'selon le goût'],
    steps: [
      'Préchauffez le four à 200 °C.',
      'Disposez les cuisses de poulet peau vers le haut dans un grand plat.',
      "Répartissez les tomates et l'ail autour et arrosez d'huile d'olive.",
      "Parsemez d'origan et de sel.",
      "Faites rôtir 40 minutes, jusqu'à ce que la peau soit croustillante.",
      'Parsemez de parmesan et remettez au four 5 minutes.',
    ],
    reply:
      'Voici un plat au four tout simple avec des cuisses de poulet et des tomates cerises. Dites-moi si vous le voulez plus relevé.',
  },
  es: {
    title: 'Muslos de pollo asados con tomates',
    description: 'Muslos de pollo y tomates cherry asados juntos en una sola fuente.',
    category: 'Plato principal',
    tags: ['pollo', 'mediterráneo', 'sin gluten', 'asado'],
    items: [
      'muslos de pollo',
      'tomates cherry',
      'dientes de ajo',
      'aceite de oliva',
      'orégano seco',
      'parmesano rallado',
      'sal',
    ],
    notes: ['cortados por la mitad', 'machacados', 'al gusto'],
    steps: [
      'Precalienta el horno a 200 °C.',
      'Coloca los muslos de pollo con la piel hacia arriba en una fuente grande.',
      'Reparte los tomates y el ajo alrededor y riega con el aceite de oliva.',
      'Espolvorea el orégano y la sal.',
      'Asa 40 minutos, hasta que la piel esté crujiente.',
      'Espolvorea el parmesano y vuelve a meterlo al horno 5 minutos.',
    ],
    reply:
      'Aquí tienes un plato al horno muy sencillo con muslos de pollo y tomates cherry. Dime si lo quieres más picante.',
  },
};

/** The example as a plain object, in exactly the key order the contract asks for. */
export function workedExample(locale: SupportedLocale): Record<string, unknown> {
  const text = EXAMPLE_TEXT[locale];

  return {
    recipe: {
      title: text.title,
      description: text.description,
      servings: EXAMPLE_TIMES.servings,
      prep_time_minutes: EXAMPLE_TIMES.prep_time_minutes,
      cook_time_minutes: EXAMPLE_TIMES.cook_time_minutes,
      total_time_minutes: EXAMPLE_TIMES.total_time_minutes,
      category: text.category,
      tags: text.tags,
      ingredients: EXAMPLE_INGREDIENTS.map((ingredient, index) => ({
        item: text.items[index],
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        note: ingredient.note === null ? null : text.notes[ingredient.note],
        density_key: ingredient.density_key,
      })),
      instructions: text.steps,
    },
    reply: text.reply,
  };
}

export function workedExampleJson(locale: SupportedLocale): string {
  return JSON.stringify(workedExample(locale), null, 2);
}

/** Exposed so a test can assert that no locale's example leaks the English strings. */
export const WORKED_EXAMPLE_TEXT = EXAMPLE_TEXT;
