import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AiChatPage from '../src/pages/AiChatPage';
import * as apiClient from '../src/api/client';
import type { CurrentUser } from '../src/api/client';
import { AuthProvider } from '../src/context/AuthContext';
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
        <AuthProvider>
          <Routes>
            <Route path="/create-with-ai" element={<AiChatPage />} />
            <Route path="/recipes/new" element={<LocationProbe />} />
          </Routes>
        </AuthProvider>
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
        <AuthProvider>
          <Routes>
            <Route path="/recipes/:id/ai-improve" element={<AiChatPage />} />
            <Route path="/recipes/:id/edit" element={<LocationProbe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const currentUser: CurrentUser = {
  id: 1,
  email: 'a@example.com',
  locale: 'en',
  unitSystem: 'metric',
  smallVolumes: 'spoons',
};

const padThaiEnvelope = {
  reply: 'Here you go.',
  recipe: {
    title: 'Pad Thai',
    description: null,
    image_path: null,
    prep_time_minutes: null,
    cook_time_minutes: null,
    total_time_minutes: null,
    servings: 2,
    ingredients: ['3 tbsp fish sauce'],
    ingredients_structured: [
      { item: 'fish sauce', quantity: 45, unit: 'ml', note: null, density_key: 'none' as const },
    ],
    instructions: [{ step_number: 1, text: 'Stir in the fish sauce.' }],
    tags: [],
    category: null,
  },
};

// The two measurement controls live here rather than in Settings, because the preview beside them
// is the only place their effect shows.
describe('AiChatPage measurement controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue(currentUser);
  });

  async function sendAndGetPreview() {
    vi.mocked(apiClient.chatAboutRecipe).mockResolvedValue(padThaiEnvelope);
    renderCreate();
    fireEvent.change(await screen.findByPlaceholderText("Tell the AI what you'd like to cook"), {
      target: { value: 'pad thai' },
    });
    fireEvent.click(screen.getByText('Send'));
    await screen.findByText('3 tbsp fish sauce');
  }

  // Persist the preference the way the server would, so the refetch that follows returns it.
  function setStoredPreference(patch: Partial<CurrentUser>) {
    const updated = { ...currentUser, ...patch };
    vi.mocked(apiClient.updateProfile).mockResolvedValue(updated);
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue(updated);
  }

  it('saves a unit choice and sends only that field', async () => {
    await sendAndGetPreview();
    setStoredPreference({ unitSystem: 'imperial' });

    fireEvent.change(screen.getByLabelText('Units'), { target: { value: 'imperial' } });

    await waitFor(() =>
      expect(apiClient.updateProfile).toHaveBeenCalledWith({ unitSystem: 'imperial' })
    );
    // 45 ml is three tablespoons in either system, so the imperial rendering agrees here.
    expect(await screen.findByText('3 tbsp fish sauce')).toBeInTheDocument();
  });

  // Without this the control would appear to do nothing until the next reply arrived.
  it('redraws the preview immediately, without another chat call', async () => {
    await sendAndGetPreview();
    const chatCallsBefore = vi.mocked(apiClient.chatAboutRecipe).mock.calls.length;

    setStoredPreference({ smallVolumes: 'millilitres' });
    fireEvent.change(screen.getByLabelText('Small amounts'), {
      target: { value: 'millilitres' },
    });

    expect(await screen.findByText('45 ml fish sauce')).toBeInTheDocument();
    expect(screen.queryByText('3 tbsp fish sauce')).not.toBeInTheDocument();
    expect(vi.mocked(apiClient.chatAboutRecipe).mock.calls).toHaveLength(chatCallsBefore);
  });

  it('saves what is on screen, not the server rendering it replaced', async () => {
    await sendAndGetPreview();
    setStoredPreference({ smallVolumes: 'millilitres' });
    fireEvent.change(screen.getByLabelText('Small amounts'), {
      target: { value: 'millilitres' },
    });
    await screen.findByText('45 ml fish sauce');

    fireEvent.click(screen.getByText('Save and review'));

    expect(await screen.findByTestId('location-probe')).toHaveTextContent('Pad Thai');
  });

  // Imperial has no alternative to spoons at these sizes.
  it('disables the small-amounts control for an imperial reader', async () => {
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({
      ...currentUser,
      unitSystem: 'imperial',
    });
    renderCreate();

    expect(await screen.findByLabelText('Small amounts')).toBeDisabled();
  });
});

describe('AiChatPage create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getCurrentUser).mockRejectedValue(new Error('not authenticated'));
  });

  it('sends a message and updates both the transcript and the preview from the envelope response', async () => {
    vi.mocked(apiClient.chatAboutRecipe).mockResolvedValue({
      reply: 'Sure, here is a spicy curry.',
      recipe: {
        title: 'Spicy Curry',
        description: null,
        image_path: null,
        prep_time_minutes: null,
        cook_time_minutes: null,
        total_time_minutes: null,
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
        description: null,
        image_path: null,
        prep_time_minutes: null,
        cook_time_minutes: null,
        total_time_minutes: null,
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
    vi.mocked(apiClient.getCurrentUser).mockRejectedValue(new Error('not authenticated'));
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
        description: null,
        image_path: null,
        prep_time_minutes: null,
        cook_time_minutes: null,
        total_time_minutes: null,
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

    expect(await screen.findByText('Could not reach the AI provider.')).toBeInTheDocument();
  });
});
