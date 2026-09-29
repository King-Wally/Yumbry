import fs from 'node:fs/promises';
import { type Page } from '@playwright/test';
import { chooseAddRecipe, openAddRecipeMenu } from '../support/app.ts';
import { env } from '../support/env.ts';
import { expect, test } from '../support/fixtures.ts';

const JSON_LD_PLACEHOLDER = '{ "@context": "https://schema.org", "@type": "Recipe", ... }';

function jsonLdRecipe(name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name,
    description: 'A soup pasted in as structured data.',
    recipeYield: '2',
    recipeIngredient: ['500 g carrots', '1 onion', '750 ml stock'],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Chop the carrots and the onion.' },
      { '@type': 'HowToStep', text: 'Simmer in the stock, then blend.' },
    ],
  };
}

async function openJsonImport(page: Page): Promise<void> {
  await page.goto('/');
  await chooseAddRecipe(page, 'Import JSON-LD');
  await expect(page.getByRole('heading', { name: 'Import a recipe' })).toBeVisible();
}

async function expectCarrotSoupDetail(page: Page, title: string): Promise<void> {
  await expect(page).toHaveURL(/\/recipes\/\d+$/);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('500 g carrots')).toBeVisible();
  await expect(page.getByText('750 ml stock')).toBeVisible();
  await expect(page.getByText('Simmer in the stock, then blend.')).toBeVisible();
}

test.describe('JSON-LD import', () => {
  test('the menu entry only appears when JSON import/export is enabled', async ({
    page,
    user,
    db,
  }) => {
    await db.setJsonImportExport(user.id, false);
    await page.goto('/');
    await openAddRecipeMenu(page);
    await expect(page.getByRole('link', { name: 'Paste URL', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Import JSON-LD', exact: true })).toBeHidden();

    await db.setJsonImportExport(user.id, true);
    await page.reload();
    await openAddRecipeMenu(page);
    await expect(page.getByRole('link', { name: 'Import JSON-LD', exact: true })).toBeVisible();
  });

  test('pasted JSON-LD is saved straight away and opens the new recipe', async ({
    page,
    user,
    db,
  }) => {
    await db.setJsonImportExport(user.id, true);
    await openJsonImport(page);

    const title = 'Pasted Carrot Soup';
    await page.getByPlaceholder(JSON_LD_PLACEHOLDER).fill(JSON.stringify(jsonLdRecipe(title)));
    await page.getByRole('button', { name: 'Import from text' }).click();

    await expectCarrotSoupDetail(page, title);
    expect(await db.recipeTitles(user.familyId)).toEqual([title]);
  });

  test('an uploaded .json file is imported too', async ({ page, user, db }, testInfo) => {
    await db.setJsonImportExport(user.id, true);
    const title = 'Uploaded Carrot Soup';
    const file = testInfo.outputPath('carrot-soup.json');
    await fs.writeFile(file, JSON.stringify(jsonLdRecipe(title)));

    await openJsonImport(page);
    await page.getByLabel('Click to upload a .json file').setInputFiles(file);

    await expectCarrotSoupDetail(page, title);
    expect(await db.recipeTitles(user.familyId)).toEqual([title]);
  });

  test('invalid JSON shows an error and saves nothing', async ({ page, user, db }) => {
    await db.setJsonImportExport(user.id, true);
    await openJsonImport(page);

    await page.getByPlaceholder(JSON_LD_PLACEHOLDER).fill('{ "@type": "Recipe", "name": ');
    await page.getByRole('button', { name: 'Import from text' }).click();

    // The wording is the parser's; any message about malformed JSON will do.
    await expect(page.getByText(/unexpected|invalid|malformed|not valid/i)).toBeVisible();
    await expect(page).toHaveURL('/import');
    expect(await db.recipeTitles(user.familyId)).toEqual([]);
  });
});

test.describe('URL import', () => {
  async function importUrl(page: Page, url: string): Promise<void> {
    await page.goto('/');
    await chooseAddRecipe(page, 'Paste URL');
    await expect(page.getByRole('heading', { name: 'Import from URL' })).toBeVisible();
    await page.getByLabel('Recipe URL').fill(url);
    await page.getByRole('button', { name: 'Import from URL' }).click();
  }

  test('a recipe page pre-fills the form for review, and saving creates it', async ({
    page,
    user,
    db,
  }) => {
    await importUrl(page, `${env.fakesUrl}/sites/pancakes.html`);

    await expect(page).toHaveURL('/recipes/new');
    await expect(
      page.getByText('Reviewing a recipe imported from a URL — check it carefully before saving.')
    ).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Fluffy Fixture Pancakes');
    const ingredients = page.getByPlaceholder('e.g. 1 1/2 cups flour');
    await expect(ingredients).toHaveCount(3);
    await expect(ingredients.nth(0)).toHaveValue('200 g flour');
    await expect(ingredients.nth(2)).toHaveValue('300 ml milk');
    const steps = page.getByPlaceholder('Describe this step');
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(1)).toHaveValue('Fry ladlefuls in a hot pan until golden.');
    // Nothing is saved until the cook confirms the draft.
    expect(await db.recipeTitles(user.familyId)).toEqual([]);

    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page).toHaveURL(/\/recipes\/\d+$/);
    await expect(
      page.getByRole('heading', { name: 'Fluffy Fixture Pancakes', level: 1 })
    ).toBeVisible();
    await expect(page.getByText('200 g flour')).toBeVisible();
    await expect(page.getByText('Whisk everything into a smooth batter.')).toBeVisible();
    expect(await db.recipeTitles(user.familyId)).toEqual(['Fluffy Fixture Pancakes']);
  });

  test('a page without a recipe shows an error and stays put', async ({ page, user, db }) => {
    await importUrl(page, `${env.fakesUrl}/sites/no-recipe.html`);

    await expect(
      page.getByText(/no .*recipe.* (was )?found|couldn't find a recipe/i)
    ).toBeVisible();
    await expect(page).toHaveURL('/import/url');
    await expect(page.getByLabel('Recipe URL')).toBeVisible();
    expect(await db.recipeTitles(user.familyId)).toEqual([]);
  });
});
