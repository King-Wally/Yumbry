import { describe, expect, it } from 'vitest';
import type { RecipeDetail } from '#lib/shared/recipe/dto.ts';
import { toRecipeSnapshot } from '#lib/shared/recipe/snapshot.ts';

const recipe: RecipeDetail = {
	id: 7,
	title: 'Pancakes',
	description: 'Fluffy',
	image_path: '/uploads/recipes/7/photo.webp',
	prep_time_minutes: 10,
	cook_time_minutes: null,
	total_time_minutes: 10,
	servings: '4',
	calories: '420',
	fat_content: null,
	carbohydrate_content: '50.5',
	protein_content: null,
	category_id: 3,
	share_token: null,
	created_at: new Date('2026-01-01T00:00:00Z'),
	updated_at: new Date('2026-01-02T00:00:00Z'),
	category: { id: 3, name: 'Breakfast' },
	tags: [
		{ id: 2, name: 'sweet' },
		{ id: 1, name: 'quick' }
	],
	ingredients: [
		{
			id: 11,
			recipe_id: 7,
			raw_text: '1 cup milk',
			amount: '1',
			unit: 'cup',
			name: 'milk',
			is_scalable: true,
			sort_order: 1
		},
		{
			id: 10,
			recipe_id: 7,
			raw_text: '2 eggs',
			amount: '2',
			unit: null,
			name: 'eggs',
			is_scalable: true,
			sort_order: 0
		}
	],
	instructions: [
		{ id: 21, recipe_id: 7, step_number: 2, text: 'Fry' },
		{ id: 20, recipe_id: 7, step_number: 1, text: 'Mix' }
	]
};

describe('toRecipeSnapshot', () => {
	it('keeps the content, with tags and category by name and ingredients as their lines', () => {
		expect(toRecipeSnapshot(recipe)).toEqual({
			title: 'Pancakes',
			description: 'Fluffy',
			prep_time_minutes: 10,
			cook_time_minutes: null,
			total_time_minutes: 10,
			servings: '4',
			calories: '420',
			fat_content: null,
			carbohydrate_content: '50.5',
			protein_content: null,
			category: 'Breakfast',
			tags: ['quick', 'sweet'],
			ingredients: ['2 eggs', '1 cup milk'],
			instructions: [
				{ step_number: 1, text: 'Mix' },
				{ step_number: 2, text: 'Fry' }
			]
		});
	});

	it('leaves out the photo and the ids', () => {
		const snapshot = toRecipeSnapshot(recipe);
		expect(snapshot).not.toHaveProperty('image_path');
		expect(snapshot).not.toHaveProperty('id');
		expect(snapshot).not.toHaveProperty('category_id');
	});

	it('records a missing category as null', () => {
		expect(toRecipeSnapshot({ ...recipe, category: null, category_id: null }).category).toBeNull();
	});

	it('does not reorder the input arrays', () => {
		toRecipeSnapshot(recipe);
		expect(recipe.ingredients.map((i) => i.sort_order)).toEqual([1, 0]);
		expect(recipe.instructions.map((i) => i.step_number)).toEqual([2, 1]);
	});
});
