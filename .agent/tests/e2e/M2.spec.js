import { test, expect } from '@playwright/test';

const sessione = {
  access_token: 'token-finto',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'refresh-finto',
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'mario@azienda.it',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
};

// Entra nell'app con credenziali finte e attende il questionario.
async function accedi(page) {
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessione) }),
  );
  await page.goto('/login');
  await page.getByLabel('Email').fill('mario@azienda.it');
  await page.getByLabel('Password').fill('password123');
  await page.getByTestId('pulsante-invia').click();
  await expect(page.getByTestId('pagina-questionario')).toBeVisible();
}

test.describe('M2 — questionario e salvataggio', () => {
  test('mostra la prima domanda con l’avanzamento', async ({ page }) => {
    const errori = [];
    page.on('pageerror', (errore) => errori.push(errore.message));

    await accedi(page);

    await expect(page.getByTestId('avanzamento')).toHaveText('Domanda 1 di 5');
    await expect(page.getByTestId('domanda')).toContainText('Con quale frequenza utilizzi il servizio?');
    await expect(page.getByTestId('pulsante-indietro')).toBeDisabled();
    expect(errori).toEqual([]);
  });

  test('chiede una risposta prima di avanzare', async ({ page }) => {
    await accedi(page);

    await page.getByTestId('pulsante-avanti').click();

    await expect(page.getByTestId('messaggio-errore')).toHaveText('Seleziona una risposta per continuare.');
    await expect(page.getByTestId('avanzamento')).toHaveText('Domanda 1 di 5');
  });

  test('naviga avanti e indietro mantenendo la scelta', async ({ page }) => {
    await accedi(page);

    await page.getByRole('radio', { name: 'Quotidianamente' }).check();
    await page.getByTestId('pulsante-avanti').click();
    await expect(page.getByTestId('avanzamento')).toHaveText('Domanda 2 di 5');

    await page.getByTestId('pulsante-indietro').click();
    await expect(page.getByTestId('avanzamento')).toHaveText('Domanda 1 di 5');
    await expect(page.getByRole('radio', { name: 'Quotidianamente' })).toBeChecked();
  });

  test('invia le risposte e mostra il ringraziamento', async ({ page }) => {
    const inviate = [];
    await page.route('**/rest/v1/survey_responses**', async (route) => {
      if (route.request().method() === 'POST') inviate.push(JSON.parse(route.request().postData()));
      await route.fulfill({ status: 201, body: '' });
    });
    await accedi(page);

    // Sceglie la prima opzione di ogni domanda, avanzando fino all'invio.
    for (let i = 0; i < 5; i += 1) {
      await page.getByTestId('domanda').getByRole('radio').first().check();
      if (i < 4) await page.getByTestId('pulsante-avanti').click();
      else await page.getByTestId('pulsante-invia-sondaggio').click();
    }

    await expect(page.getByTestId('pagina-grazie')).toBeVisible();
    await expect(page.getByTestId('pagina-grazie')).toContainText('Grazie per aver partecipato');
    expect(inviate).toHaveLength(1);
    expect(inviate[0]).toMatchObject({
      user_id: sessione.user.id,
      q1: 'Mai',
      q2: 'Molto insoddisfatto',
      q3: 'Velocità',
      q4: 'Nessuna',
      q5: 'Per niente probabile',
    });
  });
});
