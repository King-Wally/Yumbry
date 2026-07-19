interface IngredientListEditorProps {
  ingredients: string[];
  onChange: (ingredients: string[]) => void;
}

export default function IngredientListEditor({ ingredients, onChange }: IngredientListEditorProps) {
  function updateLine(index: number, value: string) {
    const next = [...ingredients];
    next[index] = value;
    onChange(next);
  }

  function addLine() {
    onChange([...ingredients, '']);
  }

  function removeLine(index: number) {
    onChange(ingredients.filter((_, i) => i !== index));
  }

  function moveLine(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= ingredients.length) return;
    const next = [...ingredients];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-stone-700">Ingredients</label>
      {ingredients.map((line, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            value={line}
            onChange={(e) => updateLine(index, e.target.value)}
            placeholder="e.g. 1 1/2 cups flour"
            className="flex-1 rounded-md border border-stone-300 px-3 py-1.5 focus:border-clay focus:outline-none"
          />
          <button
            type="button"
            onClick={() => moveLine(index, -1)}
            className="text-stone-400 hover:text-stone-700"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => moveLine(index, 1)}
            className="text-stone-400 hover:text-stone-700"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => removeLine(index)}
            className="text-stone-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addLine}
        className="rounded-md border border-dashed border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:border-clay hover:text-clay"
      >
        + Add ingredient
      </button>
    </div>
  );
}
