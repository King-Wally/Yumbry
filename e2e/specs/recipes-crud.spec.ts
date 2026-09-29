import type { Page } from '@playwright/test';
import { openNewRecipeForm, recipeAction, recipeIdFromUrl } from '../support/app.ts';
import { expect, test } from '../support/fixtures.ts';

async function expectServings(page: Page, servings: number): Promise<void> {
  await expect(page.getByRole('status', { name: 'Servings' })).toHaveText(String(servings));
}

/** Category and tag names are stored lower-cased and shown capitalised by styling, so a badge is
 * matched on its whole text, ignoring case. */
function badge(name: string): RegExp {
  return new RegExp(`^${name}$`, 'i');
}

test.describe('creating a recipe manually', () => {
  test('every field of the form is saved and shown on the detail page', async ({
    page,
    user,
    db,
  }) => {
    // An earlier recipe gives the form an existing tag to suggest.
    await db.insertRecipe(user.familyId, user.id, { title: 'Older Salad', tags: ['Vegetarian'] });
    await openNewRecipeForm(page);

    await page.getByLabel('Title').fill('Sunday Pancakes');
    await page.getByLabel('Description').fill('Fluffy and golden.');
    await page.getByLabel('Prep (min)').fill('10');
    await page.getByLabel('Cook (min)').fill('20');
    await page.getByLabel('Total (min)').fill('30');
    await page.getByRole('button', { name: 'Increase servings' }).click();
    await page.getByRole('button', { name: 'Increase servings' }).click();
    await expectServings(page, 6);

    await page.getByPlaceholder('Or type a new category').fill('Brunch');
    await page.getByRole('button', { name: 'Set' }).click();
    await expect(page.getByText('Selected:')).toContainText('Brunch');

    const tagInput = page.getByPlaceholder('Add a tag and press Enter');
    await tagInput.fill('veg');
    await page.getByRole('button', { name: 'Vegetarian' }).click();
    // A differently-cased repeat of a tag already on the recipe is ignored...
    await tagInput.fill('VEGETARIAN');
    await tagInput.press('Enter');
    await tagInput.fill('Sweet');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await tagInput.fill('sweet');
    await tagInput.press('Enter');
    // ...so there are exactly two tags.
    await expect(page.getByRole('button', { name: 'Remove tag' })).toHaveCount(2);

    await page.getByLabel('Ingredient 1', { exact: true }).fill('200 g flour');
    await page.getByRole('button', { name: '+ Add ingredient' }).click();
    await page.getByLabel('Ingredient 2', { exact: true }).fill('300 ml milk');
    await page.getByRole('button', { name: '+ Add ingredient' }).click();
    await page.getByLabel('Ingredient 3', { exact: true }).fill('salt to taste');

    await page.getByLabel('Step 1', { exact: true }).fill('Whisk everything together.');
    await page.getByRole('button', { name: '+ Add step' }).click();
    await page.getByLabel('Step 2', { exact: true }).fill('Fry in a hot pan.');

    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page).toHaveURL(/\/recipes\/\d+$/);
    await expect(page.getByRole('heading', { name: 'Sunday Pancakes', level: 1 })).toBeVisible();
    await expect(page.getByText('Fluffy and golden.')).toBeVisible();
    await expect(page.getByText('10 min')).toBeVisible();
    await expect(page.getByText('20 min')).toBeVisible();
    await expect(page.getByText('30 min')).toBeVisible();
    await expectServings(page, 6);
    await expect(page.getByText(badge('Brunch'))).toBeVisible();
    await expect(page.getByText(badge('Vegetarian'))).toBeVisible();
    await expect(page.getByText(badge('Sweet'))).toBeVisible();

    const ingredientList = page
      .getByRole('list')
      .filter({ has: page.getByText('salt to taste', { exact: true }) });
    await expect(ingredientList.getByRole('listitem')).toHaveText([
      /200 g flour/,
      /300 ml milk/,
      'salt to taste',
    ]);
    const stepList = page
      .getByRole('list')
      .filter({ has: page.getByText('Fry in a hot pan.', { exact: true }) });
    await expect(stepList.getByRole('listitem')).toHaveText([
      /Whisk everything together\./,
      /Fry in a hot pan\./,
    ]);

    expect(await db.recipeExists(recipeIdFromUrl(page))).toBe(true);
  });

  test('an existing category can be picked instead of typing one', async ({ page, user, db }) => {
    await db.insertRecipe(user.familyId, user.id, { title: 'Roast', category: 'Dinner' });
    await openNewRecipeForm(page);

    await page.getByLabel('Title').fill('Lasagne');
    await page.getByRole('button', { name: 'Dinner', exact: true }).click();
    await expect(page.getByText('Selected:')).toContainText('Dinner');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Lasagne', level: 1 })).toBeVisible();
    await expect(page.getByText(badge('Dinner'))).toBeVisible();
  });

  test('a recipe cannot be saved without a title', async ({ page, user, db }) => {
    await openNewRecipeForm(page);
    await page.getByLabel('Description').fill('Nameless dish');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page).toHaveURL('/recipes/new');
    const title = page.getByLabel('Title');
    expect(await title.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(
      true
    );
    expect(await db.recipeTitles(user.familyId)).toEqual([]);
  });
});

test.describe('editing a recipe', () => {
  test('the form opens with the saved values and saves changes', async ({ page, user, db }) => {
    await db.insertRecipe(user.familyId, user.id, { title: 'Other', category: 'Dinner' });
    const recipeId = await db.insertRecipe(user.familyId, user.id, {
      title: 'Tomato Soup',
      description: 'Warming.',
      servings: 2,
      prepTimeMinutes: 5,
      cookTimeMinutes: 25,
      totalTimeMinutes: 30,
      category: 'Lunch',
      tags: ['Soup'],
      ingredients: [{ raw: '500 g tomatoes', amount: 500, unit: 'g', name: 'tomatoes' }],
      instructions: ['Simmer the tomatoes.'],
    });

    await page.goto(`/recipes/${recipeId}`);
    await expect(page.getByRole('heading', { name: 'Tomato Soup', level: 1 })).toBeVisible();
    await (await recipeAction(page, 'Edit')).click();
    await expect(page).toHaveURL(`/recipes/${recipeId}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible();

    await expect(page.getByLabel('Title')).toHaveValue('Tomato Soup');
    await expect(page.getByLabel('Description')).toHaveValue('Warming.');
    await expect(page.getByLabel('Prep (min)')).toHaveValue('5');
    await expect(page.getByLabel('Cook (min)')).toHaveValue('25');
    await expect(page.getByLabel('Total (min)')).toHaveValue('30');
    await expectServings(page, 2);
    await expect(page.getByText('Selected:')).toContainText('Lunch');
    await expect(page.getByRole('button', { name: 'Remove tag' })).toHaveCount(1);
    await expect(page.getByPlaceholder('e.g. 1 1/2 cups flour')).toHaveValue('500 g tomatoes');
    await expect(page.getByPlaceholder('Describe this step')).toHaveValue('Simmer the tomatoes.');

    await page.getByLabel('Title').fill('Roasted Tomato Soup');
    await page.getByLabel('Cook (min)').fill('40');
    await page.getByRole('button', { name: 'Dinner', exact: true }).click();
    await page.getByRole('button', { name: 'Remove tag' }).click();
    await page.getByPlaceholder('Add a tag and press Enter').fill('Smoky');
    await page.getByPlaceholder('Add a tag and press Enter').press('Enter');
    await page.getByRole('button', { name: '+ Add step' }).click();
    await page.getByPlaceholder('Describe this step').nth(1).fill('Blend until smooth.');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page).toHaveURL(`/recipes/${recipeId}`);
    await expect(
      page.getByRole('heading', { name: 'Roasted Tomato Soup', level: 1 })
    ).toBeVisible();
    await expect(page.getByText('40 min')).toBeVisible();
    await expect(page.getByText(badge('Dinner'))).toBeVisible();
    await expect(page.getByText(badge('Lunch'))).toBeHidden();
    await expect(page.getByText(badge('Smoky'))).toBeVisible();
    await expect(page.getByText(badge('Soup'))).toBeHidden();
    await expect(page.getByText('Blend until smooth.')).toBeVisible();
    expect(await db.recipeTitles(user.familyId)).toContain('Roasted Tomato Soup');
  });
});

test.describe('deleting a recipe', () => {
  test('asks for confirmation; cancelling keeps the recipe, confirming removes it', async ({
    page,
    user,
    db,
  }) => {
    const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Doomed Quiche' });
    await page.goto(`/recipes/${recipeId}`);
    await expect(page.getByRole('heading', { name: 'Doomed Quiche', level: 1 })).toBeVisible();

    await (await recipeAction(page, 'Delete')).click();
    const dialog = page.getByRole('dialog', { name: 'Delete this recipe?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('This cannot be undone.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(`/recipes/${recipeId}`);
    expect(await db.recipeExists(recipeId)).toBe(true);

    await (await recipeAction(page, 'Delete')).click();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText('No recipes yet. Try importing or adding one.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Doomed Quiche' })).toBeHidden();
    expect(await db.recipeExists(recipeId)).toBe(false);
  });
});
