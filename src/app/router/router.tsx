import { createBrowserRouter, Outlet } from 'react-router-dom';

import styles from '@/app/App.module.scss';
import { appPaths } from '@/app/router/paths';

function RouteShell() {
  return (
    <main className={styles.appShell}>
      <Outlet />
    </main>
  );
}

function BootstrapRoute() {
  return (
    <section className={styles.routeFrame}>
      <p className={styles.routeMessage}>Frontend bootstrap ready.</p>
    </section>
  );
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
        element: <BootstrapRoute />
      },
      {
        path: appPaths.auth.slice(1),
        element: <BootstrapRoute />
      },
      {
        path: appPaths.admin.slice(1),
        element: <BootstrapRoute />
      },
      {
        path: appPaths.profile.slice(1),
        element: <BootstrapRoute />
      },
      {
        path: '*',
        element: <NotFoundRoute />
      }
    ]
  }
]);
