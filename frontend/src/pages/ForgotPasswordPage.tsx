import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { forgotPassword } from '../api/client';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await forgotPassword(email);
      // Always show success to avoid leaking which emails exist
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-sm space-y-6">
        <h1 className="font-serif text-2xl text-stone-900">
          {t('auth.forgotPassword.checkEmailTitle')}
        </h1>
        <p className="text-sm text-stone-600">{t('auth.forgotPassword.checkEmailBody')}</p>
        <p className="text-sm text-stone-500">
          <Link to="/login" className="text-clay hover:underline">
            {t('auth.forgotPassword.backToLogin')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="font-serif text-2xl text-stone-900">{t('auth.forgotPassword.title')}</h1>

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
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? t('auth.forgotPassword.submitting') : t('auth.forgotPassword.submit')}
        </button>
      </form>

      {error && <p className="text-red-600">{error}</p>}

      <p className="text-sm text-stone-500">
        <Link to="/login" className="text-clay hover:underline">
          {t('auth.forgotPassword.backToLogin')}
        </Link>
      </p>
    </div>
  );
}
