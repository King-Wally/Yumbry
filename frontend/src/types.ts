import type { Tag, Category, Ingredient, Instruction, AiProvider } from 'yumbry-shared';

export type {
  Tag,
  Category,
  Ingredient,
  Instruction,
  RecipeInput,
  AiProvider,
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

/** Shape returned by GET /api/recipes (list view) — no ingredients/instructions. */
export type RecipeSummary = RecipeBase;

/** Shape returned by GET /api/recipes/:id and mutations (detail view). */
export interface Recipe extends RecipeBase {
  ingredients: Ingredient[];
  instructions: Instruction[];
}

/** AI-generated recipe drafts (from POST /api/ai/chat's `recipe` field) are
 * response-shape-identical to RecipeInput, so they're typed directly as
 * RecipeInput rather than a separate type. */

export interface AiSettings {
  provider: AiProvider | null;
  base_url: string | null;
  model: string | null;
  has_api_key: boolean;
  updated_at: string;
}
