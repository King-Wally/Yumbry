import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecipeDetailPage from '../src/pages/RecipeDetailPage';
import * as apiClient from '../src/api/client';
import type { CurrentUser } from '../src/api/client';
import { useSession } from '../src/lib/auth-client';
import * as pwa from '../src/pwa';
import { sessionFor } from './helpers/auth-client';
import type { Recipe } from '../src/types';
import { aiStatus } from './helpers/ai-status';

vi.mock('../src/api/client');
// Async factory with a dynamic import: vi.mock is hoisted above the imports,
// so the helper cannot be referenced directly here.
vi.mock('../src/lib/auth-client', async () =>
  (await import('./helpers/auth-client')).authClientMock()
);
vi.mock('../src/pwa', async () => ({
  ...(await vi.importActual<typeof pwa>('../src/pwa')),
  isStandalonePwa: vi.fn().mockReturnValue(false),
}));

const currentUser: CurrentUser = {
  id: 'user_1',
  email: 'a@example.com',
  locale: 'en',
  unitSystem: 'metric',
  smallVolumes: 'spoons',
  jsonImportExportEnabled: false,
};

const recipe: Recipe = {
  id: 1,
  title: 'Pancakes',
  description: null,
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
  share_token: null,
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
};

function renderDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/recipes/1']}>
        <Routes>
          <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RecipeDetailPage render-time state sync', () => {
  it('initializes the servings stepper from the recipe base servings (a string from the API)', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(recipe);
    vi.mocked(useSession).mockReturnValue(sessionFor(currentUser));
    renderDetail();

    expect(await screen.findByText('2 cups flour')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('rescales ingredient amounts when the user adjusts servings', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(recipe);
    vi.mocked(useSession).mockReturnValue(sessionFor(currentUser));
    renderDetail();

    await screen.findByText('2 cups flour');
    fireEvent.click(screen.getByLabelText('Increase servings'));

    // A measuring cup has no 0.5 marking that reads as "2,5" — a cook reads halves.
    expect(await screen.findByText('2 1/2 cups flour')).toBeInTheDocument();
  });
});

describe('RecipeDetailPage export button', () => {
  const currentUserWithExport: CurrentUser = { ...currentUser, jsonImportExportEnabled: true };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(pwa.isStandalonePwa).mockReturnValue(false);
  });

  it('renders a plain download anchor outside of standalone PWA mode', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(recipe);
    vi.mocked(apiClient.getRecipeExportUrl).mockReturnValue('/api/recipes/1/export');
    vi.mocked(useSession).mockReturnValue(sessionFor(currentUserWithExport));
    renderDetail();

    const link = await screen.findByRole('link', { name: 'Export' });
    expect(link).toHaveAttribute('href', '/api/recipes/1/export');
    expect(link).toHaveAttribute('download');
  });

  it('prefetches the export and shares it synchronously on click in standalone PWA mode', async () => {
    vi.mocked(pwa.isStandalonePwa).mockReturnValue(true);
    vi.mocked(apiClient.getRecipe).mockResolvedValue(recipe);
    vi.mocked(apiClient.getRecipeExportUrl).mockReturnValue('/api/recipes/1/export');
    vi.mocked(useSession).mockReturnValue(sessionFor(currentUserWithExport));

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ '@type': 'Recipe' }), {
        headers: { 'Content-Disposition': 'attachment; filename="pancakes.json"' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const shareMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: vi.fn().mockReturnValue(true),
      share: shareMock,
    });

    renderDetail();

    const button = await screen.findByRole('button', { name: 'Export' });
    await waitFor(() => expect(button).toBeEnabled());

    fireEvent.click(button);

    // No fetch should happen between the click and the share call — the file
    // was already fetched ahead of time, so share() stays a direct response
    // to user input.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(shareMock).toHaveBeenCalledTimes(1));
    const sharedFile = shareMock.mock.calls[0][0].files[0] as File;
    expect(sharedFile.name).toBe('pancakes.json');
  });
});

describe('RecipeDetailPage nutrition', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getAiStatus).mockResolvedValue(aiStatus(false));
  });

  it('shows the four per-serving values', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue({
      ...recipe,
      calories: '420.00',
      fat_content: '14.50',
      carbohydrate_content: '58.00',
      protein_content: '16.00',
    });
    renderDetail();

    expect(await screen.findByText('Nutrition')).toBeInTheDocument();
    expect(screen.getByText('Per serving')).toBeInTheDocument();
    // Decimal(8,2) noise is trimmed, but a real decimal survives.
    expect(screen.getByText('420')).toBeInTheDocument();
    expect(screen.getByText('14.5')).toBeInTheDocument();
  });

  it('renders nothing at all when the recipe has no nutrition', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(recipe);
    renderDetail();

    await screen.findByText('Pancakes');
    expect(screen.queryByText('Nutrition')).not.toBeInTheDocument();
    expect(screen.queryByText('Per serving')).not.toBeInTheDocument();
  });

  it('shows only the values that are set', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue({ ...recipe, calories: '420' });
    renderDetail();

    expect(await screen.findByText('Calories')).toBeInTheDocument();
    expect(screen.queryByText('Protein')).not.toBeInTheDocument();
  });

  // They describe one serving by definition, so the stepper must not touch them.
  it('does not scale with the servings stepper', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue({ ...recipe, calories: '420' });
    renderDetail();

    await screen.findByText('420');
    fireEvent.click(screen.getByLabelText('Increase servings'));

    expect(screen.getByText('420')).toBeInTheDocument();
  });
});
