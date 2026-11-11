import styles from './Caricamento.module.css';

// Stato di caricamento come scheletro con shimmer (DESIGN.md: niente spinner circolari).
export default function Caricamento({ testo = 'Caricamento in corso…' }) {
  return (
    <div className={styles.wrapper} role="status" aria-live="polite" data-testid="caricamento">
      <span className={styles.scheletro} aria-hidden="true" />
      <span className={styles.testo}>{testo}</span>
    </div>
  );
}
