import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { formatRetryAt } from '../lib/format-retry-at';

interface AiErrorBannerProps {
  error: Error;
}

export default function AiErrorBanner({ error }: AiErrorBannerProps) {
  const { t, i18n } = useTranslation();

  // The server's quota message is English-only and can't name the reader's local time, so a spent
  // budget is the one AI error rendered from the locale files instead.
  let message = error.message;
  if (error instanceof ApiError && error.kind === 'quota_exceeded') {
    const key = error.scope === 'user' ? 'aiQuota.userExceeded' : 'aiQuota.sharedExceeded';
    message = error.retryAt
      ? t(`${key}At`, { time: formatRetryAt(error.retryAt, i18n.language) })
      : t(key);
  }

  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
      {message}
    </p>
  );
}
