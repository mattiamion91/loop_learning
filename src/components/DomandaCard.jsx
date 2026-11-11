import styles from './DomandaCard.module.css';

// Una domanda a risposta singola: gruppo di radio con etichetta cliccabile.
export default function DomandaCard({ domanda, valore, onChange }) {
  return (
    <fieldset className={styles.gruppo} data-testid="domanda">
      <legend className={styles.legenda}>{domanda.testo}</legend>
      <div className={styles.opzioni}>
        {domanda.opzioni.map((opzione) => {
          const selezionata = valore === opzione;
          return (
            <label
              key={opzione}
              className={selezionata ? `${styles.opzione} ${styles.opzioneScelta}` : styles.opzione}
            >
              <input
                type="radio"
                name={domanda.id}
                value={opzione}
                checked={selezionata}
                onChange={() => onChange(opzione)}
                data-testid={`opzione-${domanda.id}`}
              />
              <span className={styles.testoOpzione}>{opzione}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
