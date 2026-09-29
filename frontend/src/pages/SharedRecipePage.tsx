import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, getSharedRecipe, importSharedRecipe } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import RecipeDetailView from '../components/RecipeDetailView';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useToast } from '../hooks/useToast';
import type { SharedRecipe } from '../types';

/** Public, read-only view of a recipe reached through its share link. Not
 * wrapped in ProtectedRoute: anyone with the link may read it, and only saving
 * a copy asks for an account. */
export default function SharedRecipePage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();

  const {
    data: recipe,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.sharedRecipe(token!),
    queryFn: () => getSharedRecipe(token!),
    // A revoked link won't come back by retrying it.
    retry: (failureCount, err) =>
      !(err instanceof ApiError && err.kind === 'share_not_found') && failureCount < 2,
  });

  if (isLoading) return <p className="text-stone-500">{t('recipes.detail.loading')}</p>;

  if (!recipe) {
    const linkIsDead = error instanceof ApiError && error.kind === 'share_not_found';
    return (
      <div className="mx-auto max-w-sm space-y-6 py-16 text-center">
        <div>
          <h1 className="font-serif text-2xl text-stone-900">
            {linkIsDead ? t('sharedRecipe.unavailableTitle') : t('common.somethingWentWrong')}
          </h1>
          {linkIsDead && (
            <p className="mt-1 text-sm text-stone-500">
              {t('sharedRecipe.unavailableDescription')}
            </p>
          )}
        </div>
        <Link
          to="/"
          className="bg-clay inline-block rounded-md px-4 py-2 text-white transition-colors hover:opacity-90"
        >
          {t('notFound.backHome')}
        </Link>
      </div>
    );
  }

  return (
    <article className="space-y-4">
      <SaveBanner token={token!} recipe={recipe} />
      <RecipeDetailView recipe={recipe} />
    </article>
  );
}

function SaveBanner({ token, recipe }: { token: string; recipe: SharedRecipe }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, isLoading } = useCurrentUser();
  const { showToast } = useToast();

  const importMutation = useMutation({
    mutationFn: () => importSharedRecipe(token),
    onSuccess: (copy) => {
      queryClient.setQueryData(queryKeys.recipe(copy.id), copy);
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      // The toast provider sits above <Routes> (see main.tsx), so it survives
      // this navigation.
      showToast({ title: t('sharedRecipe.importedToast') });
      navigate(`/recipes/${copy.id}`);
    },
  });

  // Until the session is known, rendering either variant would flash the wrong one.
  if (isLoading) return null;

  let message: string;
  let actions: ReactNode;

  if (recipe.own_recipe_id !== null) {
    message = t('sharedRecipe.alreadyYours');
    actions = (
      <Link
        to={`/recipes/${recipe.own_recipe_id}`}
        className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
      >
        {t('sharedRecipe.openYours')}
      </Link>
    );
  } else if (user) {
    message = t('sharedRecipe.saveCopy');
    actions = (
      <button
        type="button"
        onClick={() => importMutation.mutate()}
        disabled={importMutation.isPending}
        className="bg-clay hover:bg-clay/90 rounded-md px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {importMutation.isPending ? t('sharedRecipe.importing') : t('sharedRecipe.import')}
      </button>
    );
  } else {
    // `from` brings the visitor back to this page after signing up or in —
    // RegisterPage also skips onboarding when it's set — so the import button
    // is waiting for them.
    message = t('sharedRecipe.signUpPrompt');
    actions = (
      <>
        <Link
          to="/login"
          state={{ from: location }}
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
        >
          {t('sharedRecipe.logIn')}
        </Link>
        <Link
          to="/register"
          state={{ from: location }}
          className="bg-clay hover:bg-clay/90 rounded-md px-4 py-2 text-sm text-white"
        >
          {t('sharedRecipe.createAccount')}
        </Link>
      </>
    );
  }

  return (
    <section className="border-clay/25 bg-clay/10 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="text-clay flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
          <BookmarkPlus size={18} />
        </div>
        <div>
          <p className="text-sm text-stone-700">{message}</p>
          {importMutation.isError && (
            <p className="mt-1 text-sm text-red-600">{importMutation.error.message}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">{actions}</div>
    </section>
  );
}
