import type { Tag, Category, Ingredient, Instruction } from 'yumbry-shared';

export type {
  Tag,
  Category,
  Ingredient,
  Instruction,
  RecipeInput,
  AiTextChatMessage,
  AiRecipeDraft,
  AiChatTurnRequest,
  AiChatTurnResponse,
  AiNutritionRequest,
  AiNutritionEstimate,
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
  // Per single serving, never scaled. Prisma Decimal, so these arrive as strings like `servings`.
  calories: string | null;
  fat_content: string | null;
  carbohydrate_content: string | null;
  protein_content: string | null;
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
