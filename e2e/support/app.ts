// Small UI actions several specs repeat. Selectors go by role, label and English text only — the
// accessible surface of the page is what a rewrite is most likely to keep.
import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { E2E_ROOT } from './env.ts';

export type AddRecipeEntry =
  'Manually' | 'Import JSON-LD' | 'Paste URL' | 'From a photo' | 'Create with AI';

export async function openAddRecipeMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add recipe' }).click();
}

export async function chooseAddRecipe(page: Page, entry: AddRecipeEntry): Promise<void> {
  await openAddRecipeMenu(page);
  await page.getByRole('link', { name: entry, exact: true }).click();
}

export async function openUserMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Profile' }).click();
}

export async function logOut(page: Page): Promise<void> {
  await openUserMenu(page);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Profile' })).toBeHidden();
}

export async function logIn(page: Page, email: string, password: string): Promise<void> {
  // Client-side navigation swaps the URL before the old page unmounts; wait for this one.
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/**
 * One of the recipe detail page's actions (Export, Edit, Improve with AI, Delete). They sit in a
 * row on wide screens and behind a "Menu" button on narrow ones, so the menu is opened only when
 * there is one.
 */
export async function recipeAction(page: Page, name: string): Promise<Locator> {
  await expect(page.getByRole('link', { name: 'Edit', exact: true }).first()).toBeAttached();
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
  return page
    .getByRole('link', { name, exact: true })
    .or(page.getByRole('button', { name, exact: true }))
    .filter({ visible: true });
}

export async function openNewRecipeForm(page: Page): Promise<void> {
  await page.goto('/');
  await chooseAddRecipe(page, 'Manually');
  await expect(page).toHaveURL('/recipes/new');
  await expect(page.getByRole('heading', { name: 'Add a recipe' })).toBeVisible();
}

export const FIXTURE_FILES = {
  dishJpg: path.join(E2E_ROOT, 'fakes/fixtures/dish.jpg'),
  dishPng: path.join(E2E_ROOT, 'fakes/fixtures/dish-2.png'),
  notAnImage: path.join(E2E_ROOT, 'fakes/fixtures/not-an-image.txt'),
};

/** Picks a file through a button's file chooser, as a user would; the file input itself is
 * hidden. */
export async function choosePhoto(page: Page, button: string, file: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button }).click();
  await (await chooser).setFiles(file);
}

/** Uploads a photo on the recipe's edit page and returns the URL the page shows it from. */
export async function uploadRecipePhoto(
  page: Page,
  recipeId: number,
  file = FIXTURE_FILES.dishJpg
): Promise<string> {
  await page.goto(`/recipes/${recipeId}/edit`);
  await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible();
  await choosePhoto(page, 'Upload recipe photo', file);
  await expect(page.getByRole('button', { name: 'Replace recipe photo' })).toBeVisible();
  return (await page.getByRole('img', { name: 'Recipe photo' }).getAttribute('src'))!;
}

/** `/recipes/123` → 123, for pages reached by a redirect after saving. */
export function recipeIdFromUrl(page: Page): number {
  const match = new URL(page.url()).pathname.match(/^\/recipes\/(\d+)/);
  if (!match) throw new Error(`Not on a recipe page: ${page.url()}`);
  return Number(match[1]);
}
