import { describe, expect, it } from 'vitest';
import { formatFraction } from '../src/utils/format-fraction';

describe('formatFraction', () => {
  it('renders whole numbers with no fraction', () => {
    expect(formatFraction(2)).toBe('2');
    expect(formatFraction(0)).toBe('0');
  });

  it('renders a bare unicode fraction below 1', () => {
    expect(formatFraction(0.5)).toBe('½');
  });

  it('renders a whole number plus a unicode fraction', () => {
    expect(formatFraction(1.5)).toBe('1 ½');
    expect(formatFraction(2.25)).toBe('2 ¼');
  });

  it('rounds to the nearest eighth', () => {
    expect(formatFraction(1.33)).toBe('1 ⅜');
  });

  it('rolls over to the next whole number when rounding reaches 8/8', () => {
    expect(formatFraction(1.97)).toBe('2');
  });

  it('returns an empty string for null/undefined amounts', () => {
    expect(formatFraction(null)).toBe('');
    expect(formatFraction(undefined)).toBe('');
  });
});
