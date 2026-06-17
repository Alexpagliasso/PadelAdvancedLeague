import styles from '@/components/loaders/PadLoaders.module.scss';

type LoaderProps = {
  label?: string;
};

export function InlineLoader({ label = 'Caricamento...' }: LoaderProps) {
  return (
    <span className={styles.inlineLoader} role="status">
      <span aria-hidden="true" className={styles.spinner} />
      <span>{label}</span>
    </span>
  );
}

export function SectionLoader({ label = 'Caricamento...' }: LoaderProps) {
  return (
    <div className={styles.sectionLoader} role="status">
      <span aria-hidden="true" className={styles.spinner} />
      <span>{label}</span>
    </div>
  );
}

export function PageLoader({ label = 'Caricamento PAD...' }: LoaderProps) {
  return (
    <main className={styles.pageLoader} role="status">
      <img alt="" aria-hidden="true" src="/assets/brand/pad-logo.png" />
      <span aria-hidden="true" className={styles.spinner} />
      <strong>{label}</strong>
    </main>
  );
}

export function ButtonLoader({ label = 'Attendi...' }: LoaderProps) {
  return (
    <span className={styles.buttonLoader}>
      <span aria-hidden="true" className={styles.spinner} />
      <span>{label}</span>
    </span>
  );
}
