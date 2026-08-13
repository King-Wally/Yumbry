import type { AiChatMessage, AiRecipeDraft } from './ai-recipe-draft.js';

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

// The AI turn trades `AiRecipeDraft` rather than `RecipeInput` so the canonical structured
// ingredients ride along with the rendered lines. `AiRecipeDraft` is assignable to `RecipeInput`,
// so everything downstream — the preview, the recipe form, the save endpoint — is unaffected.
// Which flow the turn belongs to. It never reaches the prompt — the server uses it (together with
// the turn count) to decide which model tier to spend on, since only the opening turn of a new
// recipe writes one from nothing.
export type AiChatMode = 'create' | 'improve';

export interface AiChatTurnRequest {
  mode: AiChatMode;
  messages: AiChatMessage[];
  current_draft: AiRecipeDraft | null;
}

export interface AiChatTurnResponse {
  reply: string;
  recipe: AiRecipeDraft;
}
