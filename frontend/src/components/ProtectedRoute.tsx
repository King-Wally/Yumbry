import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../hooks/useCurrentUser';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) return <p className="p-8 text-center text-stone-500">{t('common.loading')}</p>;
  // Carry the attempted route through the login bounce, so following an invite
  // link while signed out still lands on the invite after signing in.
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}
