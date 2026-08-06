import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsPage from '../src/pages/SettingsPage';
import { AuthProvider } from '../src/context/AuthContext';
import * as apiClient from '../src/api/client';
import type { AiSettings } from '../src/types';

vi.mock('../src/api/client');

const settings: AiSettings = {
  provider: 'ollama',
  base_url: 'http://localhost:11434/v1',
  model: 'llama3.1:8b',
  has_api_key: false,
  updated_at: '2026-01-01T00:00:00.000Z',
};

// Ollama never shows the API key field (it's always browser-direct, no key
// involved) — tests exercising that field use a hosted provider instead.
const openAiSettings: AiSettings = {
  provider: 'openai',
  base_url: null,
  model: 'gpt-4o-mini',
  has_api_key: false,
  updated_at: '2026-01-01T00:00:00.000Z',
};

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
    vi.mocked(apiClient.getAiSettings).mockResolvedValue(settings);
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

    await screen.findByDisplayValue('http://localhost:11434/v1');
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

  it('hydrates the form from the fetched settings', async () => {
    renderSettings();
    expect(await screen.findByDisplayValue('http://localhost:11434/v1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('llama3.1:8b')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ollama', selected: true })).toBeInTheDocument();
  });

  it('hides the API key field for Ollama, since it always connects directly from the browser', async () => {
    renderSettings();
    await screen.findByDisplayValue('http://localhost:11434/v1');
    expect(screen.queryByPlaceholderText('sk-...')).not.toBeInTheDocument();
    expect(screen.getByText(/no api key is sent/i)).toBeInTheDocument();
  });

  it('shows a model dropdown after a successful connection check', async () => {
    vi.mocked(apiClient.getAiSettings).mockResolvedValue(openAiSettings);
    vi.mocked(apiClient.listAiModels).mockResolvedValue({
      models: [{ name: 'gpt-4o-mini' }, { name: 'gpt-4o' }],
    });
    renderSettings();

    await screen.findByDisplayValue('gpt-4o-mini');
    fireEvent.click(screen.getByRole('button', { name: /check connection/i }));

    expect(await screen.findByRole('option', { name: 'gpt-4o' })).toBeInTheDocument();
  });

  it('falls back to a manual text input when the connection check fails', async () => {
    vi.mocked(apiClient.getAiSettings).mockResolvedValue(openAiSettings);
    vi.mocked(apiClient.listAiModels).mockRejectedValue(new Error('Could not reach the provider'));
    renderSettings();

    await screen.findByDisplayValue('gpt-4o-mini');
    fireEvent.click(screen.getByRole('button', { name: /check connection/i }));

    expect(await screen.findByText(/couldn't reach that provider/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('gpt-4o-mini')).toBeInTheDocument();
  });

  it('saves the form and invalidates the settings query', async () => {
    vi.mocked(apiClient.updateAiSettings).mockResolvedValue(settings);
    renderSettings();

    await screen.findByDisplayValue('http://localhost:11434/v1');
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() =>
      expect(apiClient.updateAiSettings).toHaveBeenCalledWith({
        provider: 'ollama',
        base_url: 'http://localhost:11434/v1',
        model: 'llama3.1:8b',
      })
    );
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
  });

  it('sends the typed api_key only when the user enters a new value', async () => {
    vi.mocked(apiClient.getAiSettings).mockResolvedValue(openAiSettings);
    vi.mocked(apiClient.updateAiSettings).mockResolvedValue({
      ...openAiSettings,
      has_api_key: true,
    });
    renderSettings();

    await screen.findByDisplayValue('gpt-4o-mini');
    fireEvent.change(screen.getByPlaceholderText('sk-...'), { target: { value: 'sk-new-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() =>
      expect(apiClient.updateAiSettings).toHaveBeenCalledWith(
        expect.objectContaining({ api_key: 'sk-new-key' })
      )
    );
  });

  it('defaults to no provider selected for a fresh user, and requires one before saving', async () => {
    vi.mocked(apiClient.getAiSettings).mockResolvedValue({
      provider: null,
      base_url: null,
      model: null,
      has_api_key: false,
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    renderSettings();

    const providerSelect = (
      await screen.findByRole('option', { name: 'Select a provider...' })
    ).closest('select') as HTMLSelectElement;
    expect(providerSelect).toHaveValue('');
    expect(providerSelect).toBeRequired();

    const callsBefore = vi.mocked(apiClient.updateAiSettings).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(vi.mocked(apiClient.updateAiSettings).mock.calls.length).toBe(callsBefore);
  });

  it('sends api_key: null when the user checks "Clear the saved API key"', async () => {
    vi.mocked(apiClient.getAiSettings).mockResolvedValue({ ...openAiSettings, has_api_key: true });
    vi.mocked(apiClient.updateAiSettings).mockResolvedValue({
      ...openAiSettings,
      has_api_key: false,
    });
    renderSettings();

    await screen.findByDisplayValue('gpt-4o-mini');
    fireEvent.click(screen.getByLabelText('Clear the saved API key'));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() =>
      expect(apiClient.updateAiSettings).toHaveBeenCalledWith(
        expect.objectContaining({ api_key: null })
      )
    );
  });
});
