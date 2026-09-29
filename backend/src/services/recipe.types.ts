import type { Tag, Category, Ingredient, Instruction } from 'yumbry-shared';
import type { RecipeBody, InstructionInput } from '../schemas/recipe.schema.js';
import type { ParsedIngredient } from './ingredient-parser.js';

export type TagRef = Tag;
export type CategoryRef = Category;
export type IngredientRow = Ingredient;
export type InstructionRow = Instruction;

export interface RecipeRow {
  id: number;
  title: string;
  description: string | null;
  image_path: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  servings: string;
  // Per single serving. Prisma Decimal, so it crosses the wire as a string like `servings`.
  calories: string | null;
  fat_content: string | null;
  carbohydrate_content: string | null;
  protein_content: string | null;
  category_id: number | null;
  /** Null while the recipe isn't shared. Family-visible only — the public share
   * DTO (recipe-share.service.ts) strips it. */
  share_token: string | null;
  created_at: Date;
  updated_at: Date;
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

export interface RecipeInput extends Omit<RecipeBody, 'ingredients' | 'instructions'> {
  ingredients?: IngredientInput[];
  instructions?: InstructionInput[];
}
