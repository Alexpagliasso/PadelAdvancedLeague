import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { appPaths } from '@/app/router/paths';
import { useAuth } from '@/features/auth/model/useAuth';

import styles from '@/features/admin/layout/AdminLayout.module.scss';

type NavigationItem = {
  label: string;
  to: string;
  isActive: (pathname: string) => boolean;
  variant?: 'public';
};

const navigationItems: NavigationItem[] = [
  {
    label: 'Home Pubblica',
    to: appPaths.home,
    isActive: (pathname) => pathname === appPaths.home,
    variant: 'public'
  },
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
    label: 'Calendario',
    to: appPaths.adminCalendar,
    isActive: (pathname) => pathname.startsWith(appPaths.adminCalendar)
  },
  {
    label: 'Classifica',
    to: appPaths.adminStandings,
    isActive: (pathname) => pathname.startsWith(appPaths.adminStandings)
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

function getAdminTitle(pathname: string): string {
  if (pathname === appPaths.admin) {
    return 'PAD | Dashboard';
  }

  if (pathname.startsWith(appPaths.adminTournaments)) {
    return 'PAD | Tornei';
  }

  if (pathname.startsWith(appPaths.adminTeams)) {
    return 'PAD | Squadre';
  }

  if (pathname.startsWith(appPaths.adminPlayers)) {
    return 'PAD | Giocatori';
  }

  if (pathname.startsWith(appPaths.adminCalendar)) {
    return 'PAD | Calendario';
  }

  if (pathname.startsWith(appPaths.adminStandings)) {
    return 'PAD | Classifica';
  }

  if (pathname.startsWith(appPaths.adminGallery)) {
    return 'PAD | Gallery';
  }

  if (pathname.startsWith(appPaths.adminMatches)) {
    return 'PAD | Partite';
  }

  if (pathname.startsWith(appPaths.adminSettings)) {
    return 'PAD | Impostazioni';
  }

  return 'PAD | Admin';
}

export function AdminLayout() {
  const { logout, profile } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = getAdminTitle(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  return (
    <div className={styles.shell}>
      <header className={styles.mobileHeader}>
        <button
          aria-expanded={isMobileMenuOpen}
          aria-label="Open admin menu"
          className={styles.menuButton}
          onClick={() => {
            setIsMobileMenuOpen((current) => !current);
          }}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
        <span className={styles.mobileBrand}>
          <img aria-hidden="true" className={styles.mobileLogo} src="/assets/brand/pad-logo.png" />
          <strong>PAD</strong>
        </span>
      </header>

      <button
        aria-label="Close admin menu"
        className={cx(styles.overlay, isMobileMenuOpen && styles.overlayVisible)}
        onClick={() => {
          setIsMobileMenuOpen(false);
        }}
        type="button"
      />

      <aside className={cx(styles.sidebar, isMobileMenuOpen && styles.sidebarOpen)}>
        <div className={styles.brand}>
          <img aria-hidden="true" className={styles.brandLogo} src="/assets/brand/pad-logo.png" />
          <div>
            <strong>PAD</strong>
            <span>Padel And Drink</span>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Admin">
          {navigationItems.map((item) => (
            <Link
              className={cx(
                styles.navLink,
                item.variant === 'public' && styles.navLinkPublic,
                item.isActive(location.pathname) && styles.navLinkActive
              )}
              key={item.label}
              onClick={() => {
                setIsMobileMenuOpen(false);
              }}
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
