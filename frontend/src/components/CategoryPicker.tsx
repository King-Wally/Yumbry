import { useState } from 'react';
import type { Category } from '../types';
import Chip from './Chip';

interface CategoryPickerProps {
  categories: Category[] | undefined;
  value: string | null;
  onChange: (name: string | null) => void;
}

export default function CategoryPicker({ categories, value, onChange }: CategoryPickerProps) {
  const [customInput, setCustomInput] = useState('');

  function addCustom() {
    const name = customInput.trim();
    if (name) {
      const existing = categories?.find((c) => c.name.toLowerCase() === name.toLowerCase());
      onChange(existing ? existing.name : name);
    }
    setCustomInput('');
  }

  return (
    <div>
      {categories && categories.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {categories.map((category) => (
            <Chip
              key={category.id}
              active={value === category.name}
              onClick={() => onChange(category.name === value ? null : category.name)}
            >
              {category.name}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Or type a new category"
          className="flex-1 rounded-md border border-stone-300 px-3 py-1.5"
        />
        <button
          type="button"
          onClick={addCustom}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        >
          Set
        </button>
      </div>
      {value && (
        <p className="mt-1.5 text-xs text-stone-500">
          Selected: <span className="font-medium capitalize text-stone-700">{value}</span>{' '}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-stone-400 hover:text-red-600"
          >
            ✕ clear
          </button>
        </p>
      )}
    </div>
  );
}
