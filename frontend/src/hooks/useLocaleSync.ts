import { useState } from 'react';
import { setActiveLocale } from '../i18n';
import { useCurrentUser } from './useCurrentUser';

/** Syncs the active UI language to the authenticated user's stored preference.
 *
 * Done during render, not in a useEffect, matching this app's established
 * convention for state derived from an async query result. Tracked by locale
 * value (not user id) so a locale change made via Settings — which refetches the
 * session with a new `locale` — re-applies immediately instead of only on the
 * next login. */
export function useLocaleSync(): void {
  const { user } = useCurrentUser();
  const [syncedLocale, setSyncedLocale] = useState<string | null>(null);

  if (user && syncedLocale !== user.locale) {
    setSyncedLocale(user.locale);
    setActiveLocale(user.locale);
  }
}
