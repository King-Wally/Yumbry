import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecipeDetailPage from '../src/pages/RecipeDetailPage';
import * as apiClient from '../src/api/client';
import type { Recipe } from '../src/types';

vi.mock('../src/api/client');

const recipe: Recipe = {
  id: 1,
  title: 'Pancakes',
  description: null,
  image_path: null,
  prep_time_minutes: null,
  cook_time_minutes: null,
  total_time_minutes: null,
  servings: '4',
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
};

function renderDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={['/recipes/1']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
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
    renderDetail();

    expect(await screen.findByText('2 cups flour')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('rescales ingredient amounts when the user adjusts servings', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(recipe);
    renderDetail();

    await screen.findByText('2 cups flour');
    fireEvent.click(screen.getByLabelText('Increase servings'));

    expect(await screen.findByText('2,5 cups flour')).toBeInTheDocument();
  });
});
