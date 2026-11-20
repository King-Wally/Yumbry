import { type Locator, type Page } from '@playwright/test';
import { DEFAULT_RECIPE } from '../../e2e/fakes/defaults.ts';
import { chooseAddRecipe, FIXTURE_FILES, recipeAction } from '../../e2e/support/app.ts';
import { MODELS } from '../../e2e/support/env.ts';
import { type FakesClient } from '../../e2e/support/fakes-client.ts';
import { expect, test } from '../../e2e/support/fixtures.ts';

const AI_DRAFT_BANNER = 'Reviewing an AI-generated draft — check it carefully before saving.';
const PHOTO_DRAFT_BANNER =
	'Reviewing a recipe read from a photo — check the amounts carefully before saving.';

/** The draft preview on the AI chat page renders the recipe title as its only level-2 heading. */
function previewTitle(page: Page, title: string): Locator {
	return page.getByRole('heading', { name: title, level: 2 });
}

async function openCreateWithAi(page: Page): Promise<void> {
	await page.goto('/');
	await chooseAddRecipe(page, 'Create with AI');
	await expect(page.getByRole('heading', { name: 'Create with AI', level: 1 })).toBeVisible();
}

async function sendChat(page: Page, placeholder: string, text: string): Promise<void> {
	const input = page.getByPlaceholder(placeholder);
	await expect(input).toBeEnabled();
	await input.fill(text);
	await page.getByRole('button', { name: 'Send' }).click();
}

const createPrompt = (page: Page, text: string) =>
	sendChat(page, "Tell the AI what you'd like to cook", text);
const changePrompt = (page: Page, text: string) =>
	sendChat(page, 'Tell the AI what to change', text);

/** Photo requests carry no key (the image is re-encoded server-side), so count by model. */
async function imageModelRequestCount(fakes: FakesClient): Promise<number> {
	const recorded = await fakes.requests(`"model":"${MODELS.image}"`);
	return recorded.filter((request) => request.model === MODELS.image).length;
}

test.describe('Create with AI', () => {
	test('a prompt drafts a recipe shown in the transcript and the live preview', async ({
		page,
		user,
		fakes,
		key
	}) => {
		void user;
		await fakes.queueRecipe(
			key,
			{ title: 'Smoky Chipotle Chili' },
			'A smoky chili that serves four.'
		);
		await openCreateWithAi(page);
		await expect(
			page.getByText('Your recipe will appear here once you start chatting.')
		).toBeVisible();

		await createPrompt(page, `a smoky chili please ${key}`);

		await expect(page.getByText(`a smoky chili please ${key}`)).toBeVisible();
		await expect(page.getByText('A smoky chili that serves four.')).toBeVisible();
		await expect(previewTitle(page, 'Smoky Chipotle Chili')).toBeVisible();
		await expect(page.getByText('Soften the onion in the oil.')).toBeVisible();
	});

	test('the first turn uses the big model and follow-ups the medium one; saving goes through review', async ({
		page,
		user,
		db,
		fakes,
		key
	}) => {
		await fakes.queueRecipe(key, { title: 'First Draft Risotto' });
		await fakes.queueRecipe(key, { title: 'Mushroom Risotto' }, 'Added mushrooms.');
		await openCreateWithAi(page);

		const save = page.getByRole('button', { name: 'Save and review' });
		await expect(save).toBeDisabled();

		await createPrompt(page, `a creamy risotto ${key}`);
		await expect(previewTitle(page, 'First Draft Risotto')).toBeVisible();
		await expect(save).toBeEnabled();

		await createPrompt(page, 'add mushrooms');
		await expect(page.getByText('Added mushrooms.')).toBeVisible();
		await expect(previewTitle(page, 'Mushroom Risotto')).toBeVisible();

		const models = (await fakes.requests(key)).map((request) => request.model);
		expect(models).toEqual([MODELS.big, MODELS.medium]);

		await save.click();
		await expect(page).toHaveURL('/recipes/new');
		await expect(page.getByText(AI_DRAFT_BANNER)).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveValue('Mushroom Risotto');
		await expect(page.getByPlaceholder('e.g. 1 1/2 cups flour')).toHaveCount(
			DEFAULT_RECIPE.ingredients.length
		);
		await expect(page.getByPlaceholder('Describe this step').first()).toHaveValue(
			DEFAULT_RECIPE.instructions[0]
		);
		expect(await db.recipeTitles(user.familyId)).toEqual([]);

		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect(page).toHaveURL(/\/recipes\/\d+$/);
		await expect(page.getByRole('heading', { name: 'Mushroom Risotto', level: 1 })).toBeVisible();
		expect(await db.recipeTitles(user.familyId)).toEqual(['Mushroom Risotto']);
	});

	test('switching units to imperial redraws the preview without asking the AI again', async ({
		page,
		user,
		fakes,
		key
	}) => {
		void user;
		await fakes.queueRecipe(key, { title: 'Unit Switch Soup' });
		await openCreateWithAi(page);
		await createPrompt(page, `tomato soup ${key}`);
		await expect(previewTitle(page, 'Unit Switch Soup')).toBeVisible();
		await expect(page.getByText('800 g tomatoes')).toBeVisible();
		const requestsBefore = (await fakes.requests(key)).length;

		await page.getByLabel('Units').selectOption({ label: 'Imperial (oz, cups, °F)' });

		await expect(page.getByText('800 g tomatoes')).toBeHidden();
		await expect(page.getByText(/\boz tomatoes\b|\blb tomatoes\b/)).toBeVisible();
		await expect(previewTitle(page, 'Unit Switch Soup')).toBeVisible();
		expect((await fakes.requests(key)).length).toBe(requestsBefore);
	});

	test('a failing AI provider shows an error and the chat stays usable', async ({
		page,
		user,
		fakes,
		key
	}) => {
		void user;
		await fakes.queue(key, { status: 503 });
		await fakes.queueRecipe(key, { title: 'Second Try Stew' });
		await openCreateWithAi(page);

		await createPrompt(page, `a hearty stew ${key}`);
		await expect(page.getByText(/AI provider/i)).toBeVisible();
		await expect(
			page.getByText('Your recipe will appear here once you start chatting.')
		).toBeVisible();

		await createPrompt(page, `try again ${key}`);
		await expect(previewTitle(page, 'Second Try Stew')).toBeVisible();
		await expect(page.getByText(/AI provider/i)).toBeHidden();
	});
});

test.describe('Improve with AI', () => {
	test('the preview starts from the saved recipe, and the change lands on the edit form', async ({
		page,
		user,
		db,
		fakes,
		key
	}) => {
		const title = `Plain Lentil Dal ${key}`;
		const recipeId = await db.insertRecipe(user.familyId, user.id, {
			title,
			notes: 'Too bland last time.',
			servings: 2,
			ingredients: [{ raw: '200 g red lentils', amount: 200, unit: 'g', name: 'red lentils' }],
			instructions: ['Simmer the lentils until soft.']
		});
		await fakes.queueRecipe(key, { title: 'Spicy Lentil Dal' }, 'Made it spicier.');

		await page.goto(`/recipes/${recipeId}`);
		await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
		await (await recipeAction(page, 'Improve with AI')).click();
		await expect(page).toHaveURL(`/recipes/${recipeId}/ai-improve`);
		await expect(page.getByRole('heading', { name: 'Improve with AI', level: 1 })).toBeVisible();

		// Seeded from the saved recipe without asking the AI anything.
		await expect(previewTitle(page, title)).toBeVisible();
		await expect(page.getByText('200 g red lentils')).toBeVisible();
		expect(await fakes.requests(key)).toHaveLength(0);

		await changePrompt(page, 'make it spicier');
		await expect(page.getByText('Made it spicier.')).toBeVisible();
		await expect(previewTitle(page, 'Spicy Lentil Dal')).toBeVisible();

		const [request] = await fakes.requests(key);
		expect(request.model).toBe(MODELS.medium);
		expect(JSON.stringify(request.body)).toContain(title);
		expect(JSON.stringify(request.body)).toContain('red lentils');
		// The model reads the family's notes, from the server rather than the page.
		expect(JSON.stringify(request.body)).toContain('Too bland last time.');

		await page.getByRole('button', { name: 'Save and review' }).click();
		await expect(page).toHaveURL(`/recipes/${recipeId}/edit`);
		await expect(page.getByText(AI_DRAFT_BANNER)).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveValue('Spicy Lentil Dal');
		await expect(page.getByLabel('Notes')).toHaveValue('Too bland last time.');

		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect(page).toHaveURL(`/recipes/${recipeId}`);
		await expect(page.getByRole('heading', { name: 'Spicy Lentil Dal', level: 1 })).toBeVisible();
		await expect(page.getByText('Too bland last time.')).toBeVisible();
		expect(await db.recipeTitles(user.familyId)).toEqual(['Spicy Lentil Dal']);
	});
});

test.describe('Improve with AI failures', () => {
	test('a failing provider shows an error and the saved recipe stays untouched', async ({
		page,
		user,
		db,
		fakes,
		key
	}) => {
		const title = `Stable Soup ${key}`;
		const recipeId = await db.insertRecipe(user.familyId, user.id, {
			title,
			ingredients: [{ raw: '1 onion', amount: 1, name: 'onion' }],
			instructions: ['Simmer.']
		});
		await fakes.queue(key, { status: 503 });

		await page.goto(`/recipes/${recipeId}/ai-improve`);
		await expect(previewTitle(page, title)).toBeVisible();
		await changePrompt(page, `make it richer ${key}`);

		await expect(page.getByText(/AI provider/i)).toBeVisible();
		await expect(previewTitle(page, title)).toBeVisible();
		expect(await db.recipeTitles(user.familyId)).toEqual([title]);
		expect(await db.recipeVersionCount(recipeId)).toBe(0);
	});

	test('applying a change through the edit form saves a version of the old recipe', async ({
		page,
		user,
		db,
		fakes,
		key
	}) => {
		const title = `Versioned Dal ${key}`;
		const recipeId = await db.insertRecipe(user.familyId, user.id, {
			title,
			ingredients: [{ raw: '200 g lentils', amount: 200, unit: 'g', name: 'lentils' }],
			instructions: ['Simmer.']
		});
		await fakes.queueRecipe(key, { title: `Better Dal ${key}` }, 'Improved.');

		await page.goto(`/recipes/${recipeId}/ai-improve`);
		await expect(previewTitle(page, title)).toBeVisible();
		await changePrompt(page, `improve ${key}`);
		await expect(page.getByText('Improved.')).toBeVisible();
		await page.getByRole('button', { name: 'Save and review' }).click();
		await expect(page).toHaveURL(`/recipes/${recipeId}/edit`);
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect(page).toHaveURL(`/recipes/${recipeId}`);

		await expect.poll(() => db.recipeVersionCount(recipeId)).toBe(1);
	});
});

test.describe('Photo import', () => {
	test('a photo is read by the vision model into a draft for review', async ({
		page,
		user,
		db,
		fakes
	}) => {
		const imageRequestsBefore = await imageModelRequestCount(fakes);
		await page.goto('/');
		await chooseAddRecipe(page, 'From a photo');
		await expect(page.getByRole('heading', { name: 'Add from a photo' })).toBeVisible();

		await page.getByLabel('Upload a photo').setInputFiles(FIXTURE_FILES.dishJpg);
		await expect(page.getByRole('img', { name: 'The photo to import' })).toBeVisible();
		await page.getByRole('button', { name: 'Create recipe from photo' }).click();

		await expect(page).toHaveURL('/recipes/new');
		await expect(page.getByText(PHOTO_DRAFT_BANNER)).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveValue(DEFAULT_RECIPE.title);
		await expect(page.getByPlaceholder('Describe this step')).toHaveCount(
			DEFAULT_RECIPE.instructions.length
		);
		expect(await imageModelRequestCount(fakes)).toBeGreaterThan(imageRequestsBefore);
		expect(await db.recipeTitles(user.familyId)).toEqual([]);
	});
});

test.describe('Photo import refusals', () => {
	test('a file that is not an image is refused', async ({ page, user }) => {
		void user;
		await page.goto('/import/photo');
		await expect(page.getByRole('heading', { name: 'Add from a photo' })).toBeVisible();
		await page.getByLabel('Upload a photo').setInputFiles(FIXTURE_FILES.notAnImage);
		await page.getByRole('button', { name: 'Create recipe from photo' }).click();

		await expect(page.getByText('Only image uploads are allowed.')).toBeVisible();
		await expect(page).toHaveURL('/import/photo');
	});
});

test.describe('Nutrition estimate', () => {
	test('Estimate with AI fills the nutrition fields, keeping typed values the AI leaves blank', async ({
		page,
		user,
		fakes,
		key
	}) => {
		void user;
		await fakes.queue(key, {
			content: { calories: 321, fat_content: null, carbohydrate_content: 40, protein_content: 12 }
		});
		await page.goto('/');
		await chooseAddRecipe(page, 'Manually');
		await expect(page.getByRole('heading', { name: 'Add a recipe' })).toBeVisible();

		const estimate = page.getByRole('button', { name: 'Estimate with AI' });
		await expect(estimate).toBeDisabled();

		await page.getByLabel('Title').fill(`Nutrition Bowl ${key}`);
		await page.getByPlaceholder('e.g. 1 1/2 cups flour').first().fill('150 g cooked rice');
		await page.getByLabel('Fat (g)').fill('9');
		await estimate.click();

		await expect(page.getByLabel('Calories (kcal)')).toHaveValue('321');
		await expect(page.getByLabel('Carbs (g)')).toHaveValue('40');
		await expect(page.getByLabel('Protein (g)')).toHaveValue('12');
		await expect(page.getByLabel('Fat (g)')).toHaveValue('9');

		const models = (await fakes.requests(key)).map((request) => request.model);
		expect(models).toEqual([MODELS.small]);
	});
});
