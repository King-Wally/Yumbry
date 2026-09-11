import { vi } from 'vitest';
import type { useSession } from '../../src/lib/auth-client';
import type { CurrentUser } from '../../src/lib/auth-client';

/** better-auth's real session shape carries refetch helpers and full user rows
 * that no component here reads. The doubles below supply only what is used and
 * are cast once, so individual tests stay readable. */
type SessionResult = ReturnType<typeof useSession>;

/** Stand-in for a signed-in user. better-auth's session shape nests the user,
 * and only these fields are ever read by the app. */
export function sessionFor(user: Partial<CurrentUser> = {}): SessionResult {
  return {
    data: {
      user: {
        id: 'user_1',
        email: 'a@example.com',
        locale: 'en',
        unitSystem: 'metric',
        smallVolumes: 'spoons',
        jsonImportExportEnabled: false,
        ...user,
      },
      session: { id: 'session_1' },
    },
    isPending: false,
    error: null,
  } as unknown as SessionResult;
}

export const NO_SESSION = { data: null, isPending: false, error: null } as unknown as SessionResult;
export const PENDING_SESSION = {
  data: null,
  isPending: true,
  error: null,
} as unknown as SessionResult;

/** The module factory for `vi.mock('../src/lib/auth-client')`. Tests override
 * `useSession` per case via `vi.mocked(...).mockReturnValue(...)`. */
export function authClientMock() {
  const useSession = vi.fn().mockReturnValue(NO_SESSION);
  return {
    useSession,
    refreshSession: vi.fn(),
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    authClient: {
      useSession,
      signIn: { email: vi.fn() },
      signUp: { email: vi.fn() },
      signOut: vi.fn(),
      getSession: vi.fn(),
      changePassword: vi.fn().mockResolvedValue({ error: null }),
      deleteUser: vi.fn().mockResolvedValue({ error: null }),
      resetPassword: vi.fn().mockResolvedValue({ error: null }),
      requestPasswordReset: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}
