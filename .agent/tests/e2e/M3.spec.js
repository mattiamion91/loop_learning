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

// Nessuna risposta salvata: il dipendente non ha ancora compilato.
async function mockNessunaRisposta(page) {
  await page.route('**/rest/v1/survey_responses**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

async function accedi(page) {
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessione) }),
  );
  await page.goto('/login');
  await page.getByLabel('Email').fill('mario@azienda.it');
  await page.getByLabel('Password').fill('password123');
  await page.getByTestId('pulsante-invia').click();
}

test.describe('M3 — già completato, logout e rifiniture', () => {
  test('chi ha già compilato vede solo il ringraziamento', async ({ page }) => {
    await page.route('**/rest/v1/survey_responses**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'risposta-1', submitted_at: '2026-01-02T10:00:00Z' }),
      }),
    );

    await accedi(page);

    await expect(page).toHaveURL(/\/grazie$/);
    await expect(page.getByTestId('pagina-grazie')).toBeVisible();
    await expect(page.getByTestId('pagina-questionario')).toHaveCount(0);
  });

  test('l’intestazione mostra l’email e l’uscita riporta al login', async ({ page }) => {
    await mockNessunaRisposta(page);
    await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204, body: '' }));

    await accedi(page);

    await expect(page.getByTestId('intestazione')).toBeVisible();
    await expect(page.getByTestId('email-utente')).toContainText('mario@azienda.it');

    await page.getByTestId('pulsante-esci').click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible();
  });

  test('mostra lo stato di caricamento durante la verifica', async ({ page }) => {
    await page.route('**/rest/v1/survey_responses**', async (route) => {
      await new Promise((risolvi) => setTimeout(risolvi, 700));
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await accedi(page);

    await expect(page.getByTestId('caricamento')).toBeVisible();
    await expect(page.getByTestId('pagina-questionario')).toBeVisible();
  });

  test('se la verifica fallisce lo segnala e lascia compilare', async ({ page }) => {
    await page.route('**/rest/v1/survey_responses**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'errore' }) }),
    );

    await accedi(page);

    await expect(page.getByTestId('avviso-verifica')).toBeVisible();
    await expect(page.getByTestId('pagina-questionario')).toBeVisible();
    await expect(page.getByTestId('avanzamento')).toHaveText('Domanda 1 di 5');
  });

  test('la barra di avanzamento è accessibile e si aggiorna', async ({ page }) => {
    await mockNessunaRisposta(page);

    await accedi(page);

    const barra = page.getByRole('progressbar', { name: 'Avanzamento del sondaggio' });
    await expect(barra).toHaveAttribute('aria-valuenow', '1');
    await expect(barra).toHaveAttribute('aria-valuetext', 'Domanda 1 di 5');

    await page.getByTestId('domanda').getByRole('radio').first().check();
    await page.getByTestId('pulsante-avanti').click();

    await expect(barra).toHaveAttribute('aria-valuenow', '2');
  });
});
