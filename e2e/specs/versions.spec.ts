import { expect, test } from '../support/fixtures.ts';
import { recipeAction } from '../support/app.ts';
import type { Page } from '@playwright/test';

const RECIPE = {
  title: 'Tomato Soup',
  ingredients: [{ raw: '500 g tomatoes', amount: 500, unit: 'g', name: 'tomatoes' }],
  instructions: ['Simmer the tomatoes.'],
};

/** Edits the recipe through the form, which is what makes the app save a version. */
async function editTitle(page: Page, recipeId: number, title: string): Promise<void> {
  await page.goto(`/recipes/${recipeId}/edit`);
  await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible();
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page).toHaveURL(`/recipes/${recipeId}`);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

async function openHistory(page: Page, recipeId: number): Promise<void> {
  await page.goto(`/recipes/${recipeId}`);
  await (await recipeAction(page, 'Version history')).click();
  await expect(page).toHaveURL(`/recipes/${recipeId}/versions`);
  await expect(page.getByRole('heading', { name: 'Version history', level: 1 })).toBeVisible();
}

test.describe('recipe version history', () => {
  test('a recipe that was never edited has no versions', async ({ page, user, db }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    await openHistory(page, id);
    await expect(page.getByText(/No earlier versions yet/)).toBeVisible();
    expect(await db.recipeVersionCount(id)).toBe(0);
  });

  test('each edit saves the replaced state as a version', async ({ page, user, db }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    await editTitle(page, id, 'Roasted Tomato Soup');
    expect(await db.recipeVersionCount(id)).toBe(1);
    await editTitle(page, id, 'Smoky Tomato Soup');
    expect(await db.recipeVersionCount(id)).toBe(2);

    await openHistory(page, id);
    await expect(page.getByLabel('Compare with').locator('option')).toHaveCount(2);
  });

  test('compares the selected version with the current one', async ({ page, user, db }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    await editTitle(page, id, 'Roasted Tomato Soup');
    await openHistory(page, id);

    await expect(page.getByText(/\d+ differences? highlighted/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Selected version' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Current version' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Tomato Soup', level: 3, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Roasted Tomato Soup', level: 3, exact: true })
    ).toBeVisible();
    await expect(page.locator('mark').first()).toBeVisible();
  });

  test('an older version can be chosen', async ({ page, user, db }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    await editTitle(page, id, 'Roasted Tomato Soup');
    await editTitle(page, id, 'Smoky Tomato Soup');
    await openHistory(page, id);

    // Newest version is selected first: the state just before "Smoky".
    await expect(
      page.getByRole('heading', { name: 'Roasted Tomato Soup', level: 3, exact: true })
    ).toBeVisible();
    await page.getByLabel('Compare with').selectOption({ index: 1 });
    await expect(
      page.getByRole('heading', { name: 'Tomato Soup', level: 3, exact: true })
    ).toBeVisible();
  });

  test('reverting restores the selected version and is itself undoable', async ({
    page,
    user,
    db,
  }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    await editTitle(page, id, 'Roasted Tomato Soup');
    await openHistory(page, id);

    await page.getByRole('button', { name: 'Revert to this version' }).click();
    await expect(page.getByText('Recipe reverted to the selected version')).toBeVisible();
    await expect(page).toHaveURL(`/recipes/${id}`);
    await expect(page.getByRole('heading', { name: 'Tomato Soup', level: 1 })).toBeVisible();
    expect(await db.recipeTitles(user.familyId)).toEqual(['Tomato Soup']);
    expect(await db.recipeVersionCount(id)).toBe(2);
  });

  test('cancelling leaves the recipe as it is', async ({ page, user, db }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    await editTitle(page, id, 'Roasted Tomato Soup');
    await openHistory(page, id);

    await page.getByRole('link', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(`/recipes/${id}`);
    await expect(
      page.getByRole('heading', { name: 'Roasted Tomato Soup', level: 1 })
    ).toBeVisible();
    expect(await db.recipeVersionCount(id)).toBe(1);
  });

  test('another family cannot see the history', async ({ newSession, user, db }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    const other = await newSession();
    await other.page.goto(`/recipes/${id}/versions`);
    await expect(other.page.getByRole('heading', { name: 'Version history' })).toBeHidden();
    await expect(other.page.getByText('Tomato Soup')).toBeHidden();
  });
});
