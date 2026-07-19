import type { Tag } from '../types';

interface TagChipsProps {
  tags: Tag[] | undefined;
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
}

export default function TagChips({ tags, activeTag, onSelect }: TagChipsProps) {
  if (!tags || tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`rounded-full px-3 py-1 text-sm transition ${
          !activeTag
            ? 'bg-clay text-white shadow-sm'
            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
        }`}
      >
        All
      </button>
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => onSelect(tag.name === activeTag ? null : tag.name)}
          className={`rounded-full px-3 py-1 text-sm transition ${
            activeTag === tag.name
              ? 'bg-clay text-white shadow-sm'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}
