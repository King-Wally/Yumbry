interface IngredientListProps {
  items: { key: string | number; text: string }[];
}

export default function IngredientList({ items }: IngredientListProps) {
  return (
    <ul className="divide-y divide-stone-100">
      {items.map((item) => (
        <li key={item.key} className="flex items-start gap-2.5 py-2 text-stone-700">
          <span className="bg-clay/60 mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
