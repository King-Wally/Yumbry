import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();

  if (isLoading) return <p className="p-8 text-center text-stone-500">{t('common.loading')}</p>;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
