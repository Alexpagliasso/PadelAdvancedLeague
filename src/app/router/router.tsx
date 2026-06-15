/* eslint-disable react-refresh/only-export-components */

import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';

import styles from '@/app/App.module.scss';
import { appPaths } from '@/app/router/paths';
import {
  RedirectAuthenticated,
  RequireAuth,
  RequireRole
} from '@/features/auth/components/AuthGuards';
import { useAuth } from '@/features/auth/model/useAuth';
import { LoginRoute } from '@/features/auth/routes/LoginRoute';

function RouteShell() {
  return (
    <main className={styles.appShell}>
      <Outlet />
    </main>
  );
}

function BootstrapRoute() {
  const { logout } = useAuth();

  return (
    <section className={styles.routeFrame}>
      <p className={styles.routeMessage}>Frontend bootstrap ready.</p>
      <button
        className={styles.routeAction}
        onClick={() => {
          void logout();
        }}
        type="button"
      >
        Logout
      </button>
    </section>
  );
}

function HomeRedirectRoute() {
  const { isAdmin, isAuthenticated, status } = useAuth();

  if (status === 'loading') {
    return (
      <section className={styles.routeFrame}>
        <p className={styles.routeMessage}>Loading...</p>
      </section>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={appPaths.auth} replace />;
  }

  return <Navigate to={isAdmin ? appPaths.admin : appPaths.profile} replace />;
}

function NotFoundRoute() {
  return (
    <section className={styles.routeFrame}>
      <p className={styles.routeMessage}>Route not found.</p>
    </section>
  );
}

export const router = createBrowserRouter([
  {
    path: appPaths.home,
    element: <RouteShell />,
    children: [
      {
        index: true,
        element: <HomeRedirectRoute />
      },
      {
        path: appPaths.auth.slice(1),
        element: (
          <RedirectAuthenticated>
            <LoginRoute />
          </RedirectAuthenticated>
        )
      },
      {
        path: appPaths.admin.slice(1),
        element: (
          <RequireAuth>
            <RequireRole allowedRoles={['super_admin', 'admin']}>
              <BootstrapRoute />
            </RequireRole>
          </RequireAuth>
        )
      },
      {
        path: appPaths.profile.slice(1),
        element: (
          <RequireAuth>
            <BootstrapRoute />
          </RequireAuth>
        )
      },
      {
        path: '*',
        element: <NotFoundRoute />
      }
    ]
  }
]);
