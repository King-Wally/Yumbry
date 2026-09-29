import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';

/** Joining or leaving a family swaps the entire recipe collection, so every
 * recipe/tag/category query is stale — not just the family itself.
 *
 * Single-recipe queries are removed rather than invalidated: a recipe of the old family now
 * refetches as a 404, and react-query keeps stale data on error, so an invalidated entry would
 * keep showing it until a full reload. */
export function useInvalidateFamilyData() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.family });
    queryClient.invalidateQueries({ queryKey: queryKeys.recipes() });
    queryClient.invalidateQueries({ queryKey: queryKeys.tags });
    queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    queryClient.removeQueries({ queryKey: queryKeys.recipeDetails });
    queryClient.removeQueries({ queryKey: ['recipe-export-file'] });
  };
}
