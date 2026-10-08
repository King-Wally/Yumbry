import type { AiRecipeDraft, AiTextChatMessage } from '#lib/shared/ai-recipe-draft.ts';

export interface Tag {
	id: number;
	name: string;
}

export interface Category {
	id: number;
	name: string;
}

export interface Ingredient {
	id: number;
	recipe_id: number;
	raw_text: string;
	amount: string | null;
	unit: string | null;
	name: string;
	is_scalable: boolean;
	sort_order: number;
}

export interface Instruction {
	id: number;
	recipe_id: number;
	step_number: number;
	text: string;
}

/** A recipe as the list shows it. Decimal columns are strings (see `decimalString`). */
export interface RecipeSummary {
	id: number;
	title: string;
	description: string | null;
	/** `/uploads/recipes/<id>/<file>` for an uploaded photo, or a remote http(s) URL from an import. */
	image_path: string | null;
	prep_time_minutes: number | null;
	cook_time_minutes: number | null;
	total_time_minutes: number | null;
	servings: string;
	// Per single serving: kcal and grams.
	calories: string | null;
	fat_content: string | null;
	carbohydrate_content: string | null;
	protein_content: string | null;
	category_id: number | null;
	/** Null while the recipe isn't shared. Family-visible only: the public share page strips it. */
	share_token: string | null;
	created_at: Date;
	updated_at: Date;
	category: Category | null;
	/** Sorted by name. */
	tags: Tag[];
}

/** A recipe as its detail page shows it. */
export interface RecipeDetail extends RecipeSummary {
	/** In `sort_order`. */
	ingredients: Ingredient[];
	/** In `step_number` order. */
	instructions: Instruction[];
}

export interface RecipeInput {
	title: string;
	description?: string | null;
	image_path?: string | null;
	prep_time_minutes?: number | null;
	cook_time_minutes?: number | null;
	total_time_minutes?: number | null;
	servings: number;
	// Nutrition is per single serving — never for the whole recipe. `calories` is kcal,
	// the other three are grams.
	calories?: number | null;
	fat_content?: number | null;
	carbohydrate_content?: number | null;
	protein_content?: number | null;
	ingredients: string[];
	instructions: { step_number: number; text: string }[];
	tags: string[];
	category: string | null;
}

// The AI turn trades `AiRecipeDraft` rather than `RecipeInput` so the canonical structured
// ingredients ride along with the rendered lines. `AiRecipeDraft` is assignable to `RecipeInput`,
// so everything downstream — the preview, the recipe form, the save endpoint — is unaffected.
// Which flow the turn belongs to. It never reaches the prompt — the server uses it (together with
// the turn count) to decide which model tier to spend on, since only the opening turn of a new
// recipe writes one from nothing.
export type AiChatMode = 'create' | 'improve';

export interface AiChatTurnRequest {
	mode: AiChatMode;
	messages: AiTextChatMessage[];
	current_draft: AiRecipeDraft | null;
}

export interface AiChatTurnResponse {
	reply: string;
	recipe: AiRecipeDraft;
}
