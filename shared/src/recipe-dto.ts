import type { AiChatMessage } from './ai-recipe-draft.js';

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

export interface AiChatTurnRequest {
  messages: AiChatMessage[];
  current_draft: RecipeInput | null;
}

export interface AiChatTurnResponse {
  reply: string;
  recipe: RecipeInput;
}
