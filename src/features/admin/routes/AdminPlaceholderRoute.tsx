import styles from '@/features/admin/routes/AdminPlaceholderRoute.module.scss';

type AdminPlaceholderRouteProps = {
  title: string;
};

export function AdminPlaceholderRoute({ title }: AdminPlaceholderRouteProps) {
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Admin</p>
        <h1 className={styles.title}>{title}</h1>
      </header>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Modulo non ancora implementato</h2>
        <p className={styles.muted}>
          La rotta e lo spazio nel menu sono pronti. Il CRUD verra aggiunto in una fase successiva.
        </p>
      </div>
    </section>
  );
}
