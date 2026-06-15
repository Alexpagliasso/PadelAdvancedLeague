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
import { AdminLayout } from '@/features/admin/layout/AdminLayout';
import { AdminDashboardRoute } from '@/features/admin/routes/AdminDashboardRoute';
import { AdminPlaceholderRoute } from '@/features/admin/routes/AdminPlaceholderRoute';
import { AdminMatchesRoute } from '@/features/matches/routes/AdminMatchesRoute';
import { AdminPlayersRoute } from '@/features/players/routes/AdminPlayersRoute';
import { AdminStandingsRoute } from '@/features/standings/routes/AdminStandingsRoute';
import { AdminTeamsRoute } from '@/features/teams/routes/AdminTeamsRoute';
import { AdminTournamentsRoute } from '@/features/tournaments/routes/AdminTournamentsRoute';

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
              <AdminLayout />
            </RequireRole>
          </RequireAuth>
        ),
        children: [
          {
            index: true,
            element: <AdminDashboardRoute />
          },
          {
            path: 'tournaments',
            element: <AdminTournamentsRoute />
          },
          {
            path: 'teams',
            element: <AdminTeamsRoute />
          },
          {
            path: 'players',
            element: <AdminPlayersRoute />
          },
          {
            path: 'matches',
            element: <AdminMatchesRoute />
          },
          {
            path: 'standings',
            element: <AdminStandingsRoute />
          },
          {
            path: 'gallery',
            element: <AdminPlaceholderRoute title="Gallery" />
          },
          {
            path: 'settings',
            element: <AdminPlaceholderRoute title="Impostazioni" />
          }
        ]
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
