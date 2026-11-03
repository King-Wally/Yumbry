import { describe, expect, it } from 'vitest';
import { RecipeBodySchema } from '#lib/server/recipes/body-schema.ts';

const valid = {
	title: 'Soup',
	servings: 2,
	ingredients: [],
	instructions: [{ step_number: 1, text: 'Boil.' }],
	tags: [],
	category: null
};

describe('RecipeBodySchema column limits', () => {
	it('accepts the largest values the columns hold', () => {
		const body = { ...valid, calories: 999999.99, prep_time_minutes: 2147483647 };
		expect(RecipeBodySchema.safeParse(body).success).toBe(true);
	});

	it.each([
		{ calories: 1000000 },
		{ protein_content: 1250000 },
		{ cook_time_minutes: 2147483648 },
		{ instructions: [{ step_number: 2147483648, text: 'x' }] }
	])('rejects %o', (over) => {
		expect(RecipeBodySchema.safeParse({ ...valid, ...over }).success).toBe(false);
	});
});
