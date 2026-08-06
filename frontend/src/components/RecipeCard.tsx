import { Link } from 'react-router-dom';
import { ImageOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RecipeSummary } from '../types';

interface RecipeCardProps {
  recipe: RecipeSummary;
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
  const { t } = useTranslation();
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
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-stone-300">
            <ImageOff className="h-10 w-10" strokeWidth={1.5} />
            <span className="text-xs">{t('recipes.card.noPhoto')}</span>
          </div>
        )}
      </div>
      <div className="p-4">
        {recipe.category && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-clay">
            {recipe.category.name}
          </p>
        )}
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
              className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 capitalize"
            >
              {tag.name}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
