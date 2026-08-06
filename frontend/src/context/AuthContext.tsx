import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/client';
import type { CurrentUser } from '../api/client';
import { AuthContext } from './auth-context';
import { setActiveLocale } from '../i18n';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);
  const [syncedLocaleFor, setSyncedLocaleFor] = useState<number | null>(null);

  const { isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const me = await api.getCurrentUser();
        setUser(me);
        return me;
      } catch {
        setUser(null);
        return null;
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  // Sync the active UI language to the authenticated user's stored
  // preference — during render, not a useEffect, matching this app's
  // established convention for state derived from an async query result.
  if (user && syncedLocaleFor !== user.id) {
    setSyncedLocaleFor(user.id);
    setActiveLocale(user.locale);
  }

  async function login(email: string, password: string) {
    setUser(await api.login(email, password));
  }

  async function register(email: string, password: string) {
    setUser(await api.register(email, password));
  }

  async function resetPassword(token: string, password: string) {
    await api.resetPassword(token, password);
    setUser(await api.getCurrentUser());
  }

  function clearSession() {
    setUser(null);
    queryClient.clear();
  }

  async function logout() {
    await api.logout();
    clearSession();
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, resetPassword, logout, clearSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}
