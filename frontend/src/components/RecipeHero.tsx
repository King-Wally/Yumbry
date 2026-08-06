import { ImageOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RecipeHeroProps {
  title: string;
  imagePath?: string | null;
}

export default function RecipeHero({ title, imagePath }: RecipeHeroProps) {
  const { t } = useTranslation();
  return (
    <div className="relative h-56 overflow-hidden rounded-2xl shadow-sm sm:h-72 lg:h-full">
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
          <ImageOff className="h-14 w-14" strokeWidth={1.5} />
          <span className="text-sm">{t('recipes.hero.noPhotoYet')}</span>
        </div>
      )}
    </div>
  );
}
