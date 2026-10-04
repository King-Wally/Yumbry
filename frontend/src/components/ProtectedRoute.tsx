import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useServerStatus } from '../lib/server-status';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, isLoading } = useCurrentUser();
  const location = useLocation();
  const serverStatus = useServerStatus();

  // While the server is unreachable a missing session says nothing about being signed out.
  if (isLoading || (!user && serverStatus !== 'up'))
    return <p className="p-8 text-center text-stone-500">{t('common.loading')}</p>;
  // Carry the attempted route through the login bounce, so following an invite
  // link while signed out still lands on the invite after signing in.
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}
