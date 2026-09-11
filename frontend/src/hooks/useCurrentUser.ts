import { useSession, type CurrentUser } from '../lib/auth-client';

/** The signed-in user, or null once we know there isn't one.
 *
 * Replaces the old AuthContext: better-auth keeps the session in its own store,
 * so there is no provider to thread through the tree and no react-query entry to
 * invalidate. `user` is undefined only while the first session fetch is in
 * flight, matching the shape the pages already expect. */
export function useCurrentUser(): {
  user: CurrentUser | null | undefined;
  isLoading: boolean;
} {
  const { data, isPending } = useSession();

  if (isPending) return { user: undefined, isLoading: true };
  if (!data) return { user: null, isLoading: false };

  const { id, email, locale, unitSystem, smallVolumes, jsonImportExportEnabled } = data.user;
  return {
    user: {
      id,
      email,
      locale: locale as CurrentUser['locale'],
      unitSystem: unitSystem as CurrentUser['unitSystem'],
      smallVolumes: smallVolumes as CurrentUser['smallVolumes'],
      jsonImportExportEnabled,
    },
    isLoading: false,
  };
}
