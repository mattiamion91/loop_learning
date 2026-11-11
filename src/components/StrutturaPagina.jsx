import styles from './StrutturaPagina.module.css';

// Struttura comune delle viste interne: contenitore centrato a larghezza massima.
// Punto di estensione: in M3 qui arriverà l'intestazione con email dell'utente e pulsante Esci.
export default function StrutturaPagina({ children }) {
  return (
    <div className={styles.pagina}>
      <div className="container">{children}</div>
    </div>
  );
}
