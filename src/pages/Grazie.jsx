import StrutturaPagina from '../components/StrutturaPagina.jsx';

// Punto di estensione: in M2 questa pagina diventa il ringraziamento finale.
export default function Grazie() {
  return (
    <StrutturaPagina>
      <section data-testid="pagina-grazie">
        <h1>Grazie</h1>
        <p>Pagina di ringraziamento.</p>
      </section>
    </StrutturaPagina>
  );
}
