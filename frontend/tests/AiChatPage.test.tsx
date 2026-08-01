import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AiChatPage from '../src/pages/AiChatPage';
import * as apiClient from '../src/api/client';
import type { Recipe, RecipeInput } from '../src/types';

vi.mock('../src/api/client');

const recipe: Recipe = {
  id: 1,
  title: 'Mild Curry',
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
      raw_text: '1 can coconut milk',
      amount: '1',
      unit: 'can',
      name: 'coconut milk',
      is_scalable: true,
      sort_order: 0,
    },
  ],
  instructions: [],
};

function LocationProbe() {
  const location = useLocation();
  const aiDraft = (location.state as { aiDraft?: RecipeInput } | null)?.aiDraft;
  return <div data-testid="location-probe">{aiDraft ? aiDraft.title : 'no-draft'}</div>;
}

function renderCreate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={['/create-with-ai']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/create-with-ai" element={<AiChatPage />} />
          <Route path="/recipes/new" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderImprove() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={['/recipes/1/ai-improve']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/recipes/:id/ai-improve" element={<AiChatPage />} />
          <Route path="/recipes/:id/edit" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AiChatPage create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends a message and updates both the transcript and the preview from the envelope response', async () => {
    vi.mocked(apiClient.chatAboutRecipe).mockResolvedValue({
      reply: 'Sure, here is a spicy curry.',
      recipe: {
        title: 'Spicy Curry',
        servings: 4,
        ingredients: ['1 can coconut milk'],
        instructions: [{ step_number: 1, text: 'Simmer.' }],
        tags: [],
        category: null,
      },
    });

    renderCreate();

    fireEvent.change(screen.getByPlaceholderText("Tell the AI what you'd like to cook"), {
      target: { value: 'a spicy curry' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Sure, here is a spicy curry.')).toBeInTheDocument();
    expect(screen.getByText('Spicy Curry')).toBeInTheDocument();
  });

  it('disables Save and review until a draft exists', () => {
    renderCreate();
    expect(screen.getByRole('button', { name: 'Save and review' })).toBeDisabled();
  });

  it('navigates to /recipes/new with the current draft in router state on Save', async () => {
    vi.mocked(apiClient.chatAboutRecipe).mockResolvedValue({
      reply: 'Got it.',
      recipe: {
        title: 'Spicy Curry',
        servings: 4,
        ingredients: [],
        instructions: [],
        tags: [],
        category: null,
      },
    });

    renderCreate();

    fireEvent.change(screen.getByPlaceholderText("Tell the AI what you'd like to cook"), {
      target: { value: 'a spicy curry' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Got it.');

    fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent('Spicy Curry')
    );
  });
});

describe('AiChatPage improve mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('seeds the initial preview from the fetched recipe with no chat call', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(recipe);

    renderImprove();

    expect(await screen.findByText('1 can coconut milk')).toBeInTheDocument();
    expect(apiClient.chatAboutRecipe).not.toHaveBeenCalled();
  });

  it('sends the seeded baseline as current_draft on the first chat turn', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(recipe);
    vi.mocked(apiClient.chatAboutRecipe).mockResolvedValue({
      reply: 'Made it spicier.',
      recipe: {
        title: 'Spicy Curry',
        servings: 4,
        ingredients: ['1 can coconut milk', '2 tbsp chili paste'],
        instructions: [],
        tags: [],
        category: null,
      },
    });

    renderImprove();
    await screen.findByText('1 can coconut milk');

    fireEvent.change(screen.getByPlaceholderText('Tell the AI what to change'), {
      target: { value: 'make it spicier' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(apiClient.chatAboutRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
          current_draft: expect.objectContaining({ title: 'Mild Curry' }),
        })
      )
    );
  });

  it('navigates to /recipes/:id/edit with the current draft on Save', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(recipe);

    renderImprove();
    await screen.findByText('1 can coconut milk');

    fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent('Mild Curry')
    );
  });

  it('shows AiErrorBanner on a failed chat call', async () => {
    vi.mocked(apiClient.getRecipe).mockResolvedValue(recipe);
    vi.mocked(apiClient.chatAboutRecipe).mockRejectedValue(
      new Error('Could not reach the AI provider.')
    );

    renderImprove();
    await screen.findByText('1 can coconut milk');

    fireEvent.change(screen.getByPlaceholderText('Tell the AI what to change'), {
      target: { value: 'make it spicier' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Check your AI settings')).toBeInTheDocument();
  });
});
