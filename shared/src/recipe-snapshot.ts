/** The content of a recipe at one point in its history, as stored in `recipe_versions.snapshot`.
 *
 * Tags and the category are kept by name rather than id: an edit that drops the last use of one
 * deletes its row (see deleteOrphaned), so an id would dangle. Ingredients are kept as their raw
 * text line only — every write re-parses amount/unit/name from it, so the parsed columns carry
 * nothing a revert would need. The photo is deliberately absent: `image_path` is owned by the photo
 * upload endpoint, and a revert never touches it. */
export interface RecipeSnapshot {
  title: string;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  /** Decimal columns, stringified exactly as the recipe API sends them. */
  servings: string;
  calories: string | null;
  fat_content: string | null;
  carbohydrate_content: string | null;
  protein_content: string | null;
  category: string | null;
  tags: string[];
  ingredients: string[];
  instructions: { step_number: number; text: string }[];
}

export interface RecipeVersionSummary {
  id: number;
  /** When this content became the recipe's current state — its `updated_at` at the time. */
  saved_at: string;
}

export interface RecipeVersion extends RecipeVersionSummary {
  snapshot: RecipeSnapshot;
}

/** Structural so both the backend's row type and the frontend's `Recipe` DTO satisfy it. */
export interface SnapshotSource {
  title: string;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  servings: string;
  calories: string | null;
  fat_content: string | null;
  carbohydrate_content: string | null;
  protein_content: string | null;
  category: { name: string } | null;
  tags: { name: string }[];
  ingredients: { raw_text: string; sort_order: number }[];
  instructions: { step_number: number; text: string }[];
}

export function toRecipeSnapshot(recipe: SnapshotSource): RecipeSnapshot {
  return {
    title: recipe.title,
    description: recipe.description,
    prep_time_minutes: recipe.prep_time_minutes,
    cook_time_minutes: recipe.cook_time_minutes,
    total_time_minutes: recipe.total_time_minutes,
    servings: recipe.servings,
    calories: recipe.calories,
    fat_content: recipe.fat_content,
    carbohydrate_content: recipe.carbohydrate_content,
    protein_content: recipe.protein_content,
    category: recipe.category?.name ?? null,
    tags: recipe.tags.map((tag) => tag.name).sort((a, b) => a.localeCompare(b)),
    ingredients: [...recipe.ingredients]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ingredient) => ingredient.raw_text),
    instructions: [...recipe.instructions]
      .sort((a, b) => a.step_number - b.step_number)
      .map(({ step_number, text }) => ({ step_number, text })),
  };
}
