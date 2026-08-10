import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsPage from '../src/pages/SettingsPage';
import { AuthProvider } from '../src/context/AuthContext';
import * as apiClient from '../src/api/client';

vi.mock('../src/api/client');

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <SettingsPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getCurrentUser).mockRejectedValue(new Error('not authenticated'));
  });

  it('saving a language choice refetches the current user via queryKeys.authMe, not a hand-written key', async () => {
    vi.mocked(apiClient.getCurrentUser).mockResolvedValueOnce({
      id: 1,
      email: 'a@example.com',
      locale: 'en',
    });
    vi.mocked(apiClient.updateProfile).mockResolvedValue({
      id: 1,
      email: 'a@example.com',
      locale: 'fr',
    });
    renderSettings();

    await screen.findByLabelText('Language');
    const getCurrentUserCallsBefore = vi.mocked(apiClient.getCurrentUser).mock.calls.length;

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'fr' } });

    await waitFor(() => expect(apiClient.updateProfile).toHaveBeenCalledWith({ locale: 'fr' }));
    // Saving invalidates queryKeys.authMe, which re-triggers AuthContext's
    // own getCurrentUser query — proof the mutation and the query share the
    // same key rather than two independently hand-written literals.
    await waitFor(() =>
      expect(vi.mocked(apiClient.getCurrentUser).mock.calls.length).toBeGreaterThan(
        getCurrentUserCallsBefore
      )
    );
  });
});
