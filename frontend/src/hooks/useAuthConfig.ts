import { useQuery } from '@tanstack/react-query';
import { getAuthConfig } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export function useAuthConfig() {
  return useQuery({
    queryKey: queryKeys.authConfig,
    queryFn: getAuthConfig,
  });
}
