import Chip from './Chip';

interface FilterChipItem {
  id: number;
  name: string;
}

interface FilterChipsProps {
  items: FilterChipItem[] | undefined;
  activeValue: string | null;
  onSelect: (value: string | null) => void;
}

export default function FilterChips({ items, activeValue, onSelect }: FilterChipsProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Chip active={!activeValue} onClick={() => onSelect(null)}>
        All
      </Chip>
      {items.map((item) => (
        <Chip
          key={item.id}
          active={activeValue === item.name}
          onClick={() => onSelect(item.name === activeValue ? null : item.name)}
        >
          {item.name}
        </Chip>
      ))}
    </div>
  );
}
