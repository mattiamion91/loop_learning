// Le 5 domande del sondaggio. `id` corrisponde alla colonna omonima in survey_responses.
export const DOMANDE = [
  {
    id: 'q1',
    testo: 'Con quale frequenza utilizzi il servizio?',
    opzioni: ['Mai', 'Raramente', 'Qualche volta a settimana', 'Quotidianamente'],
  },
  {
    id: 'q2',
    testo: 'Quanto sei soddisfatto del servizio nel complesso?',
    opzioni: ['Molto insoddisfatto', 'Insoddisfatto', 'Neutro', 'Soddisfatto', 'Molto soddisfatto'],
  },
  {
    id: 'q3',
    testo: 'Qual è l’aspetto più utile del servizio?',
    opzioni: [
      'Velocità',
      'Facilità d’uso',
      'Affidabilità',
      'Supporto',
      'Integrazione con i miei strumenti',
    ],
  },
  {
    id: 'q4',
    testo: 'Qual è la difficoltà principale che incontri?',
    opzioni: [
      'Nessuna',
      'Interfaccia poco chiara',
      'Troppi passaggi',
      'Prestazioni lente',
      'Documentazione insufficiente',
    ],
  },
  {
    id: 'q5',
    testo: 'Quanto è probabile che consigli il servizio a un collega?',
    opzioni: ['Per niente probabile', 'Poco probabile', 'Incerto', 'Probabile', 'Molto probabile'],
  },
];
