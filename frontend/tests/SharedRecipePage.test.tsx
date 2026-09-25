import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SharedRecipePage from '../src/pages/SharedRecipePage';
import * as apiClient from '../src/api/client';
import { useSession } from '../src/lib/auth-client';
import { ToastProvider } from '../src/context/ToastProvider';
import { NO_SESSION, sessionFor } from './helpers/auth-client';
import type { Recipe, SharedRecipe } from '../src/types';

// ApiError stays real: the page tells a dead link apart by `instanceof` + kind.
vi.mock('../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof apiClient>();
  return {
    ApiError: actual.ApiError,
    getSharedRecipe: vi.fn(),
    importSharedRecipe: vi.fn(),
  };
});
vi.mock('../src/lib/auth-client', async () =>
  (await import('./helpers/auth-client')).authClientMock()
);

const TOKEN = 'a'.repeat(64);

const sharedRecipe: SharedRecipe = {
  title: 'Pancakes',
  description: 'Fluffy.',
  image_path: null,
  prep_time_minutes: null,
  cook_time_minutes: null,
  total_time_minutes: null,
  servings: '4',
  calories: null,
  fat_content: null,
  carbohydrate_content: null,
  protein_content: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  tags: [],
  category: null,
  ingredients: [
    {
      id: 1,
      recipe_id: 1,
      raw_text: '2 cups flour',
      amount: '2',
      unit: 'cups',
      name: 'flour',
      is_scalable: true,
      sort_order: 0,
    },
  ],
  instructions: [],
  own_recipe_id: null,
};

function LocationProbe() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
  return (
    <p>
      at {location.pathname} from {from ?? 'nowhere'}
    </p>
  );
}

function renderShared() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/share/${TOKEN}`]}>
          <Routes>
            <Route path="/share/:token" element={<SharedRecipePage />} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('SharedRecipePage', () => {
  it('shows the recipe and an account prompt to a logged-out visitor', async () => {
    vi.mocked(apiClient.getSharedRecipe).mockResolvedValue(sharedRecipe);
    vi.mocked(useSession).mockReturnValue(NO_SESSION);
    renderShared();

    expect(await screen.findByText('Pancakes')).toBeInTheDocument();
    expect(screen.getByText('2 cups flour')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to my recipes' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Create account' }));
    expect(await screen.findByText(`at /register from /share/${TOKEN}`)).toBeInTheDocument();
  });

  it('imports a copy for a logged-in visitor and opens it', async () => {
    vi.mocked(apiClient.getSharedRecipe).mockResolvedValue(sharedRecipe);
    vi.mocked(apiClient.importSharedRecipe).mockResolvedValue({
      ...sharedRecipe,
      id: 42,
      share_token: null,
    } as Recipe);
    vi.mocked(useSession).mockReturnValue(sessionFor());
    renderShared();

    fireEvent.click(await screen.findByRole('button', { name: 'Add to my recipes' }));

    await waitFor(() => expect(apiClient.importSharedRecipe).toHaveBeenCalledWith(TOKEN));
    expect(await screen.findByText('at /recipes/42 from nowhere')).toBeInTheDocument();
    expect(screen.getByText('Added to your recipes')).toBeInTheDocument();
  });

  it("links to the viewer's own recipe instead of offering an import", async () => {
    vi.mocked(apiClient.getSharedRecipe).mockResolvedValue({ ...sharedRecipe, own_recipe_id: 7 });
    vi.mocked(useSession).mockReturnValue(sessionFor());
    renderShared();

    expect(await screen.findByRole('link', { name: 'Open recipe' })).toHaveAttribute(
      'href',
      '/recipes/7'
    );
    expect(screen.queryByRole('button', { name: 'Add to my recipes' })).not.toBeInTheDocument();
  });

  it('explains a revoked link', async () => {
    vi.mocked(apiClient.getSharedRecipe).mockRejectedValue(
      new apiClient.ApiError('Shared recipe not found', 'share_not_found')
    );
    vi.mocked(useSession).mockReturnValue(NO_SESSION);
    renderShared();

    expect(await screen.findByText('This link is no longer active')).toBeInTheDocument();
  });
});
