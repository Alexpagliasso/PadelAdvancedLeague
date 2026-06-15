import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { appPaths } from '@/app/router/paths';
import { useAuth } from '@/features/auth/model/useAuth';
import type { ProfileRole } from '@/lib/supabase/types';

type GuardProps = {
  children?: ReactNode;
};

type RoleGuardProps = GuardProps & {
  allowedRoles: readonly ProfileRole[];
};

function LoadingRoute() {
  return <p>Caricamento...</p>;
}

export function RequireAuth({ children }: GuardProps) {
  const location = useLocation();
  const { status, isAuthenticated } = useAuth();

  if (status === 'loading') {
    return <LoadingRoute />;
  }

  if (!isAuthenticated) {
    return <Navigate to={appPaths.auth} replace state={{ from: location }} />;
  }

  return children ?? <Outlet />;
}

export function RequireRole({ allowedRoles, children }: RoleGuardProps) {
  const { status, role } = useAuth();

  if (status === 'loading') {
    return <LoadingRoute />;
  }

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to={appPaths.profile} replace />;
  }

  return children ?? <Outlet />;
}

export function RedirectAuthenticated({ children }: GuardProps) {
  const { status, isAuthenticated, isAdmin } = useAuth();

  if (status === 'loading') {
    return <LoadingRoute />;
  }

  if (isAuthenticated) {
    return <Navigate to={isAdmin ? appPaths.admin : appPaths.profile} replace />;
  }

  return children ?? <Outlet />;
}
