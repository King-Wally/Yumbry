import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecipeCard from '../src/components/RecipeCard';
import type { RecipeSummary } from '../src/types';

const recipe: RecipeSummary = {
  id: 42,
  title: 'Chocolate Cake',
  description: 'Rich and moist.',
  image_path: null,
  prep_time_minutes: null,
  cook_time_minutes: null,
  total_time_minutes: null,
  servings: '8',
  source_url: null,
  author: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  tags: [{ id: 1, name: 'dessert' }],
};

function renderCard() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RecipeCard recipe={recipe} />
    </MemoryRouter>
  );
}

describe('RecipeCard', () => {
  it('renders the title, description, and tags', () => {
    renderCard();

    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
    expect(screen.getByText('Rich and moist.')).toBeInTheDocument();
    expect(screen.getByText('dessert')).toBeInTheDocument();
  });

  it('links to the recipe detail page', () => {
    renderCard();

    expect(screen.getByRole('link')).toHaveAttribute('href', '/recipes/42');
  });

  it('shows a placeholder when there is no photo', () => {
    renderCard();

    expect(screen.getByText('No photo')).toBeInTheDocument();
  });
});
