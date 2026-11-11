import { useState } from 'react';
import { accedi, registra, messaggioErrore } from '../lib/auth.js';
import Button from '../components/Button.jsx';
import Campo from '../components/Campo.jsx';
import styles from './Login.module.css';

const ACCESSO = 'accesso';
const REGISTRAZIONE = 'registrazione';

export default function Login() {
  const [modo, setModo] = useState(ACCESSO);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');

  const inRegistrazione = modo === REGISTRAZIONE;

  function cambiaModo() {
    setModo(inRegistrazione ? ACCESSO : REGISTRAZIONE);
    setErrore('');
    setAvviso('');
  }

  async function invia(evento) {
    evento.preventDefault();
    setErrore('');
    setAvviso('');

    if (!email.trim() || !password) {
      setErrore('Inserisci email e password.');
      return;
    }
    if (inRegistrazione && password.length < 6) {
      setErrore('La password deve avere almeno 6 caratteri.');
      return;
    }

    setInCorso(true);
    try {
      if (inRegistrazione) {
        const data = await registra({ email: email.trim(), password });
        // Con la conferma email attiva non c'è ancora una sessione: lo spieghiamo all'utente.
        if (!data.session) {
          setAvviso('Registrazione completata. Controlla la tua email per confermare l’account, poi accedi.');
          setModo(ACCESSO);
        }
      } else {
        await accedi({ email: email.trim(), password });
      }
    } catch (error) {
      setErrore(messaggioErrore(error));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <main className={styles.pagina}>
      <section className={styles.riquadro} data-testid="pagina-login">
        <header>
          <p className={styles.etichetta}>Sondaggio dipendenti</p>
          <h1>{inRegistrazione ? 'Crea il tuo account' : 'Accedi'}</h1>
          <p className={styles.sottotitolo}>
            {inRegistrazione
              ? 'Registrati con la tua email aziendale per compilare il sondaggio.'
              : 'Inserisci le tue credenziali per compilare il sondaggio.'}
          </p>
        </header>

        <form className={styles.form} onSubmit={invia} noValidate>
          <Campo
            id="email"
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="nome@azienda.it"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            required
            autoFocus
            data-testid="campo-email"
          />
          <Campo
            id="password"
            label="Password"
            type="password"
            name="password"
            autoComplete={inRegistrazione ? 'new-password' : 'current-password'}
            placeholder="Almeno 6 caratteri"
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
            required
            data-testid="campo-password"
          />

          {errore && (
            <p className={styles.errore} role="alert" data-testid="messaggio-errore">
              {errore}
            </p>
          )}
          {avviso && (
            <p className={styles.avviso} role="status" data-testid="messaggio-avviso">
              {avviso}
            </p>
          )}

          <Button type="submit" disabled={inCorso} data-testid="pulsante-invia">
            {inCorso ? 'Attendi…' : inRegistrazione ? 'Registrati' : 'Accedi'}
          </Button>
        </form>

        <p className={styles.cambio}>
          {inRegistrazione ? 'Hai già un account?' : 'Non hai ancora un account?'}{' '}
          <button type="button" className={styles.link} onClick={cambiaModo} data-testid="cambia-modalita">
            {inRegistrazione ? 'Accedi' : 'Registrati'}
          </button>
        </p>
      </section>
    </main>
  );
}
