import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import ShareRecipeDialog from '../src/components/ShareRecipeDialog';
import * as apiClient from '../src/api/client';
import { queryKeys } from '../src/api/queryKeys';
import type { Recipe } from '../src/types';

vi.mock('../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof apiClient>();
  return {
    getRecipeShareUrl: actual.getRecipeShareUrl,
    getRecipe: vi.fn(),
    enableRecipeShare: vi.fn(),
    disableRecipeShare: vi.fn(),
  };
});

const TOKEN = 'b'.repeat(64);

/** Reads the token from the cached recipe, like RecipeDetailPage does, so the
 * dialog's cache writes are what flips it between states. */
function Harness() {
  const [open, setOpen] = useState(true);
  const { data: recipe } = useQuery({
    queryKey: queryKeys.recipe(1),
    queryFn: () => apiClient.getRecipe(1),
  });
  if (!recipe) return null;
  return (
    <ShareRecipeDialog
      open={open}
      onOpenChange={setOpen}
      recipeId={1}
      shareToken={recipe.share_token}
    />
  );
}

function renderDialog(shareToken: string | null) {
  vi.mocked(apiClient.getRecipe).mockResolvedValue({ id: 1, share_token: shareToken } as Recipe);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
}

describe('ShareRecipeDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a link, then copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    vi.mocked(apiClient.enableRecipeShare).mockImplementation(async () => {
      vi.mocked(apiClient.getRecipe).mockResolvedValue({ id: 1, share_token: TOKEN } as Recipe);
      return { share_token: TOKEN };
    });
    renderDialog(null);

    fireEvent.click(await screen.findByRole('button', { name: 'Create link' }));

    const input = await screen.findByLabelText('Share link');
    expect(input).toHaveValue(`${window.location.origin}/share/${TOKEN}`);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/share/${TOKEN}`)
    );
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('stops sharing after confirmation', async () => {
    vi.mocked(apiClient.disableRecipeShare).mockImplementation(async () => {
      vi.mocked(apiClient.getRecipe).mockResolvedValue({ id: 1, share_token: null } as Recipe);
      return null;
    });
    renderDialog(TOKEN);

    fireEvent.click(await screen.findByRole('button', { name: 'Stop sharing' }));
    expect(await screen.findByText('Stop sharing this recipe?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));

    await waitFor(() => expect(apiClient.disableRecipeShare).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(screen.queryByText('Stop sharing this recipe?')).not.toBeInTheDocument()
    );
  });
});
