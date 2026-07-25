import type { RecipeBody, InstructionInput } from '../schemas/recipe.schema.js';
import type { ParsedIngredient } from './ingredient-parser.js';

export interface TagRef {
  id: number;
  name: string;
}

export interface CategoryRef {
  id: number;
  name: string;
}

export interface RecipeRow {
  id: number;
  title: string;
  description: string | null;
  image_path: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  servings: string;
  category_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface IngredientRow {
  id: number;
  recipe_id: number;
  raw_text: string;
  amount: string | null;
  unit: string | null;
  name: string;
  is_scalable: boolean;
  sort_order: number;
}

export interface InstructionRow {
  id: number;
  recipe_id: number;
  step_number: number;
  text: string;
}

export interface RecipeWithRelations extends RecipeRow {
  ingredients: IngredientRow[];
  instructions: InstructionRow[];
  tags: TagRef[];
  category: CategoryRef | null;
}

export interface IngredientInput extends ParsedIngredient {
  sort_order?: number;
}

export type { InstructionInput };

/**
 * Normalized recipe data ready for insertion, derived from RecipeBody (the
 * Zod-validated API request shape) so the two can't drift apart on their
 * shared scalar fields. Only `ingredients` differs: manual and JSON-LD entry
 * points both parse raw ingredient text into structured input before it
 * reaches the service layer (see ingredient-parser.ts).
 */
export interface RecipeInput extends Omit<RecipeBody, 'ingredients' | 'instructions'> {
  ingredients?: IngredientInput[];
  instructions?: InstructionInput[];
}
