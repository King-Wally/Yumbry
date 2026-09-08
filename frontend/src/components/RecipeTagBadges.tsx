interface RecipeTagBadgesProps {
  category?: string | null;
  tags: string[];
}

export default function RecipeTagBadges({ category, tags }: RecipeTagBadgesProps) {
  if (!category && tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {category && (
        <span className="rounded-full bg-clay px-3 py-1 text-xs font-semibold capitalize tracking-wide text-white">
          {category}
        </span>
      )}
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-clay/25 bg-clay/10 px-3 py-1 text-xs font-medium tracking-wide text-clay capitalize"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
