import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, ReceiptText, Tags } from 'lucide-react';
import { createRecipe, getRecipe, updateRecipe, uploadRecipePhoto } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import Card from '../components/Card';
import CategoryPicker from '../components/CategoryPicker';
import ImageUpload from '../components/ImageUpload';
import IngredientListEditor from '../components/IngredientListEditor';
import InstructionListEditor, { type InstructionDraft } from '../components/InstructionListEditor';
import ServingsStepper from '../components/ServingsStepper';
import { useCategories } from '../hooks/useCategories';
import { toNumber } from '../utils/numeric';
import type { RecipeInput } from '../types';

interface FormState {
  title: string;
  description: string;
  prep_time_minutes: string;
  cook_time_minutes: string;
  total_time_minutes: string;
  servings: number;
  image_path: string | null;
  ingredients: string[];
  instructions: InstructionDraft[];
  tags: string[];
  category: string | null;
}

const emptyForm: FormState = {
  title: '',
  description: '',
  prep_time_minutes: '',
  cook_time_minutes: '',
  total_time_minutes: '',
  servings: 4,
  image_path: null,
  ingredients: [''],
  instructions: [{ text: '' }],
  tags: [],
  category: null,
};

export default function RecipeFormPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const backTo = isEditing ? `/recipes/${id}` : '/';

  const [form, setForm] = useState<FormState>(emptyForm);
  const [formForRecipeId, setFormForRecipeId] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [aiDraftApplied, setAiDraftApplied] = useState(false);

  const draftState = location.state as { aiDraft?: RecipeInput; draftSource?: 'ai' | 'url' } | null;
  const aiDraft = draftState?.aiDraft ?? null;
  const draftSource = draftState?.draftSource ?? 'ai';

  const { data: existingRecipe } = useQuery({
    queryKey: queryKeys.recipe(id!),
    queryFn: () => getRecipe(id!),
    enabled: isEditing,
  });

  const { data: categories } = useCategories();

  // Form hydration in render (not useEffect) to avoid stale-value flash
  if (existingRecipe && formForRecipeId !== existingRecipe.id && !aiDraft) {
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
      servings: toNumber(existingRecipe.servings, 1),
      image_path: existingRecipe.image_path ?? null,
      ingredients: existingRecipe.ingredients?.map((i) => i.raw_text) ?? [''],
      instructions: existingRecipe.instructions?.length
        ? existingRecipe.instructions.map((i) => ({ id: i.id, text: i.text }))
        : [{ text: '' }],
      tags: existingRecipe.tags?.map((tag) => tag.name) ?? [],
      category: existingRecipe.category?.name ?? null,
    });
  }

  // AI draft takes priority (available synchronously vs async existingRecipe)
  if (aiDraft && !aiDraftApplied) {
    setAiDraftApplied(true);
    setForm({
      title: aiDraft.title,
      description: aiDraft.description ?? '',
      prep_time_minutes: aiDraft.prep_time_minutes != null ? String(aiDraft.prep_time_minutes) : '',
      cook_time_minutes: aiDraft.cook_time_minutes != null ? String(aiDraft.cook_time_minutes) : '',
      total_time_minutes:
        aiDraft.total_time_minutes != null ? String(aiDraft.total_time_minutes) : '',
      servings: aiDraft.servings,
      image_path: aiDraft.image_path ?? null,
      ingredients: aiDraft.ingredients.length ? aiDraft.ingredients : [''],
      instructions: aiDraft.instructions.length
        ? aiDraft.instructions.map((i) => ({ text: i.text }))
        : [{ text: '' }],
      tags: aiDraft.tags,
      category: aiDraft.category,
    });
  }

  const saveMutation = useMutation({
    mutationFn: (payload: RecipeInput) =>
      isEditing ? updateRecipe(id!, payload) : createRecipe(payload),
    onSuccess: (recipe) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipe(recipe.id) });
      navigate(`/recipes/${recipe.id}`);
    },
  });

  const photoMutation = useMutation({
    mutationFn: (file: File) => uploadRecipePhoto(id!, file),
    onSuccess: ({ image_path }) => setForm((f) => ({ ...f, image_path })),
  });

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function addTag() {
    const name = tagInput.trim();
    if (name && !form.tags.some((tag) => tag.toLowerCase() === name.toLowerCase())) {
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
      image_path: form.image_path,
      ingredients: form.ingredients.filter((line) => line.trim() !== ''),
      instructions: form.instructions
        .filter((step) => step.text.trim() !== '')
        .map((step, index) => ({ step_number: index + 1, text: step.text })),
      tags: form.tags,
      category: form.category,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl pb-4">
      <div className="mb-8 flex items-center gap-3">
        <Link
          to={backTo}
          aria-label={t('common.back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            {t('recipeForm.eyebrow')}
          </p>
          <h1 className="font-serif text-2xl text-stone-900">
            {isEditing ? t('recipeForm.editTitle') : t('recipeForm.addTitle')}
          </h1>
        </div>
      </div>

      {aiDraft && (
        <p className="mb-8 rounded-md border border-clay/25 bg-clay/10 px-3 py-2 text-sm text-clay">
          {draftSource === 'url'
            ? t('recipeForm.reviewingUrlDraft')
            : t('recipeForm.reviewingAiDraft')}
        </p>
      )}

      <div className="flex flex-col gap-6">
        <Card>
          <Card.Header
            icon={<ReceiptText size={20} strokeWidth={2} />}
            title={t('recipeForm.detailsTitle')}
            description={t('recipeForm.detailsDescription')}
          />
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">
                {t('recipeForm.titlePlaceholder')}
              </label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder={t('recipeForm.titlePlaceholder')}
                className="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">
                {t('recipeForm.descriptionPlaceholder')}
              </label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder={t('recipeForm.descriptionPlaceholder')}
                rows={2}
                className="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
              />
            </div>
            {isEditing && (
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  {t('recipeForm.photoLabel')}
                </label>
                <ImageUpload
                  currentUrl={form.image_path}
                  label={t('recipeForm.photoLabel')}
                  onUpload={(file) => photoMutation.mutate(file)}
                />
              </div>
            )}
          </div>
        </Card>

        <Card>
          <Card.Header
            icon={<Clock size={20} strokeWidth={2} />}
            title={t('recipeForm.timingTitle')}
            description={t('recipeForm.timingDescription')}
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <label className="text-sm text-stone-600">
              {t('recipeForm.prepMinutes')}
              <input
                type="number"
                min="0"
                value={form.prep_time_minutes}
                onChange={(e) => updateField('prep_time_minutes', e.target.value)}
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 focus:border-clay focus:outline-none"
              />
            </label>
            <label className="text-sm text-stone-600">
              {t('recipeForm.cookMinutes')}
              <input
                type="number"
                min="0"
                value={form.cook_time_minutes}
                onChange={(e) => updateField('cook_time_minutes', e.target.value)}
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 focus:border-clay focus:outline-none"
              />
            </label>
            <label className="text-sm text-stone-600">
              {t('recipeForm.totalMinutes')}
              <input
                type="number"
                min="0"
                value={form.total_time_minutes}
                onChange={(e) => updateField('total_time_minutes', e.target.value)}
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 focus:border-clay focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-5 border-t border-stone-200 pt-5">
            <ServingsStepper
              value={form.servings}
              onChange={(servings) => updateField('servings', servings)}
            />
          </div>
        </Card>

        <Card>
          <Card.Header
            icon={<Tags size={20} strokeWidth={2} />}
            title={t('recipeForm.categoryTagsTitle')}
            description={t('recipeForm.categoryTagsDescription')}
          />
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">
                {t('recipeForm.category')}
              </label>
              <CategoryPicker
                categories={categories}
                value={form.category}
                onChange={(category) => updateField('category', category)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">
                {t('recipeForm.tags')}
              </label>
              {form.tags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs capitalize text-stone-600"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="text-stone-400 hover:text-red-600"
                        aria-label={t('recipeForm.removeTag')}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
                  placeholder={t('recipeForm.addTagPlaceholder')}
                  className="flex-1 rounded-md border border-stone-300 px-3 py-1.5 focus:border-clay focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
                >
                  {t('common.add')}
                </button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <IngredientListEditor
            ingredients={form.ingredients}
            onChange={(ingredients) => updateField('ingredients', ingredients)}
          />
        </Card>

        <Card>
          <InstructionListEditor
            instructions={form.instructions}
            onChange={(instructions) => updateField('instructions', instructions)}
          />
        </Card>
      </div>

      {saveMutation.isError && (
        <p className="mt-6 text-sm text-red-600">{saveMutation.error?.message}</p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-3 px-6 py-4">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-md bg-clay px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saveMutation.isPending ? t('recipeForm.saving') : t('recipeForm.saveButton')}
          </button>
          <Link
            to={backTo}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            {t('common.cancel')}
          </Link>
        </div>
      </div>
    </form>
  );
}
