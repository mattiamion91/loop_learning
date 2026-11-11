import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DOMANDE } from '../lib/questions.js';
import { salvaRisposte } from '../lib/survey.js';
import { messaggioErrore } from '../lib/auth.js';
import { useAuth } from '../hooks/useAuth.js';
import { useRispostaEsistente } from '../hooks/useRispostaEsistente.js';
import StrutturaPagina from '../components/StrutturaPagina.jsx';
import DomandaCard from '../components/DomandaCard.jsx';
import Button from '../components/Button.jsx';
import Caricamento from '../components/Caricamento.jsx';
import styles from './Questionario.module.css';

export default function Questionario() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { caricamento, esistente, errore: erroreVerifica } = useRispostaEsistente(user?.id);

  const [indice, setIndice] = useState(0);
  const [risposte, setRisposte] = useState({});
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState('');

  // Chi ha già compilato il sondaggio vede solo la pagina di ringraziamento.
  useEffect(() => {
    if (esistente) navigate('/grazie', { replace: true });
  }, [esistente, navigate]);

  if (caricamento) {
    return (
      <StrutturaPagina>
        <div className={styles.centrato}>
          <Caricamento testo="Verifica del sondaggio in corso…" />
        </div>
      </StrutturaPagina>
    );
  }

  const totale = DOMANDE.length;
  const domanda = DOMANDE[indice];
  const ultima = indice === totale - 1;
  const rispostaCorrente = risposte[domanda.id] ?? '';

  function scegli(opzione) {
    setErrore('');
    setRisposte((precedenti) => ({ ...precedenti, [domanda.id]: opzione }));
  }

  function avanti() {
    if (!rispostaCorrente) {
      setErrore('Seleziona una risposta per continuare.');
      return;
    }
    setIndice((i) => Math.min(i + 1, totale - 1));
  }

  function indietro() {
    setErrore('');
    setIndice((i) => Math.max(i - 1, 0));
  }

  async function invia() {
    if (!rispostaCorrente) {
      setErrore('Seleziona una risposta per continuare.');
      return;
    }
    setInCorso(true);
    setErrore('');
    try {
      await salvaRisposte({ userId: user.id, risposte });
      navigate('/grazie', { replace: true });
    } catch (error) {
      setErrore(messaggioErrore(error));
    } finally {
      setInCorso(false);
    }
  }

  function gestisciInvio(evento) {
    evento.preventDefault();
    if (ultima) invia();
    else avanti();
  }

  return (
    <StrutturaPagina>
      <section className={styles.pannello} data-testid="pagina-questionario">
        <header className={styles.intestazione}>
          <p className={styles.etichetta}>Sondaggio dipendenti</p>
          <p className={styles.avanzamento} data-testid="avanzamento">
            Domanda {indice + 1} di {totale}
          </p>
          <div
            className={styles.barra}
            role="progressbar"
            aria-label="Avanzamento del sondaggio"
            aria-valuemin={1}
            aria-valuemax={totale}
            aria-valuenow={indice + 1}
            aria-valuetext={`Domanda ${indice + 1} di ${totale}`}
          >
            <span className={styles.barraPiena} style={{ width: `${((indice + 1) / totale) * 100}%` }} />
          </div>
        </header>

        {erroreVerifica && (
          <p className={styles.avviso} role="status" data-testid="avviso-verifica">
            {erroreVerifica} Puoi comunque compilare il sondaggio.
          </p>
        )}

        <form className={styles.form} onSubmit={gestisciInvio}>
          <DomandaCard domanda={domanda} valore={rispostaCorrente} onChange={scegli} />

          {errore && (
            <p className={styles.errore} role="alert" data-testid="messaggio-errore">
              {errore}
            </p>
          )}

          <div className={styles.azioni}>
            <Button
              variante="fantasma"
              onClick={indietro}
              disabled={indice === 0 || inCorso}
              data-testid="pulsante-indietro"
            >
              Indietro
            </Button>
            {ultima ? (
              <Button type="submit" disabled={inCorso} data-testid="pulsante-invia-sondaggio">
                {inCorso ? 'Invio…' : 'Invia'}
              </Button>
            ) : (
              <Button type="button" onClick={avanti} data-testid="pulsante-avanti">
                Avanti
              </Button>
            )}
          </div>
        </form>
      </section>
    </StrutturaPagina>
  );
}
