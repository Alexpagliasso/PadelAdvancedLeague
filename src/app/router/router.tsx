/* eslint-disable react-refresh/only-export-components */

import { createBrowserRouter, Outlet } from 'react-router-dom';

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
import { AdminPlaceholderRoute } from '@/features/admin/routes/AdminPlaceholderRoute';
import { AdminCalendarRoute } from '@/features/matches/routes/AdminCalendarRoute';
import { AdminMatchesRoute } from '@/features/matches/routes/AdminMatchesRoute';
import { AdminPlayersRoute } from '@/features/players/routes/AdminPlayersRoute';
import { PublicTournamentRoute } from '@/features/public/routes/PublicTournamentRoute';
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
      <img className={styles.routeLogo} src="/assets/brand/pad-logo.png" alt="PAD" />
      <p className={styles.routeMessage}>PAD - Padel And Drink</p>
      <button
        className={styles.routeAction}
        onClick={() => {
          void logout();
        }}
        type="button"
      >
        Esci
      </button>
    </section>
  );
}

function NotFoundRoute() {
  return (
    <section className={styles.routeFrame}>
      <p className={styles.routeMessage}>Pagina non trovata.</p>
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
        element: <PublicTournamentRoute />
      },
      {
        path: 'tournament/:slug',
        element: <PublicTournamentRoute />
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
            element: <AdminTournamentsRoute />
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
            path: 'matches/:matchId/edit',
            element: <AdminMatchesRoute />
          },
          {
            path: 'calendar',
            element: <AdminCalendarRoute />
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
