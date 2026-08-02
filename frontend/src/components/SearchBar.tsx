import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search recipes..."
        className="w-full rounded-full border border-stone-300 bg-white py-2 pl-10 pr-4 text-stone-800 transition-colors hover:border-stone-400 focus:border-clay focus:outline-none"
      />
    </div>
  );
}
