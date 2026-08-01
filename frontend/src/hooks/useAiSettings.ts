import { useQuery } from '@tanstack/react-query';
import { getAiSettings } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export function useAiSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.aiSettings,
    queryFn: getAiSettings,
    enabled: options?.enabled,
  });
}
