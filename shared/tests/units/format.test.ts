import { describe, expect, it } from 'vitest';
import type { SupportedLocale } from '../../src/locale.js';
import {
  formatMeasurement,
  formatScaledAmount,
  renderIngredientLine,
  renderMeasurement,
  type AiIngredient,
  type RenderContext,
} from '../../src/units/format.js';
import type { UnitCode } from '../../src/units/unit-model.js';

const metric: RenderContext = { locale: 'en', unitSystem: 'metric' };
const imperial: RenderContext = { locale: 'en', unitSystem: 'imperial' };

function ingredient(overrides: Partial<AiIngredient> = {}): AiIngredient {
  return { item: 'flour', quantity: 100, unit: 'g', note: null, density_key: 'none', ...overrides };
}

describe('imperial source rendered in metric', () => {
  it.each<[number, UnitCode, string]>([
    [1, 'oz', '30 g'],
    [2, 'oz', '55 g'],
    [4, 'oz', '115 g'],
    [8, 'oz', '225 g'],
    [12, 'oz', '340 g'],
    [1, 'lb', '450 g'],
    [1.5, 'lb', '680 g'],
    [5, 'lb', '2.25 kg'],
    [1, 'cup', '240 ml'],
    [0.5, 'cup', '120 ml'],
    [8, 'fl_oz', '240 ml'],
    [1, 'tsp', '1 tsp'],
    [1, 'tbsp', '1 tbsp'],
    [1, 'in', '2.5 cm'],
    [9, 'in', '23 cm'],
  ])('%s %s -> %s', (value, unit, expected) => {
    expect(formatMeasurement(value, unit, metric)).toBe(expected);
  });

  // Pint, quart, gallon and stick used to pass through a metric recipe untouched, by design.
  it('no longer leaks the larger imperial volumes or a stick of butter', () => {
    expect(formatMeasurement(1, 'qt', metric)).toBe('960 ml');
    expect(formatMeasurement(1, 'pt', metric)).toBe('480 ml');
    expect(formatMeasurement(1, 'stick', metric)).toBe('115 g');
  });

  // 907 g wants a 25 g step to land on the conventional 900, but that step would push 1 1/2 lb to
  // 675 instead of 680. No single band table produces both; this one is the documented trade.
  it('accepts 910 g for 2 lb rather than special-casing a nice number', () => {
    expect(formatMeasurement(2, 'lb', metric)).toBe('910 g');
  });
});

describe('metric source rendered in imperial', () => {
  it.each<[number, UnitCode, string]>([
    [5, 'ml', '1 tsp'],
    [10, 'ml', '2 tsp'],
    [15, 'ml', '1 tbsp'],
    [30, 'ml', '2 tbsp'],
    [45, 'ml', '3 tbsp'],
    [60, 'ml', '1/4 cup'],
    [80, 'ml', '1/3 cup'],
    [120, 'ml', '1/2 cup'],
    [240, 'ml', '1 cup'],
    [250, 'ml', '1 cup'],
    [500, 'ml', '2 cups'],
    [1000, 'ml', '4 cups'],
    [30, 'g', '1 oz'],
    [50, 'g', '1 3/4 oz'],
    [125, 'g', '4 1/2 oz'],
    [225, 'g', '8 oz'],
    [340, 'g', '12 oz'],
    [450, 'g', '1 lb'],
    [500, 'g', '1 1/8 lb'],
    [680, 'g', '1 1/2 lb'],
    [1000, 'g', '2 1/4 lb'],
    [2, 'cm', '3/4 inch'],
    [20, 'cm', '8 inches'],
    [23, 'cm', '9 inches'],
    [24, 'cm', '9 1/2 inches'],
  ])('%s %s -> %s', (value, unit, expected) => {
    expect(formatMeasurement(value, unit, imperial)).toBe(expected);
  });

  // Documented imperfections, asserted so they stay decisions rather than becoming accidents.
  it('takes the ~10% hit on 200 ml rather than emitting a compound amount', () => {
    expect(formatMeasurement(200, 'ml', imperial)).toBe('3/4 cup');
  });

  it('resolves the 100 ml tie upward, to 1/2 cup', () => {
    expect(formatMeasurement(100, 'ml', imperial)).toBe('1/2 cup');
  });

  it('prints a decimal ounce for a sub-ounce weight with no density hint', () => {
    expect(formatMeasurement(5, 'g', imperial)).toBe('0.2 oz');
  });
});

describe('metric source rendered in metric', () => {
  // The whole point of the pass-through rule: re-rounding the model's own metric would turn a
  // correct 125 g of flour into 130 g and break the ratio the recipe depends on.
  it.each([1, 7, 23, 125, 137, 249, 333, 999])('leaves %s g exactly as written', (grams) => {
    expect(formatMeasurement(grams, 'g', metric)).toBe(`${grams} g`);
  });

  it('ladders up to kg and l without inventing precision', () => {
    expect(formatMeasurement(1500, 'g', metric)).toBe('1.5 kg');
    expect(formatMeasurement(2000, 'ml', metric)).toBe('2 l');
  });

  it('uses spoons for the amounts a metric recipe writes as spoons', () => {
    expect(formatMeasurement(5, 'ml', metric)).toBe('1 tsp');
    expect(formatMeasurement(2.5, 'ml', metric)).toBe('1/2 tsp');
    expect(formatMeasurement(15, 'ml', metric)).toBe('1 tbsp');
    expect(formatMeasurement(45, 'ml', metric)).toBe('3 tbsp');
  });

  it('keeps millilitres when no spoon count is close enough', () => {
    expect(formatMeasurement(20, 'ml', metric)).toBe('20 ml');
    expect(formatMeasurement(7, 'ml', metric)).toBe('7 ml');
    expect(formatMeasurement(50, 'ml', metric)).toBe('50 ml');
  });
});

describe('density', () => {
  it('renders the scoopables as cups for an imperial reader', () => {
    expect(formatMeasurement(500, 'g', imperial, 'flour')).toBe('4 cups');
    expect(formatMeasurement(125, 'g', imperial, 'flour')).toBe('1 cup');
    expect(formatMeasurement(200, 'g', imperial, 'sugar_granulated')).toBe('1 cup');
    expect(formatMeasurement(227, 'g', imperial, 'butter')).toBe('1 cup');
  });

  it('rescues the sub-ounce case a weight cannot express usefully', () => {
    expect(formatMeasurement(5, 'g', imperial, 'cocoa')).toBe('2 3/4 tsp');
  });

  it('falls back to weight without a hint, and never affects a metric reader', () => {
    expect(formatMeasurement(80, 'g', imperial, 'none')).toBe('2 3/4 oz');
    expect(formatMeasurement(500, 'g', metric, 'flour')).toBe('500 g');
  });
});

describe('round-trip stability', () => {
  const cases: [number, UnitCode][] = [
    [1, 'oz'],
    [8, 'oz'],
    [1, 'lb'],
    [1.5, 'lb'],
    [1, 'cup'],
    [0.5, 'cup'],
    [1, 'tsp'],
    [1, 'tbsp'],
    [9, 'in'],
    [125, 'g'],
    [450, 'g'],
    [240, 'ml'],
    [20, 'cm'],
  ];

  // A full round trip need not return the input, but it must settle after one cycle: otherwise
  // toggling the unit setting walks the amount a little further every time.
  it.each(cases)('%s %s settles after one cycle', (value, unit) => {
    const first = renderMeasurement(value, unit, imperial);
    const back = renderMeasurement(first.value, first.unit, metric);
    const second = renderMeasurement(back.value, back.unit, imperial);
    expect(second).toEqual(first);
  });
});

describe('locale labels', () => {
  it.each<[SupportedLocale, string, string]>([
    ['en', '1 tsp', '1 cup'],
    ['nl', '1 tl', '1 cup'],
    ['fr', '1 c. à c.', '1 tasse'],
    ['es', '1 cdta', '1 taza'],
  ])('%s writes spoons and cups its own way', (locale, spoon, cup) => {
    expect(formatMeasurement(5, 'ml', { locale, unitSystem: 'metric' })).toBe(spoon);
    expect(formatMeasurement(240, 'ml', { locale, unitSystem: 'imperial' })).toBe(cup);
  });

  // "ons" is 100 g in Dutch and "pond"/"livre" about 500 g: translating oz and lb naturally would
  // be a 3.5x and a 10% error respectively.
  it('never translates oz or lb into a false friend', () => {
    for (const locale of ['nl', 'fr', 'es'] as SupportedLocale[]) {
      const context = { locale, unitSystem: 'imperial' as const };
      expect(formatMeasurement(100, 'g', context)).toContain('oz');
      expect(formatMeasurement(1000, 'g', context)).toContain('lb');
    }
  });

  it('pluralises only above one', () => {
    expect(formatMeasurement(120, 'ml', imperial)).toBe('1/2 cup');
    expect(formatMeasurement(240, 'ml', imperial)).toBe('1 cup');
    expect(formatMeasurement(480, 'ml', imperial)).toBe('2 cups');
  });

  it('uses the locale decimal separator', () => {
    expect(formatMeasurement(1500, 'g', { locale: 'nl', unitSystem: 'metric' })).toBe('1,5 kg');
    expect(formatMeasurement(1500, 'g', { locale: 'en', unitSystem: 'metric' })).toBe('1.5 kg');
  });
});

describe('renderIngredientLine', () => {
  it('writes amount, unit and item in that order', () => {
    expect(renderIngredientLine(ingredient({ quantity: 450, item: 'bloem' }), metric)).toBe(
      '450 g bloem'
    );
  });

  it('drops the unit entirely for something counted whole', () => {
    expect(
      renderIngredientLine(ingredient({ quantity: 2, unit: '', item: 'eieren' }), metric)
    ).toBe('2 eieren');
    expect(
      renderIngredientLine(ingredient({ quantity: 3, unit: '', item: 'teentjes look' }), metric)
    ).toBe('3 teentjes look');
  });

  it('puts a preparation note in parentheses', () => {
    expect(
      renderIngredientLine(
        ingredient({ quantity: 400, item: 'kerstomaten', note: 'gehalveerd' }),
        metric
      )
    ).toBe('400 g kerstomaten (gehalveerd)');
  });

  it('omits the amount when there is none', () => {
    expect(
      renderIngredientLine(
        ingredient({ quantity: null, unit: '', item: 'zout', note: 'naar smaak' }),
        metric
      )
    ).toBe('zout (naar smaak)');
  });

  // Dropping it would silently lose information; folding it into the item would corrupt the name.
  it('prints an unrecognised unit word verbatim rather than dropping it', () => {
    expect(
      renderIngredientLine(ingredient({ quantity: 1, unit: 'knob', item: 'butter' }), imperial)
    ).toBe('1 knob butter');
  });

  it('converts and localises in one step', () => {
    expect(
      renderIngredientLine(
        ingredient({ quantity: 500, unit: 'g', item: 'harina', density_key: 'flour' }),
        { locale: 'es', unitSystem: 'imperial' }
      )
    ).toBe('4 tazas harina');
  });
});

describe('formatScaledAmount', () => {
  // The old formatter rounded every unit to eighths and then printed a decimal, so a third of a
  // cup came out as "0,375" and 200 g scaled by a third as "66,625".
  it('renders a scaled spoon or cup count as a fraction', () => {
    expect(formatScaledAmount(1 / 3, 'cup', 'en')).toBe('1/3');
    expect(formatScaledAmount(1.5, 'cups', 'en')).toBe('1 1/2');
    expect(formatScaledAmount(0.5 * 3, 'cup', 'en')).toBe('1 1/2');
  });

  it('renders a scaled metric amount as a round decimal', () => {
    expect(formatScaledAmount(200 / 3, 'g', 'en')).toBe('65');
    expect(formatScaledAmount(2.13, 'kg', 'en')).toBe('2.13');
    expect(formatScaledAmount(2.13, 'kg', 'nl')).toBe('2,13');
  });

  it('keeps whole numbers whole', () => {
    expect(formatScaledAmount(3, 'cups', 'en')).toBe('3');
    expect(formatScaledAmount(500, 'g', 'en')).toBe('500');
  });

  it('handles a bare count and an unrecognised unit word', () => {
    expect(formatScaledAmount(3, null, 'en')).toBe('3');
    expect(formatScaledAmount(1.5, 'knobs', 'en')).toBe('1 1/2');
  });

  // Saved recipes are never converted; only the number is made measurable again.
  it('never changes the unit it was given', () => {
    expect(formatScaledAmount(2, 'lb', 'en')).toBe('2');
    expect(formatScaledAmount(1000, 'g', 'en')).toBe('1000');
  });

  it('returns an empty string for a value that is not a number', () => {
    expect(formatScaledAmount(NaN, 'g', 'en')).toBe('');
  });
});

describe('small-volume style', () => {
  const millilitres: RenderContext = {
    locale: 'en',
    unitSystem: 'metric',
    smallVolumes: 'millilitres',
  };

  // Both readings are idiomatic in a metric recipe, so the cook chooses. 45 ml of fish sauce is
  // "3 tbsp" to one cook and "45 ml" to another.
  it.each<[number, string, string]>([
    [2.5, '1/2 tsp', '2.5 ml'],
    [5, '1 tsp', '5 ml'],
    [15, '1 tbsp', '15 ml'],
    [30, '2 tbsp', '30 ml'],
    [45, '3 tbsp', '45 ml'],
  ])('%s ml reads as %s or %s', (value, asSpoons, asMillilitres) => {
    expect(formatMeasurement(value, 'ml', metric)).toBe(asSpoons);
    expect(formatMeasurement(value, 'ml', millilitres)).toBe(asMillilitres);
  });

  it('defaults to spoons when the style is not given', () => {
    expect(formatMeasurement(15, 'ml', { locale: 'en', unitSystem: 'metric' })).toBe('1 tbsp');
  });

  it('leaves larger volumes and other dimensions alone', () => {
    expect(formatMeasurement(240, 'ml', millilitres)).toBe('240 ml');
    expect(formatMeasurement(500, 'g', millilitres)).toBe('500 g');
  });

  // Imperial has no alternative to spoons at these sizes, so the preference cannot apply there.
  it('has no effect on an imperial reader', () => {
    const imperialMl: RenderContext = { ...imperial, smallVolumes: 'millilitres' };
    expect(formatMeasurement(15, 'ml', imperialMl)).toBe('1 tbsp');
    expect(formatMeasurement(45, 'ml', imperialMl)).toBe('3 tbsp');
  });
});
