import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <p className="p-8 text-center text-stone-500">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
