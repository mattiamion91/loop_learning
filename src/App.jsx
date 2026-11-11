import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import Caricamento from './components/Caricamento.jsx';
import Login from './pages/Login.jsx';
import Questionario from './pages/Questionario.jsx';
import Grazie from './pages/Grazie.jsx';

// Rotte dell'app (punto di estensione: le funzionalità successive si agganciano qui).
// Le viste interne sono protette: senza sessione si torna al login.
export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="container" style={{ paddingBlock: '4rem' }}>
        <Caricamento testo="Verifica della sessione in corso…" />
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/questionario" replace /> : <Login />} />
      <Route path="/questionario" element={user ? <Questionario /> : <Navigate to="/login" replace />} />
      <Route path="/grazie" element={user ? <Grazie /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? '/questionario' : '/login'} replace />} />
    </Routes>
  );
}
