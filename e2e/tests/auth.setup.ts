import { test as setup, expect, type Page } from '@playwright/test';
import path from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `E2E requires ${name}. Set it in e2e/.env (see e2e/.env.example) or export it in the shell.`,
    );
  }
  return value;
}

async function completeUniversalLogin(page: Page, email: string, password: string): Promise<void> {
  // Playwright does not expose the Auth0 tenant origin upfront; match by host.
  await page.waitForURL((url) => /auth0/i.test(url.hostname), { timeout: 90_000 });

  // Identifier-first flow and the classic single form both start with username.
  const username = page.locator('input[name="username"]').first();
  await expect(username).toBeVisible();
  await username.fill(email);

  const continueButton = page.locator('button[name="action"]').first();
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
  } else {
    await username.press('Enter');
  }

  const passwordField = page.locator('input[name="password"]').first();
  try {
    await passwordField.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    // No password prompt: the session was already established (SSO).
    return;
  }

  await passwordField.fill(password);
  const submitButton = page.locator('button[name="action"]').first();
  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click();
  } else {
    await passwordField.press('Enter');
  }
}

setup('authenticate', async ({ page }) => {
  const email = required('E2E_AUTH0_EMAIL');
  const password = required('E2E_AUTH0_PASSWORD');

  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Landing page' })
    .getByRole('button', { name: 'Log in' })
    .click();

  await completeUniversalLogin(page, email, password);

  // The app only renders the console once Auth0 has issued a token.
  await page
    .getByRole('navigation', { name: 'Coach console' })
    .waitFor({ state: 'visible', timeout: 90_000 });

  await page.context().storageState({ path: path.join(__dirname, '..', '.auth', 'coach.json') });
});