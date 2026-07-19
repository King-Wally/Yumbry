import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRecipe,
  getRecipe,
  updateRecipe,
  uploadInstructionPhoto,
  uploadRecipePhoto,
} from '../api/client';
import ImageUpload from '../components/ImageUpload';
import IngredientListEditor from '../components/IngredientListEditor';
import InstructionListEditor, { type InstructionDraft } from '../components/InstructionListEditor';
import type { RecipeInput } from '../types';

interface FormState {
  title: string;
  description: string;
  prep_time_minutes: string;
  cook_time_minutes: string;
  total_time_minutes: string;
  servings: number;
  source_url: string;
  author: string;
  image_path: string | null;
  ingredients: string[];
  instructions: InstructionDraft[];
  tags: string[];
}

const emptyForm: FormState = {
  title: '',
  description: '',
  prep_time_minutes: '',
  cook_time_minutes: '',
  total_time_minutes: '',
  servings: 4,
  source_url: '',
  author: '',
  image_path: null,
  ingredients: [''],
  instructions: [{ text: '' }],
  tags: [],
};

export default function RecipeFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [formForRecipeId, setFormForRecipeId] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState('');

  const { data: existingRecipe } = useQuery({
    queryKey: ['recipe', id],
    queryFn: () => getRecipe(id!),
    enabled: isEditing,
  });

  // Populate the form during render when a new recipe loads, rather than in a
  // useEffect — this is React's documented pattern for initializing editable
  // state from async data without an extra render/flash of stale values.
  if (existingRecipe && formForRecipeId !== existingRecipe.id) {
    setFormForRecipeId(existingRecipe.id);
    setForm({
      title: existingRecipe.title ?? '',
      description: existingRecipe.description ?? '',
      prep_time_minutes:
        existingRecipe.prep_time_minutes != null ? String(existingRecipe.prep_time_minutes) : '',
      cook_time_minutes:
        existingRecipe.cook_time_minutes != null ? String(existingRecipe.cook_time_minutes) : '',
      total_time_minutes:
        existingRecipe.total_time_minutes != null ? String(existingRecipe.total_time_minutes) : '',
      servings: Number(existingRecipe.servings),
      source_url: existingRecipe.source_url ?? '',
      author: existingRecipe.author ?? '',
      image_path: existingRecipe.image_path ?? null,
      ingredients: existingRecipe.ingredients?.map((i) => i.raw_text) ?? [''],
      instructions: existingRecipe.instructions?.length
        ? existingRecipe.instructions.map((i) => ({
            id: i.id,
            text: i.text,
            image_path: i.image_path,
          }))
        : [{ text: '' }],
      tags: existingRecipe.tags?.map((t) => t.name) ?? [],
    });
  }

  const saveMutation = useMutation({
    mutationFn: (payload: RecipeInput) =>
      isEditing ? updateRecipe(id!, payload) : createRecipe(payload),
    onSuccess: (recipe) => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['recipe', String(recipe.id)] });
      navigate(`/recipes/${recipe.id}`);
    },
  });

  const photoMutation = useMutation({
    mutationFn: (file: File) => uploadRecipePhoto(id!, file),
    onSuccess: ({ image_path }) => setForm((f) => ({ ...f, image_path })),
  });

  const stepPhotoMutation = useMutation({
    mutationFn: ({ stepId, file }: { stepId: number; file: File }) =>
      uploadInstructionPhoto(id!, stepId, file),
    onSuccess: ({ image_path }, { stepId }) => {
      setForm((f) => ({
        ...f,
        instructions: f.instructions.map((step) =>
          step.id === stepId ? { ...step, image_path } : step
        ),
      }));
    },
  });

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function addTag() {
    const name = tagInput.trim();
    if (name && !form.tags.includes(name)) {
      setForm((f) => ({ ...f, tags: [...f.tags, name] }));
    }
    setTagInput('');
  }

  function removeTag(name: string) {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== name) }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    saveMutation.mutate({
      title: form.title,
      description: form.description || null,
      prep_time_minutes: form.prep_time_minutes === '' ? null : Number(form.prep_time_minutes),
      cook_time_minutes: form.cook_time_minutes === '' ? null : Number(form.cook_time_minutes),
      total_time_minutes: form.total_time_minutes === '' ? null : Number(form.total_time_minutes),
      servings: Number(form.servings),
      source_url: form.source_url || null,
      author: form.author || null,
      image_path: form.image_path,
      ingredients: form.ingredients.filter((line) => line.trim() !== ''),
      instructions: form.instructions
        .filter((step) => step.text.trim() !== '')
        .map((step, index) => ({ step_number: index + 1, text: step.text })),
      tags: form.tags,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl text-stone-900">
        {isEditing ? 'Edit recipe' : 'Add a recipe'}
      </h1>

      <div className="space-y-3">
        <input
          type="text"
          required
          value={form.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Title"
          className="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
        />
        <textarea
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Description"
          rows={2}
          className="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
        />

        {isEditing && (
          <ImageUpload
            currentUrl={form.image_path}
            label="Recipe photo"
            onUpload={(file) => photoMutation.mutate(file)}
          />
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm text-stone-600">
            Prep (min)
            <input
              type="number"
              min="0"
              value={form.prep_time_minutes}
              onChange={(e) => updateField('prep_time_minutes', e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm text-stone-600">
            Cook (min)
            <input
              type="number"
              min="0"
              value={form.cook_time_minutes}
              onChange={(e) => updateField('cook_time_minutes', e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm text-stone-600">
            Total (min)
            <input
              type="number"
              min="0"
              value={form.total_time_minutes}
              onChange={(e) => updateField('total_time_minutes', e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm text-stone-600">
            Servings
            <input
              type="number"
              min="1"
              required
              value={form.servings}
              onChange={(e) => updateField('servings', Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={form.author}
            onChange={(e) => updateField('author', e.target.value)}
            placeholder="Author"
            className="rounded-md border border-stone-300 px-3 py-2"
          />
          <input
            type="url"
            value={form.source_url}
            onChange={(e) => updateField('source_url', e.target.value)}
            placeholder="Source URL"
            className="rounded-md border border-stone-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Tags</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {form.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-stone-400 hover:text-red-600"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag and press Enter"
              className="flex-1 rounded-md border border-stone-300 px-3 py-1.5"
            />
            <button
              type="button"
              onClick={addTag}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <IngredientListEditor
        ingredients={form.ingredients}
        onChange={(ingredients) => updateField('ingredients', ingredients)}
      />

      <InstructionListEditor
        instructions={form.instructions}
        onChange={(instructions) => updateField('instructions', instructions)}
        onUploadStepPhoto={(stepId, file) => stepPhotoMutation.mutate({ stepId, file })}
      />

      {saveMutation.isError && <p className="text-red-600">{saveMutation.error?.message}</p>}

      <button
        type="submit"
        disabled={saveMutation.isPending}
        className="rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving...' : 'Save recipe'}
      </button>
    </form>
  );
}
