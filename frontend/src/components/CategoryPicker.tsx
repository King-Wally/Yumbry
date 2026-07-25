import { useState } from 'react';
import type { Category } from '../types';

interface CategoryPickerProps {
  categories: Category[] | undefined;
  value: string | null;
  onChange: (name: string | null) => void;
}

export default function CategoryPicker({ categories, value, onChange }: CategoryPickerProps) {
  const [customInput, setCustomInput] = useState('');

  function addCustom() {
    const name = customInput.trim();
    if (name) onChange(name);
    setCustomInput('');
  }

  return (
    <div>
      {categories && categories.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onChange(category.name === value ? null : category.name)}
              className={`rounded-full px-3 py-1 text-sm transition ${
                value === category.name
                  ? 'bg-clay text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {category.name}
            </button>
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
          Selected: <span className="font-medium text-stone-700">{value}</span>{' '}
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
