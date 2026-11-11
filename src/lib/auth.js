import { supabase } from './supabase.js';

// Registrazione di un nuovo dipendente con email e password.
export async function registra({ email, password }) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// Accesso con email e password.
export async function accedi({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Uscita dall'account.
export async function esci() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

const MESSAGGI = [
  [/invalid login credentials/i, 'Email o password non corretti.'],
  [/email not confirmed/i, 'Devi prima confermare la tua email: controlla la posta.'],
  [/user already registered/i, 'Esiste già un account con questa email: prova ad accedere.'],
  [/password should be at least/i, 'La password è troppo corta: servono almeno 6 caratteri.'],
  [/unable to validate email address|invalid format/i, 'L’indirizzo email non è valido.'],
  [/rate limit|too many requests/i, 'Troppi tentativi: riprova tra qualche minuto.'],
  [/failed to fetch|network/i, 'Impossibile contattare il server: controlla la connessione.'],
];

// Traduce gli errori di Supabase in un messaggio comprensibile in italiano.
export function messaggioErrore(error) {
  const testo = error?.message ?? '';
  const trovato = MESSAGGI.find(([espressione]) => espressione.test(testo));
  return trovato ? trovato[1] : 'Si è verificato un errore imprevisto: riprova.';
}
