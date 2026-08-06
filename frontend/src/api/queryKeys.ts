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
  tags: ['tags'] as const,
  categories: ['categories'] as const,
  aiSettings: ['ai-settings'] as const,
  aiModels: (baseUrl?: string) => ['ai-models', baseUrl ?? null] as const,
  authMe: ['auth', 'me'] as const,
};
