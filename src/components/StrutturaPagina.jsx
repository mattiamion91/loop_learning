import Header from './Header.jsx';
import styles from './StrutturaPagina.module.css';

// Struttura comune delle viste autenticate: intestazione con utente e contenuto centrato.
export default function StrutturaPagina({ children }) {
  return (
    <div className={styles.pagina}>
      <Header />
      <main className={`container ${styles.contenuto}`}>{children}</main>
    </div>
  );
}
