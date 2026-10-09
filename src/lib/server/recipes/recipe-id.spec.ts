import { describe, expect, it } from 'vitest';
import { parseRecipeId } from '#lib/server/recipes/recipe-id.ts';

describe('parseRecipeId', () => {
	it.each([
		['1', 1],
		['42', 42],
		['999999', 999999],
		['2147483647', 2147483647] // exactly int4 max
	])('accepts %s as %d', (input, expected) => {
		expect(parseRecipeId(input)).toBe(expected);
	});

	it.each([
		['abc', 'non-numeric'],
		['', 'empty'],
		['0', 'zero: ids are 1-based'],
		['-1', 'negative'],
		['1.5', 'fractional'],
		['1.0', 'fractional, integral value'],
		['1e3', 'exponent notation'],
		[' 1', 'leading whitespace'],
		['1 ', 'trailing whitespace'],
		['007', 'leading zeroes'],
		['+1', 'explicit sign'],
		['0x1', 'hex'],
		['Infinity', 'Infinity'],
		['NaN', 'NaN'],
		['2147483648', 'one past int4 max'],
		['9999999999', 'ten digits, past int4 max'],
		['99999999999999', 'past the length cap']
	])('rejects %s (%s)', (input) => {
		expect(parseRecipeId(input)).toBeNull();
	});

	// Kit decodes route params, so these are what a request for /recipes/..%2F..%2Fetc hands over.
	it.each(['../../etc', '../1', '1/../2', '..', '.'])('rejects the traversal form %s', (input) => {
		expect(parseRecipeId(input)).toBeNull();
	});

	it('rejects non-string values', () => {
		for (const value of [{ equals: 1 }, ['1', '2'], 1, undefined, null]) {
			expect(parseRecipeId(value)).toBeNull();
		}
	});
});
