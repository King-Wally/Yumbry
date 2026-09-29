interface RecipeFilters {
  search: string;
  tag: string | null;
  category: string | null;
}

export const queryKeys = {
  recipes: (filters?: RecipeFilters) =>
    filters
      ? (['recipes', filters.search, filters.tag, filters.category] as const)
      : (['recipes'] as const),
  recipe: (id: string | number) => ['recipe', String(id)] as const,
  sharedRecipe: (token: string) => ['shared-recipe', token] as const,
  recipeVersions: (id: string | number) => ['recipe', String(id), 'versions'] as const,
  recipeVersion: (id: string | number, versionId: number) =>
    ['recipe', String(id), 'versions', versionId] as const,
  tags: ['tags'] as const,
  categories: ['categories'] as const,
  appConfig: ['app', 'config'] as const,
  family: ['family'] as const,
  aiStatus: ['ai', 'status'] as const,
};
