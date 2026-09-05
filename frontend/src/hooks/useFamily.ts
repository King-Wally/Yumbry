import { useQuery } from '@tanstack/react-query';
import { getFamily } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export function useFamily() {
  return useQuery({ queryKey: queryKeys.family, queryFn: getFamily });
}
