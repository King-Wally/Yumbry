import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecipeFormPage from '../src/pages/RecipeFormPage';
import * as apiClient from '../src/api/client';
import type { Recipe, RecipeInput } from '../src/types';

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
  calories: null,
  fat_content: null,
  carbohydrate_content: null,
  protein_content: null,
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
      <MemoryRouter initialEntries={[`/recipes/${id}/edit`]}>
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

describe('RecipeFormPage AI draft hydration', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getCategories).mockResolvedValue([]);
  });

  function renderCreateWithAiDraft(aiDraft: RecipeInput) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: '/recipes/new', state: { aiDraft } }]}>
          <Routes>
            <Route path="/recipes/new" element={<RecipeFormPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it('pre-fills the create form from an AI-generated draft passed via router state', async () => {
    renderCreateWithAiDraft({
      title: 'AI Curry',
      description: 'A generated curry.',
      servings: 4,
      ingredients: ['1 can coconut milk'],
      instructions: [{ step_number: 1, text: 'Simmer everything.' }],
      tags: ['curry'],
      category: 'Main course',
    });

    expect(await screen.findByDisplayValue('AI Curry')).toBeInTheDocument();
    expect(screen.getByText(/Reviewing an AI-generated draft/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('1 can coconut milk')).toBeInTheDocument();
  });

  it('pre-fills the edit form from an AI-generated draft, ignoring the fetched recipe', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(existingRecipe);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/recipes/7/edit',
              state: {
                aiDraft: {
                  title: 'Spicier Curry',
                  servings: 4,
                  calories: null,
                  fat_content: null,
                  carbohydrate_content: null,
                  protein_content: null,
                  ingredients: ['2 tbsp chili paste'],
                  instructions: [{ step_number: 1, text: 'Simmer everything.' }],
                  tags: [],
                  category: null,
                },
              },
            },
          ]}
        >
          <Routes>
            <Route path="/recipes/:id/edit" element={<RecipeFormPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByDisplayValue('Spicier Curry')).toBeInTheDocument();

    // Wait for the existingRecipe query to actually resolve (it fires because
    // isEditing is true) to prove its later-resolving hydration doesn't
    // clobber the aiDraft-applied form once it settles.
    await waitFor(() => expect(apiClient.getRecipe).toHaveBeenCalledWith('7'));

    expect(screen.getByDisplayValue('Spicier Curry')).toBeInTheDocument();
    expect(screen.getByText(/Reviewing an AI-generated draft/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Original Title')).not.toBeInTheDocument();
  });

  it('does not show the AI banner or aiDraft state on a normal empty create form', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/recipes/new']}>
          <Routes>
            <Route path="/recipes/new" element={<RecipeFormPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Add a recipe')).toBeInTheDocument();
    expect(screen.queryByText(/Reviewing an AI-generated draft/)).not.toBeInTheDocument();
  });
});

describe('RecipeFormPage nutrition', () => {
  const estimate = {
    calories: 420,
    fat_content: 14.5,
    carbohydrate_content: 58,
    protein_content: 16,
  };

  beforeEach(() => {
    vi.mocked(apiClient.getCategories).mockResolvedValue([]);
    vi.mocked(apiClient.getAiStatus).mockResolvedValue({ configured: true });
    vi.mocked(apiClient.getRecipe).mockResolvedValue({
      ...existingRecipe,
      calories: '420.00',
      fat_content: '14.50',
      ingredients: [
        {
          id: 1,
          recipe_id: 7,
          raw_text: '400 g spaghetti',
          amount: '400',
          unit: 'g',
          name: 'spaghetti',
          is_scalable: true,
          sort_order: 0,
        },
      ],
    });
  });

  function estimateButton() {
    return screen.getByRole('button', { name: 'Estimate with AI' });
  }

  it('hydrates the inputs from the saved recipe, trimming Decimal noise', async () => {
    renderForm();

    expect(await screen.findByDisplayValue('420')).toBeInTheDocument();
    expect(screen.getByDisplayValue('14.5')).toBeInTheDocument();
  });

  // The payload has to be what the cook is looking at, not the recipe that was fetched.
  it('sends the live form values, including unsaved edits', async () => {
    vi.mocked(apiClient.estimateNutrition).mockResolvedValue(estimate);
    renderForm();

    const titleInput = await screen.findByDisplayValue('Original Title');
    fireEvent.change(titleInput, { target: { value: 'Edited Pasta' } });
    fireEvent.click(estimateButton());

    // react-query hands mutationFn a context argument too, so assert on the payload alone.
    await waitFor(() => expect(apiClient.estimateNutrition).toHaveBeenCalled());
    expect(vi.mocked(apiClient.estimateNutrition).mock.calls[0][0]).toEqual({
      title: 'Edited Pasta',
      description: null,
      servings: 4,
      ingredients: ['400 g spaghetti'],
      instructions: [],
    });
  });

  it('fills the inputs from the estimate', async () => {
    vi.mocked(apiClient.estimateNutrition).mockResolvedValue(estimate);
    renderForm();

    fireEvent.click(await screen.findByRole('button', { name: 'Estimate with AI' }));

    expect(await screen.findByDisplayValue('58')).toBeInTheDocument();
    expect(screen.getByDisplayValue('16')).toBeInTheDocument();
  });

  // A value the model declined to guess must not be overwritten with a fake 0.
  it('leaves a field the estimate returned as null untouched', async () => {
    vi.mocked(apiClient.estimateNutrition).mockResolvedValue({ ...estimate, calories: null });
    renderForm();

    fireEvent.click(await screen.findByRole('button', { name: 'Estimate with AI' }));

    await screen.findByDisplayValue('58');
    expect(screen.getByDisplayValue('420')).toBeInTheDocument();
  });

  it('shows the error inline and changes nothing when the estimate fails', async () => {
    vi.mocked(apiClient.estimateNutrition).mockRejectedValue(new Error('AI is unavailable.'));
    renderForm();

    fireEvent.click(await screen.findByRole('button', { name: 'Estimate with AI' }));

    expect(await screen.findByText('AI is unavailable.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('420')).toBeInTheDocument();
  });

  it('disables the button while the estimate is in flight', async () => {
    vi.mocked(apiClient.estimateNutrition).mockReturnValue(new Promise(() => {}));
    renderForm();

    fireEvent.click(await screen.findByRole('button', { name: 'Estimate with AI' }));

    const pending = await screen.findByRole('button', { name: 'Estimating...' });
    expect(pending).toBeDisabled();
  });

  it('disables the button when there is nothing to measure', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(existingRecipe);
    renderForm();

    expect(await screen.findByRole('button', { name: 'Estimate with AI' })).toBeDisabled();
  });

  it('hides the button entirely when the server has no AI key', async () => {
    vi.mocked(apiClient.getAiStatus).mockResolvedValue({ configured: false });
    renderForm();

    await screen.findByDisplayValue('Original Title');
    expect(screen.queryByRole('button', { name: 'Estimate with AI' })).not.toBeInTheDocument();
  });

  // A bare <button> inside the form would submit it.
  it('does not save the recipe when estimating', async () => {
    vi.mocked(apiClient.estimateNutrition).mockResolvedValue(estimate);
    renderForm();

    fireEvent.click(await screen.findByRole('button', { name: 'Estimate with AI' }));
    await screen.findByDisplayValue('58');

    expect(apiClient.updateRecipe).not.toHaveBeenCalled();
    expect(apiClient.createRecipe).not.toHaveBeenCalled();
  });

  it('submits an empty nutrition input as null rather than zero', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(existingRecipe);
    vi.mocked(apiClient.updateRecipe).mockResolvedValue(existingRecipe);
    renderForm();

    await screen.findByDisplayValue('Original Title');
    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }));

    await waitFor(() =>
      expect(apiClient.updateRecipe).toHaveBeenCalledWith(
        '7',
        expect.objectContaining({
          calories: null,
          fat_content: null,
          carbohydrate_content: null,
          protein_content: null,
        })
      )
    );
  });
});
