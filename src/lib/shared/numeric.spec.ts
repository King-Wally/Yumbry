import { describe, expect, it } from 'vitest';
import { decimalString, toNullableNumber, toNumber } from '#lib/shared/numeric.ts';

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

describe('decimalString', () => {
	it('drops the column padding', () => {
		expect(decimalString('4.000000000000000000000000000000')).toBe('4');
		expect(decimalString('14.50')).toBe('14.5');
		expect(decimalString('0.00')).toBe('0');
	});

	it('leaves integers and null alone', () => {
		expect(decimalString('100')).toBe('100');
		expect(decimalString(null)).toBeNull();
	});
});
