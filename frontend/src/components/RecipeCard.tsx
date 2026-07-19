import { Link } from 'react-router-dom';
import type { RecipeSummary } from '../types';

interface RecipeCardProps {
  recipe: RecipeSummary;
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="group block overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-clay/30 hover:shadow-lg"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-stone-100">
        {recipe.image_path ? (
          <img
            src={recipe.image_path}
            alt={recipe.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-stone-300">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-10 w-10"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="8.5" cy="10" r="1.5" />
              <path d="M21 16l-5-5-9 9" />
            </svg>
            <span className="text-xs">No photo</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-serif text-lg text-stone-900 transition-colors group-hover:text-clay">
          {recipe.title}
        </h3>
        {recipe.description && (
          <p className="mt-1 line-clamp-2 text-sm text-stone-500">{recipe.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {recipe.tags?.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600"
            >
              {tag.name}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
