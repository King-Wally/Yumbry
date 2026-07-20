interface RecipeHeroProps {
  title: string;
  description?: string | null;
  imagePath?: string | null;
}

export default function RecipeHero({ title, description, imagePath }: RecipeHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl shadow-sm">
      {imagePath ? (
        <>
          <img src={imagePath} alt={title} className="h-72 w-full object-cover sm:h-96" />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900/80 via-stone-900/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
            <h1 className="font-serif text-3xl text-white drop-shadow-sm sm:text-4xl">{title}</h1>
            {description && <p className="mt-2 max-w-2xl text-stone-100/90">{description}</p>}
          </div>
        </>
      ) : (
        <div className="flex h-56 w-full flex-col items-center justify-center gap-3 bg-stone-100 text-stone-300 sm:h-72">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-14 w-14"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="8.5" cy="10" r="1.5" />
            <path d="M21 16l-5-5-9 9" />
          </svg>
          <span className="text-sm">No photo yet</span>
          <div className="px-6 text-center">
            <h1 className="font-serif text-2xl text-stone-700 sm:text-3xl">{title}</h1>
            {description && <p className="mt-2 max-w-2xl text-stone-500">{description}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
