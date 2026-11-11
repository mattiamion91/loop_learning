import styles from './Campo.module.css';

// Campo di testo con etichetta sopra e messaggio di errore sotto (DESIGN.md: niente floating label).
export default function Campo({ id, label, errore, ...rest }) {
  const idErrore = errore ? `${id}-errore` : undefined;

  return (
    <div className={styles.campo}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={errore ? `${styles.input} ${styles.inputErrore}` : styles.input}
        aria-invalid={errore ? 'true' : undefined}
        aria-describedby={idErrore}
        {...rest}
      />
      {errore && (
        <p id={idErrore} className={styles.errore} role="alert">
          {errore}
        </p>
      )}
    </div>
  );
}
