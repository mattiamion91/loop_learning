import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Configurazione Supabase mancante: imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nel file .env.',
  );
}

// Unico punto di accesso al client Supabase: il resto dell'app usa i moduli di src/lib/.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
