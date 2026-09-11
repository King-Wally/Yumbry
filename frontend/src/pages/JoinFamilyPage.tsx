import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { joinFamily } from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useInvalidateFamilyData } from '../hooks/useInvalidateFamilyData';
import { useToast } from '../hooks/useToast';

export default function JoinFamilyPage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading } = useCurrentUser();
  const invalidateFamilyData = useInvalidateFamilyData();
  const { showToast } = useToast();

  // Deliberately confirm-then-join rather than joining on mount: link
  // prefetchers, previews and scanners would otherwise consume the invite
  // without anyone having agreed to it. This route is intentionally public
  // (not wrapped in ProtectedRoute) so the invite is visible before login is
  // demanded — logging in only happens when the visitor chooses to join.
  const joinMutation = useMutation({
    mutationFn: () => joinFamily(token as string),
    onSuccess: () => {
      invalidateFamilyData();
      // The toast is rendered by a provider above <Routes> (see main.tsx), so
      // it survives this navigation instead of unmounting with the page.
      showToast({ title: t('joinFamily.joinedToast') });
      navigate('/');
    },
  });

  function handleJoinClick() {
    if (!user) {
      navigate('/login', { state: { from: location } });
      return;
    }
    joinMutation.mutate();
  }

  if (isLoading) {
    return <p className="p-8 text-center text-stone-500">{t('common.loading')}</p>;
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-stone-900">{t('joinFamily.title')}</h1>
        <p className="mt-1 text-sm text-stone-500">{t('joinFamily.description')}</p>
      </div>

      {joinMutation.isError && (
        <p className="text-sm text-red-600">{joinMutation.error?.message}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleJoinClick}
          disabled={joinMutation.isPending}
          className="bg-clay rounded-md px-4 py-2 text-white disabled:opacity-50"
        >
          {joinMutation.isPending
            ? t('joinFamily.joining')
            : user
              ? t('joinFamily.join')
              : t('joinFamily.logInToJoin')}
        </button>
        <Link
          to="/"
          className="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
        >
          {t('common.cancel')}
        </Link>
      </div>
    </div>
  );
}
