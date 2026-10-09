import { and, eq, exists, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { db, type DbExecutor } from '#lib/server/db/index.ts';
import {
	categories,
	ingredients,
	instructions,
	recipes,
	recipeTags,
	recipeVersions,
	tags
} from '#lib/server/db/schema.ts';
import type { RecipeBody } from '#lib/server/recipes/body-schema.ts';
import {
	deleteOrphanedTagsAndCategories,
	upsertCategory,
	upsertTags
} from '#lib/server/recipes/tags-categories.ts';
import { deleteRecipeUploadsDir, deleteUploadedFile } from '#lib/server/uploads/storage.ts';
import { parseIngredientLine } from '#lib/shared/recipe/ingredient-parser.ts';
import { decimalString } from '#lib/shared/recipe/numeric.ts';
import { toRecipeSnapshot } from '#lib/shared/recipe/snapshot.ts';
import type {
	Ingredient,
	Instruction,
	RecipeDetail,
	RecipeSummary
} from '#lib/shared/recipe/dto.ts';

/** Whether the recipe exists and belongs to the family. Recipes are owned by the family, not the
 * author, so any member may read and write any recipe in their household. */
export async function recipeBelongsToFamily(recipeId: number, familyId: number): Promise<boolean> {
	const [row] = await db
		.select({ id: recipes.id })
		.from(recipes)
		.where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)))
		.limit(1);
	return row !== undefined;
}

export interface RecipeFilters {
	/** Case-insensitive substring of the title or description. */
	search?: string;
	/** Exact tag name. */
	tag?: string;
	/** Exact category name. */
	category?: string;
}

const MAX_FILTER_LENGTH = 100;

/** The family's recipes, newest first. Filters combine; an empty one is ignored. */
export async function listRecipes(
	familyId: number,
	filters: RecipeFilters = {}
): Promise<RecipeSummary[]> {
	const search = clip(filters.search);
	const tag = clip(filters.tag);
	const category = clip(filters.category);

	const conditions: (SQL | undefined)[] = [eq(recipes.familyId, familyId)];
	if (search) {
		const pattern = `%${escapeLike(search)}%`;
		conditions.push(or(ilike(recipes.title, pattern), ilike(recipes.description, pattern)));
	}
	if (tag) {
		conditions.push(
			exists(
				db
					.select({ one: recipeTags.tagId })
					.from(recipeTags)
					.innerJoin(tags, eq(tags.id, recipeTags.tagId))
					.where(and(eq(recipeTags.recipeId, recipes.id), eq(tags.name, tag)))
			)
		);
	}
	if (category) {
		conditions.push(
			inArray(
				recipes.categoryId,
				db
					.select({ id: categories.id })
					.from(categories)
					.where(and(eq(categories.familyId, familyId), eq(categories.name, category)))
			)
		);
	}

	const rows = await db.query.recipes.findMany({
		where: and(...conditions),
		with: SUMMARY_RELATIONS,
		orderBy: (r, { desc }) => [desc(r.createdAt), desc(r.id)]
	});
	return rows.map(toRecipeSummary);
}

/** One of the family's recipes with its ingredients and steps, or null (missing, or another
 * family's). */
export async function getRecipe(
	recipeId: number,
	familyId: number,
	executor: DbExecutor = db
): Promise<RecipeDetail | null> {
	const found = await findRecipeDetail(
		and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)),
		executor
	);
	return found?.recipe ?? null;
}

/** The recipe a public share link points at, with the family that owns it, or null. The one read
 * not scoped by the viewer's family on purpose: the token is the credential. */
export async function getRecipeByShareToken(
	token: string
): Promise<{ recipe: RecipeDetail; familyId: number } | null> {
	return findRecipeDetail(eq(recipes.shareToken, token));
}

async function findRecipeDetail(
	where: SQL | undefined,
	executor: DbExecutor = db
): Promise<{ recipe: RecipeDetail; familyId: number } | null> {
	const row = await executor.query.recipes.findFirst({
		where,
		with: {
			...SUMMARY_RELATIONS,
			ingredients: { orderBy: (i, { asc }) => [asc(i.sortOrder), asc(i.id)] },
			instructions: { orderBy: (i, { asc }) => [asc(i.stepNumber), asc(i.id)] }
		}
	});
	if (!row) return null;

	return {
		recipe: {
			...toRecipeSummary(row),
			ingredients: row.ingredients.map(toIngredient),
			instructions: row.instructions.map(toInstruction)
		},
		familyId: row.familyId
	};
}

/** Saves a new recipe for the family and returns its id. */
export async function createRecipe(
	input: RecipeBody,
	{ familyId, authorId }: { familyId: number; authorId: string }
): Promise<number> {
	return db.transaction(async (tx) => {
		const categoryId = await upsertCategory(tx, input.category, familyId);
		const [row] = await tx
			.insert(recipes)
			.values({
				...scalarColumns(input),
				imagePath: externalImageUrl(input.image_path),
				categoryId,
				familyId,
				authorId
			})
			.returning({ id: recipes.id });
		await insertChildren(tx, row.id, input, familyId);
		return row.id;
	});
}

/**
 * Replaces the recipe's content, first keeping what it replaces as a version (the snapshot and the
 * update commit together, so a failed save leaves no version behind). Every save writes one, even
 * an unchanged one, as on main. The photo is left alone: the photo action owns it. Returns false if
 * the recipe isn't the family's.
 */
export async function updateRecipe(
	recipeId: number,
	input: RecipeBody,
	familyId: number
): Promise<boolean> {
	return db.transaction(async (tx) => {
		const previous = await getRecipe(recipeId, familyId, tx);
		if (!previous) return false;

		await tx.insert(recipeVersions).values({
			recipeId,
			savedAt: previous.updated_at,
			snapshot: toRecipeSnapshot(previous)
		});

		const categoryId = await upsertCategory(tx, input.category, familyId);
		await tx
			.update(recipes)
			.set({ ...scalarColumns(input), categoryId, updatedAt: new Date() })
			.where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)));

		await tx.delete(ingredients).where(eq(ingredients.recipeId, recipeId));
		await tx.delete(instructions).where(eq(instructions.recipeId, recipeId));
		await tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId));
		await insertChildren(tx, recipeId, input, familyId);
		await deleteOrphanedTagsAndCategories(tx, familyId);
		return true;
	});
}

/** Deletes the recipe (its rows and versions go with it by cascade) and its photos. Returns false
 * if the recipe isn't the family's. */
export async function deleteRecipe(recipeId: number, familyId: number): Promise<boolean> {
	const deleted = await db.transaction(async (tx) => {
		const rows = await tx
			.delete(recipes)
			.where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)))
			.returning({ id: recipes.id });
		if (rows.length === 0) return false;
		await deleteOrphanedTagsAndCategories(tx, familyId);
		return true;
	});
	// After the commit, so a rolled-back delete never loses its files.
	if (deleted) await deleteRecipeUploadsDir(recipeId);
	return deleted;
}

/** Points the recipe at a newly stored photo and removes the one it replaces. Writes no version.
 * Returns false if the recipe isn't the family's (the caller then removes the new file). */
export async function setRecipePhoto(
	recipeId: number,
	imagePath: string,
	familyId: number
): Promise<boolean> {
	const where = and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId));
	const [current] = await db.select({ imagePath: recipes.imagePath }).from(recipes).where(where);
	if (!current) return false;

	const updated = await db
		.update(recipes)
		.set({ imagePath, updatedAt: new Date() })
		.where(where)
		.returning({ id: recipes.id });
	if (updated.length === 0) return false;

	if (current.imagePath && current.imagePath !== imagePath) {
		await deleteUploadedFile(current.imagePath);
	}
	return true;
}

function scalarColumns(input: RecipeBody) {
	return {
		title: input.title,
		description: input.description ?? null,
		prepTimeMinutes: input.prep_time_minutes ?? null,
		cookTimeMinutes: input.cook_time_minutes ?? null,
		totalTimeMinutes: input.total_time_minutes ?? null,
		servings: String(input.servings),
		calories: decimalColumn(input.calories),
		fatContent: decimalColumn(input.fat_content),
		carbohydrateContent: decimalColumn(input.carbohydrate_content),
		proteinContent: decimalColumn(input.protein_content)
	};
}

function decimalColumn(value: number | null | undefined): string | null {
	return value == null ? null : String(value);
}

async function insertChildren(
	tx: DbExecutor,
	recipeId: number,
	input: RecipeBody,
	familyId: number
): Promise<void> {
	if (input.ingredients.length > 0) {
		await tx.insert(ingredients).values(
			input.ingredients.map((line, index) => {
				const parsed = parseIngredientLine(line);
				return {
					recipeId,
					rawText: parsed.raw_text,
					amount: decimalColumn(parsed.amount),
					unit: parsed.unit,
					name: parsed.name,
					isScalable: parsed.is_scalable,
					sortOrder: index
				};
			})
		);
	}
	if (input.instructions.length > 0) {
		await tx.insert(instructions).values(
			input.instructions.map((step) => ({
				recipeId,
				stepNumber: step.step_number,
				text: step.text
			}))
		);
	}
	await upsertTags(tx, recipeId, input.tags, familyId);
}

/** The only `image_path` a client may set: an absolute http(s) URL, as an imported draft carries.
 * Anything else, `/uploads/...` included, is dropped, so a save can't point at another file. */
function externalImageUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}

const SUMMARY_RELATIONS = {
	category: { columns: { id: true, name: true } },
	recipeTags: { with: { tag: { columns: { id: true, name: true } } } }
} as const;

function clip(value: string | undefined): string | undefined {
	return value ? value.slice(0, MAX_FILTER_LENGTH) : undefined;
}

/** Makes `%`, `_` and `\` match themselves in an ILIKE pattern. */
function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, '\\$&');
}

type RecipeRow = typeof recipes.$inferSelect & {
	category: { id: number; name: string } | null;
	recipeTags: { tag: { id: number; name: string } }[];
};

function toRecipeSummary(row: RecipeRow): RecipeSummary {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		image_path: row.imagePath,
		prep_time_minutes: row.prepTimeMinutes,
		cook_time_minutes: row.cookTimeMinutes,
		total_time_minutes: row.totalTimeMinutes,
		servings: decimalString(row.servings),
		calories: decimalString(row.calories),
		fat_content: decimalString(row.fatContent),
		carbohydrate_content: decimalString(row.carbohydrateContent),
		protein_content: decimalString(row.proteinContent),
		category_id: row.categoryId,
		share_token: row.shareToken,
		created_at: row.createdAt,
		updated_at: row.updatedAt,
		category: row.category,
		tags: row.recipeTags.map((rt) => rt.tag).sort((a, b) => a.name.localeCompare(b.name))
	};
}

function toIngredient(row: {
	id: number;
	recipeId: number;
	rawText: string;
	amount: string | null;
	unit: string | null;
	name: string;
	isScalable: boolean;
	sortOrder: number;
}): Ingredient {
	return {
		id: row.id,
		recipe_id: row.recipeId,
		raw_text: row.rawText,
		amount: decimalString(row.amount),
		unit: row.unit,
		name: row.name,
		is_scalable: row.isScalable,
		sort_order: row.sortOrder
	};
}

function toInstruction(row: {
	id: number;
	recipeId: number;
	stepNumber: number;
	text: string;
}): Instruction {
	return {
		id: row.id,
		recipe_id: row.recipeId,
		step_number: row.stepNumber,
		text: row.text
	};
}
