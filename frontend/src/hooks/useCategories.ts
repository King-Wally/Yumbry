import { useQuery } from '@tanstack/react-query';
import { getCategories } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: getCategories });
}
