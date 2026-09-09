import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('recipes.list.searchPlaceholder')}
        className="focus:border-clay w-full rounded-full border border-stone-300 bg-white py-2 pr-4 pl-10 text-stone-800 transition-colors hover:border-stone-400 focus:outline-none"
      />
    </div>
  );
}
