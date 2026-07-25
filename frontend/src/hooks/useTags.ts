import { useQuery } from '@tanstack/react-query';
import { getTags } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: getTags });
}
