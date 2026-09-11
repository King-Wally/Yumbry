import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authClient } from '../lib/auth-client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useAppConfig } from '../hooks/useAppConfig';

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useCurrentUser();
  const { data: appConfig } = useAppConfig();
  const navigate = useNavigate();
  const location = useLocation();
  // Set by ProtectedRoute when it bounced an unauthenticated visitor, so an
  // invite link followed while signed out resumes after signing in.
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  // Already signed in: visiting /login directly is confusing, so bounce back
  // to wherever they were headed (mirrors ProtectedRoute's own redirect).
  if (user) return <Navigate to={from} replace />;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    // better-auth returns errors in the result rather than throwing, so there is
    // no catch here for the expected "wrong credentials" case.
    const { error: signInError } = await authClient.signIn.email({ email, password });
    setIsSubmitting(false);
    if (signInError) {
      setError(signInError.message ?? t('auth.login.error'));
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="font-serif text-2xl text-stone-900">{t('auth.login.title')}</h1>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="focus:border-clay w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:outline-none"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder={t('auth.passwordPlaceholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="focus:border-clay w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-clay w-full rounded-md px-4 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? t('auth.login.submitting') : t('auth.login.submit')}
        </button>
      </form>

      {error && <p className="text-red-600">{error}</p>}

      {appConfig?.passwordResetEnabled && (
        <p className="text-sm text-stone-500">
          <Link to="/forgot-password" className="text-clay hover:underline">
            {t('auth.login.forgotPasswordLink')}
          </Link>
        </p>
      )}

      <p className="text-sm text-stone-500">
        {t('auth.login.noAccount')}{' '}
        {/* Forwards `state` so a visitor without an account who followed an
            invite link here still lands back on it after registering. */}
        <Link to="/register" state={location.state} className="text-clay hover:underline">
          {t('auth.login.registerLink')}
        </Link>
      </p>
    </div>
  );
}
