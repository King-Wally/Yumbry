import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/context/AuthContext';
import { useAuth } from '../src/hooks/useAuth';
import { queryKeys } from '../src/api/queryKeys';
import * as apiClient from '../src/api/client';
import * as i18n from '../src/i18n';

vi.mock('../src/api/client');
vi.mock('../src/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/i18n')>();
  return { ...actual, setActiveLocale: vi.fn() };
});

function Consumer() {
  const { user } = useAuth();
  return <div>{user ? `${user.id}:${user.locale}` : 'no user'}</div>;
}

function renderWithProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </QueryClientProvider>
  );
  return queryClient;
}

describe('AuthProvider locale sync', () => {
  beforeEach(() => {
    vi.mocked(i18n.setActiveLocale).mockClear();
  });

  it("re-applies the active locale when the same user's locale changes, not just on next login", async () => {
    vi.mocked(apiClient.getCurrentUser).mockResolvedValueOnce({
      id: 1,
      email: 'a@example.com',
      locale: 'en',
    });
    const queryClient = renderWithProvider();

    await screen.findByText('1:en');
    expect(i18n.setActiveLocale).toHaveBeenCalledWith('en');

    // Simulate SettingsPage's locale mutation: same user id, new locale,
    // refetched via the same queryKeys.authMe invalidation SettingsPage uses.
    vi.mocked(apiClient.getCurrentUser).mockResolvedValueOnce({
      id: 1,
      email: 'a@example.com',
      locale: 'fr',
    });
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.authMe }));

    await screen.findByText('1:fr');
    expect(i18n.setActiveLocale).toHaveBeenCalledWith('fr');
  });
});
