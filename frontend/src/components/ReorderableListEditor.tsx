import type { ReactNode } from 'react';

interface ReorderableListEditorProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  createItem: () => T;
  renderItem: (item: T, update: (next: T) => void, index: number) => ReactNode;
  label: string;
  addLabel: string;
  rowClassName?: string;
  controlsClassName?: string;
}

export default function ReorderableListEditor<T>({
  items,
  onChange,
  createItem,
  renderItem,
  label,
  addLabel,
  rowClassName = 'flex items-center gap-2',
  controlsClassName = 'flex items-center gap-2',
}: ReorderableListEditorProps<T>) {
  function updateItem(index: number, next: T) {
    const copy = [...items];
    copy[index] = next;
    onChange(copy);
  }

  function addItem() {
    onChange([...items, createItem()]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function moveItem(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-stone-700">{label}</label>
      {items.map((item, index) => (
        <div key={index} className={rowClassName}>
          {renderItem(item, (next) => updateItem(index, next), index)}
          <div className={controlsClassName}>
            <button
              type="button"
              onClick={() => moveItem(index, -1)}
              className="text-stone-400 hover:text-stone-700"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveItem(index, 1)}
              className="text-stone-400 hover:text-stone-700"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="text-stone-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="rounded-md border border-dashed border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:border-clay hover:text-clay"
      >
        {addLabel}
      </button>
    </div>
  );
}
