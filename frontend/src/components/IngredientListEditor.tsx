import { useTranslation } from 'react-i18next';
import ReorderableListEditor from './ReorderableListEditor';

interface IngredientListEditorProps {
  ingredients: string[];
  onChange: (ingredients: string[]) => void;
}

export default function IngredientListEditor({ ingredients, onChange }: IngredientListEditorProps) {
  const { t } = useTranslation();
  return (
    <ReorderableListEditor
      items={ingredients}
      onChange={onChange}
      createItem={() => ''}
      label={t('recipeForm.ingredients.label')}
      addLabel={t('recipeForm.ingredients.addButton')}
      dragHandleLabel={t('recipeForm.ingredients.dragHandle')}
      renderItem={(line, update) => (
        <input
          type="text"
          value={line}
          onChange={(e) => update(e.target.value)}
          placeholder={t('recipeForm.ingredients.placeholder')}
          className="flex-1 rounded-md border border-stone-300 px-3 py-1.5 focus:border-clay focus:outline-none"
        />
      )}
    />
  );
}
