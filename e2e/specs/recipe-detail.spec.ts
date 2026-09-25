import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import type { SeedRecipe } from '../support/db.ts';

const PANCAKES: SeedRecipe = {
  title: 'Buttermilk Pancakes',
  description: 'Weekend breakfast.',
  servings: 4,
  prepTimeMinutes: 10,
  cookTimeMinutes: 15,
  totalTimeMinutes: 25,
  calories: 420,
  fatContent: 14.5,
  carbohydrateContent: 55,
  proteinContent: 12,
  category: 'breakfast',
  tags: ['sweet', 'quick'],
  ingredients: [
    { raw: '200 g flour', amount: 200, unit: 'g', name: 'flour' },
    { raw: '2 eggs', amount: 2, name: 'eggs' },
    { raw: 'salt to taste' },
  ],
  instructions: ['Mix the batter.', 'Cook on a griddle.'],
};

function ingredientItems(page: Page) {
  return page
    .getByRole('list')
    .filter({ has: page.getByText('salt to taste', { exact: true }) })
    .getByRole('listitem');
}

async function openRecipe(page: Page, id: number, title: string): Promise<void> {
  await page.goto(`/recipes/${id}`);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

test.describe('scaling servings', () => {
  test('changing servings scales measured ingredients but not free-text lines', async ({
    page,
    user,
    db,
  }) => {
    const id = await db.insertRecipe(user.familyId, user.id, PANCAKES);
    await openRecipe(page, id, PANCAKES.title);

    await expect(ingredientItems(page)).toHaveText(['200 g flour', '2 eggs', 'salt to taste']);

    const increase = page.getByRole('button', { name: 'Increase servings' });
    for (let i = 0; i < 4; i++) await increase.click();
    await expect(ingredientItems(page)).toHaveText(['400 g flour', '4 eggs', 'salt to taste']);

    const decrease = page.getByRole('button', { name: 'Decrease servings' });
    await decrease.click();
    await decrease.click();
    await expect(ingredientItems(page)).toHaveText(['300 g flour', '3 eggs', 'salt to taste']);
  });

  test('servings cannot go below one', async ({ page, user, db }) => {
    const id = await db.insertRecipe(user.familyId, user.id, { ...PANCAKES, servings: 2 });
    await openRecipe(page, id, PANCAKES.title);

    const decrease = page.getByRole('button', { name: 'Decrease servings' });
    await decrease.click();
    await expect(ingredientItems(page).first()).toHaveText('100 g flour');
    await expect(decrease).toBeDisabled();
  });

  test('nutrition is per serving and does not change with servings', async ({ page, user, db }) => {
    const id = await db.insertRecipe(user.familyId, user.id, PANCAKES);
    await openRecipe(page, id, PANCAKES.title);

    await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeVisible();
    await expect(page.getByText('Per serving')).toBeVisible();
    const nutrition = [/^420\s*kcal$/, /^14\.5\s*g$/, /^55\s*g$/, /^12\s*g$/];
    for (const value of nutrition) await expect(page.getByText(value)).toBeVisible();

    await page.getByRole('button', { name: 'Increase servings' }).click();
    await page.getByRole('button', { name: 'Increase servings' }).click();
    await expect(ingredientItems(page).first()).toHaveText('300 g flour');
    for (const value of nutrition) await expect(page.getByText(value)).toBeVisible();
  });

  test('a recipe without nutrition shows no nutrition block', async ({ page, user, db }) => {
    const id = await db.insertRecipe(user.familyId, user.id, { title: 'Plain Rice' });
    await openRecipe(page, id, 'Plain Rice');
    await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeHidden();
  });
});

test('the detail page shows times, category, tags and steps', async ({ page, user, db }) => {
  const id = await db.insertRecipe(user.familyId, user.id, PANCAKES);
  await openRecipe(page, id, PANCAKES.title);

  await expect(page.getByText('Weekend breakfast.')).toBeVisible();
  await expect(page.getByText('Prep', { exact: true })).toBeVisible();
  await expect(page.getByText('10 min')).toBeVisible();
  await expect(page.getByText('Cook', { exact: true })).toBeVisible();
  await expect(page.getByText('15 min')).toBeVisible();
  await expect(page.getByText('Total', { exact: true })).toBeVisible();
  await expect(page.getByText('25 min')).toBeVisible();
  for (const badge of ['breakfast', 'sweet', 'quick']) {
    await expect(page.getByText(badge, { exact: true })).toBeVisible();
  }
  const steps = page
    .getByRole('list')
    .filter({ has: page.getByText('Mix the batter.', { exact: true }) })
    .getByRole('listitem');
  await expect(steps).toHaveText([/Mix the batter\./, /Cook on a griddle\./]);
});

test('a recipe without a photo says so', async ({ page, user, db }) => {
  const id = await db.insertRecipe(user.familyId, user.id, PANCAKES);
  await openRecipe(page, id, PANCAKES.title);
  await expect(page.getByText('No photo yet')).toBeVisible();
  await expect(page.getByRole('img', { name: PANCAKES.title })).toBeHidden();
});

test('an unknown recipe id shows "Recipe not found."', async ({ page, user }) => {
  void user;
  await page.goto('/recipes/2000000000');
  await expect(page.getByText('Recipe not found.')).toBeVisible();
});
