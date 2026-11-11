import StrutturaPagina from '../components/StrutturaPagina.jsx';

// Punto di estensione: in M2 questa pagina ospita le 5 domande del sondaggio.
export default function Questionario() {
  return (
    <StrutturaPagina>
      <section data-testid="pagina-questionario">
        <h1>Questionario</h1>
        <p>Qui potrai compilare il sondaggio.</p>
      </section>
    </StrutturaPagina>
  );
}
