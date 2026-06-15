import { Link, Outlet, useLocation } from 'react-router-dom';

import { appPaths } from '@/app/router/paths';
import { useAuth } from '@/features/auth/model/useAuth';

import styles from '@/features/admin/layout/AdminLayout.module.scss';

type NavigationItem = {
  label: string;
  to: string;
  isActive: (pathname: string) => boolean;
};

const navigationItems: NavigationItem[] = [
  {
    label: 'Dashboard',
    to: appPaths.admin,
    isActive: (pathname) => pathname === appPaths.admin
  },
  {
    label: 'Tornei',
    to: appPaths.adminTournaments,
    isActive: (pathname) => pathname === appPaths.adminTournaments
  },
  {
    label: 'Stagioni',
    to: appPaths.adminTournaments,
    isActive: (pathname) =>
      /^\/admin\/tournaments\/[^/]+\/seasons$/.test(pathname) ||
      /^\/admin\/seasons\/[^/]+\/settings$/.test(pathname)
  },
  {
    label: 'Squadre',
    to: appPaths.adminTeams,
    isActive: (pathname) => pathname.startsWith(appPaths.adminTeams)
  },
  {
    label: 'Giocatori',
    to: appPaths.adminPlayers,
    isActive: (pathname) => pathname.startsWith(appPaths.adminPlayers)
  },
  {
    label: 'Partite',
    to: appPaths.adminMatches,
    isActive: (pathname) => pathname.startsWith(appPaths.adminMatches)
  },
  {
    label: 'Gallery',
    to: appPaths.adminGallery,
    isActive: (pathname) => pathname.startsWith(appPaths.adminGallery)
  },
  {
    label: 'Impostazioni',
    to: appPaths.adminSettings,
    isActive: (pathname) => pathname.startsWith(appPaths.adminSettings)
  }
];

function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function AdminLayout() {
  const { logout, profile } = useAuth();
  const location = useLocation();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>PAL</span>
          <div>
            <strong>Padel League</strong>
            <span>Admin</span>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Admin">
          {navigationItems.map((item) => (
            <Link
              className={cx(
                styles.navLink,
                item.isActive(location.pathname) && styles.navLinkActive
              )}
              key={item.label}
              to={item.to}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.account}>
          <span>{profile?.full_name ?? 'Admin'}</span>
          <button
            className={styles.logoutButton}
            onClick={() => {
              void logout();
            }}
            type="button"
          >
            Logout
          </button>
        </div>
      </aside>

      <section className={styles.content}>
        <Outlet />
      </section>
    </div>
  );
}
