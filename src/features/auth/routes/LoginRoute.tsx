import { type SyntheticEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { appPaths } from '@/app/router/paths';
import { isAdminRole } from '@/features/auth/api/authApi';
import { useAuth } from '@/features/auth/model/useAuth';

import styles from '@/features/auth/routes/LoginRoute.module.scss';

type LocationState = {
  from?: {
    pathname?: string;
  };
};

export function LoginRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { error, isAdmin, isAuthenticated, login, status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'PAD | Login';
  }, []);

  if (isAuthenticated) {
    return <Navigate to={isAdmin ? appPaths.admin : appPaths.profile} replace />;
  }

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    try {
      const profile = await login(email, password);
      const state = location.state as LocationState | null;
      const fallbackPath = isAdminRole(profile?.role) ? appPaths.admin : appPaths.profile;
      void navigate(state?.from?.pathname ?? fallbackPath, { replace: true });
    } catch (nextError) {
      setSubmitError(nextError instanceof Error ? nextError.message : 'Accesso non riuscito.');
    }
  };

  const isSubmitting = status === 'loading';

  return (
    <section className={styles.page}>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <label className={styles.field}>
          <span className={styles.label}>Email</span>
          <input
            className={styles.input}
            autoComplete="email"
            disabled={isSubmitting}
            name="email"
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            required
            type="email"
            value={email}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Password</span>
          <input
            className={styles.input}
            autoComplete="current-password"
            disabled={isSubmitting}
            name="password"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            required
            type="password"
            value={password}
          />
        </label>

        {(submitError ?? error) && <p className={styles.error}>{submitError ?? error}</p>}

        <button className={styles.button} disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Accesso...' : 'Accedi'}
        </button>
      </form>
    </section>
  );
}
