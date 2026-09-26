import fs from 'node:fs/promises';
import { type Page } from '@playwright/test';
import { chooseAddRecipe, recipeAction } from '../support/app.ts';
import { type SeedRecipe } from '../support/db.ts';
import { expect, test } from '../support/fixtures.ts';

const GAZPACHO: SeedRecipe = {
  title: 'Export Test Gazpacho',
  description: 'Cold tomato soup for hot days.',
  servings: 4,
  ingredients: [
    { raw: '1 kg ripe tomatoes', amount: 1, unit: 'kg', name: 'ripe tomatoes' },
    { raw: '1 cucumber', amount: 1, name: 'cucumber' },
    { raw: 'salt to taste' },
  ],
  instructions: ['Blend all the vegetables.', 'Chill for two hours before serving.'],
};

async function openSeededRecipe(page: Page, recipeId: number, title: string): Promise<void> {
  await page.goto(`/recipes/${recipeId}`);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

test.describe('JSON export', () => {
  test('Export downloads the recipe as schema.org JSON-LD', async ({ page, user, db }) => {
    await db.setJsonImportExport(user.id, true);
    const recipeId = await db.insertRecipe(user.familyId, user.id, GAZPACHO);
    await openSeededRecipe(page, recipeId, GAZPACHO.title);

    const downloadPromise = page.waitForEvent('download');
    await (await recipeAction(page, 'Export')).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/gazpacho.*\.json$/i);
    const content = await fs.readFile(await download.path(), 'utf-8');
    const jsonLd = JSON.parse(content) as Record<string, unknown>;
    expect(jsonLd['@type']).toBe('Recipe');
    expect(jsonLd.name).toBe(GAZPACHO.title);
    expect(jsonLd.recipeIngredient).toEqual(['1 kg ripe tomatoes', '1 cucumber', 'salt to taste']);
    expect(JSON.stringify(jsonLd.recipeInstructions)).toContain('Chill for two hours');
  });

  test('an exported file imports back as the same recipe', async ({ page, user, db }) => {
    await db.setJsonImportExport(user.id, true);
    const recipeId = await db.insertRecipe(user.familyId, user.id, GAZPACHO);
    await openSeededRecipe(page, recipeId, GAZPACHO.title);

    const downloadPromise = page.waitForEvent('download');
    await (await recipeAction(page, 'Export')).click();
    const download = await downloadPromise;
    const exported = await download.path();

    await chooseAddRecipe(page, 'Import JSON-LD');
    await expect(page.getByRole('heading', { name: 'Import a recipe' })).toBeVisible();
    await page.getByLabel('Click to upload a .json file').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/json',
      buffer: await fs.readFile(exported),
    });

    await expect(page).not.toHaveURL(`/recipes/${recipeId}`);
    await expect(page).toHaveURL(/\/recipes\/\d+$/);
    await expect(page.getByRole('heading', { name: GAZPACHO.title, level: 1 })).toBeVisible();
    for (const ingredient of GAZPACHO.ingredients!) {
      await expect(page.getByText(ingredient.raw, { exact: true })).toBeVisible();
    }
    for (const step of GAZPACHO.instructions!) {
      await expect(page.getByText(step, { exact: true })).toBeVisible();
    }
    expect(await db.recipeTitles(user.familyId)).toEqual([GAZPACHO.title, GAZPACHO.title]);
  });

  test('Export is not offered while JSON import/export is disabled', async ({ page, user, db }) => {
    await db.setJsonImportExport(user.id, false);
    const recipeId = await db.insertRecipe(user.familyId, user.id, GAZPACHO);
    await openSeededRecipe(page, recipeId, GAZPACHO.title);

    await expect(await recipeAction(page, 'Edit')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Export', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toHaveCount(0);
  });
});
