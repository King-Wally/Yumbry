import { useQuery } from '@tanstack/react-query';
import { getAiStatus } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export function useAiStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: getAiStatus,
    enabled: options?.enabled,
  });
}
