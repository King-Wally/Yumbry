import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsPage from '../src/pages/SettingsPage';
import { refreshSession, useSession } from '../src/lib/auth-client';
import * as apiClient from '../src/api/client';
import { sessionFor } from './helpers/auth-client';
import { aiStatus } from './helpers/ai-status';

vi.mock('../src/api/client');
// Async factory with a dynamic import: vi.mock is hoisted above the imports,
// so the helper cannot be referenced directly here.
vi.mock('../src/lib/auth-client', async () =>
  (await import('./helpers/auth-client')).authClientMock()
);

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue(sessionFor());
    vi.mocked(apiClient.getAiStatus).mockResolvedValue(aiStatus(false));
  });

  it('saving a language choice refreshes the session so the new locale takes effect', async () => {
    vi.mocked(apiClient.updateProfile).mockResolvedValue({
      id: 'user_1',
      email: 'a@example.com',
      locale: 'fr',
      unitSystem: 'metric',
      smallVolumes: 'spoons',
      jsonImportExportEnabled: false,
    });
    renderSettings();

    await screen.findByLabelText('Language');
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'fr' } });

    await waitFor(() => expect(apiClient.updateProfile).toHaveBeenCalledWith({ locale: 'fr' }));
    // The preference columns are written through our own endpoint, which
    // better-auth knows nothing about, so the session has to be re-read for
    // useLocaleSync to see the change.
    await waitFor(() => expect(refreshSession).toHaveBeenCalled());
  });

  describe('AI usage', () => {
    it('shows how much of the user’s daily allowance and the shared pool is left', async () => {
      vi.mocked(apiClient.getAiStatus).mockResolvedValue(
        aiStatus(true, { userSpentTodayUsd: 0.025, availableUsd: 2.5 / 30 })
      );
      renderSettings();

      expect(await screen.findByText('75% left')).toBeInTheDocument();
      expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '75');
      expect(screen.getByText("About 2.5 days' worth left")).toBeInTheDocument();
    });

    it('explains when the user is blocked and when they can try again', async () => {
      vi.mocked(apiClient.getAiStatus).mockResolvedValue(
        aiStatus(true, {
          userSpentTodayUsd: 0.1,
          allowed: false,
          blockedBy: 'user',
          retryAt: '2099-01-01T00:00:00.000Z',
        })
      );
      renderSettings();

      expect(
        await screen.findByText(/You've used up your AI allowance for today. Try again after/)
      ).toBeInTheDocument();
    });

    it('hides the section when the AI assistant is not configured', async () => {
      renderSettings();

      await screen.findByLabelText('Language');
      expect(screen.queryByText('AI usage')).not.toBeInTheDocument();
    });
  });
});
