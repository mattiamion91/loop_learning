import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Espone la sessione Supabase corrente e lo stato di caricamento iniziale.
export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let attivo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!attivo) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_evento, prossima) => {
      setSession(prossima);
      setLoading(false);
    });

    return () => {
      attivo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}
