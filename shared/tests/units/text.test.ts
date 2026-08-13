import { describe, expect, it } from 'vitest';
import { convertTextUnits } from '../../src/units/text.js';

const toImperial = (text: string, locale: 'en' | 'nl' | 'fr' | 'es' = 'en') =>
  convertTextUnits(text, 'imperial', locale);
const toMetric = (text: string, locale: 'en' | 'nl' | 'fr' | 'es' = 'en') =>
  convertTextUnits(text, 'metric', locale);

describe('temperatures in instructions', () => {
  it('converts an oven temperature both ways', () => {
    expect(toImperial('Heat the oven to 200 °C.')).toBe('Heat the oven to 400 °F.');
    expect(toMetric('Bake at 350°F until golden.')).toBe('Bake at 180 °C until golden.');
  });

  it('leaves a temperature already in the reader system alone', () => {
    expect(toMetric('Heat the oven to 200 °C.')).toBe('Heat the oven to 200 °C.');
  });

  it('converts both ends of a range', () => {
    expect(toImperial('Roast at 180-200 °C.')).toBe('Roast at 350-400 °F.');
  });

  it('collapses a range whose ends round together', () => {
    expect(toImperial('Roast at 178-180 °C.')).toBe('Roast at 350 °F.');
  });

  it('keeps the value the author already gave in the reader system', () => {
    expect(toMetric('Bake at 350°F (177°C).')).toBe('Bake at 177 °C.');
  });

  // Telling a bare oven temperature from any other number needs oven-verb lists in four languages,
  // and a wrong guess burns the dish.
  it('leaves a temperature with no scale marker alone', () => {
    expect(toMetric('Bake at 350 until golden.')).toBe('Bake at 350 until golden.');
    expect(toImperial('Bake for 40 minutes at gas mark 4.')).toBe(
      'Bake for 40 minutes at gas mark 4.'
    );
  });

  it('does not read a lone C as Celsius, because C is also the US shorthand for cup', () => {
    expect(toImperial('Add 2 C of the mixture.')).toBe('Add 2 C of the mixture.');
  });
});

describe('measurements in instructions', () => {
  it('converts a weight and a volume', () => {
    expect(toImperial('Stir in 500 g of flour.')).toBe('Stir in 1 1/8 lb of flour.');
    expect(toMetric('Stir in 1 lb of flour.')).toBe('Stir in 450 g of flour.');
    expect(toImperial('Pour in 240 ml of stock.')).toBe('Pour in 1 cup of stock.');
  });

  it('keeps spoons as spoons, since both systems measure them identically', () => {
    expect(toMetric('Add 2-3 tbsp of oil.')).toBe('Add 2-3 tbsp of oil.');
    expect(toImperial('Add 2 tbsp of oil.')).toBe('Add 2 tbsp of oil.');
  });

  it('converts a range with a single trailing unit word', () => {
    expect(toImperial('Use 200-300 g of beef.')).toBe('Use 7-11 oz of beef.');
  });

  it('keeps the metric half of a dual-listed amount', () => {
    expect(toMetric('Use 1.5 lbs (680 g) ground beef.')).toBe('Use 680 g ground beef.');
    expect(toMetric('Use 1.5 lbs (about 680 g) ground beef.')).toBe('Use 680 g ground beef.');
  });

  // "9x13-inch" must be handled before the standalone rule, or only the unit-adjacent number
  // converts and the pan becomes 9x33 cm.
  it('converts both sides of a tin size', () => {
    expect(toMetric('Use a 9x13-inch baking dish.')).toBe('Use a 23x33 cm baking dish.');
    expect(toImperial('Use a 23x33 cm baking dish.')).toBe('Use a 9x13 inches baking dish.');
  });
});

describe('false positives the lexicon must not create', () => {
  it('leaves English prepositions alone', () => {
    expect(toMetric('Cut the onion in half and stir in the flour.')).toBe(
      'Cut the onion in half and stir in the flour.'
    );
  });

  it('does not read a French elision as litres', () => {
    expect(toImperial("Ajoutez 2 l'oignon émincé.", 'fr')).toBe("Ajoutez 2 l'oignon émincé.");
  });

  // "ons" is 100 g in Dutch. Reading it as an ounce would be a 3.5x error.
  it('does not read Dutch ons or pond as imperial units', () => {
    expect(toImperial('Voeg twee ons kaas toe.', 'nl')).toBe('Voeg twee ons kaas toe.');
    expect(toImperial('Voeg 1 pond kaas toe.', 'nl')).toBe('Voeg 1 pond kaas toe.');
  });

  it('leaves times and counts alone', () => {
    expect(toImperial('Bak 40 minuten in de oven.', 'nl')).toBe('Bak 40 minuten in de oven.');
    expect(toImperial('Add 2 eggs and 3 onions.')).toBe('Add 2 eggs and 3 onions.');
  });
});

describe('locale scoping', () => {
  it('recognises a locale spoon word only under that locale', () => {
    // Five Dutch tablespoons is 75 ml, which an imperial reader measures as a third of a cup.
    expect(toImperial('Voeg 5 el olijfolie toe.', 'nl')).toBe('Voeg 1/3 cup olijfolie toe.');
    // Under English, "el" is not a unit at all — and must not become one.
    expect(toImperial('Voeg 5 el olijfolie toe.', 'en')).toBe('Voeg 5 el olijfolie toe.');
  });

  it('leaves a spoon count alone when the locale already spells it that way', () => {
    expect(toImperial('Voeg 2 el olijfolie toe.', 'nl')).toBe('Voeg 2 el olijfolie toe.');
  });

  it('writes the converted unit in the active language', () => {
    expect(toImperial('Verwarm de oven op 200 °C.', 'nl')).toBe('Verwarm de oven op 400 °F.');
    expect(toImperial('Giet er 240 ml bouillon bij.', 'nl')).toBe('Giet er 1 cup bouillon bij.');
    expect(toImperial('Versez 240 ml de bouillon.', 'fr')).toBe('Versez 1 tasse de bouillon.');
  });
});

describe('stability', () => {
  const samples = [
    'Heat the oven to 200 °C and bake for 40 minutes.',
    'Stir in 500 g of flour and 240 ml of milk.',
    'Use a 23x33 cm baking dish.',
  ];

  it.each(samples)('converting twice changes nothing the second time: %s', (text) => {
    for (const system of ['metric', 'imperial'] as const) {
      const once = convertTextUnits(text, system, 'en');
      expect(convertTextUnits(once, system, 'en')).toBe(once);
    }
  });

  it('never throws on malformed input', () => {
    expect(convertTextUnits('Add 5/0 cups of flour.', 'metric', 'en')).toContain('5/0');
  });
});
