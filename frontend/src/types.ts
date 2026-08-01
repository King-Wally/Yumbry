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

interface RecipeBase {
  id: number;
  title: string;
  description: string | null;
  image_path: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  servings: string;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  category: Category | null;
}

/** Shape returned by GET /api/recipes (list view) — no ingredients/instructions. */
export type RecipeSummary = RecipeBase;

/** Shape returned by GET /api/recipes/:id and mutations (detail view). */
export interface Recipe extends RecipeBase {
  ingredients: Ingredient[];
  instructions: Instruction[];
}

/** Payload sent to POST/PUT /api/recipes from the manual create/edit form. */
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

export type AiProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'custom';

export interface AiSettings {
  provider: AiProvider | null;
  base_url: string | null;
  model: string | null;
  has_api_key: boolean;
  updated_at: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** AI-generated recipe drafts (from POST /api/ai/chat's `recipe` field) are
 * response-shape-identical to RecipeInput, so they're typed directly as
 * RecipeInput rather than a separate type. */

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
