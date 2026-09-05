import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';

/** Joining or leaving a family swaps the entire recipe collection, so every
 * recipe/tag/category query is stale — not just the family itself. */
export function useInvalidateFamilyData() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.family });
    queryClient.invalidateQueries({ queryKey: queryKeys.recipes() });
    queryClient.invalidateQueries({ queryKey: queryKeys.tags });
    queryClient.invalidateQueries({ queryKey: queryKeys.categories });
  };
}
