import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { recipes } from '#lib/server/db/schema.ts';
import type { RecipeBody } from '#lib/server/recipe-schema.ts';
import {
	createRecipe,
	getRecipeByShareToken,
	setRecipePhoto
} from '#lib/server/services/recipes.ts';
import { copyRecipeUpload, resolveStoredUpload, type UploadFile } from '#lib/server/uploads.ts';
import { toNullableNumber, toNumber } from '#lib/shared/numeric.ts';
import type { RecipeDetail, SharedRecipe } from '#lib/shared/recipe-dto.ts';

// Public share links: the one deliberate hole in family scoping. A recipe's `share_token` is the
// credential for reading it, and stopping sharing nulls it, which kills the link.

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** Whether `raw` has the shape of a share token. Anything else is answered like an unknown token,
 * so the response says nothing about what a valid one looks like. */
export function isShareToken(raw: string): boolean {
	return TOKEN_PATTERN.test(raw);
}

/** Stored raw, like the family invite token: the owner's dialog shows the same link again, and 256
 * random bits leave nothing to guess. */
function generateShareToken(): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))).toString('hex');
}

// Sharing isn't an edit, so `updated_at` is set to itself: the schema's `$onUpdate` would bump it.
const KEEP_UPDATED_AT = { updatedAt: sql`${recipes.updatedAt}` };

/** The recipe's share token, minted if it has none. Null when the recipe isn't the family's. */
export async function enableShare(recipeId: number, familyId: number): Promise<string | null> {
	const owned = and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId));
	const current = async () => {
		const [row] = await db.select({ shareToken: recipes.shareToken }).from(recipes).where(owned);
		return row;
	};

	const existing = await current();
	if (!existing) return null;
	if (existing.shareToken) return existing.shareToken;

	// Only while the token is still null, so two concurrent "Create link" clicks can't mint two
	// links, the first one shown silently dead. The loser reads the winner's.
	const token = generateShareToken();
	const updated = await db
		.update(recipes)
		.set({ shareToken: token, ...KEEP_UPDATED_AT })
		.where(and(owned, isNull(recipes.shareToken)))
		.returning({ id: recipes.id });
	if (updated.length > 0) return token;
	return (await current())?.shareToken ?? null;
}

/** Kills the recipe's link. False when the recipe isn't the family's. */
export async function disableShare(recipeId: number, familyId: number): Promise<boolean> {
	const updated = await db
		.update(recipes)
		.set({ shareToken: null, ...KEEP_UPDATED_AT })
		.where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)))
		.returning({ id: recipes.id });
	return updated.length > 0;
}

/** Where a shared recipe's uploaded photo is served from. `/uploads` is family-gated, so a visitor
 * can't load the stored path. */
export function sharedPhotoPath(token: string): string {
	return `/share/${token}/photo`;
}

/** The public link to a shared recipe. */
export function shareUrl(origin: string, token: string): string {
	return `${origin}/share/${token}`;
}

type Hidden = 'id' | 'share_token' | 'category_id';

/** The recipe behind the link as a visitor sees it, or null for an unknown or stopped link. */
export async function getSharedRecipe(
	token: string,
	viewerFamilyId: number | undefined
): Promise<SharedRecipe | null> {
	const found = await getRecipeByShareToken(token);
	if (!found) return null;

	// None of these belong in the public page.
	const { id } = found.recipe;
	const rest: Omit<RecipeDetail, Hidden> & Partial<Pick<RecipeDetail, Hidden>> = {
		...found.recipe
	};
	delete rest.id;
	delete rest.share_token;
	delete rest.category_id;
	const localPhoto = rest.image_path !== null && resolveStoredUpload(rest.image_path) !== null;
	return {
		...rest,
		// A remote http(s) picture (from an import) passes through as it is.
		image_path: localPhoto ? sharedPhotoPath(token) : rest.image_path,
		own_recipe_id: viewerFamilyId === found.familyId ? id : null
	};
}

/** The shared recipe's uploaded photo, or null when there is none. */
export async function sharedPhotoFile(token: string): Promise<UploadFile | null> {
	const [row] = await db
		.select({ imagePath: recipes.imagePath })
		.from(recipes)
		.where(eq(recipes.shareToken, token));
	return row?.imagePath ? resolveStoredUpload(row.imagePath) : null;
}

/** A shared recipe as a save. Tags and the category travel by name, so `createRecipe` recreates
 * them in the importer's family. Ingredients go as their lines and are parsed again, as on every
 * save. */
export function toRecipeBody(recipe: RecipeDetail): RecipeBody {
	return {
		title: recipe.title,
		description: recipe.description,
		image_path: recipe.image_path,
		prep_time_minutes: recipe.prep_time_minutes,
		cook_time_minutes: recipe.cook_time_minutes,
		total_time_minutes: recipe.total_time_minutes,
		servings: toNumber(recipe.servings, 1),
		calories: toNullableNumber(recipe.calories),
		fat_content: toNullableNumber(recipe.fat_content),
		carbohydrate_content: toNullableNumber(recipe.carbohydrate_content),
		protein_content: toNullableNumber(recipe.protein_content),
		ingredients: recipe.ingredients.map((ingredient) => ingredient.raw_text),
		instructions: recipe.instructions.map(({ step_number, text }) => ({ step_number, text })),
		tags: recipe.tags.map((tag) => tag.name),
		category: recipe.category?.name ?? null
	};
}

/** Saves an independent copy of a shared recipe, photo included, in the importer's family and
 * returns its id. Null for an unknown or stopped link. */
export async function importSharedRecipe(
	token: string,
	importer: { familyId: number; authorId: string }
): Promise<number | null> {
	const found = await getRecipeByShareToken(token);
	if (!found) return null;
	const source = found.recipe;

	// createRecipe keeps a remote image URL and drops an /uploads path, so a local photo is copied
	// on its own below.
	const id = await createRecipe(toRecipeBody(source), importer);
	if (!source.image_path) return id;

	// Best-effort: a missing or unreadable photo still leaves the copied recipe.
	try {
		const copied = await copyRecipeUpload(source.image_path, id);
		if (copied) await setRecipePhoto(id, copied, importer.familyId);
	} catch (err) {
		console.error(`Failed to copy the photo of imported recipe ${id}:`, err);
	}
	return id;
}
