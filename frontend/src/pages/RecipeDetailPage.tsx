import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { deleteRecipe, getRecipe, getRecipeExportUrl } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import AiErrorBanner from '../components/AiErrorBanner';
import { useAiStatus } from '../hooks/useAiStatus';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { fetchExportFile, shareOrDownloadFile } from '../lib/export-share';
import { isStandalonePwa } from '../pwa';
import CollapsibleActions from '../components/CollapsibleActions';
import ConfirmDialog from '../components/ConfirmDialog';
import RecipeDetailView from '../components/RecipeDetailView';
import ShareRecipeDialog from '../components/ShareRecipeDialog';

export default function RecipeDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: recipe, isLoading } = useQuery({
    queryKey: queryKeys.recipe(id!),
    queryFn: () => getRecipe(id!),
  });
  const { data: aiStatus } = useAiStatus();
  const { user } = useCurrentUser();

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Computed once: a standalone/installed PWA can't rely on `<a download>` (see
  // exportFileQuery below), so this decides which export control to render.
  const [standalone] = useState(isStandalonePwa);

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecipe(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes() });
      navigate('/');
    },
  });

  // Standalone iOS PWAs get trapped on the OS "Quick Look" screen when a plain
  // `<a download>` navigates to a Content-Disposition: attachment response — there's no
  // browser chrome to hand the download back to. Prefetching here (rather than on click)
  // means navigator.share() in shareOrDownloadFile can run synchronously off the click
  // event, since WebKit drops "user activation" after an intervening await.
  const { data: exportFile, error: exportFileError } = useQuery({
    queryKey: ['recipe-export-file', id],
    queryFn: () => fetchExportFile(getRecipeExportUrl(id!), `${recipe?.title ?? 'recipe'}.json`),
    enabled: standalone && !!user?.jsonImportExportEnabled && !!recipe,
    staleTime: Infinity,
  });

  if (isLoading) return <p className="text-stone-500">{t('recipes.detail.loading')}</p>;
  if (!recipe) return <p className="text-stone-500">{t('recipes.detail.notFound')}</p>;

  return (
    <article className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
        >
          <ArrowLeft size={18} />
        </Link>
        <CollapsibleActions>
          {user?.jsonImportExportEnabled &&
            (standalone ? (
              <button
                type="button"
                disabled={!exportFile}
                onClick={() => exportFile && shareOrDownloadFile(exportFile)}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100 disabled:opacity-50"
              >
                {t('recipes.detail.export')}
              </button>
            ) : (
              <a
                href={getRecipeExportUrl(id!)}
                download
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
              >
                {t('recipes.detail.export')}
              </a>
            ))}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            {t('recipes.detail.share')}
          </button>
          <Link
            to={`/recipes/${id}/edit`}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            {t('recipes.detail.edit')}
          </Link>
          <Link
            to={`/recipes/${id}/versions`}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
          >
            {t('recipes.detail.versionHistory')}
          </Link>
          {aiStatus?.configured && (
            <Link
              to={`/recipes/${id}/ai-improve`}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
            >
              {t('recipes.detail.improveWithAi')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
          >
            {t('common.delete')}
          </button>
        </CollapsibleActions>
      </div>

      {standalone && exportFileError && (
        <AiErrorBanner error={new Error(t('recipes.detail.exportError'))} />
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t('recipes.detail.deleteDialogTitle')}
        description={t('recipes.detail.deleteDialogDescription')}
        confirmLabel={t('common.delete')}
        isDanger
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />

      <ShareRecipeDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        recipeId={recipe.id}
        shareToken={recipe.share_token}
      />

      <RecipeDetailView key={recipe.id} recipe={recipe} />
    </article>
  );
}
