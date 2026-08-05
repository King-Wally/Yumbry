import type { AiChatMessage } from './ai-recipe-draft.js';

/**
 * Wire-shape DTOs shared between backend/src/services/recipe.types.ts and
 * frontend/src/types.ts. These are the fields with no Date/string crossing
 * concern — id/name/text/number scalars that are identical on both sides of
 * the API boundary. `RecipeRow`/`Recipe`/`RecipeSummary` (which carry
 * created_at/updated_at) stay local to each package for now: backend types
 * those as `Date` (what recipe.service.ts's Prisma mapper actually produces)
 * while frontend types them as `string` (what actually crosses the wire) —
 * reconciling that is a separate follow-up.
 */

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

/** Payload sent to POST/PUT /api/recipes from the manual create/edit form,
 * and the shape AI-generated drafts (POST /api/ai/chat's `recipe` field)
 * are typed as too — see shared/src/ai-recipe-draft.ts's AiRecipeDraft,
 * which deliberately matches this shape. */
export interface RecipeInput {
  title: string;
  description?: string | null;
  image_path?: string | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  total_time_minutes?: number | null;
  servings: number;
  ingredients: string[];
  instructions: { step_number: number; text: string }[];
  tags: string[];
  category: string | null;
}

/** Request body for POST /api/ai/chat. */
export interface AiChatTurnRequest {
  messages: AiChatMessage[];
  current_draft: RecipeInput | null;
}

/** Response body for POST /api/ai/chat — the model's conversational reply
 * plus its full current best-guess recipe, every turn. */
export interface AiChatTurnResponse {
  reply: string;
  recipe: RecipeInput;
}
