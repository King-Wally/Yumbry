interface InstructionListProps {
  items: { key: string | number; step_number: number; text: string }[];
}

export default function InstructionList({ items }: InstructionListProps) {
  return (
    <ol className="space-y-5">
      {items.map((item) => (
        <li key={item.key} className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay text-sm font-medium text-white">
            {item.step_number}
          </span>
          <div className="flex-1 text-stone-700">{item.text}</div>
        </li>
      ))}
    </ol>
  );
}
