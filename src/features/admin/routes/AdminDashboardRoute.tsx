import styles from '@/features/admin/routes/AdminPlaceholderRoute.module.scss';

export function AdminDashboardRoute() {
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Admin</p>
        <h1 className={styles.title}>Dashboard</h1>
      </header>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Struttura admin pronta</h2>
        <p className={styles.muted}>
          Usa il menu laterale per gestire tornei e stagioni. Le altre sezioni sono predisposte
          per i prossimi moduli.
        </p>
      </div>
    </section>
  );
}
