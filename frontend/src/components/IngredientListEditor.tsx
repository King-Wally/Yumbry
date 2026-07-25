import ReorderableListEditor from './ReorderableListEditor';

interface IngredientListEditorProps {
  ingredients: string[];
  onChange: (ingredients: string[]) => void;
}

export default function IngredientListEditor({ ingredients, onChange }: IngredientListEditorProps) {
  return (
    <ReorderableListEditor
      items={ingredients}
      onChange={onChange}
      createItem={() => ''}
      label="Ingredients"
      addLabel="+ Add ingredient"
      renderItem={(line, update) => (
        <input
          type="text"
          value={line}
          onChange={(e) => update(e.target.value)}
          placeholder="e.g. 1 1/2 cups flour"
          className="flex-1 rounded-md border border-stone-300 px-3 py-1.5 focus:border-clay focus:outline-none"
        />
      )}
    />
  );
}
