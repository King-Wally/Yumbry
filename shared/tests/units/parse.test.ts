import { describe, expect, it } from 'vitest';
import { normalizeFractionChars } from '../../src/quantity.js';
import { renderIngredientLine, type RenderContext } from '../../src/units/format.js';
import {
  parseMeasurementPrefix,
  toCanonicalIngredient,
  toCanonicalMetric,
} from '../../src/units/parse.js';
import { AMBIGUOUS_NON_UNITS, RECOGNIZED_UNITS } from '../../src/units/labels.js';

const metric: RenderContext = { locale: 'en', unitSystem: 'metric' };
const imperial: RenderContext = { locale: 'en', unitSystem: 'imperial' };

describe('vulgar fractions', () => {
  // Without the separator, "1½" substitutes into "11/2" and a leading-quantity match reads it as
  // eleven halves — a silent 5.5x on any recipe pasted in with vulgar fractions.
  it('reads a mixed number rather than multiplying it by eleven', () => {
    expect(normalizeFractionChars('1½ cups flour')).toBe('1 1/2 cups flour');
    expect(parseMeasurementPrefix('1½ cups flour').quantity).toBe(1.5);
    expect(parseMeasurementPrefix('2¾ cups flour').quantity).toBe(2.75);
  });

  it('still handles a bare fraction and an already-spaced one', () => {
    expect(parseMeasurementPrefix('½ cup milk').quantity).toBe(0.5);
    expect(parseMeasurementPrefix('1 ½ cups milk').quantity).toBe(1.5);
  });
});

describe('parseMeasurementPrefix', () => {
  it('splits quantity, unit and item', () => {
    expect(parseMeasurementPrefix('450 g bloem')).toMatchObject({
      quantity: 450,
      unit: 'g',
      rest: 'bloem',
    });
  });

  // The old single-ASCII-word matcher could not see a French spoon at all.
  it('matches multi-token and accented unit words', () => {
    expect(parseMeasurementPrefix("2 c. à s. huile d'olive")).toMatchObject({
      quantity: 2,
      unit: 'tbsp',
    });
    expect(parseMeasurementPrefix('2 el olijfolie')).toMatchObject({ quantity: 2, unit: 'tbsp' });
    expect(parseMeasurementPrefix('1 cucharadita sal')).toMatchObject({ quantity: 1, unit: 'tsp' });
  });

  it('prefers the longest unit word', () => {
    expect(parseMeasurementPrefix('8 fl oz milk').unit).toBe('fl_oz');
    expect(parseMeasurementPrefix('8 oz milk').unit).toBe('oz');
    expect(parseMeasurementPrefix('200 grams flour').unit).toBe('g');
  });

  it('keeps a portion word without pretending it is convertible', () => {
    expect(parseMeasurementPrefix('3 cloves garlic')).toMatchObject({
      quantity: 3,
      unit: null,
      unitWord: 'cloves',
      rest: 'garlic',
    });
  });

  it('leaves an unmeasured line alone', () => {
    expect(parseMeasurementPrefix('salt to taste')).toMatchObject({ quantity: null, unit: null });
  });

  it('treats a zero denominator as unparseable rather than infinite', () => {
    expect(parseMeasurementPrefix('5/0 cups flour').quantity).toBeNull();
  });
});

describe('the ambiguity blacklist', () => {
  // Each of these is a word a unit lexicon is tempted by and must never claim.
  it.each(AMBIGUOUS_NON_UNITS)('never recognises %s as a unit', (word) => {
    expect(RECOGNIZED_UNITS.has(word)).toBe(false);
  });

  it('does not read a French elision as litres', () => {
    expect(parseMeasurementPrefix("2 l'oignon").unit).toBeNull();
  });
});

describe('toCanonicalMetric', () => {
  it('snaps an imperial source to a culinary metric value once, and not again', () => {
    expect(toCanonicalMetric(1, 'lb')).toEqual({ quantity: 450, unit: 'g' });
    expect(toCanonicalMetric(8, 'oz')).toEqual({ quantity: 225, unit: 'g' });
    expect(toCanonicalMetric(1, 'cup')).toEqual({ quantity: 240, unit: 'ml' });
    expect(toCanonicalMetric(9, 'in')).toEqual({ quantity: 23, unit: 'cm' });
  });

  it('leaves a metric source exactly as written', () => {
    expect(toCanonicalMetric(125, 'g')).toEqual({ quantity: 125, unit: 'g' });
    expect(toCanonicalMetric(1.5, 'kg')).toEqual({ quantity: 1500, unit: 'g' });
  });
});

describe('toCanonicalIngredient', () => {
  it('normalises an imperial line rather than merely parsing it', () => {
    expect(toCanonicalIngredient('1 lb chicken thighs')).toMatchObject({
      quantity: 450,
      unit: 'g',
      item: 'chicken thighs',
    });
  });

  it('handles a countable and an unmeasured line', () => {
    expect(toCanonicalIngredient('2 eggs')).toMatchObject({ quantity: 2, unit: '', item: 'eggs' });
    expect(toCanonicalIngredient('salt to taste')).toMatchObject({
      quantity: null,
      unit: '',
      item: 'salt to taste',
    });
  });

  it('strips a leading "of"', () => {
    expect(toCanonicalIngredient('2 cups of flour').item).toBe('flour');
  });

  // A line we rendered for an imperial reader last turn and the client echoed back must come home
  // to the same canonical value, not drift a little each round.
  it('survives a render/parse round trip in either system', () => {
    const original = {
      item: 'chicken thighs',
      quantity: 450,
      unit: 'g',
      note: null,
      density_key: 'none' as const,
    };

    for (const context of [metric, imperial]) {
      const line = renderIngredientLine(original, context);
      const reparsed = toCanonicalIngredient(line);
      expect(reparsed.quantity).toBe(450);
      expect(reparsed.unit).toBe('g');
      expect(reparsed.item).toBe('chicken thighs');
    }
  });
});
