import { and, eq, exists, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { categories, recipes, recipeTags, tags } from '#lib/server/db/schema.ts';
import { decimalString } from '#lib/shared/numeric.ts';
import type {
	Ingredient,
	Instruction,
	RecipeDetail,
	RecipeSummary
} from '#lib/shared/recipe-dto.ts';

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
export async function getRecipe(recipeId: number, familyId: number): Promise<RecipeDetail | null> {
	const row = await db.query.recipes.findFirst({
		where: and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)),
		with: {
			...SUMMARY_RELATIONS,
			ingredients: { orderBy: (i, { asc }) => [asc(i.sortOrder), asc(i.id)] },
			instructions: { orderBy: (i, { asc }) => [asc(i.stepNumber), asc(i.id)] }
		}
	});
	if (!row) return null;

	return {
		...toRecipeSummary(row),
		ingredients: row.ingredients.map(toIngredient),
		instructions: row.instructions.map(toInstruction)
	};
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
