import { describe, expect, it } from 'vitest';
import { RecipeIdParamSchema } from '../src/schemas/recipe-id.schema.js';

function parse(id: unknown) {
  return RecipeIdParamSchema.safeParse({ id });
}

describe('RecipeIdParamSchema', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    ['999999', 999999],
    ['2147483647', 2147483647], // exactly int4 max
  ])('accepts %s and coerces it to a number', (input, expected) => {
    const result = parse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(expected);
  });

  it.each([
    ['abc', 'non-numeric'],
    ['', 'empty'],
    ['0', 'zero — ids are 1-based'],
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
    ['99999999999999', 'past the length cap'],
  ])('rejects %s (%s)', (input) => {
    expect(parse(input).success).toBe(false);
  });

  // Express decodes path params, so these are what req.params.id actually holds for
  // a request to /api/recipes/..%2F..%2Fetc — the reason upload.ts must never build
  // a filesystem path from the raw value.
  it.each(['../../etc', '../1', '1/../2', '..', '.'])('rejects the traversal form %s', (input) => {
    expect(parse(input).success).toBe(false);
  });

  it('rejects non-string values, so a qs object never coerces', () => {
    expect(parse({ equals: 1 }).success).toBe(false);
    expect(parse(['1', '2']).success).toBe(false);
    expect(parse(1).success).toBe(false);
    expect(parse(undefined).success).toBe(false);
    expect(parse(null).success).toBe(false);
  });
});
