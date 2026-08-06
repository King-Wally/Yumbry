import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await resetPassword(token, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.resetPassword.error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm space-y-6">
        <h1 className="font-serif text-2xl text-stone-900">
          {t('auth.resetPassword.invalidLinkTitle')}
        </h1>
        <p className="text-sm text-stone-600">{t('auth.resetPassword.invalidLinkBody')}</p>
        <p className="text-sm text-stone-500">
          <Link to="/forgot-password" className="text-clay hover:underline">
            {t('auth.resetPassword.requestNewLink')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="font-serif text-2xl text-stone-900">{t('auth.resetPassword.title')}</h1>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder={t('auth.resetPassword.passwordPlaceholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submit')}
        </button>
      </form>

      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
