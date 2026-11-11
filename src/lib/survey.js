import { supabase } from './supabase.js';
import { DOMANDE } from './questions.js';

// Restituisce la risposta già inviata dal dipendente, oppure null se non ha ancora compilato.
export async function caricaRispostaUtente(userId) {
  const { data, error } = await supabase
    .from('survey_responses')
    .select('id, submitted_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Salva le risposte del sondaggio: una riga per dipendente, una colonna per domanda.
export async function salvaRisposte({ userId, risposte }) {
  const riga = { user_id: userId };
  DOMANDE.forEach((domanda) => {
    riga[domanda.id] = risposte[domanda.id];
  });

  const { error } = await supabase.from('survey_responses').insert(riga);
  if (error) throw error;
}
