import { useQuery } from '@tanstack/react-query';
import { getAppConfig } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export function useAppConfig() {
  return useQuery({
    queryKey: queryKeys.appConfig,
    queryFn: getAppConfig,
  });
}
