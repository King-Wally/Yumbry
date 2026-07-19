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
});
