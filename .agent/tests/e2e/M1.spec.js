import { test, expect } from '@playwright/test';

// Sessione finta restituita dalle chiamate Supabase intercettate: nessuna rete reale.
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

async function mockAccessoRiuscito(page) {
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessione) }),
  );
}

async function mockAccessoFallito(page) {
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 400,
        error_code: 'invalid_credentials',
        error: 'invalid_grant',
        error_description: 'Invalid login credentials',
        msg: 'Invalid login credentials',
      }),
    }),
  );
}

async function compilaCredenziali(page) {
  await page.getByLabel('Email').fill('mario@azienda.it');
  await page.getByLabel('Password').fill('password123');
  await page.getByTestId('pulsante-invia').click();
}

test.describe('M1 — scheletro, design e autenticazione', () => {
  test('la radice porta alla pagina di accesso', async ({ page }) => {
    const errori = [];
    page.on('pageerror', (errore) => errori.push(errore.message));

    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible();
    await expect(page.getByTestId('campo-email')).toBeVisible();
    await expect(page.getByTestId('campo-password')).toBeVisible();
    expect(errori).toEqual([]);
  });

  test('la pagina usa lingua e design token di DESIGN.md', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.getByTestId('pulsante-invia')).toHaveCSS('background-color', 'rgb(0, 255, 135)');
  });

  test('una vista protetta senza sessione riporta al login', async ({ page }) => {
    await page.goto('/questionario');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible();
  });

  test('l’accesso riuscito porta al questionario', async ({ page }) => {
    const errori = [];
    page.on('pageerror', (errore) => errori.push(errore.message));
    await mockAccessoRiuscito(page);

    await page.goto('/login');
    await compilaCredenziali(page);

    await expect(page.getByTestId('pagina-questionario')).toBeVisible();
    await expect(page).toHaveURL(/\/questionario$/);
    expect(errori).toEqual([]);
  });

  test('credenziali errate mostrano un errore in italiano', async ({ page }) => {
    await mockAccessoFallito(page);

    await page.goto('/login');
    await compilaCredenziali(page);

    await expect(page.getByTestId('messaggio-errore')).toHaveText('Email o password non corretti.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('la registrazione con conferma email mostra un avviso', async ({ page }) => {
    await page.route('**/auth/v1/signup**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: sessione.user, session: null }),
      }),
    );

    await page.goto('/login');
    await page.getByTestId('cambia-modalita').click();
    await expect(page.getByRole('heading', { name: 'Crea il tuo account' })).toBeVisible();

    await compilaCredenziali(page);

    await expect(page.getByTestId('messaggio-avviso')).toContainText('confermare');
    await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible();
  });
});
