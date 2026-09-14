import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-sm space-y-6 py-16 text-center">
      <p className="font-serif text-5xl text-stone-900">404</p>
      <div>
        <h1 className="font-serif text-2xl text-stone-900">{t('notFound.title')}</h1>
        <p className="mt-1 text-sm text-stone-500">{t('notFound.description')}</p>
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
