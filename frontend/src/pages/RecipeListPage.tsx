import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCategories, getRecipes, getTags } from '../api/client';
import CategoryChips from '../components/CategoryChips';
import RecipeCard from '../components/RecipeCard';
import SearchBar from '../components/SearchBar';
import TagChips from '../components/TagChips';

export default function RecipeListPage() {
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: tags } = useQuery({ queryKey: ['tags'], queryFn: getTags });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const {
    data: recipes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['recipes', search, activeTag, activeCategory],
    queryFn: () => getRecipes({ search, tag: activeTag, category: activeCategory }),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SearchBar value={search} onChange={setSearch} />
        <CategoryChips
          categories={categories}
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
        />
        <TagChips tags={tags} activeTag={activeTag} onSelect={setActiveTag} />
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
