import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toRecipeSnapshot } from 'yumbry-shared';
import { getRecipe, getRecipeVersion, getRecipeVersions, revertRecipeVersion } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import Card from '../components/Card';
import IngredientList from '../components/IngredientList';
import InstructionList from '../components/InstructionList';
import TimeStat from '../components/TimeStat';
import { useToast } from '../hooks/useToast';
import {
  diffRecipes,
  NUTRITION_KEYS,
  TIME_KEYS,
  type DiffPane,
  type NutritionKey,
  type Segment,
  type TimeKey,
} from '../utils/recipeDiff';

/** The one highlight colour for every difference on the page — bright on purpose. */
const HIGHLIGHT = 'bg-yellow-300';

function highlightIf(changed: boolean, otherwise = 'bg-transparent') {
  return changed ? HIGHLIGHT : otherwise;
}

function DiffText({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.changed ? (
          <mark key={index} className={`rounded-[3px] text-inherit ${HIGHLIGHT}`}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  );
}

const TIME_META: Record<TimeKey, { icon: 'clock' | 'flame' | 'timer'; labelKey: string }> = {
  prep_time_minutes: { icon: 'clock', labelKey: 'recipes.detail.prep' },
  cook_time_minutes: { icon: 'flame', labelKey: 'recipes.detail.cook' },
  total_time_minutes: { icon: 'timer', labelKey: 'recipes.detail.total' },
};

const NUTRITION_META: Record<NutritionKey, { unit: string; labelKey: string }> = {
  calories: { unit: 'kcal', labelKey: 'recipes.detail.calories' },
  fat_content: { unit: 'g', labelKey: 'recipes.detail.fat' },
  carbohydrate_content: { unit: 'g', labelKey: 'recipes.detail.carbs' },
  protein_content: { unit: 'g', labelKey: 'recipes.detail.protein' },
};

interface VersionPaneProps {
  label: string;
  date: string;
  pane: DiffPane;
  /** Shared by both panes, so a field one side lacks still lines up as a dash. */
  timeKeys: TimeKey[];
  nutritionKeys: NutritionKey[];
}

function VersionPane({ label, date, pane, timeKeys, nutritionKeys }: VersionPaneProps) {
  const { t } = useTranslation();

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3 border-b border-stone-100 pb-3">
        <h2 className="text-xs font-medium tracking-wide text-stone-500 uppercase">{label}</h2>
        <span className="text-xs text-stone-500">{date}</span>
      </div>

      <div>
        <h3 className="font-serif text-2xl text-stone-900">
          <DiffText segments={pane.title} />
        </h3>
        {pane.description.length > 0 && (
          <p className="mt-2 text-stone-600">
            <DiffText segments={pane.description} />
          </p>
        )}
      </div>

      {(pane.category.name || pane.tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {pane.category.name && (
            <span
              className={`inline-flex rounded-full p-[3px] ${highlightIf(pane.category.changed)}`}
            >
              <span className="bg-clay rounded-full px-3 py-1 text-xs font-semibold tracking-wide text-white capitalize">
                {pane.category.name}
              </span>
            </span>
          )}
          {pane.tags.map((tag) => (
            <span
              key={tag.name}
              className={`inline-flex rounded-full p-[3px] ${highlightIf(tag.changed)}`}
            >
              <span className="border-clay/25 bg-clay/10 text-clay rounded-full border px-3 py-1 text-xs font-medium tracking-wide capitalize">
                {tag.name}
              </span>
            </span>
          ))}
        </div>
      )}

      {timeKeys.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {timeKeys.map((key) => (
            <div
              key={key}
              className={`rounded-lg py-1 pr-2.5 pl-1 ${highlightIf(pane.times[key].changed)}`}
            >
              <TimeStat
                icon={TIME_META[key].icon}
                label={t(TIME_META[key].labelKey)}
                minutes={pane.times[key].value}
              />
            </div>
          ))}
        </div>
      )}

      {nutritionKeys.length > 0 && (
        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <h4 className="text-xs font-medium tracking-wide text-stone-500 uppercase">
              {t('recipes.detail.nutrition')}
            </h4>
            <span className="text-xs text-stone-500">{t('recipes.detail.perServing')}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {nutritionKeys.map((key) => {
              const stat = pane.nutrition[key];
              return (
                <div
                  key={key}
                  className={`rounded-md px-1.5 py-1.5 text-center ${highlightIf(stat.changed, 'bg-stone-100')}`}
                >
                  <div className="text-sm font-medium text-stone-900">
                    {stat.value === null ? '—' : Number(stat.value.toFixed(1))}
                    <span className="ml-0.5 text-[10px] text-stone-500">
                      {NUTRITION_META[key].unit}
                    </span>
                  </div>
                  <div className="text-[10px] text-stone-500">
                    {t(NUTRITION_META[key].labelKey)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-stone-100 pt-5">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h4 className="font-serif text-xl text-stone-900">{t('recipes.detail.ingredients')}</h4>
          <span
            className={`rounded px-1 text-sm text-stone-500 ${highlightIf(pane.servings.changed)}`}
          >
            {t('recipeVersions.servings', { count: Number(pane.servings.value) })}
          </span>
        </div>
        <IngredientList
          items={pane.ingredients.map((segments, index) => ({
            key: index,
            text: <DiffText segments={segments} />,
          }))}
        />
      </div>

      <div className="border-t border-stone-100 pt-5">
        <h4 className="mb-3 font-serif text-xl text-stone-900">
          {t('recipes.detail.instructions')}
        </h4>
        <InstructionList
          items={pane.instructions.map((segments, index) => ({
            key: index,
            step_number: index + 1,
            text: <DiffText segments={segments} />,
          }))}
        />
      </div>
    </Card>
  );
}

export default function RecipeVersionsPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: recipe, isLoading: recipeLoading } = useQuery({
    queryKey: queryKeys.recipe(id!),
    queryFn: () => getRecipe(id!),
  });
  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: queryKeys.recipeVersions(id!),
    queryFn: () => getRecipeVersions(id!),
  });

  // Newest by default; the dropdown only ever overrides it.
  const [pickedId, setPickedId] = useState<number | null>(null);
  const selectedId =
    versions?.find((version) => version.id === pickedId)?.id ?? versions?.[0]?.id ?? null;

  const { data: version } = useQuery({
    queryKey: queryKeys.recipeVersion(id!, selectedId ?? 0),
    queryFn: () => getRecipeVersion(id!, selectedId!),
    enabled: selectedId !== null,
  });

  const diff = useMemo(
    () =>
      recipe && version && version.id === selectedId
        ? diffRecipes(version.snapshot, toRecipeSnapshot(recipe))
        : null,
    [recipe, version, selectedId]
  );

  const formatDate = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    return (iso: string) => formatter.format(new Date(iso));
  }, [i18n.language]);

  const revertMutation = useMutation({
    mutationFn: (versionId: number) => revertRecipeVersion(id!, versionId),
    onSuccess: () => {
      // recipe(id) is a prefix of the version keys, so this refreshes the history too.
      queryClient.invalidateQueries({ queryKey: queryKeys.recipe(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      showToast({ title: t('recipeVersions.revertedToast') });
      navigate(`/recipes/${id}`);
    },
  });

  if (recipeLoading || versionsLoading) {
    return <p className="text-stone-500">{t('common.loading')}</p>;
  }
  if (!recipe) return <p className="text-stone-500">{t('recipes.detail.notFound')}</p>;

  const timeKeys = diff
    ? TIME_KEYS.filter(
        (key) => diff.old.times[key].value !== null || diff.current.times[key].value !== null
      )
    : [];
  const nutritionKeys = diff
    ? NUTRITION_KEYS.filter(
        (key) =>
          diff.old.nutrition[key].value !== null || diff.current.nutrition[key].value !== null
      )
    : [];

  return (
    <article className="space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <Link
          to={`/recipes/${id}`}
          aria-label={t('recipeVersions.back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="font-serif text-3xl text-stone-900">{t('recipeVersions.title')}</h1>
      </div>

      {!versions || versions.length === 0 ? (
        <Card>
          <p className="text-stone-600">{t('recipeVersions.empty')}</p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="flex w-full flex-col gap-1.5 sm:max-w-sm">
              <span className="text-sm font-medium text-stone-900">
                {t('recipeVersions.compareWith')}
              </span>
              <select
                value={selectedId ?? ''}
                onChange={(event) => setPickedId(Number(event.target.value))}
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
              >
                {versions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {formatDate(option.saved_at)}
                  </option>
                ))}
              </select>
            </label>
            {diff && (
              <div className="flex items-center gap-2 text-sm text-stone-500">
                <span className={`inline-block h-4 w-4 rounded ${HIGHLIGHT}`} />
                <span>
                  {diff.changeCount === 0
                    ? t('recipeVersions.noDifferences')
                    : t('recipeVersions.differences', { count: diff.changeCount })}
                </span>
              </div>
            )}
          </Card>

          {diff && version ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <VersionPane
                label={t('recipeVersions.selectedVersion')}
                date={formatDate(version.saved_at)}
                pane={diff.old}
                timeKeys={timeKeys}
                nutritionKeys={nutritionKeys}
              />
              <VersionPane
                label={t('recipeVersions.currentVersion')}
                date={formatDate(recipe.updated_at)}
                pane={diff.current}
                timeKeys={timeKeys}
                nutritionKeys={nutritionKeys}
              />
            </div>
          ) : (
            <p className="text-stone-500">{t('common.loading')}</p>
          )}

          {revertMutation.isError && (
            <p className="text-sm text-red-600">{revertMutation.error?.message}</p>
          )}
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-3 px-6 py-4">
          <Link
            to={`/recipes/${id}`}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            {t('common.cancel')}
          </Link>
          {selectedId !== null && (
            <button
              type="button"
              disabled={revertMutation.isPending || !diff}
              onClick={() => revertMutation.mutate(selectedId)}
              className="bg-clay rounded-md px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {revertMutation.isPending
                ? t('recipeVersions.reverting')
                : t('recipeVersions.revert')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
