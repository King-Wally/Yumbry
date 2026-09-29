import { describe, expect, it } from 'vitest';
import { toNullableNumber, toNumber } from '../src/numeric.js';

describe('toNumber', () => {
  it('parses Decimal strings', () => {
    expect(toNumber('4.00')).toBe(4);
  });

  it('falls back for null and undefined', () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined, 1)).toBe(1);
  });
});

describe('toNullableNumber', () => {
  it('keeps an absent value absent rather than turning it into 0', () => {
    expect(toNullableNumber(null)).toBeNull();
    expect(toNullableNumber(undefined)).toBeNull();
    expect(toNullableNumber('')).toBeNull();
  });

  it('parses numbers and Decimal strings', () => {
    expect(toNullableNumber('420.00')).toBe(420);
    expect(toNullableNumber(12.5)).toBe(12.5);
  });

  it('treats garbage as absent', () => {
    expect(toNullableNumber('abc')).toBeNull();
  });

  it('keeps a real zero', () => {
    expect(toNullableNumber('0')).toBe(0);
  });
});
