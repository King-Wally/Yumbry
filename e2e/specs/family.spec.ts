import type { Page } from '@playwright/test';
import { logIn, openUserMenu } from '../support/app.ts';
import { expect, test } from '../support/fixtures.ts';

async function openSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

/** The invite link as shown in Settings > Family, reduced to a path on this server. */
async function inviteLinkOf(page: Page): Promise<string> {
  await openSettings(page);
  const input = page.getByLabel('Invite link');
  await expect(input).toHaveValue(/\/join-family\/[^/]+$/);
  const url = new URL(await input.inputValue());
  return url.pathname;
}

async function expectRecipeListed(page: Page, title: string): Promise<void> {
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test.describe('joining a family', () => {
  test('a signed-out invitee logs in, joins, and both collections merge', async ({
    page,
    user,
    db,
    newSession,
  }) => {
    await db.insertRecipe(user.familyId, user.id, {
      title: 'Family Lasagne',
      category: 'mains',
      tags: ['baked'],
    });
    const invite = await inviteLinkOf(page);

    // B already has an account with a collection of their own, but is signed out.
    const b = await newSession();
    await db.insertRecipe(b.user.familyId, b.user.id, {
      title: 'Bee Bread',
      category: 'breads',
      tags: ['sourdough'],
    });
    await b.context.clearCookies();

    await b.page.goto(invite);
    await expect(b.page.getByRole('heading', { name: 'Join this family' })).toBeVisible();
    await b.page.getByRole('button', { name: 'Log in to join' }).click();
    await expect(b.page).toHaveURL('/login');
    await logIn(b.page, b.user.email, b.user.password);

    await expect(b.page).toHaveURL(invite);
    await b.page.getByRole('button', { name: 'Join family' }).click();
    await expect(b.page.getByText("You've joined the family", { exact: true })).toBeVisible();
    await expect(b.page).toHaveURL('/');

    // B now sees A's recipes next to their own.
    await expectRecipeListed(b.page, 'Family Lasagne');
    await expectRecipeListed(b.page, 'Bee Bread');

    // A sees B's recipe, tag and category merged into the family.
    await page.goto('/');
    await expectRecipeListed(page, 'Family Lasagne');
    await expectRecipeListed(page, 'Bee Bread');
    await expect(page.getByRole('button', { name: 'sourdough' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'breads' })).toBeVisible();
    expect(await db.familyIdOf(b.user.id)).toBe(user.familyId);

    // Both are listed as members; each sees themselves marked "(you)".
    await openSettings(page);
    const aMembers = page.getByRole('listitem');
    await expect(aMembers.filter({ hasText: user.email })).toContainText('(you)');
    await expect(aMembers.filter({ hasText: b.user.email })).not.toContainText('(you)');

    await openSettings(b.page);
    const bMembers = b.page.getByRole('listitem');
    await expect(bMembers.filter({ hasText: b.user.email })).toContainText('(you)');
    await expect(bMembers.filter({ hasText: user.email })).not.toContainText('(you)');
  });

  test('an invalid invite link shows an error', async ({ page, user, db }) => {
    await page.goto('/join-family/not-a-real-invite-token');
    await expect(page.getByRole('heading', { name: 'Join this family' })).toBeVisible();
    await page.getByRole('button', { name: 'Join family' }).click();

    await expect(page.getByText(/not valid|invalid/i)).toBeVisible();
    await expect(page).toHaveURL('/join-family/not-a-real-invite-token');
    expect(await db.familyIdOf(user.id)).toBe(user.familyId);
  });
});

test.describe('leaving a family', () => {
  test('the only member of a family cannot leave it', async ({ page, user }) => {
    void user;
    await openSettings(page);
    await expect(page.getByRole('listitem').filter({ hasText: '(you)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Leave family' })).toBeHidden();
  });

  test('a member who leaves loses access, and their old recipes stay with the family', async ({
    page,
    user,
    db,
    newSession,
  }) => {
    const familyRecipe = await db.insertRecipe(user.familyId, user.id, {
      title: 'Shared Stew',
    });
    const invite = await inviteLinkOf(page);

    const b = await newSession();
    await db.insertRecipe(b.user.familyId, b.user.id, { title: 'Brought Along Pie' });
    await b.page.goto(invite);
    await b.page.getByRole('button', { name: 'Join family' }).click();
    await expect(b.page.getByText("You've joined the family", { exact: true })).toBeVisible();
    await expectRecipeListed(b.page, 'Shared Stew');
    await expectRecipeListed(b.page, 'Brought Along Pie');

    await openSettings(b.page);
    await b.page.getByRole('button', { name: 'Leave family' }).click();
    const dialog = b.page.getByRole('dialog', { name: 'Leave this family?' });
    await expect(dialog).toContainText('The shared recipes stay with the family');
    await dialog.getByRole('button', { name: 'Leave family' }).click();
    await expect(dialog).toBeHidden();

    // B starts over, alone: no leave button, only themselves in the member list.
    await expect(b.page.getByRole('button', { name: 'Leave family' })).toBeHidden();
    await expect(b.page.getByRole('listitem').filter({ hasText: user.email })).toBeHidden();

    await b.page.goto('/');
    await expect(b.page.getByText('No recipes yet. Try importing or adding one.')).toBeVisible();
    await expect(b.page.getByRole('heading', { name: 'Shared Stew' })).toBeHidden();
    await expect(b.page.getByRole('heading', { name: 'Brought Along Pie' })).toBeHidden();

    await b.page.goto(`/recipes/${familyRecipe}`);
    await expect(b.page.getByText('Recipe not found.')).toBeVisible();

    // What B brought along stayed with the family.
    await page.goto('/');
    await expectRecipeListed(page, 'Shared Stew');
    await expectRecipeListed(page, 'Brought Along Pie');
    await openSettings(page);
    await expect(page.getByRole('listitem').filter({ hasText: b.user.email })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Leave family' })).toBeHidden();
  });

  test('a recipe viewed before leaving is not found right after leaving, without a reload', async ({
    page,
    user,
    db,
    newSession,
  }) => {
    const familyRecipe = await db.insertRecipe(user.familyId, user.id, { title: 'Cached Curry' });
    const invite = await inviteLinkOf(page);

    const b = await newSession();
    await b.page.goto(invite);
    await b.page.getByRole('button', { name: 'Join family' }).click();
    await expect(b.page.getByText("You've joined the family", { exact: true })).toBeVisible();

    // B looks at the recipe, then leaves from Settings within the same page session.
    await b.page.goto(`/recipes/${familyRecipe}`);
    await expect(b.page.getByRole('heading', { name: 'Cached Curry' })).toBeVisible();
    await openUserMenu(b.page);
    await b.page.getByRole('link', { name: 'Settings' }).click();
    await expect(b.page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await b.page.getByRole('button', { name: 'Leave family' }).click();
    const dialog = b.page.getByRole('dialog', { name: 'Leave this family?' });
    await dialog.getByRole('button', { name: 'Leave family' }).click();
    await expect(dialog).toBeHidden();

    await b.page.goBack();
    await expect(b.page).toHaveURL(`/recipes/${familyRecipe}`);
    await expect(b.page.getByText('Recipe not found.')).toBeVisible();
    await expect(b.page.getByRole('heading', { name: 'Cached Curry' })).toBeHidden();
  });
});
