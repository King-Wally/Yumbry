import { createContext } from 'react';
import type { CurrentUser } from '../api/client';

export interface AuthContextValue {
  user: CurrentUser | null | undefined;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
