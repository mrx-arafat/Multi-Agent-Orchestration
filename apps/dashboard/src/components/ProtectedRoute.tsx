import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.js';
import type { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }){
  const { user, isRestoring } = useAuth();

  // Still checking if stored token is valid — show loading
  if (isRestoring) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="mt-3 text-sm text-gray-500">Restoring session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
