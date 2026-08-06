import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface AiErrorBannerProps {
  error: Error;
}

export default function AiErrorBanner({ error }: AiErrorBannerProps) {
  const { t } = useTranslation();
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
      {error.message}{' '}
      <Link to="/settings" className="underline hover:text-red-700">
        {t('aiChat.checkSettings')}
      </Link>
    </p>
  );
}
