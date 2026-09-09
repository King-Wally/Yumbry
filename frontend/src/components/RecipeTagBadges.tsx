interface RecipeTagBadgesProps {
  category?: string | null;
  tags: string[];
}

export default function RecipeTagBadges({ category, tags }: RecipeTagBadgesProps) {
  if (!category && tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {category && (
        <span className="bg-clay rounded-full px-3 py-1 text-xs font-semibold tracking-wide text-white capitalize">
          {category}
        </span>
      )}
      {tags.map((tag) => (
        <span
          key={tag}
          className="border-clay/25 bg-clay/10 text-clay rounded-full border px-3 py-1 text-xs font-medium tracking-wide capitalize"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
