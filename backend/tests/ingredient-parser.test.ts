import { describe, expect, it } from 'vitest';
import { parseIngredientLine } from '../src/services/ingredient-parser.js';

describe('parseIngredientLine', () => {
  it('parses a simple quantity, unit, and name', () => {
    const result = parseIngredientLine('2 cups flour');
    expect(result.amount).toBe(2);
    expect(result.unit).toBe('cups');
    expect(result.name).toBe('flour');
    expect(result.is_scalable).toBe(true);
    expect(result.raw_text).toBe('2 cups flour');
  });

  it('parses fractional quantities', () => {
    const result = parseIngredientLine('1/2 cup sugar');
    expect(result.amount).toBeCloseTo(0.5);
    expect(result.is_scalable).toBe(true);
  });

  it('parses mixed number quantities', () => {
    const result = parseIngredientLine('1 1/2 cups milk');
    expect(result.amount).toBeCloseTo(1.5);
  });

  it('parses unicode vulgar fractions', () => {
    const result = parseIngredientLine('½ cup butter');
    expect(result.amount).toBeCloseTo(0.5);
  });

  it('marks group headers as non-scalable', () => {
    const result = parseIngredientLine('For the icing:');
    expect(result.is_scalable).toBe(false);
  });

  it('keeps the raw string and marks non-scalable when no quantity is found', () => {
    const result = parseIngredientLine('salt to taste');
    expect(result.amount).toBeNull();
    expect(result.is_scalable).toBe(false);
    expect(result.raw_text).toBe('salt to taste');
  });

  it('strips a leading "of" from the name', () => {
    const result = parseIngredientLine('1 cup of sugar');
    expect(result.amount).toBe(1);
    expect(result.unit).toBe('cup');
    expect(result.name).toBe('sugar');
  });

  it('recognizes alternate unit spellings', () => {
    const result = parseIngredientLine('3 tbsp olive oil');
    expect(result.unit).toBe('tbsp');
    expect(result.name).toBe('olive oil');
  });

  it('parses decimal quantities', () => {
    const result = parseIngredientLine('2.5 kg potatoes');
    expect(result.amount).toBe(2.5);
    expect(result.unit).toBe('kg');
    expect(result.name).toBe('potatoes');
  });

  it('rounds repeating-decimal fractions to 3 decimal places', () => {
    const result = parseIngredientLine('1/3 cup water');
    expect(result.amount).toBeCloseTo(0.333);
  });

  it('falls back to a null unit and keeps the word in the name when the unit is unrecognized', () => {
    const result = parseIngredientLine('2 knobs butter');
    expect(result.amount).toBe(2);
    expect(result.unit).toBeNull();
    expect(result.name).toBe('knobs butter');
  });

  it('strips a trailing period from an abbreviated unit', () => {
    const result = parseIngredientLine('1 lb. butter');
    expect(result.amount).toBe(1);
    expect(result.unit).toBe('lb');
    expect(result.name).toBe('butter');
  });

  it('strips a leading "of" after a period-abbreviated unit', () => {
    const result = parseIngredientLine('1 lb. of butter');
    expect(result.amount).toBe(1);
    expect(result.unit).toBe('lb');
    expect(result.name).toBe('butter');
  });

  it('strips a comma separating an abbreviated unit from the name', () => {
    const result = parseIngredientLine('2 tbsp, packed');
    expect(result.unit).toBe('tbsp');
    expect(result.name).toBe('packed');
  });

  it('ignores surrounding whitespace', () => {
    const result = parseIngredientLine('  2 eggs  ');
    expect(result.amount).toBe(2);
    expect(result.unit).toBeNull();
    expect(result.name).toBe('eggs');
  });

  it('parses a comma as a decimal separator', () => {
    const result = parseIngredientLine('4,5 g suiker');
    expect(result.amount).toBe(4.5);
    expect(result.unit).toBe('g');
    expect(result.name).toBe('suiker');
    expect(result.is_scalable).toBe(true);
  });

  it('does not treat a comma later in the line as a decimal separator', () => {
    const result = parseIngredientLine('2 eggs, beaten');
    expect(result.amount).toBe(2);
    expect(result.name).toBe('eggs, beaten');
  });
});
