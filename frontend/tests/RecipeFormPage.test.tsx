import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecipeFormPage from '../src/pages/RecipeFormPage';
import * as apiClient from '../src/api/client';
import type { Recipe } from '../src/types';

vi.mock('../src/api/client');

const existingRecipe: Recipe = {
  id: 7,
  title: 'Original Title',
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
  ingredients: [],
  instructions: [],
};

function renderForm(id = '7') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[`/recipes/${id}/edit`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/recipes/:id/edit" element={<RecipeFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RecipeFormPage render-time state sync', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(existingRecipe);
    vi.mocked(apiClient.getCategories).mockResolvedValue([]);
  });

  it('populates the form from the fetched recipe when editing', async () => {
    renderForm();

    expect(await screen.findByDisplayValue('Original Title')).toBeInTheDocument();
  });

  it('does not clobber user edits on an unrelated re-render', async () => {
    renderForm();

    const titleInput = await screen.findByDisplayValue('Original Title');
    fireEvent.change(titleInput, { target: { value: 'User Edited Title' } });
    expect(titleInput).toHaveValue('User Edited Title');

    // Adding a tag updates unrelated component state and forces a re-render;
    // the title should stay as the user left it rather than reverting to the
    // originally-fetched recipe (the bug the render-time-sync guard prevents).
    fireEvent.change(screen.getByPlaceholderText('Add a tag and press Enter'), {
      target: { value: 'quick' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(titleInput).toHaveValue('User Edited Title');
  });
});
