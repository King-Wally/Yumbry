import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RecipeVersion } from 'yumbry-shared';
import RecipeVersionsPage from '../src/pages/RecipeVersionsPage';
import * as apiClient from '../src/api/client';
import type { Recipe } from '../src/types';

vi.mock('../src/api/client');
const showToast = vi.fn();
vi.mock('../src/hooks/useToast', () => ({ useToast: () => ({ showToast }) }));

const recipe: Recipe = {
  id: 1,
  title: 'Weeknight tomato pasta',
  description: null,
  image_path: null,
  prep_time_minutes: null,
  cook_time_minutes: 20,
  total_time_minutes: null,
  servings: '4',
  calories: null,
  fat_content: null,
  carbohydrate_content: null,
  protein_content: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-09-18T19:05:00.000Z',
  tags: [{ id: 1, name: 'pasta' }],
  category: null,
  ingredients: [
    {
      id: 1,
      recipe_id: 1,
      raw_text: '400 g spaghetti',
      amount: '400',
      unit: 'g',
      name: 'spaghetti',
      is_scalable: true,
      sort_order: 0,
    },
  ],
  instructions: [{ id: 1, recipe_id: 1, step_number: 1, text: 'Simmer for 10 minutes.' }],
};

const version: RecipeVersion = {
  id: 7,
  saved_at: '2026-09-02T12:41:00.000Z',
  snapshot: {
    title: 'Tomato pasta',
    description: null,
    prep_time_minutes: null,
    cook_time_minutes: 25,
    total_time_minutes: null,
    servings: '4',
    calories: null,
    fat_content: null,
    carbohydrate_content: null,
    protein_content: null,
    category: null,
    tags: ['pasta'],
    ingredients: ['400 g spaghetti'],
    instructions: [{ step_number: 1, text: 'Simmer for 15 minutes.' }],
  },
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/recipes/1/versions']}>
        <Routes>
          <Route path="/recipes/:id/versions" element={<RecipeVersionsPage />} />
          <Route path="/recipes/:id" element={<p>detail page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RecipeVersionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.getRecipe).mockResolvedValue(recipe);
  });

  it('shows an empty state when the recipe has no earlier versions', async () => {
    vi.mocked(apiClient.getRecipeVersions).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/No earlier versions yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revert to this version' })).toBeNull();
  });

  it('compares the newest version with the current recipe and highlights differences', async () => {
    vi.mocked(apiClient.getRecipeVersions).mockResolvedValue([
      { id: 7, saved_at: version.saved_at },
      { id: 3, saved_at: '2026-05-03T17:30:00.000Z' },
    ]);
    vi.mocked(apiClient.getRecipeVersion).mockResolvedValue(version);
    renderPage();

    expect(await screen.findByText('Selected version')).toBeInTheDocument();
    expect(screen.getByText('Current version')).toBeInTheDocument();
    expect(apiClient.getRecipeVersion).toHaveBeenCalledWith('1', 7);
    expect(screen.getAllByRole('option')).toHaveLength(2);

    const marks = Array.from(document.querySelectorAll('mark')).map((m) => m.textContent);
    expect(marks).toEqual(['Tomato', '15', 'Weeknight tomato', '10']);
    // title word, cook time, one instruction step
    expect(screen.getByText('3 differences highlighted')).toBeInTheDocument();
  });

  it('loads another version when one is picked from the dropdown', async () => {
    vi.mocked(apiClient.getRecipeVersions).mockResolvedValue([
      { id: 7, saved_at: version.saved_at },
      { id: 3, saved_at: '2026-05-03T17:30:00.000Z' },
    ]);
    vi.mocked(apiClient.getRecipeVersion).mockResolvedValue(version);
    renderPage();

    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    await waitFor(() => expect(apiClient.getRecipeVersion).toHaveBeenCalledWith('1', 3));
  });

  it('reverts to the selected version and returns to the recipe', async () => {
    vi.mocked(apiClient.getRecipeVersions).mockResolvedValue([
      { id: 7, saved_at: version.saved_at },
    ]);
    vi.mocked(apiClient.getRecipeVersion).mockResolvedValue(version);
    vi.mocked(apiClient.revertRecipeVersion).mockResolvedValue(recipe);
    renderPage();

    await screen.findByText('Selected version');
    fireEvent.click(screen.getByRole('button', { name: 'Revert to this version' }));

    expect(await screen.findByText('detail page')).toBeInTheDocument();
    expect(apiClient.revertRecipeVersion).toHaveBeenCalledWith('1', 7);
    expect(showToast).toHaveBeenCalled();
  });
});
