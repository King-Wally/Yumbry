import type { Category } from '../types';

interface CategoryChipsProps {
  categories: Category[] | undefined;
  activeCategory: string | null;
  onSelect: (category: string | null) => void;
}

export default function CategoryChips({
  categories,
  activeCategory,
  onSelect,
}: CategoryChipsProps) {
  if (!categories || categories.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`rounded-full px-3 py-1 text-sm transition ${
          !activeCategory
            ? 'bg-clay text-white shadow-sm'
            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
        }`}
      >
        All
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(category.name === activeCategory ? null : category.name)}
          className={`rounded-full px-3 py-1 text-sm capitalize transition ${
            activeCategory === category.name
              ? 'bg-clay text-white shadow-sm'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
