import { usePublicTournamentQuery } from '@/features/public/api/publicTournamentQueries';
import { PublicTournamentView } from '@/features/public/routes/PublicTournamentRoute';

import styles from '@/features/admin/routes/AdminDashboardRoute.module.scss';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Errore imprevisto.';
}

export function AdminDashboardRoute() {
  const tournamentQuery = usePublicTournamentQuery(null);
  const data = tournamentQuery.data ?? null;

  if (tournamentQuery.isLoading) {
    return (
      <section className={styles.page}>
        <p className={styles.muted}>Caricamento anteprima...</p>
      </section>
    );
  }

  if (tournamentQuery.isError) {
    return (
      <section className={styles.page}>
        <p className={styles.error}>{getErrorMessage(tournamentQuery.error)}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className={styles.page}>
        <header className={styles.previewHeader}>
          <div>
            <p className={styles.eyebrow}>Area admin</p>
            <h1>Anteprima torneo attivo</h1>
          </div>
        </header>
        <div className={styles.emptyPanel}>
          <p>Nessun torneo pubblico attivo da mostrare.</p>
        </div>
      </section>
    );
  }

  return (
    <PublicTournamentView
      data={data}
      header={
        <header className={styles.previewHeader}>
          <div>
            <p className={styles.eyebrow}>Area admin</p>
            <h1>Anteprima torneo attivo</h1>
            <span>{data.tournament.name}</span>
          </div>
        </header>
      }
    />
  );
}
