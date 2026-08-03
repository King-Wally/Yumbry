import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/client';
import type { CurrentUser } from '../api/client';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

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

  async function login(email: string, password: string) {
    setUser(await api.login(email, password));
  }

  async function register(email: string, password: string) {
    setUser(await api.register(email, password));
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
      value={{ user, isLoading, login, register, logout, clearSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

