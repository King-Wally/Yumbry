interface RecipeHeroProps {
  title: string;
  imagePath?: string | null;
}

export default function RecipeHero({ title, imagePath }: RecipeHeroProps) {
  return (
    <div className="relative h-56 overflow-hidden rounded-2xl shadow-sm sm:h-72 md:h-full">
      {imagePath ? (
        <img
          src={imagePath}
          alt={title}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-100 text-stone-300">
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
        </div>
      )}
    </div>
  );
}
