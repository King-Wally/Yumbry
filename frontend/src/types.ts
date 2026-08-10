import type { Tag, Category, Ingredient, Instruction } from 'yumbry-shared';

export type {
  Tag,
  Category,
  Ingredient,
  Instruction,
  RecipeInput,
  AiChatMessage,
  AiChatTurnRequest,
  AiChatTurnResponse,
} from 'yumbry-shared';

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

export type RecipeSummary = RecipeBase;

export interface Recipe extends RecipeBase {
  ingredients: Ingredient[];
  instructions: Instruction[];
}
