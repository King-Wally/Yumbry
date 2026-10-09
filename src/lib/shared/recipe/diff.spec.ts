import { describe, expect, it } from 'vitest';
import { diffRecipes, NUTRITION_KEYS, TIME_KEYS } from '#lib/shared/recipe/diff.ts';
import type { RecipeSnapshot } from '#lib/shared/recipe/snapshot.ts';

const base: RecipeSnapshot = {
	title: 'Easy pancakes',
	description: null,
	prep_time_minutes: 10,
	cook_time_minutes: 20,
	total_time_minutes: 30,
	servings: '4',
	calories: '420',
	fat_content: null,
	carbohydrate_content: null,
	protein_content: null,
	category: 'Breakfast',
	tags: ['quick', 'sweet'],
	ingredients: ['2 eggs', '1 cup milk', 'salt'],
	instructions: [
		{ step_number: 1, text: 'Mix everything' },
		{ step_number: 2, text: 'Fry in butter' }
	]
};

const snapshot = (overrides: Partial<RecipeSnapshot>): RecipeSnapshot => ({
	...base,
	...overrides
});

describe('diffRecipes', () => {
	it('reports nothing for identical recipes', () => {
		const diff = diffRecipes(base, snapshot({}));
		expect(diff.changeCount).toBe(0);
		expect(diff.old.title).toEqual([{ text: 'Easy pancakes', changed: false }]);
		expect(diff.current.ingredients).toEqual([
			[{ text: '2 eggs', changed: false }],
			[{ text: '1 cup milk', changed: false }],
			[{ text: 'salt', changed: false }]
		]);
		for (const key of TIME_KEYS) expect(diff.current.times[key].changed).toBe(false);
		for (const key of NUTRITION_KEYS) expect(diff.current.nutrition[key].changed).toBe(false);
	});

	it('highlights only the inserted words, with the gaps as their own unchanged segments', () => {
		const diff = diffRecipes(base, snapshot({ title: 'Easy banana pancakes' }));
		expect(diff.old.title).toEqual([{ text: 'Easy pancakes', changed: false }]);
		expect(diff.current.title).toEqual([
			{ text: 'Easy', changed: false },
			{ text: ' ', changed: false },
			{ text: 'banana', changed: true },
			{ text: ' ', changed: false },
			{ text: 'pancakes', changed: false }
		]);
		expect(diff.changeCount).toBe(1);
	});

	it('treats a missing description as empty', () => {
		const diff = diffRecipes(base, snapshot({ description: 'Fluffy' }));
		expect(diff.old.description).toEqual([]);
		expect(diff.current.description).toEqual([{ text: 'Fluffy', changed: true }]);
		expect(diff.changeCount).toBe(1);
	});

	it('counts each added and removed tag', () => {
		const diff = diffRecipes(base, snapshot({ tags: ['sweet', 'vegetarian'] }));
		expect(diff.old.tags).toEqual([
			{ name: 'quick', changed: true },
			{ name: 'sweet', changed: false }
		]);
		expect(diff.current.tags).toEqual([
			{ name: 'sweet', changed: false },
			{ name: 'vegetarian', changed: true }
		]);
		expect(diff.changeCount).toBe(2);
	});

	it('flags the category and the times on both sides', () => {
		const diff = diffRecipes(base, snapshot({ category: 'Brunch', prep_time_minutes: 15 }));
		expect(diff.old.category).toEqual({ name: 'Breakfast', changed: true });
		expect(diff.current.category).toEqual({ name: 'Brunch', changed: true });
		expect(diff.old.times.prep_time_minutes).toEqual({ value: 10, changed: true });
		expect(diff.current.times.prep_time_minutes).toEqual({ value: 15, changed: true });
		expect(diff.current.times.cook_time_minutes.changed).toBe(false);
		expect(diff.changeCount).toBe(2);
	});

	it('compares numeric columns as numbers', () => {
		const diff = diffRecipes(base, snapshot({ calories: '420.00', servings: '4.0' }));
		expect(diff.changeCount).toBe(0);
		expect(diff.current.nutrition.calories).toEqual({ value: 420, changed: false });
		expect(diff.current.servings).toEqual({ value: '4.0', changed: false });

		const changed = diffRecipes(base, snapshot({ calories: null, servings: '6' }));
		expect(changed.old.nutrition.calories).toEqual({ value: 420, changed: true });
		expect(changed.current.nutrition.calories).toEqual({ value: null, changed: true });
		expect(changed.current.servings).toEqual({ value: '6', changed: true });
		expect(changed.changeCount).toBe(2);
	});

	it('aligns identical ingredient lines and word-diffs the ones between them', () => {
		const diff = diffRecipes(
			base,
			snapshot({ ingredients: ['2 eggs', '1 cup oat milk', 'salt', 'pepper'] })
		);
		expect(diff.old.ingredients).toEqual([
			[{ text: '2 eggs', changed: false }],
			[{ text: '1 cup milk', changed: false }],
			[{ text: 'salt', changed: false }]
		]);
		expect(diff.current.ingredients).toEqual([
			[{ text: '2 eggs', changed: false }],
			[
				{ text: '1 cup', changed: false },
				{ text: ' ', changed: false },
				{ text: 'oat', changed: true },
				{ text: ' ', changed: false },
				{ text: 'milk', changed: false }
			],
			[{ text: 'salt', changed: false }],
			[{ text: 'pepper', changed: true }]
		]);
		expect(diff.changeCount).toBe(2);
	});

	it('highlights a removed line whole and leaves no row for it on the other side', () => {
		const diff = diffRecipes(base, snapshot({ ingredients: ['2 eggs', 'salt'] }));
		expect(diff.old.ingredients[1]).toEqual([{ text: '1 cup milk', changed: true }]);
		expect(diff.current.ingredients).toHaveLength(2);
		expect(diff.changeCount).toBe(1);
	});

	it('compares steps by text, so renumbering alone is not a change', () => {
		const diff = diffRecipes(
			base,
			snapshot({
				instructions: [
					{ step_number: 1, text: 'Heat the pan' },
					{ step_number: 2, text: 'Mix everything' },
					{ step_number: 3, text: 'Fry in butter' }
				]
			})
		);
		expect(diff.current.instructions).toEqual([
			[{ text: 'Heat the pan', changed: true }],
			[{ text: 'Mix everything', changed: false }],
			[{ text: 'Fry in butter', changed: false }]
		]);
		expect(diff.old.instructions).toHaveLength(2);
		expect(diff.changeCount).toBe(1);
	});
});
