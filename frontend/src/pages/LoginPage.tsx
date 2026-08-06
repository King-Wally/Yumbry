import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.login.error'));
    } finally {
      setIsSubmitting(false);
    }
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
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder={t('auth.passwordPlaceholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? t('auth.login.submitting') : t('auth.login.submit')}
        </button>
      </form>

      {error && <p className="text-red-600">{error}</p>}

      {/* Forgot password link hidden until Resend domain is configured */}

      <p className="text-sm text-stone-500">
        {t('auth.login.noAccount')}{' '}
        <Link to="/register" className="text-clay hover:underline">
          {t('auth.login.registerLink')}
        </Link>
      </p>
    </div>
  );
}
