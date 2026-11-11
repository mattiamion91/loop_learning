import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { esci, messaggioErrore } from '../lib/auth.js';
import { useAuth } from '../hooks/useAuth.js';
import Button from './Button.jsx';
import styles from './Header.module.css';

// Intestazione delle viste autenticate: email del dipendente e uscita dall'account.
export default function Header() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState('');

  async function esciAccount() {
    setInCorso(true);
    setErrore('');
    try {
      await esci();
      navigate('/login', { replace: true });
    } catch (error) {
      setErrore(messaggioErrore(error));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <header className={styles.header} data-testid="intestazione">
      <div className={`container ${styles.contenuto}`}>
        <span className={styles.marchio}>Sondaggio dipendenti</span>
        <div className={styles.utente}>
          <span className={styles.email} data-testid="email-utente" title={user?.email}>
            <span className="visually-hidden">Collegato come </span>
            {user?.email}
          </span>
          <Button variante="fantasma" onClick={esciAccount} disabled={inCorso} data-testid="pulsante-esci">
            {inCorso ? 'Attendi…' : 'Esci'}
          </Button>
        </div>
      </div>
      {errore && (
        <p className={`container ${styles.errore}`} role="alert" data-testid="errore-uscita">
          {errore}
        </p>
      )}
    </header>
  );
}
