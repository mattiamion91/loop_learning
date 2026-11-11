import { useEffect, useState } from 'react';
import { caricaRispostaUtente } from '../lib/survey.js';

// Dice se il dipendente ha già compilato il sondaggio, così da mostrargli solo il ringraziamento.
export function useRispostaEsistente(userId) {
  const [stato, setStato] = useState({ caricamento: true, esistente: false, errore: '' });

  useEffect(() => {
    if (!userId) return undefined;
    let attivo = true;
    setStato({ caricamento: true, esistente: false, errore: '' });

    caricaRispostaUtente(userId)
      .then((risposta) => {
        if (attivo) setStato({ caricamento: false, esistente: Boolean(risposta), errore: '' });
      })
      .catch(() => {
        if (attivo) {
          setStato({
            caricamento: false,
            esistente: false,
            errore: 'Non è stato possibile verificare se hai già compilato il sondaggio.',
          });
        }
      });

    return () => {
      attivo = false;
    };
  }, [userId]);

  return stato;
}
