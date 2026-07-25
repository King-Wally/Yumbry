import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRecipes } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useCategories } from '../hooks/useCategories';
import { useTags } from '../hooks/useTags';
import FilterChips from '../components/FilterChips';
import RecipeCard from '../components/RecipeCard';
import SearchBar from '../components/SearchBar';

export default function RecipeListPage() {
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: tags } = useTags();
  const { data: categories } = useCategories();
  const {
    data: recipes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.recipes({ search, tag: activeTag, category: activeCategory }),
    queryFn: () => getRecipes({ search, tag: activeTag, category: activeCategory }),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SearchBar value={search} onChange={setSearch} />
        <FilterChips items={categories} activeValue={activeCategory} onSelect={setActiveCategory} />
        <FilterChips items={tags} activeValue={activeTag} onSelect={setActiveTag} />
      </div>

      {isLoading && <p className="text-stone-500">Loading recipes...</p>}
      {isError && <p className="text-red-600">Couldn't load recipes.</p>}

      {recipes && recipes.length === 0 && (
        <p className="text-stone-500">No recipes yet. Try importing or adding one.</p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {recipes?.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </div>
  );
}
