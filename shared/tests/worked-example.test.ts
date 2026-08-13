import { describe, expect, it } from 'vitest';
import {
  AI_ENVELOPE_JSON_SCHEMA,
  buildChatMessages,
  parseChatEnvelope,
} from '../src/ai-recipe-draft.js';
import { workedExample, workedExampleJson, WORKED_EXAMPLE_TEXT } from '../src/ai-worked-example.js';
import { SUPPORTED_LOCALES, type SupportedLocale } from '../src/locale.js';
import { DENSITY_KEYS } from '../src/units/density.js';
import { MODEL_UNIT_ENUM } from '../src/units/unit-model.js';

/**
 * The example the model is shown is the most-copied artefact in the whole prompt, so a stale one
 * is worse than none at all — the model follows the example over the spec whenever they disagree.
 * Generating it from a fixture is what makes these checks possible; four hand-written JSON blobs
 * could not be kept honest this way.
 */

interface SchemaNode {
  type?: unknown;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  items?: SchemaNode;
  enum?: unknown[];
}

/** A small structural validator — enough for a schema this shape, without adding a dependency. */
function validate(node: SchemaNode, value: unknown, path = 'recipe'): string[] {
  const types = (Array.isArray(node.type) ? node.type : [node.type]) as string[];
  const actual =
    value === null
      ? 'null'
      : Array.isArray(value)
        ? 'array'
        : Number.isInteger(value)
          ? 'integer'
          : typeof value;

  const matches = types.some(
    (type) => type === actual || (type === 'number' && actual === 'integer')
  );
  if (!matches) return [`${path}: expected ${types.join('|')}, got ${actual}`];
  if (value === null) return [];

  if (actual === 'array') {
    return (value as unknown[]).flatMap((entry, index) =>
      node.items ? validate(node.items, entry, `${path}[${index}]`) : []
    );
  }

  if (actual === 'object') {
    const record = value as Record<string, unknown>;
    const errors: string[] = [];

    for (const key of node.required ?? []) {
      if (!(key in record)) errors.push(`${path}.${key}: missing`);
    }
    for (const key of Object.keys(record)) {
      if (!node.properties?.[key]) errors.push(`${path}.${key}: not allowed`);
    }
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      if (key in record) errors.push(...validate(child, record[key], `${path}.${key}`));
    }
    if (node.enum && !node.enum.includes(value)) errors.push(`${path}: not in enum`);
    return errors;
  }

  if (node.enum && !node.enum.includes(value)) return [`${path}: ${String(value)} not in enum`];
  return [];
}

const locales: SupportedLocale[] = [...SUPPORTED_LOCALES];

describe('the worked example', () => {
  it.each(locales)('%s: validates against the schema we send the model', (locale) => {
    const errors = validate(
      AI_ENVELOPE_JSON_SCHEMA.schema as SchemaNode,
      workedExample(locale),
      'envelope'
    );
    expect(errors).toEqual([]);
  });

  it.each(locales)('%s: survives our own parser without losing anything', (locale) => {
    const result = parseChatEnvelope(workedExampleJson(locale), { locale });

    expect(result.recipe.ingredients).toHaveLength(7);
    expect(result.recipe.instructions).toHaveLength(6);
    expect(result.recipe.title).toBe(WORKED_EXAMPLE_TEXT[locale].title);
    expect(result.reply).toBe(WORKED_EXAMPLE_TEXT[locale].reply);
  });

  it.each(locales)('%s: uses only enum members the schema allows', (locale) => {
    const recipe = workedExample(locale).recipe as {
      ingredients: { unit: string; density_key: string }[];
    };

    for (const ingredient of recipe.ingredients) {
      expect(MODEL_UNIT_ENUM as readonly string[]).toContain(ingredient.unit);
      expect(DENSITY_KEYS as readonly string[]).toContain(ingredient.density_key);
    }
  });

  it.each(locales.filter((locale) => locale !== 'en'))(
    '%s: contains none of the English strings',
    (locale) => {
      const json = workedExampleJson(locale);
      const english = WORKED_EXAMPLE_TEXT.en;

      for (const text of [
        english.title,
        english.category,
        ...english.items,
        ...english.steps,
        ...english.tags,
      ]) {
        expect(json).not.toContain(text);
      }
    }
  );

  it.each(locales)('%s: tags stay within the three-to-five range', (locale) => {
    const recipe = workedExample(locale).recipe as { tags: string[] };
    expect(recipe.tags.length).toBeGreaterThanOrEqual(3);
    expect(recipe.tags.length).toBeLessThanOrEqual(5);
    expect(recipe.tags).toEqual(recipe.tags.map((tag) => tag.toLowerCase()));
  });

  // The example is the most-copied part of the prompt, so its tags should demonstrate the mapping
  // the field notes describe — one of each kind — rather than five plausible-looking words.
  it('tags one of each kind the field notes list', () => {
    const recipe = workedExample('en').recipe as { tags: string[] };
    expect(recipe.tags).toEqual([
      'chicken', // main ingredient or protein
      'mediterranean', // cuisine
      'gluten-free', // dietary restriction
      'roasted', // cooking method
    ]);
  });

  it('demonstrates every part of the contract at least once', () => {
    const recipe = workedExample('en').recipe as {
      ingredients: {
        quantity: number | null;
        unit: string;
        note: string | null;
        density_key: string;
      }[];
      instructions: string[];
    };

    expect(recipe.ingredients.some((i) => i.unit === '')).toBe(true);
    expect(recipe.ingredients.some((i) => i.unit === 'g')).toBe(true);
    expect(recipe.ingredients.some((i) => i.unit === 'ml')).toBe(true);
    expect(recipe.ingredients.some((i) => i.quantity === null)).toBe(true);
    expect(recipe.ingredients.some((i) => i.note !== null)).toBe(true);
    expect(recipe.ingredients.some((i) => i.note === null)).toBe(true);
    expect(recipe.ingredients.some((i) => i.density_key !== 'none')).toBe(true);
    expect(recipe.instructions.some((step) => step.includes('°C'))).toBe(true);
  });
});

describe('prompt and schema stay in step', () => {
  // Rungs two and three of the provider's downgrade ladder send no schema at all, so a constraint
  // that lives only in the schema is a constraint that sometimes does not exist.
  it('prints every unit and density enum member in the prompt', () => {
    const prompt = buildChatMessages([{ role: 'user', content: 'soup' }], null)[0].content;

    for (const unit of MODEL_UNIT_ENUM) expect(prompt).toContain(`"${unit}"`);
    for (const key of DENSITY_KEYS) expect(prompt).toContain(`"${key}"`);
  });
});
