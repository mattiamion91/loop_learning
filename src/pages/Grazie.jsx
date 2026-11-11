import StrutturaPagina from '../components/StrutturaPagina.jsx';
import styles from './Grazie.module.css';

export default function Grazie() {
  return (
    <StrutturaPagina>
      <section className={styles.pannello} data-testid="pagina-grazie">
        <p className={styles.etichetta}>Sondaggio completato</p>
        <h1 className={styles.titolo}>Grazie per aver partecipato</h1>
        <p className={styles.testo}>
          Le tue risposte sono state registrate correttamente. Non serve fare altro: puoi chiudere questa pagina.
        </p>
      </section>
    </StrutturaPagina>
  );
}
